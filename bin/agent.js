#!/usr/bin/env node

// Auto-prefix with 'agent' command
import { main } from '../src/index.js';

const args = process.argv.slice(2);
const agentArgs = ['agent', ...args];

main(agentArgs)
  .then(process.exit)
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
