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

function normalizeTryOnModel(value) {
  const model = String(value || '').trim().toLowerCase();
  return ['vto-unrestricted', 'vto-trial', 'second', 'virtual-try-on'].includes(model) ? 'vto-unrestricted' : 'gpt-image-2';
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

function inferTryOnModel(product = {}) {
  const explicit = normalizeTryOnModel(product.tryOnModel);
  if (product.tryOnModel) return explicit;

  const text = textForTryOnClassification(product);
  return VTO_RESTRICTED_TERMS.some((pattern) => pattern.test(text)) ? 'vto-unrestricted' : 'gpt-image-2';
}

export { inferTryOnModel, normalizeTryOnModel };
