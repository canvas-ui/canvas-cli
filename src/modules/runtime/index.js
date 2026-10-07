import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { runtimeInstallation } from './install.js';

export default { name: 'runtime', description: 'Manage local workspace and agent processes', needsConnection: false, defaultAction: 'status',
  actions: ['status','start','stop','restart','logs','token','detach'].map(action => ({ name: action, description: `${action} a local runtime`, positional: [{ name: 'path' }],
    async run({ args, io }) {
      const root = path.resolve(args.path || process.cwd());
      const file = path.join(root, '.workspace/runtime.json');
      const config = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (action === 'token') { io.output(config.token); return; }
      if (action === 'status') {
        let endpoint = null, connections = [];
        try { endpoint = JSON.parse(fs.readFileSync(path.join(root, '.workspace/endpoint.json'), 'utf8')); } catch { /* stopped */ }
        try { connections = JSON.parse(fs.readFileSync(path.join(root, '.workspace/connections.json'), 'utf8')); } catch { /* no remotes */ }
        let online = false;
        if (endpoint) online = await fetch(`${endpoint.url}/rest/v2/runtime/status`, { headers: { Authorization: `Bearer ${config.token}` }, signal: AbortSignal.timeout(2000) }).then(r => r.ok).catch(() => false);
        io.output({ root, kind: config.kind, instanceId: config.instanceId, online, endpoint: online ? endpoint.url : null, connections }); return;
      }
      if (action === 'detach') {
        for (const remote of config.remotes || []) {
          const response = await fetch(`${remote.url}/rest/v2/edge/registrations/${config.instanceId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${remote.token}` } });
          if (!response.ok && response.status !== 404) throw new Error(`Could not detach from ${remote.url}: HTTP ${response.status}`);
        }
        config.remotes = [];
        fs.writeFileSync(file, JSON.stringify(config, null, 2), { mode: 0o600 });
      }
      const install = await runtimeInstallation({ background: true });
      let command = [action === 'detach' ? 'restart' : action, `canvas-${config.instanceId}`];
      if (action === 'start') command = ['start', install.node, '--name', `canvas-${config.instanceId}`, '--interpreter', 'none', '--', path.join(install.dir,'bin',`canvas-${config.kind === 'agent' ? 'agent' : 'workspace'}.js`), root, '--foreground'];
      await new Promise((resolve,reject) => { const child = spawn(install.node, [install.pm2, ...command], { stdio: 'inherit', env: install.env }); child.once('error',reject); child.once('exit',code => code === 0 ? resolve() : reject(new Error(`PM2 exited ${code}`))); });
    } })) };
