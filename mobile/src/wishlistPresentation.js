export function wishlistPriceValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

export function wishlistGridColumnsForWidth(width, requestedColumns = 2) {
  return Number(width) >= 600 && requestedColumns === 3 ? 3 : 2;
}

export function wishlistFilterTabMinWidth(label, fontScale = 1) {
  return Math.ceil(String(label || '').length * 8.5 * Math.max(1, Number(fontScale) || 1));
}

export function removeWishlistProduct(products, productId) {
  return products.filter((item) => String(item.id) !== String(productId));
}

export async function persistWishlistProducts(storage, key, products) {
  await storage.setItem(key, JSON.stringify(products.slice(0, 100)));
  return products;
}
