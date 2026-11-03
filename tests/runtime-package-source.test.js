import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { normalizePackageSource, preparePackageSource } from '../src/modules/runtime/package-source.js';
const exec = promisify(execFile);

test('normalize SSH Git URLs and local package paths', () => {
    assert.equal(normalizePackageSource('git@github.com:canvas-ui/canvas-agentd.git#main'), 'git+ssh://git@github.com/canvas-ui/canvas-agentd.git#main');
    assert.equal(normalizePackageSource('./agent.tgz'), path.resolve('agent.tgz'));
    assert.equal(normalizePackageSource('file:./agent.tgz'), path.resolve('agent.tgz'));
    assert.equal(normalizePackageSource('~/Downloads/agent.zip'), path.join(os.homedir(), 'Downloads/agent.zip'));
    assert.equal(normalizePackageSource('github:canvas-ui/canvas-agentd'), 'github:canvas-ui/canvas-agentd');
});

test('ZIP, tarball and Git packages install an executable with its runtime dependency', async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-runtime-package-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const source = path.join(root, 'canvas-agentd-main');
    const dependency = path.join(root, 'runtime');
    fs.mkdirSync(source);
    fs.mkdirSync(dependency);
    fs.writeFileSync(path.join(dependency, 'package.json'), JSON.stringify({ name: '@augmentd-labs/canvas-agent-runtime', version: '0.1.3', main: 'index.js' }));
    fs.writeFileSync(path.join(dependency, 'index.js'), 'module.exports = "runtime loaded";');
    fs.writeFileSync(path.join(source, 'package.json'), JSON.stringify({ name: 'canvas-agentd', version: '0.3.2', bin: { 'canvas-agent': 'local.js' }, dependencies: { '@augmentd-labs/canvas-agent-runtime': `file:${dependency}` } }));
    fs.writeFileSync(path.join(source, 'local.js'), '#!/usr/bin/env node\nconsole.log(require("@augmentd-labs/canvas-agent-runtime"));');
    const zip = path.join(root, 'agent source.zip');
    await exec('zip', ['-qr', zip, 'canvas-agentd-main'], { cwd: root });
    const options = { cache: path.join(root, 'cache'), npm: { command: 'npm', args: [] }, env: process.env };
    const archive = await preparePackageSource(zip, options);
    assert.match(archive, /\.tgz$/);
    assert.equal(await preparePackageSource(zip, options), archive);
    assert.equal(await preparePackageSource(archive, options), archive);
    await exec('git', ['init', '-q', source]);
    await exec('git', ['add', '.'], { cwd: source });
    await exec('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'fixture'], { cwd: source });
    for (const [label, spec] of [['zip', archive], ['git', `git+file://${source}`]]) {
        const destination = path.join(root, label);
        fs.mkdirSync(destination);
        fs.writeFileSync(path.join(destination, 'package.json'), JSON.stringify({ private: true, dependencies: { 'canvas-agentd': spec } }));
        await exec('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: destination });
        const { stdout } = await exec(process.execPath, [path.join(destination, 'node_modules/canvas-agentd/local.js')]);
        assert.equal(stdout.trim(), 'runtime loaded');
    }
    fs.unlinkSync(zip);
    assert.equal(await preparePackageSource(archive, options), archive);
});

test('invalid ZIP reports missing package and cleans staging files', async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-runtime-invalid-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.writeFileSync(path.join(root, 'README'), 'No package here');
    const zip = path.join(root, 'invalid.zip');
    await exec('zip', ['-q', zip, 'README'], { cwd: root });
    const cache = path.join(root, 'cache');
    await assert.rejects(preparePackageSource(zip, { cache, npm: { command: 'npm', args: [] }, env: process.env }), /ZIP must contain one package.json/);
    assert.deepEqual(fs.readdirSync(cache), []);
});
