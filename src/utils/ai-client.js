'use strict';

import { setupDebug } from '../lib/debug.js';

const debug = setupDebug('canvas:cli:ai');

/**
 * Base AI Client class
 */
class BaseAIClient {
    constructor(config, connectorConfig) {
        this.config = config;
        this.connectorConfig = connectorConfig;
        this.driver = connectorConfig.driver;
    }

    async query(prompt, options = {}) {
        throw new Error('query method must be implemented by subclass');
    }

    async isAvailable() {
        throw new Error('isAvailable method must be implemented by subclass');
    }
}

/**
 * Anthropic Claude client
 */
class AnthropicClient extends BaseAIClient {
    constructor(config, connectorConfig) {
        super(config, connectorConfig);
        this.apiKey = connectorConfig.apiKey;
        this.model = connectorConfig.model || connectorConfig.defaultModel;
        this.maxTokens = connectorConfig.maxTokens || 4096;
        this.baseURL = 'https://api.anthropic.com/v1';
    }

    async query(prompt, options = {}) {
        if (!this.apiKey) {
            throw new Error(
                'Anthropic API key not configured. Set ANTHROPIC_API_KEY environment variable.',
            );
        }

        const { default: fetch } = await import('node-fetch');

        const response = await fetch(`${this.baseURL}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: options.model || this.model,
                max_tokens: options.maxTokens || this.maxTokens,
                messages: [
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Anthropic API error: ${response.status} ${error}`);
        }

        const data = await response.json();
        return data.content[0].text;
    }

    async isAvailable() {
        return !!this.apiKey;
    }
}

/**
 * OpenAI client
 */
class OpenAIClient extends BaseAIClient {
    constructor(config, connectorConfig) {
        super(config, connectorConfig);
        this.apiKey = connectorConfig.apiKey;
        this.model = connectorConfig.model || connectorConfig.defaultModel;
        this.maxTokens = connectorConfig.maxTokens || 4096;
        this.baseURL = 'https://api.openai.com/v1';
    }

    async query(prompt, options = {}) {
        if (!this.apiKey) {
            throw new Error(
                'OpenAI API key not configured. Set OPENAI_API_KEY environment variable.',
            );
        }

        const { default: fetch } = await import('node-fetch');

        const response = await fetch(`${this.baseURL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: options.model || this.model,
                max_tokens: options.maxTokens || this.maxTokens,
                messages: [
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`OpenAI API error: ${response.status} ${error}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }

    async isAvailable() {
        return !!this.apiKey;
    }
}

/**
 * Ollama client (OpenAI-compatible API)
 */
class OllamaClient extends BaseAIClient {
    constructor(config, connectorConfig) {
        super(config, connectorConfig);
        this.host = connectorConfig.host || 'http://localhost:11434';
        this.model = connectorConfig.model || connectorConfig.defaultModel;
    }

    async query(prompt, options = {}) {
        const { default: fetch } = await import('node-fetch');

        // Use OpenAI-compatible endpoint
        const response = await fetch(`${this.host}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: options.model || this.model,
                messages: [
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Ollama API error: ${response.status} ${error}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }

    async isAvailable() {
        try {
            const { default: fetch } = await import('node-fetch');
            const response = await fetch(`${this.host}/api/tags`, {
                method: 'GET',
                timeout: 2000,
            });
            return response.ok;
        } catch (error) {
            debug('Ollama availability check failed:', error.message);
            return false;
        }
    }
}

/**
 * AI Client Manager
 */
export class AIClientManager {
    constructor(config) {
        this.config = config;
        this.clients = {};
        this.initializeClients();
    }

    initializeClients() {
        const connectors = this.config.get('connectors') || {};

        // Initialize Anthropic client
        if (connectors.anthropic) {
            this.clients.anthropic = new AnthropicClient(
                this.config,
                connectors.anthropic,
            );
        }

        // Initialize OpenAI client
        if (connectors.openai) {
            this.clients.openai = new OpenAIClient(this.config, connectors.openai);
        }

        // Initialize Ollama client
        if (connectors.ollama) {
            this.clients.ollama = new OllamaClient(this.config, connectors.ollama);
        }

        debug('Initialized AI clients:', Object.keys(this.clients));
        debug('Connectors config:', connectors);
    }

    async getAvailableClient(preferredConnector = null) {
    // If a specific connector is requested, try it first
        if (preferredConnector && this.clients[preferredConnector]) {
            const client = this.clients[preferredConnector];
            if (await client.isAvailable()) {
                debug(`Using preferred connector: ${preferredConnector}`);
                return { client, connector: preferredConnector };
            } else {
                debug(`Preferred connector ${preferredConnector} not available`);
            }
        }

        // Try connectors in priority order
        const priority = this.config.get('ai.priority') || [
            'anthropic',
            'openai',
            'ollama',
        ];

        for (const connectorName of priority) {
            const client = this.clients[connectorName];
            if (client && (await client.isAvailable())) {
                debug(`Using available connector: ${connectorName}`);
                return { client, connector: connectorName };
            }
        }

        throw new Error(
            'No AI connectors available. Please configure at least one AI service.',
        );
    }

    async query(prompt, options = {}) {
        const { client, connector } = await this.getAvailableClient(
            options.connector,
        );

        debug(`Querying ${connector} with prompt length: ${prompt.length}`);

        const response = await client.query(prompt, options);

        debug(`Received response from ${connector}, length: ${response.length}`);

        return {
            response,
            connector,
            model: options.model || client.model,
        };
    }

    getConnectorInfo() {
        const info = {};
        for (const [name, client] of Object.entries(this.clients)) {
            info[name] = {
                driver: client.driver,
                model: client.model,
                available: null, // Will be checked async
            };
        }
        return info;
    }

    async getConnectorStatus() {
        const status = {};
        for (const [name, client] of Object.entries(this.clients)) {
            status[name] = {
                driver: client.driver,
                model: client.model,
                available: await client.isAvailable(),
            };
        }
        return status;
    }
}

export default AIClientManager;
