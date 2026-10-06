import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { certificates, nginxFixture } from '../../canvas-common/packages/api-client/tests/support/fixture.js';
test('CLI TLS configuration survives authentication and clears without deleting keys', async () => {
    const dir = certificates(); const fixture = await nginxFixture(dir);
    const home = join(dir, 'home'); const id = 'user@tls';
    const run = args => new Promise((done, reject) => {
        const child = spawn(process.env.CANVAS_TEST_CLI_BIN || process.execPath, [...(process.env.CANVAS_TEST_CLI_BIN ? [] : [resolve('bin/canvas.js')]), ...args], {
            env: { ...process.env, CANVAS_USER_HOME: home, NODE_EXTRA_CA_CERTS: join(dir, 'root.crt') }, stdio: ['ignore', 'pipe', 'pipe'],
        });
        let output = ''; child.stdout.on('data', d => output += d); child.stderr.on('data', d => output += d);
        child.on('error', reject); child.on('exit', code => done({ code, output }));
    });
    const remote = () => JSON.parse(readFileSync(join(home, 'config/remotes.json'), 'utf8'))[id];
    try {
        const added = await run(['remote', 'add', id, fixture.url, '--token', 'canvas-test-token', '--tls-cert', join(dir, 'client.chain.crt'), '--tls-key', join(dir, 'client.key')]);
        assert.equal(added.code, 0, added.output); assert.equal(remote().tls.certFile, join(dir, 'client.chain.crt'));
        const ping = await run(['remote', 'ping', id]); assert.equal(ping.code, 0, ping.output);
        const login = await run(['remote', 'login', id, '--token', 'canvas-test-token']); assert.equal(login.code, 0, login.output);
        assert.equal(remote().tls.keyFile, join(dir, 'client.key'));
        const invalid = await run(['remote', 'tls', 'set', id, '--tls-cert', join(dir, 'client.chain.crt'), '--tls-key', join(dir, 'other.key')]);
        assert.notEqual(invalid.code, 0); assert.match(invalid.output, /do not match/); assert.equal(remote().tls.keyFile, join(dir, 'client.key'));
        const show = await run(['remote', id, 'tls', 'show']); assert.equal(show.code, 0, show.output); assert.match(show.output, /client.chain.crt/);
        const clear = await run(['remote', 'tls', 'clear', id]); assert.equal(clear.code, 0, clear.output);
        assert.equal(remote().tls, undefined); assert.ok(existsSync(join(dir, 'client.key')));
    } finally { await fixture.close(); rmSync(dir, { recursive: true, force: true }); }
});
