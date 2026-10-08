let activeWorkspace = null;
const language = () => { try { return localStorage.getItem('adpilot-language') || 'en'; } catch { return 'en'; } };
export const selectApiWorkspace = (id) => { activeWorkspace = id; };
export async function uploadMedia(file) {
  const workspace = activeWorkspace;
  if (!file) throw new Error('Select an image or video');
  const input = new FormData(); input.set('file', file);
  let response;
  try { response = await fetch('/api/media', { method: 'POST', credentials: 'same-origin', headers: { 'x-workspace-id': workspace }, body: input, signal: AbortSignal.timeout(180000) }); }
  catch { throw new Error('Upload connection interrupted. Check Media library before uploading the file again.'); }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || 'Upload failed');
  if (activeWorkspace !== workspace) throw new Error('Workspace changed. Reload to continue in the selected workspace.');
  return result;
}
export async function api(endpoint, method = 'GET', body) {
  if (['/auth/login', '/auth/register', '/auth/demo'].includes(endpoint)) activeWorkspace = null;
  const workspace = activeWorkspace;
  let response;
  for (let attempt = 0; attempt < (method === 'GET' ? 2 : 1); attempt++) {
    try {
      response = await fetch(`/api${endpoint}`, {
        method, credentials: 'same-origin',
        headers: {
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(workspace ? { 'x-workspace-id': workspace } : {}),
          'accept-language': language(),
          'x-request-id': crypto.randomUUID(),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(method === 'GET' ? 20000 : 210000),
      });
      if (method !== 'GET' || ![502, 503, 504].includes(response.status) || attempt === 1) break;
      await response.body?.cancel();
    } catch {
      if (method === 'GET' && attempt === 0) continue;
      throw Object.assign(new Error('Connection interrupted. Your inputs are preserved. Refresh the current record before retrying a submitted action.'), { code: 'CONNECTION_INTERRUPTED' });
    }
  }
  let result;
  try { result = await response.json(); }
  catch { throw new Error('The server returned an unreadable response. Your inputs are preserved.'); }
  if (!response.ok) throw Object.assign(new Error(result.error?.message || 'Request failed'), {
    code: result.error?.code, details: result.error?.details, requestId: response.headers.get('x-request-id'),
  });
  if (activeWorkspace !== workspace && !endpoint.startsWith('/auth/'))
    throw Object.assign(new Error('Workspace changed. Reload to continue in the selected workspace.'), { code: 'WORKSPACE_CHANGED' });
  if (endpoint === '/workspaces/switch') activeWorkspace = result.user.businessId;
  return result;
}
