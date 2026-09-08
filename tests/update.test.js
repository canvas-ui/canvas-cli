import { test, describe } from 'node:test';
import assert from 'node:assert';
import os from 'node:os';
import path from 'node:path';
import { assetFor, compareVersions, installMode, isNewer, parseVersion } from '../src/core/update.js';

describe('canvas update: version and platform helpers', () => {
    test('parseVersion accepts bare, v- and cli-v- forms', () => {
        assert.equal(parseVersion('2.7.1').text, '2.7.1');
        assert.equal(parseVersion('v2.7.1').text, '2.7.1');
        assert.equal(parseVersion('cli-v2.10.0').text, '2.10.0');
        assert.equal(parseVersion('2.8.0-rc.1').pre, 'rc.1');
        assert.equal(parseVersion('server-v2.8.7'), null);
        assert.equal(parseVersion('latest'), null);
    });

    test('compareVersions orders numerically, prerelease below release', () => {
        assert.equal(compareVersions('2.10.0', '2.9.9'), 1);
        assert.equal(compareVersions('2.7.1', 'cli-v2.7.1'), 0);
        assert.equal(compareVersions('2.8.0-rc.1', '2.8.0'), -1);
        assert.ok(isNewer('3.0.0', '2.99.99'));
        assert.ok(!isNewer('2.7.1', '2.7.1'));
    });

    test('assetFor mirrors the installer asset names', () => {
        assert.equal(assetFor('linux', 'x64'), 'canvas-linux');
        assert.equal(assetFor('linux', 'arm64'), 'canvas-linux-arm');
        assert.equal(assetFor('darwin', 'x64'), 'canvas-macos');
        assert.equal(assetFor('darwin', 'arm64'), 'canvas-macos-arm');
        assert.equal(assetFor('win32', 'x64'), 'canvas-windows.exe');
        assert.equal(assetFor('freebsd', 'x64'), null);
    });

    test('installMode tells a compiled binary, an npm install and a source checkout apart', () => {
        const bin = installMode({ execPath: path.join(os.homedir(), '.local/bin/canvas'), versions: { bun: '1.2.0' } });
        assert.equal(bin.mode, 'binary');
        assert.equal(installMode({ execPath: 'C:\\Users\\me\\AppData\\Local\\Programs\\canvas\\canvas.exe', versions: { bun: '1.2.0' } }).mode, 'binary');
        // node running bin/canvas.js under a global node_modules: no monorepo markers around it
        assert.equal(installMode({ execPath: '/usr/bin/node', versions: { node: '22' }, here: '/usr/lib/node_modules/@augmentd-labs/canvas-cli/src/core' }).mode, 'npm');
        // this very checkout
        const src = installMode({ execPath: '/usr/bin/node', versions: { node: '22' } });
        assert.equal(src.mode, 'source');
    });
});
