'use strict';

/**
 * Socket.IO Transport
 *
 * This transport layer provides real-time communication using socket.io.
 * Currently a placeholder for future real-time features.
 */

import { io } from 'socket.io-client';
import { setupDebug } from '../../lib/debug.js';

const debug = setupDebug('canvas:transport:socketio');

export class SocketIOTransport {
    constructor(config = {}) {
        this.url = config.url;
        this.options = config.options || {};
        this.socket = null;
        this.connected = false;
    }

    async connect() {
        return new Promise((resolve, reject) => {
            debug('Connecting to:', this.url);

            this.socket = io(this.url, this.options);

            this.socket.on('connect', () => {
                debug('Connected successfully');
                this.connected = true;
                resolve();
            });

            this.socket.on('disconnect', () => {
                debug('Disconnected');
                this.connected = false;
            });

            this.socket.on('connect_error', (error) => {
                debug('Connection error:', error.message);
                this.connected = false;
                reject(error);
            });
        });
    }

    async disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.connected = false;
            debug('Disconnected');
        }
    }

    emit(event, data) {
        if (!this.connected) {
            throw new Error('Socket not connected');
        }
        this.socket.emit(event, data);
    }

    on(event, callback) {
        if (!this.socket) {
            throw new Error('Socket not initialized');
        }
        this.socket.on(event, callback);
    }

    off(event, callback) {
        if (!this.socket) {
            throw new Error('Socket not initialized');
        }
        this.socket.off(event, callback);
    }
}

export default SocketIOTransport;
