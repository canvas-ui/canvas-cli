import path from 'node:path';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { input, password, select, isTTY } from '@augmentd-labs/canvas-cli-host/prompt';
import { noStart } from '../mirror/lib/config.js';
import { runtimeInstallation } from '../runtime/install.js';

export const initFlags = { name: 'string', model: 'string', 'ollama-url': 'string', 'server-url': 'string', remote: 'string',
  'token-file': 'string', 'stt-url': 'string', 'tts-url': 'string', 'stt-model': 'string', voice: 'string',
  host: 'string', port: 'string', foreground: 'boolean', 'no-start': 'boolean', 'local-only': 'boolean', yes: 'boolean' };
export async function initialize(kind, { args, flags, client, session, io }) {
  const root = path.resolve(args.path || process.cwd());
  const interactive = isTTY() && !flags.yes;
  const options = { ...flags };
  if (interactive) {
    options.name ||= await input({ message: `${kind} name`, defaultValue: path.basename(root) });
    if (kind === 'agent') {
      options.model ||= await input({ message: 'Ollama model', defaultValue: 'qwen3:latest' });
      options['ollama-url'] ||= await input({ message: 'Ollama API URL', defaultValue: 'http://127.0.0.1:11434/v1' });
      options['stt-url'] ||= await input({ message: 'Speech recognition URL (empty to disable)', defaultValue: '' });
      options['tts-url'] ||= await input({ message: 'Kokoro URL (empty to disable)', defaultValue: '' });
    }
    if (!flags.foreground && !noStart(flags)) options.foreground = await select('Run mode', [
      { label: 'Background (PM2)', value: false }, { label: 'Foreground', value: true },
    ]);
  }
  const remote = options.remote ? client.getRemote(options.remote) : (!options['server-url'] && !flags['local-only'] ? client.getRemote(session.boundRemote()) : null);
  options['server-url'] ||= remote?.url;
  if (!options['server-url'] && interactive && !flags['local-only']) options['server-url'] = await input({ message: 'Canvas server URL (empty for local-only)', defaultValue: '' });
  let token = remote?.auth?.token || process.env.CANVAS_PAIRING_TOKEN;
  if (options['server-url'] && !token && !options['token-file'] && interactive) token = await password('Canvas server API token');
  if (options['server-url'] && !token && !options['token-file']) throw new Error('Registration needs --token-file, CANVAS_PAIRING_TOKEN, or an authenticated --remote');
  io.info?.('Preparing the local Canvas runtime…');
  const install = await runtimeInstallation({ background: !options.foreground && !noStart(flags) });
  const script = path.join(install.dir, 'bin', `canvas-${kind}.js`);
  const runtimeArgs = [script, root, noStart(flags) || !options.foreground ? '--init-only' : '--foreground'];
  for (const key of Object.keys(initFlags)) {
    if (typeof options[key] === 'string' && options[key] && !['remote'].includes(key)) runtimeArgs.push(`--${key}`, options[key]);
  }
  const env = { ...install.env, ...(token ? { CANVAS_PAIRING_TOKEN: token } : {}) };
  const run = (file, argv, runEnv) => new Promise((resolve, reject) => {
    const child = spawn(file, argv, { stdio: 'inherit', env: runEnv });
    child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Runtime exited ${code}`)));
  });
  await run(install.node, runtimeArgs, env);
  if (!options.foreground && !noStart(flags)) {
    const cfg = JSON.parse(fs.readFileSync(path.join(root, '.workspace/runtime.json'), 'utf8'));
    const launch = [script, root, '--foreground'];
    for (const key of ['host','port']) if (options[key]) launch.push(`--${key}`, options[key]);
    await run(install.node, [install.pm2, 'start', install.node, '--name', `canvas-${cfg.instanceId}`, '--interpreter', 'none', '--', ...launch], install.env);
    await run(install.node, [install.pm2, 'save'], install.env);
    io.success(`Local ${kind} started in ${root}. Use canvas runtime status ${root}`);
  } else if (noStart(flags)) io.success(`Local ${kind} initialized in ${root}`);
}
export default { name: 'init', description: 'Initialize and run a local workspace or agent', needsConnection: false,
  actions: ['workspace','agent'].map(kind => ({ name: kind, description: `Initialize a local ${kind}`, positional: [{ name: 'path' }], flags: initFlags, run: context => initialize(kind, context) })) };
