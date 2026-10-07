import fs from 'node:fs';
import path from 'node:path';

export function runtimeConfigFile(root, kind) {
  if (kind && !['agent', 'workspace'].includes(kind)) throw new Error('Runtime kind must be agent or workspace');
  if (kind) return path.join(root, kind === 'agent' ? '.agent' : '.workspace', 'runtime.json');
  const agent = path.join(root, '.agent/runtime.json');
  return fs.existsSync(agent) ? agent : path.join(root, '.workspace/runtime.json');
}
