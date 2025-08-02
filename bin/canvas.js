#!/usr/bin/env node

import { main } from '../src/index.js';

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

// Run the main CLI function and handle exit codes
main(process.argv.slice(2))
    .then((exitCode) => {
        process.exit(exitCode || 0);
    })
    .catch((error) => {
        console.error('CLI Error:', error.message);
        if (process.env.DEBUG) {
            console.error(error.stack);
        }
        process.exit(1);
    });
