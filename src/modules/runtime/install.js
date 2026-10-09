import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { CANVAS_HOME } from '../../core/paths.js';
const exec = promisify(execFile);
export const prefix = path.join(CANVAS_HOME, 'runtime');
export const DEFAULT_PACKAGE = { agent: '^0.1.0', workspace: 'git+https://github.com/canvas-ui/canvas-common.git#main' };
// `pkg` is any npm package spec: a version range, a tarball path/URL, or a Git
// source such as github:owner/repo#ref. The runtime is installed under the
// kind's package name whatever the source package calls itself, so a private
// GitHub repository works as long as it provides the canvas-<kind> executable.
// Resolution: explicit pkg > CANVAS_<KIND>_PACKAGE / CANVAS_RUNTIME_PACKAGE >
// the spec already installed > the default, so `runtime start` keeps what
// `init --runtime-package` chose.
export async function runtimeInstallation({ kind = 'agent', background = false, pkg = null } = {}) {
  if (!['agent', 'workspace'].includes(kind)) throw new Error('Runtime kind must be agent or workspace');
  const packageName = kind === 'agent' ? '@augmentd-labs/canvas-agent-runtime' : '@augmentd-labs/canvas-workspaced';
  if (process.platform !== 'linux' || !['x64','arm64'].includes(process.arch)) throw new Error('Local runtime installation currently supports Linux x64/arm64');
  fs.mkdirSync(prefix, { recursive: true, mode: 0o700 });
  // Each kind has its own dependency tree: installing an agent never fetches
  // a previously installed private workspace runtime as a side effect.
  const installPrefix = path.join(prefix, kind);
  fs.mkdirSync(installPrefix, { recursive: true, mode: 0o700 });
  const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), `../../../../canvas-common/runtimes/${kind === 'agent' ? 'agent' : 'workspaced'}`);
  const sourceMode = !pkg && fs.existsSync(path.join(source, 'package.json')) && process.env.CANVAS_RUNTIME_NO_DEV !== '1';
  const manifestPath = path.join(installPrefix, 'package.json');
  const previous = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
  // Local tarballs/folders are resolved before npm runs inside the install prefix.
  if (pkg && /^(\.\.?[\\/]|\/|~\/)/.test(pkg)) pkg = path.resolve(pkg.replace(/^~\//, `${process.env.HOME}/`));
  const spec = pkg || process.env[kind === 'agent' ? 'CANVAS_AGENT_PACKAGE' : 'CANVAS_WORKSPACE_PACKAGE'] || process.env.CANVAS_RUNTIME_PACKAGE ||
    previous.dependencies?.[packageName] || DEFAULT_PACKAGE[kind];
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
  let dir = sourceMode ? source : path.join(installPrefix, 'node_modules', packageName);
  const pm2 = path.join(installPrefix, 'node_modules/pm2/bin/pm2');
  if (!fs.existsSync(path.join(dir, 'package.json')) || (background && !fs.existsSync(pm2)) || (!sourceMode && previous.dependencies?.[packageName] !== spec)) {
    const manifest = { name: 'canvas-managed-runtime', private: true, overrides: { 'fast-jwt': '6.2.4' }, dependencies: {
      ...previous.dependencies, ...(sourceMode ? {} : { [packageName]: spec }), pm2: '^6.0.0',
    } };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    const npm = path.join(nodeRoot, 'lib/node_modules/npm/bin/npm-cli.js');
    try { await exec(fs.existsSync(npm) ? node : 'npm', [...(fs.existsSync(npm) ? [npm] : []), 'install', '--no-audit', '--no-fund'],
      { cwd: installPrefix, env: { ...process.env, PATH: `${path.dirname(node)}:${process.env.PATH}` }, timeout: 900_000, maxBuffer: 16 * 1024 * 1024 });
    } catch (error) {
      const hint = sourceMode ? '' : `\nPackage: ${packageName}@${spec}. Use --runtime-package <spec> (a version, tarball URL, or github:owner/repo#ref) to install the ${kind} runtime from another source.`;
      throw new Error(`Runtime dependency installation failed: ${error.stderr || error.message}${hint}`);
    }
  }
  const env = { ...process.env, PM2_HOME: process.env.PM2_HOME || path.join(prefix, 'pm2'), PATH: `${path.dirname(node)}:${process.env.PATH}` };
  delete env.CANVAS_PAIRING_TOKEN;
  const installed = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const entry = installed.bin?.[`canvas-${kind}`];
  if (!entry) throw new Error(`Installed runtime does not provide canvas-${kind}`);
  return { node, dir, script: path.resolve(dir, entry), pm2, env };
}
