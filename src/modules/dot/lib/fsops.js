'use strict';

import {
    existsSync, mkdirSync, copyFileSync, cpSync, lstatSync, readlinkSync,
    symlinkSync, unlinkSync, statSync, renameSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import os from 'node:os';

export function expandHome(p) {
    if (!p) return p;
    if (p.startsWith('~')) return p.replace(/^~/, os.homedir());
    if (p.includes('$HOME')) return p.replaceAll('$HOME', os.homedir());
    return p;
}

export function collapseHome(p) {
    const home = os.homedir();
    if (p.startsWith(home)) return p.replace(home, '$HOME');
    return p;
}

export function ensureDir(p) {
    if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

export function ensureParent(p) {
    ensureDir(dirname(p));
}

export function backup(target) {
    if (!existsSync(target)) return null;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = `${target}.canvas-backup.${stamp}`;
    renameSync(target, dest);
    return dest;
}

export function symlinkInto(target, linkPath) {
    ensureParent(linkPath);
    if (existsSync(linkPath) || isBrokenSymlink(linkPath)) backup(linkPath);
    symlinkSync(resolve(target), linkPath);
}

export function copyInto(source, target) {
    ensureParent(target);
    if (existsSync(target) || isBrokenSymlink(target)) backup(target);
    const stat = lstatSync(source);
    if (stat.isDirectory()) {
        cpSync(source, target, { recursive: true, dereference: false });
    } else {
        copyFileSync(source, target);
    }
}

export function isAppliedSymlink(linkPath, expectedTarget) {
    try {
        const lst = lstatSync(linkPath);
        if (!lst.isSymbolicLink()) return false;
        return resolve(readlinkSync(linkPath)) === resolve(expectedTarget);
    } catch { return false; }
}

function isBrokenSymlink(p) {
    try { lstatSync(p); statSync(p); return false; }
    catch { try { lstatSync(p); return true; } catch { return false; } }
}

export function unlinkSafe(p) {
    try { unlinkSync(p); return true; } catch { return false; }
}
