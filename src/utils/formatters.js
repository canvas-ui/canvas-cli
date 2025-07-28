'use strict';

import Table from 'cli-table3';
import chalk from 'chalk';
import { format } from 'date-fns';

/**
 * Base formatter class
 */
class BaseFormatter {
    constructor(options = {}) {
        this.options = {
            raw: false,
            format: 'table',
            ...options
        };
    }

    format(data, session = null) {
        if (this.options.raw) {
            return JSON.stringify(data, null, 2);
        }

        switch (this.options.format) {
            case 'json':
                return JSON.stringify(data, null, 2);
            case 'csv':
                return this.formatCsv(data);
            case 'table':
            default:
                return this.formatTable(data, session);
        }
    }

    formatTable(data, session = null) {
        if (!Array.isArray(data)) {
            data = [data];
        }

        if (data.length === 0 || !data[0]) {
            return chalk.yellow('No data found');
        }

        return this.formatGenericTable(data);
    }

    formatCsv(data, schema) {
        if (!Array.isArray(data)) {
            data = [data];
        }

        if (data.length === 0) {
            return '';
        }

        const headers = Object.keys(data[0]);
        const rows = data.map(item =>
            headers.map(header => {
                const value = item[header];
                if (value === null || value === undefined) {
                    return '';
                }
                if (typeof value === 'object') {
                    // Serialize objects as JSON
                    return JSON.stringify(value);
                }
                // Escape commas and quotes in string values
                if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                    return `"${value.replace(/"/g, '""')}"`;
                }
                return String(value);
            })
        );

        return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    }

    formatGenericTable(data) {
        const table = new Table({
            head: Object.keys(data[0]).map(key => chalk.cyan(key)),
            style: { head: [], border: [] }
        });

        data.forEach(item => {
            table.push(Object.values(item));
        });

        return table.toString();
    }

    formatDate(dateString) {
        if (!dateString) return 'N/A';
        try {
            return format(new Date(dateString), 'yyyy-MM-dd HH:mm:ss');
        } catch {
            return dateString;
        }
    }

    truncate(text, length = 50) {
        if (!text) return '';
        return text.length > length ? text.substring(0, length) + '...' : text;
    }
}

/**
 * Workspace formatter
 */
export class WorkspaceFormatter extends BaseFormatter {
    formatTable(data, session = null) {
        if (!Array.isArray(data)) {
            // Single workspace - show detailed vertical table
            return this.formatDetailedTable(data);
        }

        // Multiple workspaces - show list table
        return this.formatListTable(data, session);
    }

    formatListTable(data, session = null) {
        if (data.length === 0 || !data[0]) {
            return chalk.yellow('No workspaces found');
        }

        const table = new Table({
            head: [
                chalk.cyan('Address'),
                chalk.cyan('Name'),
                chalk.cyan('Owner'),
                chalk.cyan('Color'),
                chalk.cyan('Description'),
                chalk.cyan('Created'),
                chalk.cyan('Default'),
                chalk.cyan('Status')
            ],
            style: { head: [], border: [] }
        });

        data.forEach(workspace => {
            if (workspace) {
                // Check if this workspace is the default workspace
                const isDefault = session && session.defaultWorkspace && 
                    (session.defaultWorkspace === workspace.id || 
                     session.defaultWorkspace === `${workspace.address}:${workspace.id}`);
                const defaultMark = isDefault ? chalk.green('✓') : '';
                
                table.push([
                    workspace.address || workspace.remote || 'N/A',
                    workspace.label || workspace.name || 'N/A',
                    this.truncate(workspace.ownerEmail || workspace.owner, 20),
                    this.formatColor(workspace.color),
                    this.truncate(workspace.description, 25),
                    this.formatDate(workspace.created || workspace.createdAt),
                    defaultMark,
                    this.formatWorkspaceStatus(workspace.status)
                ]);
            }
        });

        return table.toString();
    }

    formatDetailedTable(workspace) {
        if (!workspace) {
            return chalk.yellow('No workspace data found');
        }

        const table = new Table({
            style: { head: [], border: [] }
        });

        // Basic information
        table.push([chalk.cyan('ID'), workspace.id || 'N/A']);
        table.push([chalk.cyan('Owner'), workspace.ownerEmail || workspace.owner || 'N/A']);
        table.push([chalk.cyan('Type'), workspace.type || 'N/A']);
        table.push([chalk.cyan('Label'), workspace.label || 'N/A']);
        table.push([chalk.cyan('Color'), this.formatColor(workspace.color)]);
        table.push([chalk.cyan('Description'), workspace.description || 'N/A']);

        // ACL - JSON stringify for safety
        if (workspace.acl) {
            table.push([chalk.cyan('ACL'), JSON.stringify(workspace.acl, null, 2)]);
        }

        // Timestamps
        table.push([chalk.cyan('Created'), this.formatDate(workspace.created)]);
        table.push([chalk.cyan('Updated'), this.formatDate(workspace.updated)]);

        // Metadata - JSON stringify
        if (workspace.metadata) {
            table.push([chalk.cyan('Metadata'), JSON.stringify(workspace.metadata, null, 2)]);
        }

        // Paths
        if (workspace.rootPath) {
            table.push([chalk.cyan('Root Path'), workspace.rootPath]);
        }

        if (workspace.configPath) {
            table.push([chalk.cyan('Config Path'), workspace.configPath]);
        }

        // Status with color
        table.push([chalk.cyan('Status'), this.formatWorkspaceStatus(workspace.status)]);

        return table.toString();
    }

    formatWorkspaceStatus(status) {

        const statusColors = {
            active: chalk.green,
            inactive: chalk.yellow,
            error: chalk.red,
            available: chalk.blue,
            not_found: chalk.red,
            removed: chalk.red,
            destroyed: chalk.red,
        };

        if (!status) return 'N/A';

        if (statusColors[status]) {
            return statusColors[status](status);
        }


        return status;
    }

    /**
     * Format color field with the actual color styling
     */
    formatColor(colorValue) {
        if (!colorValue) return 'N/A';

        // Convert hex color to chalk color
        try {
            // Remove # if present and validate hex format
            const hex = colorValue.replace('#', '');

            // Validate hex format (should be 6 characters)
            if (!/^[0-9A-Fa-f]{6}$/.test(hex)) {
                return colorValue; // Return uncolored if invalid format
            }

            // Convert hex to RGB
            const r = parseInt(hex.substr(0, 2), 16);
            const g = parseInt(hex.substr(2, 2), 16);
            const b = parseInt(hex.substr(4, 2), 16);

            // For very light colors (like white), add a background to make them visible
            if (r > 240 && g > 240 && b > 240) {
                // Light color - use dark background
                return chalk.rgb(r, g, b).bgGray(colorValue);
            } else if (r < 50 && g < 50 && b < 50) {
                // Very dark color - use light background
                return chalk.rgb(r, g, b).bgWhite(colorValue);
            } else {
                // Normal color - just color the text
                return chalk.rgb(r, g, b)(colorValue);
            }
        } catch (error) {
            // Fallback to uncolored text if color parsing fails
            return colorValue;
        }
    }
}

/**
 * Context formatter
 */
export class ContextFormatter extends BaseFormatter {
    formatTable(data, session = null) {
        if (!Array.isArray(data)) {
            // Single context - show detailed vertical table
            return this.formatDetailedTable(data);
        }

        // Multiple contexts - show list table
        return this.formatListTable(data, session);
    }

    formatListTable(data, session = null) {
        if (data.length === 0 || !data[0]) {
            return chalk.yellow('No contexts found');
        }

        const table = new Table({
            head: [
                chalk.cyan('Address'),
                chalk.cyan('Name'),
                chalk.cyan('URL'),
                chalk.cyan('BaseUrl'),
                chalk.cyan('Owner'),
                chalk.cyan('Locked'),
                chalk.cyan('Bound')
            ],
            style: { head: [], border: [] }
        });

        data.forEach(context => {
            const owner = context.ownerEmail || context.userId || 'N/A';
            const locked = context.locked ? chalk.red('Yes') : chalk.green('No');
            const contextId = this.formatContextId(context.id, context.color);
            
            // Check if this context is the bound context
            const isBound = session && session.boundContext && 
                (session.boundContext === context.id || 
                 session.boundContext === `${context.address}:${context.id}`);
            const boundMark = isBound ? chalk.green('✓') : '';

            table.push([
                context.address || context.remote || 'N/A',
                contextId,
                this.truncate(context.url || 'N/A', 35),
                context.baseUrl || 'N/A',
                this.truncate(owner, 20),
                locked,
                boundMark
            ]);
        });

        return table.toString();
    }

    formatDetailedTable(context) {
        if (!context) {
            return chalk.yellow('No context data found');
        }

        const table = new Table({
            style: { head: [], border: [] }
        });

        // Basic information
        table.push([chalk.cyan('ID'), context.id || 'N/A']);
        table.push([chalk.cyan('Owner'), context.ownerEmail || context.userId || 'N/A']);
        table.push([chalk.cyan('URL'), context.url || 'N/A']);
        table.push([chalk.cyan('Base URL'), context.baseUrl || 'N/A']);
        table.push([chalk.cyan('Path'), context.path || 'N/A']);
        table.push([chalk.cyan('Workspace ID'), context.workspaceId || 'N/A']);

        // Timestamps
        table.push([chalk.cyan('Created'), this.formatDate(context.createdAt)]);
        table.push([chalk.cyan('Updated'), this.formatDate(context.updatedAt)]);

        // Status
        const locked = context.locked ? chalk.red('Yes') : chalk.green('No');
        table.push([chalk.cyan('Locked'), locked]);

        const shared = context.isShared ? chalk.green('Yes') : chalk.red('No');
        table.push([chalk.cyan('Shared'), shared]);

        if (context.sharedVia) {
            table.push([chalk.cyan('Shared Via'), context.sharedVia]);
        }

        // Arrays
        if (context.pathArray && Array.isArray(context.pathArray)) {
            table.push([chalk.cyan('Path Array'), this.formatArrayVertical(context.pathArray)]);
        }

        if (context.serverContextArray && Array.isArray(context.serverContextArray)) {
            table.push([chalk.cyan('Server Context Array'), this.formatArrayVertical(context.serverContextArray)]);
        }

        if (context.clientContextArray && Array.isArray(context.clientContextArray)) {
            table.push([chalk.cyan('Client Context Array'), this.formatArrayVertical(context.clientContextArray)]);
        }

        if (context.contextBitmapArray && Array.isArray(context.contextBitmapArray)) {
            table.push([chalk.cyan('Context Bitmap Array'), this.formatArrayVertical(context.contextBitmapArray)]);
        }

        if (context.featureBitmapArray && Array.isArray(context.featureBitmapArray)) {
            table.push([chalk.cyan('Feature Bitmap Array'), this.formatArrayVertical(context.featureBitmapArray)]);
        }

        if (context.filterArray && Array.isArray(context.filterArray)) {
            table.push([chalk.cyan('Filter Array'), this.formatArrayVertical(context.filterArray)]);
        }

        // ACL
        if (context.acl && Object.keys(context.acl).length > 0) {
            const aclEntries = Object.entries(context.acl).map(([user, permission]) => `${user}: ${permission}`);
            table.push([chalk.cyan('ACL'), aclEntries.join('\n')]);
        }

        // Pending URL
        if (context.pendingUrl) {
            table.push([chalk.cyan('Pending URL'), context.pendingUrl]);
        }

        return table.toString();
    }

    /**
     * Format context ID with color styling
     */
    formatContextId(contextId, colorValue) {
        if (!contextId) return 'N/A';
        if (!colorValue) return contextId;

        // Use the same color formatting logic as workspace formatter
        try {
            // Remove # if present and validate hex format
            const hex = colorValue.replace('#', '');

            // Validate hex format (should be 6 characters)
            if (!/^[0-9A-Fa-f]{6}$/.test(hex)) {
                return contextId; // Return uncolored if invalid format
            }

            // Convert hex to RGB
            const r = parseInt(hex.substr(0, 2), 16);
            const g = parseInt(hex.substr(2, 2), 16);
            const b = parseInt(hex.substr(4, 2), 16);

            // For very light colors (like white), add a background to make them visible
            if (r > 240 && g > 240 && b > 240) {
                // Light color - use dark background
                return chalk.rgb(r, g, b).bgGray(contextId);
            } else if (r < 50 && g < 50 && b < 50) {
                // Very dark color - use light background
                return chalk.rgb(r, g, b).bgWhite(contextId);
            } else {
                // Normal color - just color the text
                return chalk.rgb(r, g, b)(contextId);
            }
        } catch (error) {
            // Fallback to uncolored text if color parsing fails
            return contextId;
        }
    }

    /**
     * Format array elements vertically for better readability
     */
    formatArrayVertical(array) {
        if (!Array.isArray(array) || array.length === 0) {
            return 'N/A';
        }

        // For single item, just return it
        if (array.length === 1) {
            return String(array[0]);
        }

        // For multiple items, format vertically
        return array.map(item => String(item)).join('\n');
    }


}

/**
 * Document formatter
 */
export class DocumentFormatter extends BaseFormatter {
    formatTable(data, session = null, schema = null) {
        if (!data || (Array.isArray(data) && data.length === 0) ||
            (typeof data === 'object' && Object.keys(data).length === 0)) {
            const docType = schema ? (typeof schema === 'string' ? schema : schema.name).toLowerCase() : 'document';
            return `No ${docType}s found.`;
        }

        // Handle case where data is wrapped in another object (e.g., workspace documents)
        let tableData = Array.isArray(data) ? data : [data];

        // Check if data is a single object containing an array (common in some API responses)
        if (tableData.length === 1 && !tableData[0].id && !tableData[0].schema) {
            const singleItem = tableData[0];
            // Look for array properties that might contain the actual documents
            for (const key of Object.keys(singleItem)) {
                if (Array.isArray(singleItem[key]) && singleItem[key].length > 0) {
                    // Check if the array contains document-like objects
                    const firstArrayItem = singleItem[key][0];
                    if (firstArrayItem && (firstArrayItem.id || firstArrayItem.schema)) {
                        tableData = singleItem[key];
                        break;
                    }
                }
            }
        }

        let table;

        if (Array.isArray(tableData) && tableData.length > 0) {
            const firstItem = tableData[0];

            // Determine document type from multiple sources
            let docType = 'document';

            // 1. Check if schema parameter was explicitly passed
            if (schema && typeof schema === 'string') {
                docType = schema.toLowerCase();
            }
            // 2. Check document's type field
            else if (firstItem.type) {
                docType = firstItem.type.toLowerCase();
            }
            // 3. Extract type from document's schema field (e.g., "data/abstraction/tab" -> "tab")
            else if (firstItem.schema && typeof firstItem.schema === 'string') {
                const schemaParts = firstItem.schema.split('/');
                if (schemaParts.length > 0) {
                    docType = schemaParts[schemaParts.length - 1].toLowerCase();
                }
            }

            switch (docType) {
                case 'note':
                    table = this.formatNoteTable(tableData);
                    break;
                case 'file':
                    table = this.formatFileTable(tableData);
                    break;
                case 'todo':
                    table = this.formatTodoTable(tableData);
                    break;
                case 'email':
                    table = this.formatEmailTable(tableData);
                    break;
                case 'tab':
                    table = this.formatTabTable(tableData);
                    break;
                default:
                    table = this.formatGenericDocumentTable(tableData);
            }
        } else {
            return this.formatGenericTable(data);
        }

        return table.toString();
    }

    formatGenericDocumentTable(data) {
        const table = new Table({
            head: [
                chalk.cyan('ID'),
                chalk.cyan('Schema'),
                chalk.cyan('Data'),
                chalk.cyan('Metadata'),
                chalk.cyan('Created'),
                chalk.cyan('Version')
            ],
            style: { head: [], border: [] }
        });

        data.forEach(doc => {
            table.push([
                doc.id || 'N/A',
                doc.schema || 'N/A',
                doc.data ? this.truncate(JSON.stringify(doc.data), 40) : 'N/A',
                doc.metadata ? this.truncate(JSON.stringify(doc.metadata), 30) : 'N/A',
                doc.createdAt ? this.formatDate(doc.createdAt) : 'N/A',
                doc.versionNumber || 'N/A'
            ]);
        });

        return table.toString();
    }

    formatNoteTable(data) {
        const table = new Table({
            head: [
                chalk.cyan('ID'),
                chalk.cyan('Title'),
                chalk.cyan('Content'),
                chalk.cyan('Tags'),
                chalk.cyan('Created')
            ],
            style: { head: [], border: [] }
        });

        data.forEach(doc => {
            // Handle nested data structure - note data is under doc.data
            const noteData = doc.data || {};
            const title = noteData.title || 'N/A';
            const content = noteData.content || 'N/A';
            const tags = noteData.tags || [];

            table.push([
                doc.id || 'N/A',
                this.truncate(title, 20),
                this.truncate(content, 40),
                Array.isArray(tags) ? tags.join(', ') : (tags || ''),
                this.formatDate(doc.createdAt)
            ]);
        });

        return table.toString();
    }

    formatFileTable(data) {
        const table = new Table({
            head: [
                chalk.cyan('ID'),
                chalk.cyan('Title'),
                chalk.cyan('Filename'),
                chalk.cyan('Size'),
                chalk.cyan('Type'),
                chalk.cyan('Created')
            ],
            style: { head: [], border: [] }
        });

        data.forEach(doc => {
            table.push([
                doc.id || 'N/A',
                this.truncate(doc.title, 20),
                doc.filename || 'N/A',
                doc.size ? this.formatFileSize(doc.size) : 'N/A',
                doc.mimeType || 'N/A',
                this.formatDate(doc.createdAt)
            ]);
        });

        return table.toString();
    }

    formatTodoTable(data) {
        const table = new Table({
            head: [
                chalk.cyan('ID'),
                chalk.cyan('Title'),
                chalk.cyan('Status'),
                chalk.cyan('Priority'),
                chalk.cyan('Due Date'),
                chalk.cyan('Created')
            ],
            style: { head: [], border: [] }
        });

        data.forEach(doc => {
            // Handle nested data structure - todo data is under doc.data
            const todoData = doc.data || {};
            const title = todoData.title || 'N/A';
            const completed = todoData.completed || false;
            const priority = todoData.priority;
            const dueDate = todoData.dueDate;

            const status = completed ? chalk.green('✓ Done') : chalk.yellow('○ Pending');
            const priorityFormatted = priority ? this.formatPriority(priority) : 'N/A';

            table.push([
                doc.id || 'N/A',
                this.truncate(title, 25),
                status,
                priorityFormatted,
                this.formatDate(dueDate),
                this.formatDate(doc.createdAt)
            ]);
        });

        return table.toString();
    }

    formatEmailTable(data) {
        const table = new Table({
            head: [
                chalk.cyan('ID'),
                chalk.cyan('Subject'),
                chalk.cyan('From'),
                chalk.cyan('To'),
                chalk.cyan('Date'),
                chalk.cyan('Read')
            ],
            style: { head: [], border: [] }
        });

        data.forEach(doc => {
            table.push([
                doc.id || 'N/A',
                this.truncate(doc.subject, 25),
                this.truncate(doc.from, 20),
                this.truncate(doc.to, 20),
                this.formatDate(doc.date),
                doc.read ? chalk.green('✓') : chalk.yellow('○')
            ]);
        });

        return table.toString();
    }

    formatTabTable(data) {
        const table = new Table({
            head: [
                chalk.cyan('ID'),
                chalk.cyan('URL'),
                chalk.cyan('Created')
            ],
            style: { head: [], border: [] }
        });

        data.forEach(doc => {
            // Handle nested data structure - tab data is under doc.data
            const tabData = doc.data || {};
            const url = tabData.url || 'N/A';

            table.push([
                doc.id || 'N/A',
                this.truncate(url, 60),
                this.formatDate(doc.createdAt)
            ]);
        });

        return table.toString();
    }

    formatFileSize(bytes) {
        const sizes = ['B', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0 B';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }

    formatPriority(priority) {
        const colors = {
            high: chalk.red,
            medium: chalk.yellow,
            low: chalk.green
        };
        return colors[priority] ? colors[priority](priority) : priority;
    }
}

/**
 * Auth formatter
 */
export class AuthFormatter extends BaseFormatter {
    formatTable(data) {
        if (!data || (Array.isArray(data) && data.length === 0) ||
            (typeof data === 'object' && Object.keys(data).length === 0)) {
            return 'No API tokens found.';
        }

        if (!Array.isArray(data)) {
            data = [data];
        }

        const table = new Table({
            head: [
                chalk.cyan('ID'),
                chalk.cyan('Name'),
                chalk.cyan('Token'),
                chalk.cyan('Created'),
                chalk.cyan('Last Used'),
                chalk.cyan('Status')
            ],
            style: { head: [], border: [] }
        });

        data.forEach(token => {
            table.push([
                token.id || 'N/A',
                token.name || 'N/A',
                token.token ? token.token.substring(0, 10) + '...' : 'N/A',
                this.formatDate(token.createdAt),
                this.formatDate(token.lastUsedAt),
                token.active ? chalk.green('Active') : chalk.red('Inactive')
            ]);
        });

        return table.toString();
    }
}

/**
 * Remote formatter
 */
export class RemoteFormatter extends BaseFormatter {
    formatTable(data, session = null) {
        if (!Array.isArray(data)) {
            data = [data];
        }

        if (data.length === 0) {
            return chalk.yellow('No remotes found');
        }

        const table = new Table({
            head: [
                chalk.cyan('Remote ID'),
                chalk.cyan('URL'),
                chalk.cyan('Version'),
                chalk.cyan('Auth'),
                chalk.cyan('Last Synced'),
                chalk.cyan('Default'),
                chalk.cyan('Status')
            ],
            style: { head: [], border: [] }
        });

        data.forEach(remote => {
            const isDefault = session && session.boundRemote === remote.id;
            const defaultMark = isDefault ? chalk.green('✓') : '';
            
            table.push([
                remote.id || 'N/A',
                this.truncate(remote.url, 30),
                this.truncate(remote.version, 25),
                remote.auth || 'N/A',
                remote.lastSynced || 'Never',
                defaultMark,
                remote.status || 'Unknown'
            ]);
        });

        return table.toString();
    }
}

/**
 * Create formatter based on type
 */
export function createFormatter(type, options = {}) {
    switch (type) {
        case 'workspace':
            return new WorkspaceFormatter(options);
        case 'context':
            return new ContextFormatter(options);
        case 'document':
            return new DocumentFormatter(options);
        case 'auth':
            return new AuthFormatter(options);
        case 'remote':
            return new RemoteFormatter(options);
        default:
            return new BaseFormatter(options);
    }
}

export default {
    BaseFormatter,
    WorkspaceFormatter,
    ContextFormatter,
    DocumentFormatter,
    AuthFormatter,
    RemoteFormatter,
    createFormatter
};
