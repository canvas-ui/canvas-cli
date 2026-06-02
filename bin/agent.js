#!/usr/bin/env node
'use strict';

import { main } from '../src/core/cli.js';

main(['agent', ...process.argv.slice(2)])
    .then((code) => process.exit(code || 0))
    .catch((err) => { console.error(err.message || err); process.exit(1); });
