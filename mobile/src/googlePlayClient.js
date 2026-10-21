export async function initGooglePlayCatalog(iap, productIds) {
  if (!Array.isArray(productIds) || !productIds.length || new Set(productIds).size !== productIds.length) {
    throw new Error('Google Play product configuration is unavailable.');
  }
  const connected = await iap.initConnection();
  if (connected !== true) throw new Error('Google Play Billing is unavailable in this build.');
  const products = await iap.fetchProducts({ skus: productIds, type: 'in-app' });
  const result = {};
  for (const item of Array.isArray(products) ? products : []) {
    if (!productIds.includes(item?.id) || result[item.id]) continue;
    result[item.id] = item;
  }
  return result;
}

export function googlePlayPurchaseCancelled(error) {
  return /cancel/i.test(String(error?.code || error?.message || ''));
}

export function beginGooglePlayPurchase(guard) {
  if (guard.current) return false;
  guard.current = true;
  return true;
}
