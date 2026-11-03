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

// Pack source checkouts without fetching unrelated repository submodules.
// Cached tarballs also let starts work without the original source or Git access.
export async function preparePackageSource(spec, { cache, npm, env }) {
    const git = /^(git\+|git:\/\/|ssh:\/\/|github:)/.test(spec) || /^https?:\/\/.*\.git(?:#|$)/.test(spec);
    const zip = path.isAbsolute(spec) && /\.zip$/i.test(spec);
    if (!git && !zip) return spec;
    fs.mkdirSync(cache, { recursive: true });
    let archive;
    if (zip) {
        const digest = createHash('sha256').update(fs.readFileSync(spec)).digest('hex');
        archive = path.join(cache, `${digest}.tgz`);
        if (fs.existsSync(archive)) return archive;
    }
    const staging = fs.mkdtempSync(path.join(cache, 'unpack-'));
    const execOptions = { env, timeout: 900_000, maxBuffer: 16 * 1024 * 1024 };
    try {
        let packageRoot;
        if (git) {
            const url = spec.replace(/^git\+/, '').replace(/^github:(.+?)(?=#|$)/, 'https://github.com/$1.git');
            const hash = url.indexOf('#');
            const repository = hash < 0 ? url : url.slice(0, hash);
            const ref = hash < 0 ? '' : url.slice(hash + 1);
            if (ref.startsWith('semver:')) throw new Error('Use a Git branch, tag, or commit instead of a semver selector');
            packageRoot = path.join(staging, 'source');
            await exec('git', ['clone', '--no-recurse-submodules', '--', repository, packageRoot], execOptions);
            if (ref) await exec('git', ['-c', 'submodule.recurse=false', 'checkout', '--detach', '--end-of-options', ref], { ...execOptions, cwd: packageRoot });
        } else {
            const { stdout } = await exec('unzip', ['-Z1', spec], execOptions);
            if (stdout.split('\n').some(name => name.startsWith('/') || name.split(/[\\/]/).includes('..'))) {
                throw new Error('Runtime ZIP contains a path outside the archive');
            }
            await exec('unzip', ['-q', spec, '-d', staging], execOptions);
            const roots = [staging, ...fs.readdirSync(staging, { withFileTypes: true })
                .filter(entry => entry.isDirectory() && entry.name !== '__MACOSX')
                .map(entry => path.join(staging, entry.name))];
            const packages = roots.filter(root => fs.existsSync(path.join(root, 'package.json')));
            if (packages.length !== 1) throw new Error('Runtime ZIP must contain one package.json at its root or in a single top-level directory');
            [packageRoot] = packages;
        }
        const result = await exec(npm.command, [...npm.args, 'pack', '--ignore-scripts', '--json', '--pack-destination', staging],
            { ...execOptions, cwd: packageRoot });
        const [{ filename }] = JSON.parse(result.stdout);
        const packed = path.join(staging, filename);
        archive ||= path.join(cache, `${createHash('sha256').update(fs.readFileSync(packed)).digest('hex')}.tgz`);
        fs.renameSync(packed, archive);
        return archive;
    } catch (error) {
        throw new Error(`Could not prepare runtime ${git ? 'Git source' : 'ZIP'} ${spec}: ${error.stderr || error.message}`);
    } finally {
        fs.rmSync(staging, { recursive: true, force: true });
    }
}
