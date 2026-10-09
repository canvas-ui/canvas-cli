import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runtimeConfigFile } from '../src/modules/runtime/config.js';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-cli-agent-'));
process.env.CANVAS_USER_HOME = home;
const { runtimeInstallation, prefix } = await import('../src/modules/runtime/install.js');
test.after(() => fs.rmSync(home, { recursive: true, force: true }));

test('runtime commands select .agent state and support an explicit workspace selection', () => {
    assert.equal(runtimeConfigFile(home), path.join(home, '.workspace/runtime.json'));
    fs.mkdirSync(path.join(home, '.agent'));
    fs.writeFileSync(path.join(home, '.agent/runtime.json'), '{}');
    assert.equal(runtimeConfigFile(home), path.join(home, '.agent/runtime.json'));
    assert.equal(runtimeConfigFile(home, 'workspace'), path.join(home, '.workspace/runtime.json'));
    assert.throws(() => runtimeConfigFile(home, 'invalid'), /kind/);
});

test('source installations select independent agent and private workspace executables', async () => {
    const agent = await runtimeInstallation({ kind: 'agent' });
    const workspace = await runtimeInstallation({ kind: 'workspace' });
    assert.match(agent.script, /runtimes\/agent\/bin\/canvas-agent\.js$/);
    assert.match(workspace.script, /runtimes\/workspaced\/bin\/canvas-workspace\.js$/);
    assert.notEqual(agent.pm2, workspace.pm2);
    assert.equal(agent.env.PM2_HOME, workspace.env.PM2_HOME);
});

test('managed installs use separate dependency trees and honor Git package bin paths', async () => {
    const configurations = [
        // A Git spec that differs from the default: the installed spec must stick without a reinstall.
        ['agent', '@augmentd-labs/canvas-agent-runtime', 'github:canvas-ui/canvas-agentd#main', 'src/local.js'],
        ['workspace', '@augmentd-labs/canvas-workspaced', 'git+https://github.com/canvas-ui/canvas-common.git#main', 'runtimes/workspaced/bin/canvas-workspace.js'],
    ];
    process.env.CANVAS_RUNTIME_NO_DEV = '1';
    process.env.CANVAS_RUNTIME_NODE = process.execPath;
    try {
        for (const [kind, name, spec, script] of configurations) {
            const installPrefix = path.join(prefix, kind);
            const dir = path.join(installPrefix, 'node_modules', name);
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, bin: { [`canvas-${kind}`]: script } }));
            fs.writeFileSync(path.join(installPrefix, 'package.json'), JSON.stringify({ private: true, dependencies: { [name]: spec } }));
            const installed = await runtimeInstallation({ kind });
            assert.equal(installed.script, path.join(dir, script));
        }
        const agentDeps = JSON.parse(fs.readFileSync(path.join(prefix, 'agent/package.json'))).dependencies;
        assert.deepEqual(agentDeps, { '@augmentd-labs/canvas-agent-runtime': 'github:canvas-ui/canvas-agentd#main' });
        // An explicit --runtime-package that differs from the installed spec triggers a reinstall through npm.
        // The install runs `npm` from the managed node's directory: a fake one there proves no network is touched.
        fs.mkdirSync(path.join(home, 'fakebin'));
        process.env.CANVAS_RUNTIME_NODE = path.join(home, 'fakebin/node');
        fs.writeFileSync(path.join(home, 'fakebin/npm'), '#!/bin/sh\necho "fake npm" >&2; exit 1\n', { mode: 0o755 });
        fs.symlinkSync(process.execPath, process.env.CANVAS_RUNTIME_NODE);
        await assert.rejects(runtimeInstallation({ kind: 'agent', pkg: 'github:canvas-ui/canvas-agentd#v0.4.0' }), /fake npm[^]*--runtime-package/);
    } finally {
        delete process.env.CANVAS_RUNTIME_NO_DEV;
        delete process.env.CANVAS_RUNTIME_NODE;
    }
});
