"use strict";

import chalk from "chalk";
import BaseCommand from "./base.js";
import { AIClientManager } from "../utils/ai-client.js";
import { PromptRenderer, ContextFormatter } from "../utils/prompt-templates.js";

/**
 * Q (AI Query) command
 */
export class QCommand extends BaseCommand {
  constructor(config) {
    super(config);
    this.options = null;
    this.aiManager = new AIClientManager(config);
    this.promptRenderer = new PromptRenderer();
  }

  async execute(parsed) {
    try {
      this.options = parsed.options;

      // Collect client context for this execution
      this.collectClientContext();

      // Handle subcommands
      const subcommand = parsed.args[0];

      if (subcommand === "status") {
        return await this.handleStatus(parsed);
      }

      if (subcommand === "templates") {
        return await this.handleTemplates(parsed);
      }

      if (subcommand === "help" || parsed.options.help) {
        this.showHelp();
        return 0;
      }

      // Skip server connection check for AI queries (they don't require Canvas server)
      // But we'll try to get context info if available
      let currentContext = null;
      try {
        const contextAddress = await this.getCurrentContext(parsed.options);
        const response = await this.apiClient.getContext(contextAddress);
        currentContext = response.payload || response.data || response;

        // Extract context from nested response if needed
        if (currentContext && currentContext.context) {
          currentContext = currentContext.context;
        }
      } catch (error) {
        this.debug(
          "Could not fetch context info (server may be offline or no default remote):",
          error.message,
        );
        // Continue without context info
      }

      // Handle the query
      return await this.handleQuery(parsed, currentContext);
    } catch (error) {
      console.error(chalk.red("Error:"), error.message);
      if (process.env.DEBUG) {
        console.error(error.stack);
      }
      return 1;
    }
  }

  /**
   * Handle AI query
   */
  async handleQuery(parsed, currentContext = null) {
    const query = parsed.args.join(" ");
    const stdinData = parsed.data;

    if (!query && !stdinData) {
      console.error(
        chalk.red("Error: Please provide a query or pipe data to analyze"),
      );
      this.showHelp();
      return 1;
    }

    // Determine template based on options or data
    let templateName =
      this.options.template ||
      this.config.get("ai.contextTemplate") ||
      "canvas-assistant";

    if (stdinData && !query) {
      templateName = "data-analysis";
    } else if (this.options.code || this.isCodeQuery(query)) {
      templateName = "code-assistant";
    }

    // Prepare template variables
    const variables = {
      userQuery: query || "Please analyze the provided data",
      stdinData: stdinData,
      contextInfo: ContextFormatter.formatContextInfo(currentContext),
      clientInfo: ContextFormatter.formatClientInfo(this.llmContext),
    };

    // Render the prompt
    const prompt = this.promptRenderer.render(templateName, variables);

    this.debug("Generated prompt length:", prompt.length);
    this.debug("Using template:", templateName);

    // Show prompt if requested
    if (this.options["show-prompt"] || this.options["show-prompt-only"]) {
      console.log(chalk.bold.yellow("📝 Rendered Prompt:"));
      console.log(chalk.gray("─".repeat(80)));
      console.log(prompt);
      console.log(chalk.gray("─".repeat(80)));
      console.log();

      // If only showing prompt, exit here
      if (this.options["show-prompt-only"]) {
        return 0;
      }
    }

    try {
      // Show thinking indicator
      if (!this.options.quiet && !this.options["show-prompt"]) {
        process.stderr.write(chalk.gray("🤔 Thinking..."));
      }

      // Query the AI
      const result = await this.aiManager.query(prompt, {
        connector: this.options.connector,
        model: this.options.model,
        maxTokens: this.options.maxTokens,
      });

      // Clear thinking indicator
      if (!this.options.quiet) {
        process.stderr.write("\r" + " ".repeat(20) + "\r");
      }

      // Output the response
      if (this.options.raw) {
        console.log(
          JSON.stringify(
            {
              query: query,
              response: result.response,
              connector: result.connector,
              model: result.model,
              template: templateName,
              hasStdinData: !!stdinData,
            },
            null,
            2,
          ),
        );
      } else {
        console.log(result.response);

        if (!this.options.quiet) {
          console.log();
          console.log(chalk.gray(`─ ${result.connector} (${result.model})`));
        }
      }

      return 0;
    } catch (error) {
      // Clear thinking indicator
      if (!this.options.quiet) {
        process.stderr.write("\r" + " ".repeat(20) + "\r");
      }

      throw new Error(`AI query failed: ${error.message}`);
    }
  }

  /**
   * Check if query is code-related
   */
  isCodeQuery(query) {
    const codeKeywords = [
      "code",
      "function",
      "class",
      "method",
      "variable",
      "bug",
      "debug",
      "error",
      "exception",
      "syntax",
      "algorithm",
      "refactor",
      "optimize",
      "review",
      "test",
      "unit test",
      "integration",
      "api",
      "database",
      "sql",
      "javascript",
      "python",
      "java",
      "typescript",
      "react",
      "node",
      "npm",
      "git",
      "repository",
      "commit",
      "branch",
      "merge",
    ];

    const lowerQuery = query.toLowerCase();
    return codeKeywords.some((keyword) => lowerQuery.includes(keyword));
  }

  /**
   * Show connector status
   */
  async handleStatus(parsed) {
    try {
      const status = await this.aiManager.getConnectorStatus();

      console.log(chalk.bold("AI Connector Status:"));
      console.log();

      for (const [name, info] of Object.entries(status)) {
        const statusIcon = info.available ? chalk.green("✓") : chalk.red("✗");
        const statusText = info.available
          ? chalk.green("Available")
          : chalk.red("Unavailable");

        console.log(`${statusIcon} ${chalk.cyan(name)}`);
        console.log(`  Driver: ${info.driver}`);
        console.log(`  Model: ${info.model}`);
        console.log(`  Status: ${statusText}`);
        console.log();
      }

      // Show priority order
      const priority = this.config.get("ai.priority") || [];
      console.log(chalk.bold("Priority Order:"));
      priority.forEach((connector, index) => {
        console.log(`  ${index + 1}. ${connector}`);
      });

      return 0;
    } catch (error) {
      throw new Error(`Failed to get connector status: ${error.message}`);
    }
  }

  /**
   * List available templates
   */
  async handleTemplates(parsed) {
    const templates = this.promptRenderer.listTemplates();

    console.log(chalk.bold("Available Prompt Templates:"));
    console.log();

    for (const templateName of templates) {
      const template = this.promptRenderer.getTemplate(templateName);
      console.log(`${chalk.cyan(templateName)}`);
      console.log(`  ${template.description}`);
      console.log();
    }

    return 0;
  }

  /**
   * Show help
   */
  showHelp() {
    console.log(chalk.bold("Q (AI Query) Commands:"));
    console.log("  q <query>             Ask the AI assistant");
    console.log("  q status              Show AI connector status");
    console.log("  q templates           List available prompt templates");
    console.log();
    console.log(chalk.bold("Options:"));
    console.log(
      "  --connector <name>    Use specific AI connector (anthropic, openai, ollama)",
    );
    console.log("  --model <name>        Use specific model");
    console.log("  --template <name>     Use specific prompt template");
    console.log("  --max-tokens <num>    Maximum tokens for response");
    console.log("  --code                Use code assistant template");
    console.log("  --raw                 Output raw JSON response");
    console.log("  --quiet               Suppress status messages");
    console.log(
      "  --show-prompt         Display the rendered prompt before sending",
    );
    console.log(
      "  --show-prompt-only    Display the rendered prompt and exit (no AI call)",
    );
    console.log();
    console.log(chalk.bold("Examples:"));
    console.log('  canvas q "How do I create a new context?"');
    console.log('  canvas q "Explain this error" --code');
    console.log('  canvas q --connector ollama "What is Canvas?"');
    console.log('  cat error.log | canvas q "What does this error mean?"');
    console.log('  ps aux | canvas q "Are there any suspicious processes?"');
    console.log("  canvas q status");
    console.log("  canvas q templates");
    console.log();
    console.log(chalk.bold("Debug Examples:"));
    console.log('  canvas q "Test query" --show-prompt');
    console.log('  canvas q "Test query" --show-prompt-only');
    console.log("  cat data.txt | canvas q --show-prompt-only");
    console.log();
    console.log(chalk.bold("Configuration:"));
    console.log("  Set API keys via environment variables:");
    console.log('    export ANTHROPIC_API_KEY="your-key"');
    console.log('    export OPENAI_API_KEY="your-key"');
    console.log("  Configure Ollama host in config:");
    console.log(
      "    canvas config set connectors.ollama.host http://localhost:11434",
    );
    console.log();
    console.log(
      chalk.cyan(
        "The AI assistant is context-aware and will include information",
      ),
    );
    console.log(
      chalk.cyan(
        "about your current Canvas context and environment in queries.",
      ),
    );
  }
}

export default QCommand;
