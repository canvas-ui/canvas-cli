#!/usr/bin/env node

// Auto-prefix with 'workspace' command
import { main } from "../src/index.js";

// Get command line arguments, skip node and script name
const args = process.argv.slice(2);

// Prepend 'workspace' to the arguments
const workspaceArgs = ["workspace", ...args];

// Call main with the prefixed arguments
main(workspaceArgs)
  .then(process.exit)
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
