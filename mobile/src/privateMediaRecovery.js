const privateMediaPathPattern = /^\/api\/(?:auth\/media\/(?:avatar|body|body-original)|closet\/media\/(?:item|garment|outfit|transparent)|tryons\/(?:image|transparent|video|garment)\/(?:product|custom|external))\/[a-f0-9]{24}$/i;
const scopedOutputPathPattern = /^\/api\/images\/subject-isolation\/media\/[a-f0-9]{24}$/i;
const legacyVideoPathPattern = /^\/api\/tryons\/[a-f0-9]{24}\/video\/media$/i;

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
  if (!source?.uri || !privateMediaPath(source.uri, apiOrigin)) return source;
  if (!sessionToken) return null;
  return {
    ...source,
    headers: { Authorization: `Bearer ${sessionToken}` },
    cache: 'reload'
  };
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
