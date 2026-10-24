# TODO

## Resumable uploads for `canvas ws file upload` (and `add`/`upload` verbs)

The CLI is likely the most common way files reach a workspace; today it
streams each file in one request (`POST /workspaces/:id/blobs`, via
`api-client` `uploadBlob`), so a dropped connection restarts the file from
byte 0.

canvas-server (dev, 2026-10-24) serves resumable sessions on the workspace API:

- `POST /rest/v2/workspaces/:id/uploads` `{ size, fingerprint?, sha256?, target? }`
  → session `{ id, offset, state, ... }` (201 new, 200 when it reopens an
  unfinished one). `target` is `{ type: 'blob' }` (default) or
  `{ type: 'object', driver, address, key, ifMatch?, ifNoneMatch?, mtime?, mimeType? }`
  for writing straight onto a backend (Home, a mounted folder).
- `PATCH /rest/v2/workspaces/:id/uploads/:uid` with `Upload-Offset: <n>` and
  `Content-Type: application/offset+octet-stream`, raw bytes. Bytes received
  before a drop are kept; a stale offset answers 409 with the server's offset.
- `GET .../uploads/:uid` → offset and state; once `offset === size` the state is
  `finalizing`, then `complete` (`result` = blob or object) or `failed`
  (`error.retryable` → retry with an empty PATCH at the full offset).
- `DELETE .../uploads/:uid` cancels.

Do:

- [ ] `canvas-common/packages/api-client`: `uploads.create/get/append/cancel`
      (shared with canvas-desktop). The web's loop to mirror:
      `canvas-web/src/services/blobs.ts` `uploadResumable`.
- [ ] Use sessions for files from ~8 MB; small files keep the single request.
- [ ] Identify files by `fingerprint` = `<abs path or name>:<size>:<mtimeMs>`;
      do NOT hash large files client-side first (the server hashes what it
      receives). Small files may keep the sha256 exists-check.
- [ ] Re-running the same command after a crash or Ctrl+C resumes (the same
      fingerprint reopens the session); retry with back-off on network errors.
- [ ] Progress per file from the session offset.
- [ ] Limit: the server answers 413 `UPLOAD_TOO_LARGE` with `limit` above
      `CANVAS_MAX_UPLOAD_SIZE` (default 50G); report it before sending.
