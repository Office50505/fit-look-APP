const privateMediaPathPattern = /^\/api\/(?:auth\/media\/(?:avatar|body|body-original)|closet\/media\/(?:item|garment|outfit|transparent)|tryons\/(?:image|transparent|video|garment)\/(?:product|custom|external))\/[a-f0-9]{24}$/i;
const scopedOutputPathPattern = /^\/api\/images\/subject-isolation\/media\/[a-f0-9]{24}$/i;
const legacyVideoPathPattern = /^\/api\/tryons\/[a-f0-9]{24}\/video\/media$/i;
const privateImageCache = new Map();
const pendingPrivateImages = new Map();
const privateImageCacheMaxChars = 12 * 1024 * 1024;
let privateImageCacheChars = 0;
let privateImageSession = '';

export function clearPrivateImageCache() {
  privateImageCache.clear();
  pendingPrivateImages.clear();
  privateImageCacheChars = 0;
  privateImageSession = '';
}

function imageCacheForSession(sessionToken) {
  if (privateImageSession === sessionToken) return;
  privateImageCache.clear();
  pendingPrivateImages.clear();
  privateImageCacheChars = 0;
  privateImageSession = sessionToken;
}

export function cachedPrivateImage(uri, { apiOrigin, sessionToken }) {
  if (!sessionToken || !privateMediaPath(uri, apiOrigin)) return '';
  imageCacheForSession(sessionToken);
  const value = privateImageCache.get(uri) || '';
  if (value) {
    privateImageCache.delete(uri);
    privateImageCache.set(uri, value);
  }
  return value;
}

export async function cachedAuthenticatedImageDataUri(uri, options) {
  const { apiOrigin, sessionToken } = options;
  if (!sessionToken || !privateMediaPath(uri, apiOrigin)) return '';
  const cached = cachedPrivateImage(uri, options);
  if (cached) return cached;
  const pending = pendingPrivateImages.get(uri);
  if (pending) return pending;
  const requestSession = sessionToken;
  const request = authenticatedImageDataUri(uri, options).then((value) => {
    if (privateImageSession !== requestSession || !value || value.length > privateImageCacheMaxChars) return value;
    privateImageCache.delete(uri);
    privateImageCache.set(uri, value);
    privateImageCacheChars += value.length;
    while (privateImageCacheChars > privateImageCacheMaxChars && privateImageCache.size) {
      const oldest = privateImageCache.keys().next().value;
      privateImageCacheChars -= privateImageCache.get(oldest).length;
      privateImageCache.delete(oldest);
    }
    return value;
  }).finally(() => {
    if (pendingPrivateImages.get(uri) === request) pendingPrivateImages.delete(uri);
  });
  pendingPrivateImages.set(uri, request);
  return request;
}

export function privateMediaPath(uri, apiOrigin) {
  try {
    const origin = new URL(apiOrigin).origin;
    const parsed = new URL(uri, origin);
    if (parsed.origin !== origin) return '';
    if (scopedOutputPathPattern.test(parsed.pathname)) return parsed.searchParams.has('mediaToken') ? parsed.pathname : '';
    return privateMediaPathPattern.test(parsed.pathname) || legacyVideoPathPattern.test(parsed.pathname) ? parsed.pathname : '';
  } catch {
    return '';
  }
}

export function authenticatedMediaSource(source, { apiOrigin, sessionToken }) {
  if (!source?.uri) return source;
  if (!privateMediaPath(source.uri, apiOrigin)) return source;
  if (!sessionToken) return null;
  return {
    ...source,
    headers: { Authorization: `Bearer ${sessionToken}` },
    cache: 'reload'
  };
}

// A saved result can be ready before a transient media/storage request succeeds.
// Retry reads only: never regenerate the result or retry authorization failures.
export async function authenticatedImageDataUri(uri, {
  apiOrigin, sessionToken, fetchImage = fetch, Reader = FileReader,
  maxBytes = 20 * 1024 * 1024, timeoutMs = 5000,
  retryDelays = [350, 700], sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
}) {
  if (!sessionToken || !privateMediaPath(uri, apiOrigin)) return '';
  for (let attempt = 0; ; attempt += 1) {
    const controller = new AbortController();
    let timer;
    try {
      return await Promise.race([
        readAuthenticatedImage(uri, { apiOrigin, sessionToken, fetchImage, Reader, maxBytes, signal: controller.signal }),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            const error = new Error('Private image request timed out');
            error.status = 408;
            reject(error);
            controller.abort();
          }, timeoutMs);
        })
      ]);
    } catch (error) {
      const retryable = error instanceof TypeError || error.name === 'AbortError'
        || [408, 425, 429].includes(error.status) || error.status >= 500;
      if (!retryable || attempt >= retryDelays.length) throw error;
    } finally {
      clearTimeout(timer);
    }
    await sleep(retryDelays[attempt]);
  }
}

async function readAuthenticatedImage(uri, { apiOrigin, sessionToken, fetchImage, Reader, maxBytes, signal }) {
  if (!sessionToken || !privateMediaPath(uri, apiOrigin)) return '';
  const response = await fetchImage(uri, { headers: { Authorization: `Bearer ${sessionToken}` }, cache: 'no-store', signal });
  if (!response.ok) {
    const error = new Error(`Private image request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  const type = String(response.headers?.get?.('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) throw new Error('Private image response is not a supported image');
  const size = Number(response.headers?.get?.('content-length') || 0);
  if (size > maxBytes) throw new Error('Private image is too large to display');
  const blob = await response.blob();
  if (blob.size > maxBytes) throw new Error('Private image is too large to display');
  return new Promise((resolve, reject) => {
    const reader = new Reader();
    reader.onerror = () => reject(new Error('Could not read private image'));
    reader.onload = () => {
      const result = String(reader.result || '');
      // Android's native Blob reader may lose the response MIME type and emit
      // application/octet-stream. Use the image type validated above instead.
      const data = /^data:(?:image\/(?:jpeg|png|webp)|application\/octet-stream)?;base64,([A-Za-z0-9+/]+={0,2})$/.exec(result);
      if (!data) return reject(new Error('Invalid private image data'));
      resolve(`data:${type};base64,${data[1]}`);
    };
    reader.readAsDataURL(blob);
  });
}

export async function renewPrivateImageUrl(uri, { apiOrigin, request, resolveUrl, getSessionToken }) {
  const path = privateMediaPath(uri, apiOrigin);
  if (!path) return '';
  const before = await getSessionToken();
  if (!before) return '';
  const result = await request(`/auth/media-renew?path=${encodeURIComponent(path)}`, { noCache: true, timeoutMs: 5000 });
  if (before !== await getSessionToken()) return '';
  const renewed = resolveUrl(result?.url);
  return privateMediaPath(renewed, apiOrigin) === path && renewed !== uri ? renewed : '';
}
