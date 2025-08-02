"use strict";

import debugInstance from "debug";
const debug = debugInstance("canvas:cli:utils");

function parseInput(parsedArgs) {
  // Parse the args array "_" to get the CLI "action"
  const command = parsedArgs["_"][0] || null;
  const args = parsedArgs["_"].slice(1) || [];
  const options = { ...parsedArgs };
  delete options["_"];
  const data = null; // Will be set later if stdin data is available

  debug("command:", command);
  debug("args:", args);
  debug("options:", options);
  debug("data:", data);

  // Parse the context array
  // Providing context as a parameter won't change the global context
  let contextArray = [];
  if (options["context"]) {
    contextArray =
      typeof options["context"] === "string"
        ? [options["context"]]
        : options["context"];
  }

  // Parse the "features" array
  // Features are populated by the runtime itself when adding objects
  // Useful to specify an undetected feature or create a custom one.
  let featureArray = [];
  if (options["feature"]) {
    featureArray =
      typeof options["feature"] === "string"
        ? [options["feature"]]
        : options["feature"];
  }

  // Parse the "filters" array
  // Example: $0 notes -s datetime/today -s name/regexp/^foo/
  let filterArray = [];
  if (options["filter"]) {
    filterArray =
      typeof options["filter"] === "string"
        ? [options["filter"]]
        : options["filter"];
  }

  debug("contextArray:", contextArray);
  debug("featureArray:", featureArray);
  debug("filterArray:", filterArray);

  return {
    command,
    args,
    options,
    data,
    contextArray,
    featureArray,
    filterArray,
  };
}

export { parseInput };
