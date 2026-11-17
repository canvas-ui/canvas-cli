import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, symlinkSync } from 'node:fs';

const home = mkdtempSync(path.join(os.tmpdir(), 'canvas-cli-share-'));
process.env.CANVAS_USER_HOME = home;
const share = await import('../src/modules/workspace/share/lib.js');
const { default: workspace } = await import('../src/modules/workspace/index.js');

after(() => { rmSync(home, { recursive: true, force: true }); });

test('share names are <share>.<site>, and a wrong one says so', () => {
    for (const name of ['wd1t.home', 'nas-accounting.home', 'a.b']) assert.equal(share.assertShareName(name), name);
    for (const name of ['WD 1TB', 'wd1t', 'wd1t.office.home', 'Wd1t.home', '-wd.home', 'wd_1t.home', undefined]) {
        assert.throws(() => share.assertShareName(name), /<share>\.<site>.*--name nas-accounting\.home/);
    }
});

test('shares.json is what the canvas-edge daemon reads: one entry per hub, workspace and name', () => {
    assert.deepEqual(share.readShares(), []);
    const id = share.shareId('me@hub', 'universe', 'wd1t.home');
    assert.equal(id, 'me@hub/universe/wd1t.home');
    share.upsertShare({ id, remote: 'me@hub', workspaceName: 'universe', name: 'wd1t.home', label: '1TB WD', path: '/mnt/mywd', watch: true, exclude: [] });
    share.upsertShare({ id: share.shareId('me@hub', 'augmentd', 'wd1t.home'), remote: 'me@hub', workspaceName: 'augmentd', name: 'wd1t.home', path: '/mnt/mywd' });
    share.upsertShare({ ...share.findShare('me@hub', 'universe', 'wd1t.home'), label: 'WD' });
    assert.deepEqual(share.readShares().map((s) => [s.id, s.label]), [['me@hub/augmentd/wd1t.home', undefined], [id, 'WD']]);
    assert.deepEqual(Object.keys(JSON.parse(readFileSync(share.FILE_SHARES, 'utf8'))), ['version', 'shares']);
    assert.equal(share.removeShare(id), true);
    assert.equal(share.removeShare(id), false);
    assert.equal(share.findShare('me@hub', 'universe', 'wd1t.home'), null);
});

test('the shared folder is resolved to a real directory', () => {
    const disk = path.join(home, 'disk');
    mkdirSync(disk);
    writeFileSync(path.join(disk, 'file.txt'), 'x');
    symlinkSync(disk, path.join(home, 'link'));
    assert.equal(share.resolveFolder(path.join(home, 'link')), disk);
    assert.throws(() => share.resolveFolder(path.join(home, 'missing')), /Folder not found/);
    assert.throws(() => share.resolveFolder(path.join(disk, 'file.txt')), /Not a folder/);
});

test('`workspace share` is a workspace submodule with add, list, remove and scan', () => {
    const module = workspace.submodules.find((m) => m.name === 'share');
    assert.deepEqual(module.actions.map((a) => a.name), ['add', 'list', 'remove', 'scan']);
    assert.equal(module.defaultAction, 'list');
});
