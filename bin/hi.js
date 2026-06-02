#!/usr/bin/env node
'use strict';

import { main } from '../src/core/cli.js';

const args = process.argv.slice(2);
if (!args.length) {
    console.error('Usage: hi <agent[@remote]> [message]');
    console.error('       tail -f /var/log/syslog | hi linus "any errors?"');
    process.exit(1);
}

main(['agent', ...args])
    .then((code) => process.exit(code || 0))
    .catch((err) => {
        console.error(err.message || err);
        process.exit(1);
    });
