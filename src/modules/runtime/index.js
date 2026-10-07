import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { runtimeInstallation } from './install.js';
import { runtimeConfigFile } from './config.js';

export default { name: 'runtime', description: 'Manage local workspace and agent processes', needsConnection: false, defaultAction: 'status',
  actions: ['status','start','stop','restart','logs','token','detach'].map(action => ({ name: action, description: `${action} a local runtime`, positional: [{ name: 'path' }], flags: { kind: 'string' },
    async run({ args, flags = {}, io }) {
      const root = path.resolve(args.path || process.cwd());
      const file = runtimeConfigFile(root, flags.kind);
      const state = path.dirname(file);
      const config = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (action === 'token') { io.output(config.token); return; }
      if (action === 'status') {
        let endpoint = null, connections = [];
        try { endpoint = JSON.parse(fs.readFileSync(path.join(state, 'endpoint.json'), 'utf8')); } catch { /* stopped */ }
        try { connections = JSON.parse(fs.readFileSync(path.join(state, 'connections.json'), 'utf8')); } catch { /* no remotes */ }
        let online = false;
        if (endpoint) online = await fetch(`${endpoint.url}/rest/v2/runtime/status`, { headers: { Authorization: `Bearer ${config.token}` }, signal: AbortSignal.timeout(2000) }).then(r => r.ok).catch(() => false);
        io.output({ root, kind: config.kind, instanceId: config.instanceId, online, endpoint: online ? endpoint.url : null,
          connections: online ? connections : connections.map(c => ({ ...c, connected: false, registered: false })) }); return;
      }
      if (action === 'detach') {
        const remotes = config.remotes || [];
        config.remotes = [];
        fs.writeFileSync(`${file}.tmp`, JSON.stringify(config, null, 2), { mode: 0o600 });
        fs.renameSync(`${file}.tmp`, file);
        // Detach must also work for a foreground process or an offline hub.
        try {
          const endpoint = JSON.parse(fs.readFileSync(path.join(state, 'endpoint.json'), 'utf8'));
          const response = await fetch(`${endpoint.url}/rest/v2/runtime/status`, { headers: { Authorization: `Bearer ${config.token}` }, signal: AbortSignal.timeout(2000) });
          if (response.ok && (await response.json()).payload.instanceId === config.instanceId) process.kill(endpoint.pid, 'SIGHUP');
        } catch { /* stopped runtime */ }
        for (const remote of remotes) {
          try {
            const response = await fetch(`${remote.url}/rest/v2/edge/registrations/${config.instanceId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${remote.token}` }, signal: AbortSignal.timeout(10000) });
            if (!response.ok && response.status !== 404) throw new Error(`HTTP ${response.status}`);
          } catch (error) { io.warn?.(`Detached locally; remove the offline registration on ${remote.url}: ${error.message}`); }
        }
        io.success('Runtime detached; local data and API are preserved'); return;
      }
      const install = await runtimeInstallation({ kind: config.kind, background: true });
      let command = [action, `canvas-${config.instanceId}`];
      if (action === 'start') command = ['start', install.node, '--name', `canvas-${config.instanceId}`, '--interpreter', 'none', '--', install.script, root, '--foreground'];
      await new Promise((resolve,reject) => { const child = spawn(install.node, [install.pm2, ...command], { stdio: 'inherit', env: install.env }); child.once('error',reject); child.once('exit',code => code === 0 ? resolve() : reject(new Error(`PM2 exited ${code}`))); });
    } })) };
