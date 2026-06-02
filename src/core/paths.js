'use strict';

import os from 'node:os';
import path from 'node:path';

function userHome() {
    const mode = process.env.SERVER_MODE || 'user';
    const home = process.env.SERVER_HOME || process.cwd();
    if (mode !== 'user') return path.join(home, 'users');
    return process.platform === 'win32'
        ? path.join(os.homedir(), 'Canvas')
        : path.join(os.homedir(), '.canvas');
}

export const CANVAS_HOME = process.env.CANVAS_USER_HOME || userHome();
export const DIR_CONFIG = path.join(CANVAS_HOME, 'config');
export const DIR_DB = path.join(CANVAS_HOME, 'db');
export const DIR_DATA = path.join(CANVAS_HOME, 'data');
export const DIR_CACHE = path.join(CANVAS_HOME, 'cache');
export const DIR_VAR = path.join(CANVAS_HOME, 'var');

export const FILE_REMOTES = path.join(DIR_CONFIG, 'remotes.json');
export const FILE_SESSION = path.join(DIR_CONFIG, 'cli-session.json');
export const FILE_ALIASES = path.join(DIR_CONFIG, 'cli-aliases.json');
export const FILE_CONFIG = path.join(DIR_CONFIG, 'cli.json');
export const FILE_CONTEXTS = path.join(DIR_DB, 'contexts.json');
export const FILE_WORKSPACES = path.join(DIR_DB, 'workspaces.json');
export const FILE_AGENTS = path.join(DIR_DB, 'agents.json');
export const FILE_DOTFILES = path.join(DIR_DB, 'dotfiles.json');
