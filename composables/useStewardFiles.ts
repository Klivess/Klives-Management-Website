import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI, RequestPUTFromKliveAPI } from '~/scripts/APIInterface';

export type ConflictPolicy = 'Fail' | 'Replace' | 'KeepBoth' | 'Skip';

export interface StewardFileActor {
  type: string;
  id: string;
  displayName: string;
}

export interface StewardFileEntry {
  fileID: string;
  stewardID: string;
  path: string;
  kind: 'File' | 'Directory';
  size: number;
  mimeType: string;
  sha256?: string;
  fileSystemModifiedUtc: string;
  createdUtc: string;
  modifiedUtc: string;
  createdBy: StewardFileActor;
  modifiedBy: StewardFileActor;
  origin: string;
  description?: string;
  important: boolean;
}

export interface UploadSessionResponse {
  session: { sessionID: string; status: string; expiresUtc: string };
  items: Array<{ path: string; receivedSize: number; expectedSize: number }>;
  maxFileBytes: number;
  maxChunkBytes: number;
}

async function jsonError(response: Response, fallback: string): Promise<Error> {
  const detail = (await response.text().catch(() => '')).trim();
  return new Error(detail || `${fallback} (HTTP ${response.status})`);
}

export function useStewardFiles() {
  async function startUpload(purpose: 'initial' | 'existingSteward', stewardID?: string): Promise<UploadSessionResponse> {
    const response = await RequestPOSTFromKliveAPI('/demiurge/files/uploads/start', JSON.stringify({ purpose, stewardID }), false, true);
    if (!response.ok) throw await jsonError(response, 'Could not start upload');
    return response.json();
  }

  async function getUpload(sessionID: string): Promise<UploadSessionResponse> {
    const response = await RequestGETFromKliveAPI(`/demiurge/files/uploads/get?sessionID=${encodeURIComponent(sessionID)}`, false, false);
    if (!response.ok) throw await jsonError(response, 'Could not resume upload');
    return response.json();
  }

  async function uploadChunk(sessionID: string, path: string, file: File, offset: number, chunkSize: number): Promise<number> {
    const end = Math.min(file.size, offset + chunkSize);
    const query = new URLSearchParams({
      sessionID,
      path,
      offset: String(offset),
      expectedSize: String(file.size),
      contentType: file.type || 'application/octet-stream',
    });
    const response = await RequestPUTFromKliveAPI(`/demiurge/files/uploads/chunk?${query}`, file.slice(offset, end), false);
    if (!response.ok) throw await jsonError(response, `Could not upload ${path}`);
    const result = await response.json();
    return Number(result.nextOffset ?? result.receivedSize ?? end);
  }

  async function commitUpload(sessionID: string, conflictPolicy: ConflictPolicy) {
    const response = await RequestPOSTFromKliveAPI('/demiurge/files/uploads/commit', JSON.stringify({ sessionID, conflictPolicy }), false, true);
    if (!response.ok) throw await jsonError(response, 'Could not commit upload');
    return response.json();
  }

  async function cancelUpload(sessionID: string) {
    const response = await RequestPOSTFromKliveAPI('/demiurge/files/uploads/cancel', JSON.stringify({ sessionID }), false, true);
    if (!response.ok) throw await jsonError(response, 'Could not cancel upload');
  }

  async function list(stewardID: string, path = '', query = '', cursor = '') {
    const params = new URLSearchParams({ stewardID, path, limit: '100' });
    if (query) params.set('query', query);
    if (cursor) params.set('cursor', cursor);
    const response = await RequestGETFromKliveAPI(`/demiurge/files/list?${params}`, false, false);
    if (!response.ok) throw await jsonError(response, 'Could not list files');
    return response.json() as Promise<{ entries: StewardFileEntry[]; total: number; limit: number; nextCursor?: string }>;
  }

  async function audit(stewardID: string, cursor = '') {
    const params = new URLSearchParams({ stewardID, limit: '100' });
    if (cursor) params.set('cursor', cursor);
    const response = await RequestGETFromKliveAPI(`/demiurge/files/audit?${params}`, false, false);
    if (!response.ok) throw await jsonError(response, 'Could not load file history');
    return response.json();
  }

  async function mutate(route: string, body: Record<string, unknown>) {
    const response = await RequestPOSTFromKliveAPI(`/demiurge/files/${route}`, JSON.stringify(body), false, true);
    if (!response.ok) throw await jsonError(response, `Could not ${route}`);
    return response.json();
  }

  async function download(stewardID: string, path: string) {
    const params = new URLSearchParams({ stewardID, path });
    const response = await RequestGETFromKliveAPI(`/demiurge/files/download?${params}`, false, false);
    if (!response.ok) throw await jsonError(response, 'Could not download file');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = path.split('/').pop() || 'download';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return { startUpload, getUpload, uploadChunk, commitUpload, cancelUpload, list, audit, mutate, download };
}
