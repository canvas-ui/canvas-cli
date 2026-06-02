'use strict';

import chalk from 'chalk';
import { UsageError } from '../../../core/errors.js';

export default {
    name: 'create-token',
    aliases: ['createToken', 'token-create'],
    description: 'Create new API token',
    positional: [{ name: 'name' }],
    flags: { name: 'string', description: 'string', save: 'boolean' },
    needsConnection: true,
    async run({ args, flags, client, session, io }) {
        const name = args.name || flags.name;
        if (!name) throw new UsageError('Token name required');
        const token = await client.client().auth.tokens.create({
            name,
            description: flags.description || '',
        });
        io.success(`API token '${token.name}' created`);
        io.print(chalk.bold('Token: ') + chalk.yellow(token.token));
        io.warn('Save this token now — it will not be shown again!');
        if (flags.save) {
            const id = session.boundRemote();
            client.updateRemote(id, {
                auth: { method: 'token', tokenType: 'jwt', token: token.token },
            });
            client.clearCache(id);
            io.success('Token saved on bound remote');
        }
    },
};
