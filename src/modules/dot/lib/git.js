'use strict';

import { spawn } from 'node:child_process';
import { CanvasError } from '../../../core/errors.js';

export function git(args, { cwd, input } = {}) {
    return new Promise((resolve, reject) => {
        const proc = spawn('git', args, {
            cwd,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        });
        let stdout = '', stderr = '';
        proc.stdout.on('data', (d) => stdout += d);
        proc.stderr.on('data', (d) => stderr += d);
        proc.on('error', reject);
        proc.on('close', (code) => {
            if (code === 0) resolve({ stdout, stderr });
            else reject(new CanvasError(`git ${args.join(' ')} failed (${code}): ${stderr || stdout}`));
        });
        if (input != null) proc.stdin.write(input);
        proc.stdin.end();
    });
}

export async function isRepo(cwd) {
    try { await git(['rev-parse', '--git-dir'], { cwd }); return true; }
    catch { return false; }
}

export async function currentBranch(cwd) {
    const { stdout } = await git(['branch', '--show-current'], { cwd });
    return stdout.trim();
}

export async function status(cwd) {
    const { stdout } = await git(['status', '--porcelain=v1'], { cwd });
    return stdout
        .split('\n')
        .filter(Boolean)
        .map((line) => ({ flag: line.slice(0, 2), path: line.slice(3) }));
}

export async function aheadBehind(cwd, branch) {
    try {
        const { stdout } = await git(
            ['rev-list', '--left-right', '--count', `origin/${branch}...${branch}`],
            { cwd },
        );
        const [behind, ahead] = stdout.trim().split(/\s+/).map(Number);
        return { ahead, behind };
    } catch { return { ahead: 0, behind: 0 }; }
}
