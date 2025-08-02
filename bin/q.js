#!/usr/bin/env node

// Auto-prefix with 'q' command
import { main } from "../src/index.js";

// Get command line arguments, skip node and script name
const args = process.argv.slice(2);

// Prepend 'q' to the arguments
const qArgs = ["q", ...args];

// Call main with the prefixed arguments
main(qArgs)
  .then(process.exit)
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
