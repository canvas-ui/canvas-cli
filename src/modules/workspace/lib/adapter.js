'use strict';

/** File-ingest adapter bound to a workspace handle. */
export function workspaceAdapter(handle) {
    return {
        label: handle.id,
        start: () => handle.api.workspaces.start(handle.id),
        insertDocuments: (body) => handle.api.workspaces.insertDocuments(handle.id, body),
        uploadBlob: (data) => handle.api.workspaces.uploadBlob(handle.id, data),
    };
}
