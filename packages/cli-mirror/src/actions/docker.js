'use strict';

import { UsageError } from '@augmentd-labs/canvas-cli-host/errors';
import { DIRECTIONS } from '../lib/config.js';
import { findHubWorkspace, listHubWorkspaces, resolveHub } from '../lib/hub.js';

/*
 * `canvas remote mirror docker <workspace>` — print a docker compose project
 * (or a `docker run` line with --run) that mirrors the workspace in a
 * canvas-edge container elsewhere: a NAS, a server. The container configures
 * itself from the environment (runtimes/edge Dockerfile); nothing is written
 * on this device. Fill in the folder to bind at /data.
 */
const yamlStr = (v) => JSON.stringify(String(v));

export default {
    name: 'docker',
    description: 'Print a docker compose project (or --run line) that mirrors a workspace in a canvas-edge container',
    positional: [{ name: 'workspace', required: true }],
    flags: { hub: 'string', folder: 'string', direction: 'string', 'device-id': 'string', 'device-name': 'string', token: 'string', image: 'string', pin: 'string', run: 'boolean' },
    async run({ args, flags, client, session, io }) {
        const remoteId = await resolveHub(flags, client, session, { interactive: false });
        const remote = client.getRemote(remoteId);
        const ws = findHubWorkspace(await listHubWorkspaces(client, remoteId), args.workspace);
        if (!ws) throw new UsageError(`Workspace '${args.workspace}' not found on ${remoteId}`);
        const direction = flags.direction || 'pull';
        if (!DIRECTIONS.includes(direction)) throw new UsageError(`--direction must be ${DIRECTIONS.join('|')}`);
        // A token the container can present. The remote's own device token is
        // bound to THIS device's id; prefer a dedicated one (--token) minted for
        // the container: `canvas remote token create` / a workspace token.
        const token = flags.token || remote?.auth?.token || remote?.device?.token || null;
        if (!token) throw new UsageError(`No token for ${remoteId}; pass --token <canvas-…>`);
        const folder = flags.folder || `/volume1/work/${ws.folderName || ws.name}`;
        const deviceId = flags['device-id'] || `edge-${ws.name}`.replace(/[^a-zA-Z0-9._-]+/g, '-');
        const deviceName = flags['device-name'] || deviceId;
        const image = flags.image || 'ghcr.io/canvas-ui/canvas-edge:latest';
        const env = {
            CANVAS_HUB_URL: remote.url,
            CANVAS_HUB_TOKEN: token,
            CANVAS_WORKSPACE: ws.name,
            CANVAS_DIRECTION: direction,
            CANVAS_DEVICE_ID: deviceId,
            CANVAS_DEVICE_NAME: deviceName,
            ...(flags.pin ? { CANVAS_PINS: flags.pin } : {}),
        };
        const name = `canvas-edge-${ws.name}`.replace(/[^a-zA-Z0-9._-]+/g, '-');
        if (flags.run) {
            const parts = ['docker run -d', `--name ${name}`, '--restart unless-stopped',
                ...Object.entries(env).map(([k, v]) => `-e ${k}=${JSON.stringify(v)}`),
                `-v ${JSON.stringify(folder)}:/data`, `-v ${name}-config:/config`, `-v ${name}-state:/state`, image];
            io.print(parts.join(' \\\n  '));
            return;
        }
        const lines = [
            `# ${ws.folderName || ws.name} ← ${remoteId} (${direction}); bind the real folder at /data`,
            'services:',
            `  ${name}:`,
            `    image: ${image}`,
            `    container_name: ${name}`,
            '    restart: unless-stopped',
            '    environment:',
            ...Object.entries(env).map(([k, v]) => `      ${k}: ${yamlStr(v)}`),
            '    volumes:',
            `      - ${yamlStr(folder)}:/data`,
            `      - ${name}-config:/config`,
            `      - ${name}-state:/state`,
            'volumes:',
            `  ${name}-config:`,
            `  ${name}-state:`,
        ];
        io.print(lines.join('\n'));
        if (!flags.token) io.warn(`Token is ${remoteId}'s own; mint one for the container instead and pass --token.`);
    },
};
