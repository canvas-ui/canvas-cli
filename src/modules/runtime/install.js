import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { CANVAS_HOME } from '../../core/paths.js';
const exec = promisify(execFile);
export const prefix = path.join(CANVAS_HOME, 'runtime');
const packageName = '@augmentd-labs/canvas-workspaced';

export async function runtimeInstallation({ background = false } = {}) {
  if (process.platform !== 'linux' || !['x64','arm64'].includes(process.arch)) throw new Error('Local runtime installation currently supports Linux x64/arm64');
  fs.mkdirSync(prefix, { recursive: true, mode: 0o700 });
  const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../canvas-common/runtimes/workspaced');
  const sourceMode = fs.existsSync(path.join(source, 'package.json')) && process.env.CANVAS_RUNTIME_NO_DEV !== '1';
  const version = '22.20.0';
  const artifact = `node-v${version}-linux-${process.arch}`;
  const nodeRoot = path.join(prefix, artifact);
  let node = process.env.CANVAS_RUNTIME_NODE || (sourceMode && !process.versions.bun && (Number(process.versions.node.split('.')[0]) > 22 || (Number(process.versions.node.split('.')[0]) === 22 && Number(process.versions.node.split('.')[1]) >= 19)) ? process.execPath : path.join(nodeRoot, 'bin/node'));
  if (!fs.existsSync(node)) {
    const base = `https://nodejs.org/dist/v${version}`;
    const [archiveResponse, checksumResponse] = await Promise.all([fetch(`${base}/${artifact}.tar.xz`), fetch(`${base}/SHASUMS256.txt`)]);
    if (!archiveResponse.ok || !checksumResponse.ok) throw new Error('Could not download the managed Node runtime');
    const bytes = Buffer.from(await archiveResponse.arrayBuffer());
    const expected = (await checksumResponse.text()).split('\n').find(line => line.endsWith(`  ${artifact}.tar.xz`))?.split(' ')[0];
    if (!expected || createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('Node archive checksum mismatch');
    const archive = path.join(prefix, `${artifact}.tar.xz`); fs.writeFileSync(archive, bytes);
    await exec('tar', ['-xJf', archive, '-C', prefix]); fs.rmSync(archive);
  }
  let dir = sourceMode ? source : path.join(prefix, 'node_modules', packageName);
  const pm2 = path.join(prefix, 'node_modules/pm2/bin/pm2');
  if (!fs.existsSync(path.join(dir, 'package.json')) || (background && !fs.existsSync(pm2))) {
    const manifest = { name: 'canvas-managed-runtime', private: true, overrides: { 'fast-jwt': '6.2.4' }, dependencies: {
      ...(sourceMode ? {} : { [packageName]: process.env.CANVAS_RUNTIME_PACKAGE || 'latest' }), pm2: '^6.0.0',
    } };
    fs.writeFileSync(path.join(prefix, 'package.json'), JSON.stringify(manifest, null, 2));
    const npm = path.join(nodeRoot, 'lib/node_modules/npm/bin/npm-cli.js');
    try { await exec(fs.existsSync(npm) ? node : 'npm', [...(fs.existsSync(npm) ? [npm] : []), 'install', '--no-audit', '--no-fund'],
      { cwd: prefix, env: { ...process.env, PATH: `${path.dirname(node)}:${process.env.PATH}` }, timeout: 900_000, maxBuffer: 16 * 1024 * 1024 });
    } catch (error) { throw new Error(`Runtime dependency installation failed: ${error.stderr || error.message}`); }
  }
  const env = { ...process.env, PM2_HOME: process.env.PM2_HOME || path.join(prefix, 'pm2'), PATH: `${path.dirname(node)}:${process.env.PATH}` };
  delete env.CANVAS_PAIRING_TOKEN;
  return { node, dir, pm2, env };
}
