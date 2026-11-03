import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export function normalizePackageSource(spec) {
    // npm's dependency manifest needs a URL for scp-style Git SSH sources.
    if (/^[\w.-]+@[^/:]+:.+/.test(spec)) return `git+ssh://${spec.replace(':', '/')}`;
    if (spec.startsWith('file://')) return fileURLToPath(spec);
    if (spec.startsWith('file:')) return path.resolve(spec.slice(5));
    if (spec.startsWith('~/')) spec = path.join(os.homedir(), spec.slice(2));
    if (/^(\.\.?[\\/]|\/)/.test(spec) || fs.existsSync(spec)) return path.resolve(spec);
    return spec;
}

// npm accepts tarballs, but GitHub source ZIPs must first become npm packages.
// Keep the resulting tarball in the managed prefix so restarts don't depend on
// the original download still existing.
export async function preparePackageSource(spec, { cache, npm, env }) {
    if (!path.isAbsolute(spec) || !/\.zip$/i.test(spec)) return spec;
    const digest = createHash('sha256').update(fs.readFileSync(spec)).digest('hex');
    fs.mkdirSync(cache, { recursive: true });
    const archive = path.join(cache, `${digest}.tgz`);
    if (fs.existsSync(archive)) return archive;
    const staging = fs.mkdtempSync(path.join(cache, 'unpack-'));
    try {
        const { stdout } = await exec('unzip', ['-Z1', spec]);
        if (stdout.split('\n').some(name => name.startsWith('/') || name.split(/[\\/]/).includes('..'))) {
            throw new Error('Runtime ZIP contains a path outside the archive');
        }
        await exec('unzip', ['-q', spec, '-d', staging]);
        const roots = [staging, ...fs.readdirSync(staging, { withFileTypes: true })
            .filter(entry => entry.isDirectory() && entry.name !== '__MACOSX')
            .map(entry => path.join(staging, entry.name))];
        const packages = roots.filter(root => fs.existsSync(path.join(root, 'package.json')));
        if (packages.length !== 1) throw new Error('Runtime ZIP must contain one package.json at its root or in a single top-level directory');
        const result = await exec(npm.command, [...npm.args, 'pack', '--ignore-scripts', '--json', '--pack-destination', staging],
            { cwd: packages[0], env, timeout: 900_000, maxBuffer: 16 * 1024 * 1024 });
        const [{ filename }] = JSON.parse(result.stdout);
        fs.renameSync(path.join(staging, filename), archive);
        return archive;
    } catch (error) {
        throw new Error(`Could not prepare runtime ZIP ${spec}: ${error.stderr || error.message}`);
    } finally {
        fs.rmSync(staging, { recursive: true, force: true });
    }
}
