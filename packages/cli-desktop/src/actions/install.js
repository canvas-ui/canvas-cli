'use strict';

import path from 'node:path';
import { spinner } from '@augmentd-labs/canvas-cli-host/prompt';
import { CanvasError } from '@augmentd-labs/canvas-cli-host/errors';
import { APP_DIR, download, installed, latestRelease, pickAsset, remember } from '../lib/release.js';

export default {
    name: 'install',
    aliases: ['update'],
    description: `Download the latest desktop release for this platform into ${APP_DIR}`,
    flags: { force: 'boolean' },
    async run({ flags, io }) {
        const s = spinner();
        s.start('Looking up the latest desktop release…');
        const rel = await latestRelease();
        const asset = pickAsset(rel);
        if (!asset) { s.stop('No matching asset'); throw new CanvasError(`${rel.tag_name} has no installer for ${process.platform}/${process.arch}: ${(rel.assets || []).map((a) => a.name).join(', ')}`); }
        const cur = installed();
        if (!flags.force && cur?.tag === rel.tag_name && cur?.asset === asset.name) { s.stop(`${rel.tag_name} already installed (${cur.path})`); return; }
        s.message(`Downloading ${asset.name} (${Math.round(asset.size / 1048576)} MB)…`);
        const dest = path.join(APP_DIR, asset.name);
        await download(asset, dest);
        remember({ tag: rel.tag_name, asset: asset.name, path: dest, installedAt: new Date().toISOString() });
        s.stop(`${rel.tag_name} → ${dest}`);
        io.success(/\.(deb|msi|dmg)$/i.test(asset.name) ? `Installer downloaded — open it to install, or run \`canvas desktop open\`` : 'Run `canvas desktop open`');
    },
};
