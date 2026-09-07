import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

const home = mkdtempSync(path.join(os.tmpdir(), 'canvas-cli-mirror-'));
process.env.CANVAS_USER_HOME = home;

const config = await import('../src/lib/config.js');
const fuse = await import('../src/lib/fuse.js');

describe('mirror config', () => {
    before(() => { config.writeConfig({ ...config.DEFAULTS, mirrors: [] }); });
    after(() => { rmSync(home, { recursive: true, force: true }); });

    test('parseWorkspaceSpec folds folders into globs', () => {
        assert.deepEqual(config.parseWorkspaceSpec('devel'), { name: 'devel', pins: [] });
        assert.deepEqual(config.parseWorkspaceSpec('devel:UI/,Docs, Notes/**'), { name: 'devel', pins: ['UI/**', 'Docs/**', 'Notes/**'] });
        assert.deepEqual(config.parseWorkspaceSpec('x:*.md').pins, ['*.md']);
    });

    test('build/upsert/find/remove', () => {
        const root = path.join(home, 'Workspaces');
        const m = config.buildMirror({ remoteId: 'admin@dev', workspaceId: 'uuid-1', workspaceName: 'devel', root, pins: ['UI/**'], conflicts: 'rename' });
        assert.equal(m.id, 'admin@dev/devel');
        assert.equal(m.mountpoint, path.join(root, 'devel'));
        config.upsertMirror(m);
        assert.equal(config.readConfig().root, root, 'first mirror sets the root');
        assert.equal(config.findMirror('devel').id, m.id);
        assert.equal(config.findMirror('uuid-1').id, m.id);
        assert.equal(config.findMirror(path.join(root, 'devel')).id, m.id);
        config.upsertMirror({ ...m, pins: ['UI/**', 'Docs/**'] });
        assert.deepEqual(config.findMirror('devel').pins, ['UI/**', 'Docs/**']);
        assert.equal(config.listMirrors().length, 1);
        assert.equal(config.removeMirror(m.id), true);
        assert.equal(config.removeMirror(m.id), false);
        assert.throws(() => config.buildMirror({ remoteId: 'a', workspaceName: 'b', conflicts: 'maybe' }));
    });

    test('mountArgs never puts credentials on the command line', () => {
        const m = config.buildMirror({ remoteId: 'admin@dev', workspaceName: 'devel', root: '/tmp/ws', pins: ['UI/**'], ignore: ['*.tmp'], conflicts: 'prompt', deletes: 'keep' });
        assert.deepEqual(fuse.mountArgs(m), ['mount', '-w', 'devel', '/tmp/ws', '--remote', 'admin@dev', '--mirror', '--pin', 'UI/**', '--ignore', '*.tmp', '--conflicts', 'prompt', '--deletes', 'keep']);
        assert.ok(fuse.mountArgs(m, { detach: true }).includes('-d'));
        assert.ok(!fuse.mountArgs(m).some((a) => /token|canvas-/.test(a)));
    });
});

describe('mirror wizard helpers', async () => {
    const { parseSelection } = await import('@augmentd-labs/canvas-cli-host/prompt');
    const { parsePublishSpec } = await import('../src/lib/publish.js');
    const { hubWorkspaceName, findHubWorkspace } = await import('../src/lib/hub.js');
    const { pm2Env } = await import('@augmentd-labs/canvas-cli-host/pm2');

    test('flagOff reads --no-<flag> from argv (declared booleans default to false)', () => {
        assert.equal(config.flagOff('service', ['node', 'canvas', 'mirror', 'init', '--no-service']), true);
        assert.equal(config.flagOff('service', ['node', 'canvas', 'mirror', 'init']), false);
        assert.equal(config.noStart({ start: false }), true);
        assert.equal(config.noStart({ 'no-start': true }), true);
        assert.equal(config.noStart({}), false);
    });

    test('edgeBin from mirrors.json wins over the PATH fallback', async () => {
        const { edgeBinary } = await import('../src/lib/edge.js');
        const { writeFileSync, mkdirSync } = await import('node:fs');
        const dir = path.join(home, 'edge-checkout', 'bin');
        mkdirSync(dir, { recursive: true });
        writeFileSync(path.join(dir, 'canvas-edge'), '#!/usr/bin/env node\n');
        const saveEnv = { bin: process.env.CANVAS_EDGE_BIN, root: process.env.CANVAS_SERVER_ROOT };
        delete process.env.CANVAS_EDGE_BIN; delete process.env.CANVAS_SERVER_ROOT;
        config.setEdgeBin(path.join(home, 'edge-checkout'));
        assert.equal(edgeBinary(), path.join(dir, 'canvas-edge'));
        config.setEdgeBin(null);
        if (saveEnv.bin) process.env.CANVAS_EDGE_BIN = saveEnv.bin;
        if (saveEnv.root) process.env.CANVAS_SERVER_ROOT = saveEnv.root;
    });

    test('pm2Env keeps CANVAS_*/PATH/HOME and drops the rest', () => {
        process.env.CANVAS_TEST_X = '1';
        process.env.SOME_SECRET_TOKEN = 'it\'s secret';
        const env = pm2Env({ NODE_ENV: 'test' });
        assert.equal(env.CANVAS_TEST_X, '1');
        assert.equal(env.NODE_ENV, 'test');
        assert.ok('PATH' in env);
        assert.ok(!('SOME_SECRET_TOKEN' in env));
        delete process.env.CANVAS_TEST_X; delete process.env.SOME_SECRET_TOKEN;
    });

    test('parseSelection: numbers, ranges, all, defaults', () => {
        assert.deepEqual(parseSelection('1,3', 4), [0, 2]);
        assert.deepEqual(parseSelection('2-4', 4), [1, 2, 3]);
        assert.deepEqual(parseSelection('4-2, 9', 4), [1, 2, 3]);
        assert.deepEqual(parseSelection('all', 3), [0, 1, 2]);
        assert.deepEqual(parseSelection('', 3), []);
        assert.deepEqual(parseSelection('', 3, { defaultAll: true }), [0, 1, 2]);
        assert.deepEqual(parseSelection('x', 3), []);
    });

    test('hubWorkspaceName keeps case, folds spaces/dots to dashes', () => {
        assert.equal(hubWorkspaceName('Universe'), 'Universe');
        assert.equal(hubWorkspaceName('My Notes.v2'), 'My-Notes-v2');
        assert.equal(hubWorkspaceName('  ünï/cøde  '), 'ncde');
    });

    test('parsePublishSpec: folder, ~, explicit name', () => {
        const a = parsePublishSpec('~/Code/UI');
        assert.equal(a.folder, path.join(os.homedir(), 'Code', 'UI'));
        assert.equal(a.name, 'UI');
        const b = parsePublishSpec('/tmp/my notes:Notes');
        assert.equal(b.folder, path.resolve('/tmp/my notes'));
        assert.equal(b.name, 'Notes');
        assert.equal(parsePublishSpec('/tmp/my notes').name, 'my-notes');
    });

    test('findHubWorkspace is case-insensitive over name/folder/label', () => {
        const list = [{ id: 'u1', name: 'universe', folderName: 'Universe', label: 'Universe' }, { id: 'd1', name: 'devel', folderName: 'Devel', label: 'Development' }];
        assert.equal(findHubWorkspace(list, 'Universe').id, 'u1');
        assert.equal(findHubWorkspace(list, 'DEVEL').id, 'd1');
        assert.equal(findHubWorkspace(list, 'development').id, 'd1');
        assert.equal(findHubWorkspace(list, 'd1').id, 'd1');
        assert.equal(findHubWorkspace(list, 'nope'), null);
    });

    test('buildMirror: folderName drives the mountpoint; custom folder needs the daemon', () => {
        const root = path.join(home, 'Workspaces');
        const m = config.buildMirror({ remoteId: 'admin@dev', workspaceId: 'u1', workspaceName: 'universe', folderName: 'Universe', root });
        assert.equal(m.mountpoint, path.join(root, 'Universe'));
        assert.equal(m.folderName, 'Universe');
        const p = config.buildMirror({ remoteId: 'admin@dev', workspaceId: 'x', workspaceName: 'ui', folderName: 'UI', root, folder: '/tmp/Code/UI', client: 'daemon' });
        assert.equal(p.mountpoint, path.resolve('/tmp/Code/UI'));
        assert.throws(() => config.buildMirror({ remoteId: 'a@b', workspaceName: 'ui', root, folder: '/tmp/x', client: 'fuse' }), /daemon/);
    });
});
