'use strict';

import { session as store } from './storage.js';

export const session = {
    get(key) { return store.get(key); },
    set(key, value) { store.set(key, value); },
    delete(key) { store.delete(key); },
    all() { return store.read(); },
    path: store.path,

    boundRemote() { return store.get('boundRemote'); },
    bindRemote(id) {
        store.set('boundRemote', id);
        store.set('boundAt', new Date().toISOString());
    },
    boundContext() { return store.get('boundContext'); },
    bindContext({ id, url } = {}) {
        store.set('boundContext', id || null);
        store.set('boundContextId', id || null);
        store.set('boundContextUrl', url || null);
        store.set('boundAt', new Date().toISOString());
    },
    update(patch) {
        const cur = store.read();
        store.write({ ...cur, ...patch });
    },
};

export default session;
