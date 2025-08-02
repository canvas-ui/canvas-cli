#!/usr/bin/env node

// Auto-prefix with 'context' command
import { main } from "../src/index.js";

// Get command line arguments, skip node and script name
const args = process.argv.slice(2);

// Prepend 'dot' to the arguments
const dotArgs = ["dot", ...args];

// Call main with the prefixed arguments
main(dotArgs)
  .then(process.exit)
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
