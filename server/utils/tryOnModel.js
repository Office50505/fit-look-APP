const VTO_RESTRICTED_TERMS = [
  /\bbikini(?:s)?\b/i,
  /\btwo[-\s]?piece\s+swim/i,
  /\bswim\s?suit(?:s)?\b/i,
  /\bswimming\s+sui(?:t|te)(?:s)?\b/i,
  /\bswimwear\b/i,
  /\bbeachwear\b/i,
  /\bswim\s+trunks?\b/i,
  /\bunderwear\b/i,
  /\binnerwear\b/i,
  /\blingerie\b/i,
  /\bbra(?:s)?\b/i,
  /\bbralette(?:s)?\b/i,
  /\bsports?\s+bra(?:s)?\b/i,
  /\bpant(?:y|ies)\b/i,
  /\bthong(?:s)?\b/i,
  /\bbriefs?\b/i,
  /\bboxers?\b/i,
  /\bcorset(?:s)?\b/i,
  /\bbustier(?:s)?\b/i,
  /\bbodysuit(?:s)?\b/i,
  /\bshapewear\b/i,
  /\bnight(?:wear|ie|dress|gown)\b/i,
  /\bbabydoll\b/i,
  /\bchemise\b/i,
  /\bdresses\b/i,
  /\bfull\s+(?:body\s+)?dress(?:es)?\b/i,
  /\b(?:maxi|midi|mini|bodycon|wrap|party|cocktail|evening|wedding|summer)\s+dress(?:es)?\b/i,
  /\bgowns?\b/i,
  /\blehenga(?:s)?\b/i,
  /\bsarees?|saris?\b/i
];

const WAN_TRY_ON_MODELS = ['wan-v2.2-image-to-image', 'wan-v2.6-image-to-image'];
const TRY_ON_MODELS = ['gpt-image-2', 'vto-unrestricted', ...WAN_TRY_ON_MODELS];

function normalizeTryOnModel(value) {
  const model = String(value || '').trim().toLowerCase();
  if (['vto-unrestricted', 'vto-trial', 'second', 'virtual-try-on'].includes(model)) return 'vto-unrestricted';
  if (model === 'wan-v2.6-image-to-image' || model.includes('wan/v2.6')) return 'wan-v2.6-image-to-image';
  if (
    model === 'wan-v2.2-image-to-image' ||
    model === 'wan-image-to-image' ||
    model === 'wan' ||
    model === 'fal-ai/wan/v2.2-a14b/image-to-image' ||
    model.includes('wan/v2.2')
  ) return 'wan-v2.2-image-to-image';
  return 'gpt-image-2';
}

function isWanTryOnModel(value) {
  return WAN_TRY_ON_MODELS.includes(normalizeTryOnModel(value));
}

function restrictedTryOnFallbackModel() {
  const fallback = normalizeTryOnModel(process.env.RESTRICTED_TRYON_FALLBACK_MODEL || 'wan-v2.2-image-to-image');
  return fallback === 'gpt-image-2' ? 'wan-v2.2-image-to-image' : fallback;
}

function textForTryOnClassification(product = {}) {
  const facts = product.facts instanceof Map
    ? [...product.facts.values()].join(' ')
    : product.facts && typeof product.facts === 'object'
      ? Object.values(product.facts).join(' ')
      : product.facts;
  return [
    product.title,
    product.name,
    product.brand,
    product.category,
    product.gender,
    product.description,
    product.query,
    product.searchQuery,
    Array.isArray(product.tags) ? product.tags.join(' ') : product.tags,
    Array.isArray(product.colors) ? product.colors.join(' ') : product.colors,
    Array.isArray(product.bullets) ? product.bullets.join(' ') : product.bullets,
    facts
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function hasRestrictedTryOnText(product = {}) {
  const text = textForTryOnClassification(product);
  return VTO_RESTRICTED_TERMS.some((pattern) => pattern.test(text));
}

function inferTryOnModel(product = {}) {
  const explicit = normalizeTryOnModel(product.tryOnModel);
  const restricted = hasRestrictedTryOnText(product);
  if (product.tryOnModel) {
    if (explicit === 'gpt-image-2' && restricted) return restrictedTryOnFallbackModel();
    return explicit;
  }

  return restricted ? restrictedTryOnFallbackModel() : 'gpt-image-2';
}

export {
  TRY_ON_MODELS,
  WAN_TRY_ON_MODELS,
  hasRestrictedTryOnText,
  inferTryOnModel,
  isWanTryOnModel,
  normalizeTryOnModel,
  restrictedTryOnFallbackModel
};
