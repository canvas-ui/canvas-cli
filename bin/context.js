#!/usr/bin/env node

// Auto-prefix with 'context' command
import { main } from "../src/index.js";

// Get command line arguments, skip node and script name
const args = process.argv.slice(2);

// Prepend 'context' to the arguments
const contextArgs = ["context", ...args];

// Call main with the prefixed arguments
main(contextArgs)
  .then(process.exit)
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
