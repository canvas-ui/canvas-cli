"use strict";

/**
 * Axios HTTP Transport
 *
 * This transport layer provides HTTP-based communication using axios.
 * It can be used for Canvas API calls and other HTTP-based services.
 */

import axios from "axios";
import { setupDebug } from "../../lib/debug.js";

const debug = setupDebug("canvas:transport:axios");

export class AxiosTransport {
  constructor(config = {}) {
    this.baseURL = config.baseURL;
    this.timeout = config.timeout || 30000;
    this.headers = config.headers || {};

    // Create axios instance
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        Accept: "application/json",
        "User-Agent": "canvas-cli/1.0.0",
        ...this.headers,
      },
    });

    // Setup interceptors
    this.setupInterceptors();
  }

  setupInterceptors() {
    // Request interceptor
    this.client.interceptors.request.use((config) => {
      debug("Request:", config.method?.toUpperCase(), config.url);
      return config;
    });

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        debug("Response:", response.status, response.config.url);
        return response;
      },
      (error) => {
        debug(
          "Error:",
          error.response?.status,
          error.config?.url,
          error.message,
        );
        return Promise.reject(error);
      },
    );
  }

  async request(config) {
    return await this.client.request(config);
  }

  async get(url, config) {
    return await this.client.get(url, config);
  }

  async post(url, data, config) {
    return await this.client.post(url, data, config);
  }

  async put(url, data, config) {
    return await this.client.put(url, data, config);
  }

  async patch(url, data, config) {
    return await this.client.patch(url, data, config);
  }

  async delete(url, config) {
    return await this.client.delete(url, config);
  }
}

export default AxiosTransport;
