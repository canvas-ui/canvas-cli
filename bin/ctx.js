#!/usr/bin/env node

// Auto-prefix with 'context' command
import { main } from '../src/index.js';

const args = process.argv.slice(2);
const ctxArgs = ['context', ...args];

main(ctxArgs)
  .then(process.exit)
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
