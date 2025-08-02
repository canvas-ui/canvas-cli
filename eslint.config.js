import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },
    rules: {
      // Relaxed rules for CLI development
      "no-console": "off",
      "no-process-exit": "off",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "prefer-const": "warn",
      "no-var": "error",
      semi: ["error", "always"],
      quotes: ["warn", "single", { allowTemplateLiterals: true }],
      indent: ["warn", 4, { SwitchCase: 1 }],
      "no-trailing-spaces": "warn",
      "eol-last": "warn",
    },
  },
  {
    // Specific rules for bin files
    files: ["bin/**/*.js"],
    rules: {
      "no-console": "off",
      "no-process-exit": "off",
    },
  },
  {
    // Ignore patterns
    ignores: [
      "node_modules/**",
      "dist/**",
      "_OLD_/**",
      "release-assets/**",
      "*.min.js",
    ],
  },
];
