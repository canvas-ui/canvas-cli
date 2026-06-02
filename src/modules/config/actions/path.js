'use strict';

import { config } from '../../../core/storage.js';

export default {
    name: 'path',
    description: 'Print config file path',
    async run({ io }) { io.print(config.path); },
};
