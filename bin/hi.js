#!/usr/bin/env node
'use strict';

// hi <agent[@remote]> [message...] → canvas agent <agent[@remote]> [message...]
import { main } from '../src/index.js';

const args = process.argv.slice(2);
if (!args.length) {
    console.error('Usage: hi <agent[@remote]> [message]');
    console.error('       tail -f /var/log/syslog | hi linus "any errors?"');
    process.exit(1);
}

main(['agent', ...args])
    .then(process.exit)
    .catch((error) => {
        console.error(error.message || error);
        process.exit(1);
    });
