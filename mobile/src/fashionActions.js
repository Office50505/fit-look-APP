function itemId(item = {}) {
  return String(item.id || item._id || '');
}

function unavailable(reason) {
  return { kind: 'unavailable', reason };
}

export function resolveFashionAction(action = {}, message = {}) {
  const products = Array.isArray(message.products) ? message.products : [];
  const outfits = Array.isArray(message.outfits) ? message.outfits : [];
  const payload = action.payload && typeof action.payload === 'object' ? action.payload : {};
  const productId = String(payload.productId || '');
  const outfitId = String(payload.outfitId || '');

  if (productId) {
    const product = products.find((item) => itemId(item) === productId);
    return product
      ? { kind: 'product_try_on', product }
      : unavailable('That product is no longer available in this message.');
  }

  if (outfitId) {
    const outfit = outfits.find((item) => itemId(item) === outfitId);
    return outfit
      ? { kind: 'outfit_try_on', outfit }
      : unavailable('That outfit is no longer available in this message.');
  }

  if (String(action.type || '') === 'plan_try_on') {
    if (outfits.length === 1) return { kind: 'outfit_try_on', outfit: outfits[0] };
    if (products.length === 1) return { kind: 'product_try_on', product: products[0] };
  }

  const prompt = String(action.prompt || action.label || '').replace(/\s+/g, ' ').trim();
  if (prompt) return { kind: 'message', prompt };
  return unavailable(action.disabledReason || 'This action is not available right now.');
}
