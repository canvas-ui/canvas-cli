#!/usr/bin/env node
'use strict';

import { main } from '../src/core/cli.js';

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
    process.exit(1);
});

main(process.argv.slice(2))
    .then((code) => process.exit(code || 0))
    .catch((err) => {
        console.error(err.message || err);
        if (process.env.DEBUG) console.error(err.stack);
        process.exit(1);
    });
