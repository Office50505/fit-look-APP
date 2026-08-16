import express from 'express';
import mongoose from 'mongoose';
import Product, { productToClient } from '../models/Product.js';
import User from '../models/User.js';
import UserEvent from '../models/UserEvent.js';
import UserPreference from '../models/UserPreference.js';
import { requireUser } from './auth.js';
import { createHybridCache } from '../utils/cache.js';
import { inlineOrQueue, registerJobHandler } from '../utils/jobs.js';
import { productGenderForPreference } from '../utils/genderPreference.js';

const router = express.Router();
const recommendationCacheTtlMs = Number(process.env.RECOMMENDATION_READ_CACHE_TTL_MS || 30 * 1000);
const productPoolCache = createHybridCache('recommendations:product-pool', { ttlMs: recommendationCacheTtlMs, maxItems: 20 });
const similarProductsCache = createHybridCache('recommendations:similar', { ttlMs: recommendationCacheTtlMs, maxItems: 300 });
const aiStudioDressResultCache = createHybridCache('recommendations:ai-studio-dress-results', {
  ttlMs: Number(process.env.AI_STUDIO_SEARCH_CACHE_TTL_MS || 10 * 60 * 1000),
  maxItems: 120
});

async function clearRecommendationCaches() {
  await Promise.all([
    productPoolCache.clear(),
    similarProductsCache.clear()
  ]);
}

const EVENT_WEIGHTS = {
  search: 1,
  filter: 1,
  product_view: 2,
  product_click: 2,
  style_bot_query: 2,
  custom_tryon: 2,
  try_on: 5,
  shop_click: 8
};

function catalogFilter(extra = {}) {
  const botAmazonRecord = { badge: 'Amazon', $or: [{ sourceUrl: /amazon\.[a-z.]+\/dp\//i }, { affiliateLink: /amazon\.[a-z.]+\/dp\//i }] };
  return { isActive: true, $nor: [botAmazonRecord], ...extra };
}

function normalizeKey(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

function queryTerms(value = '') {
  return [...new Set(String(value).toLowerCase().match(/[a-z0-9]{3,}/g) || [])].slice(0, 8);
}

function readableError(value, fallback = 'Request failed') {
  if (!value) return fallback;
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message || fallback;
  if (typeof value === 'object') {
    const nested = value.message || value.detail || value.error || value.errors;
    if (nested && nested !== value) return readableError(nested, fallback);
    try {
      return JSON.stringify(value);
    } catch {
      return fallback;
    }
  }
  return String(value);
}

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function preferenceValue(map, key) {
  if (!map || !key) return 0;
  return map.get?.(key) || map[key] || 0;
}

function eventWeight(type) {
  return EVENT_WEIGHTS[type] || 1;
}

function requireAdmin(req, res, next) {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) return res.status(500).json({ message: 'ADMIN_KEY is missing on the server' });
  if (req.headers['x-admin-key'] !== adminKey) return res.status(401).json({ message: 'Invalid admin key' });
  next();
}

function productPreferenceIncrements(product, weight) {
  const increments = {};
  const add = (bucket, value, scale = 1) => {
    const key = normalizeKey(value);
    if (!key) return;
    increments[`${bucket}.${key}`] = (increments[`${bucket}.${key}`] || 0) + weight * scale;
  };

  add('categories', product?.category, 1);
  add('brands', product?.brand, 0.75);
  add('genders', product?.gender, 0.8);
  (product?.tags || []).slice(0, 10).forEach((tag) => add('tags', tag, 0.7));
  if (Number.isFinite(Number(product?.price))) {
    increments.priceTotal = Number(product.price) * weight;
    increments.priceCount = weight;
  }
  return increments;
}

function queryPreferenceIncrements(query, weight) {
  const increments = {};
  queryTerms(query).forEach((term) => {
    const key = normalizeKey(term);
    if (key) increments[`tags.${key}`] = (increments[`tags.${key}`] || 0) + weight;
  });
  return increments;
}

async function updatePreference({ userId, type, product, query, metadata }) {
  const weight = eventWeight(type);
  const preferenceSource = product || metadata?.product || metadata;
  const increments = {
    ...queryPreferenceIncrements(query, weight),
    ...productPreferenceIncrements(preferenceSource, weight)
  };
  if (Object.keys(increments).length === 0) return null;

  return UserPreference.findOneAndUpdate(
    { user: userId },
    { $inc: increments, $setOnInsert: { user: userId } },
    { upsert: true, new: true }
  );
}

function scoreProduct(product, preference) {
  if (!preference) return 0;
  const categoryScore = preferenceValue(preference.categories, normalizeKey(product.category)) * 4;
  const brandScore = preferenceValue(preference.brands, normalizeKey(product.brand)) * 2;
  const genderScore = preferenceValue(preference.genders, normalizeKey(product.gender)) * 3;
  const tagScore = (product.tags || []).slice(0, 12).reduce((sum, tag) => sum + preferenceValue(preference.tags, normalizeKey(tag)), 0) * 2.5;
  const averagePrice = preference.priceCount ? preference.priceTotal / preference.priceCount : 0;
  const price = Number(product.price);
  const priceFit = averagePrice && Number.isFinite(price) ? Math.max(0, 2 - Math.abs(price - averagePrice) / Math.max(averagePrice, 1)) : 0;
  const recencyBoost = product.isNewArrival ? 0.8 : 0;
  const featuredBoost = product.isFeatured ? 0.8 : 0;
  const ratingBoost = Number(product.rating || 0) / 5;
  return categoryScore + brandScore + genderScore + tagScore + priceFit + recencyBoost + featuredBoost + ratingBoost;
}

function similarScore(base, product) {
  const baseTags = new Set((base.tags || []).map(normalizeKey).filter(Boolean));
  const productTags = (product.tags || []).map(normalizeKey).filter(Boolean);
  const sharedTags = productTags.filter((tag) => baseTags.has(tag)).length;
  const basePrice = Number(base.price);
  const price = Number(product.price);
  const priceFit = Number.isFinite(basePrice) && Number.isFinite(price) ? Math.max(0, 2 - Math.abs(price - basePrice) / Math.max(basePrice, 1)) : 0;
  return (
    (normalizeKey(base.category) === normalizeKey(product.category) ? 6 : 0) +
    (normalizeKey(base.gender) === normalizeKey(product.gender) ? 3 : 0) +
    (normalizeKey(base.brand) === normalizeKey(product.brand) ? 2 : 0) +
    sharedTags * 2 +
    priceFit +
    (product.isNewArrival ? 0.5 : 0) +
    Number(product.rating || 0) / 5
  );
}

router.post('/events', requireUser, async (req, res) => {
  const type = String(req.body?.type || '').trim();
  if (!EVENT_WEIGHTS[type]) return res.status(400).json({ message: 'Unknown recommendation event type' });

  const productId = String(req.body?.productId || '').trim();
  const query = String(req.body?.query || '').trim();
  const product = mongoose.Types.ObjectId.isValid(productId)
    ? await Product.findOne({ _id: productId, isActive: true }).lean()
    : null;

  await UserEvent.create({
    user: req.user._id,
    type,
    product: product?._id,
    query,
    weight: eventWeight(type),
    metadata: req.body?.metadata || {}
  });
  await updatePreference({ userId: req.user._id, type, product, query, metadata: req.body?.metadata || {} });
  res.status(201).json({ ok: true });
});

router.get('/recent-searches', requireUser, async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 5, 1), 12);
  const events = await UserEvent.find({
    user: req.user._id,
    type: 'search',
    query: { $exists: true, $ne: '' }
  })
    .sort({ createdAt: -1 })
    .limit(limit * 8)
    .lean();

  const seen = new Set();
  const searches = [];
  for (const event of events) {
    const query = String(event.query || '').trim();
    const key = query.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    searches.push({ query, createdAt: event.createdAt });
    if (searches.length >= limit) break;
  }

  res.json({ searches });
});

const nonDressSearchPattern = /\b(sarees?|saris?|lehengas?|dupattas?|kurtas?|kurtis?|salwars?|churidars?|anarkali|palazzos?|shararas?|dress\s*materials?|ethnic\s*wear|underwear|briefs?|boxers?|trunks?|vests?|innerwear|lingerie|bras?|bralettes?|pant(?:y|ies)|camisoles?|shapewear|bikinis?|swimwear|sleepwear|night(?:y|ie|wear|gown|suit)|pajamas?|pyjamas?|loungewear|robes?|shoes?|sneakers?|heels?|sandals?|boots?|slippers?|footwear|loafers?|pumps?|flats?|shirts?|t\s*-?\s*shirts?|tshirts?|tees?|tops?|blouses?|tunics?|pants?|trousers?|joggers?|leggings?|jeans?|denims?|bottomwear|shorts?|skirts?|jackets?|coats?|blazers?|hoodies?|sweaters?|watches?|smart\s*watches?|bags?|handbags?|wallets?|purses?|belts?|caps?|hats?|scarves?|sunglasses?|eyewear|glasses|jewellery|jewelry|earrings?|necklaces?|bracelets?|accessories|beauty|makeup|cosmetics?|perfume|cookware|kitchen|home|toys?|kids?)\b/i;
const dressProductPattern = /\b(dresses?|gowns?|frocks?|bodycon|maxi|midi|mini\s*dress|a-line\s*dress|wrap\s*dress|party\s*dress|cocktail\s*dress|slip\s*dress|shirt\s*dress|skater\s*dress)\b/i;
const nonDressProductPattern = /\b(skirts?|shirts?|t\s*-?\s*shirts?|tshirts?|tees?|tops?|pants?|trousers?|jeans?|shorts?|shoes?|sneakers?|heels?|sandals?|boots?|slippers?|bags?|watches?|jewellery|jewelry|eyewear|innerwear|lingerie|sarees?|kurtis?|lehengas?|dress\s*materials?)\b/i;

function dressSearchBlock(message = '') {
  const lower = String(message || '').toLowerCase();
  if (!nonDressSearchPattern.test(lower)) return '';
  return 'AI Studio is dress-only right now. I can search dresses by colour, budget, fabric, length, occasion, or vibe, but I cannot show shirts, shoes, accessories, beauty, or other categories here.';
}

function productLooksLikeDress(product = {}) {
  const normalizedName = String(product.name || '').replace(/\bshirt\s+dresses?\b/gi, 'dress');
  const text = [
    normalizedName,
    product.category,
    product.description,
    ...(Array.isArray(product.tags) ? product.tags : [])
  ].filter(Boolean).join(' ');
  if (!dressProductPattern.test(text)) return false;
  return !nonDressProductPattern.test(normalizedName);
}

function amazonDressQuery(message = '') {
  const prompt = String(message || '').trim();
  if (dressProductPattern.test(prompt)) return prompt;
  return `${prompt} dress`.trim();
}

function budgetCeiling(message = '') {
  const match = String(message || '').match(/(?:under|below|upto|up to|less than)\s*(?:rs\.?|₹|inr)?\s*(\d{2,6})/i);
  const value = Number(match?.[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function dressCatalogTerms(message = '') {
  return queryTerms(message)
    .filter((term) => !['dress', 'dresses', 'under', 'below', 'upto', 'than', 'women', 'woman', 'female', 'mens', 'male'].includes(term))
    .slice(0, 8);
}

function scoreCatalogDress(product = {}, message = '', user = {}) {
  const text = [
    product.name,
    product.brand,
    product.category,
    product.description,
    ...(Array.isArray(product.tags) ? product.tags : []),
    ...(Array.isArray(product.colors) ? product.colors : [])
  ].filter(Boolean).join(' ').toLowerCase();
  const terms = dressCatalogTerms(message);
  const budget = budgetCeiling(message);
  const preferredGender = productGenderForPreference(user?.genderPreference);
  const price = Number(product.price);

  let score = 0;
  if (/^dresses?$/i.test(product.category || '')) score += 20;
  if (preferredGender && String(product.gender || '').toLowerCase() === preferredGender) score += 10;
  if (preferredGender && String(product.gender || '').toLowerCase() === 'unisex') score += 4;
  if (budget && Number.isFinite(price) && price <= budget) score += 12;
  if (budget && Number.isFinite(price) && price > budget) score -= Math.min(10, Math.ceil((price - budget) / Math.max(budget, 1) * 10));
  for (const term of terms) {
    if (text.includes(term)) score += 5;
  }
  if (product.isFeatured) score += 2;
  if (product.isNewArrival) score += 1.5;
  score += Math.min(Number(product.rating || 0), 5) / 2;
  return score;
}

async function catalogDressFallback(message = '', user = {}) {
  const preferredGender = productGenderForPreference(user?.genderPreference);
  const categoryFilter = { category: /^dresses?$/i };
  const genderFilter = preferredGender ? { $or: [{ gender: preferredGender }, { gender: 'unisex' }, { gender: { $exists: false } }] } : {};
  const query = catalogFilter({ ...categoryFilter, ...genderFilter });
  let products = await Product.find(query).sort({ isFeatured: -1, isNewArrival: -1, rating: -1, createdAt: -1 }).limit(80).lean();

  if (products.length < 4) {
    products = await Product.find(catalogFilter()).sort({ isFeatured: -1, isNewArrival: -1, rating: -1, createdAt: -1 }).limit(180).lean();
  }

  return products
    .filter(productLooksLikeDress)
    .map((product) => ({
      product,
      score: scoreCatalogDress(product, message, user)
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(({ product }) => ({ ...productToClient(product), searchSource: 'catalog-fallback' }));
}

function uniqueStrings(values = []) {
  const seen = new Set();
  return values
    .map((value) => String(value || '').replace(/\s+/g, ' ').trim())
    .filter((value) => {
      const key = value.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function aiStudioDressSearchVariants(message = '', user = {}) {
  const prompt = String(message || '').trim();
  const base = amazonDressQuery(prompt);
  const genderWord = user?.genderPreference === 'male' ? 'men' : 'women';
  const budget = prompt.match(/(?:under|below|upto|up to|less than)\s*(?:rs\.?|₹|inr)?\s*(\d{2,6})/i)?.[1];
  const colour = prompt.match(/\b(black|white|red|pink|blue|green|yellow|beige|brown|maroon|purple|lavender|grey|gray|cream)\b/i)?.[1] || '';
  const occasion = prompt.match(/\b(party|wedding|brunch|office|date|dinner|summer|vacation|casual|formal|cocktail)\b/i)?.[1] || '';

  return uniqueStrings([
    base,
    `${base} ${genderWord}`,
    `${genderWord} ${base}`,
    colour ? `${colour} ${genderWord} dress` : '',
    occasion ? `${occasion} ${genderWord} dress` : '',
    budget ? `${genderWord} dress under ${budget}` : '',
    `${prompt} western dress`,
    `${prompt} one piece dress`
  ]).slice(0, 5);
}

function aiStudioSearchFailureReply(detail = '') {
  const text = String(detail || '');
  if (/blocked|captcha|automated access|unusual traffic|robot/i.test(text)) {
    return 'Amazon is blocking live dress search right now. Try a simpler dress request in a moment, like “black midi dress under 1500”.';
  }
  if (/did not expose|no usable|no results|did not find|none were compatible|none could be used|compatible with AI try-on/i.test(text)) {
    return 'I could not find usable Amazon dress cards for that request. Try another colour, length, budget, or occasion and I will search dresses again.';
  }
  if (/timed out|network|fetch|respond/i.test(text)) {
    return 'Live dress search is taking longer than usual. Try again in a moment with a shorter dress query.';
  }
  return 'I could not complete live dress search right now. Try another dress colour, budget, length, or occasion.';
}

function falAiStudioEndpoint() {
  return String(process.env.FAL_AI_STUDIO_ENDPOINT || process.env.FAL_CLOSET_VISION_ENDPOINT || 'openrouter/router/vision').replace(/^\/+|\/+$/g, '');
}

function falAiStudioModel() {
  return process.env.FAL_AI_STUDIO_MODEL || process.env.FAL_CLOSET_VISION_MODEL || 'google/gemini-2.5-flash-lite';
}

function falHeaders() {
  if (!process.env.FAL_KEY) throw Object.assign(new Error('FAL_KEY is missing on the server'), { statusCode: 503 });
  return {
    Authorization: `Key ${process.env.FAL_KEY}`,
    'Content-Type': 'application/json'
  };
}

function flattenText(value, depth = 0) {
  if (!value || depth > 8) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((item) => flattenText(item, depth + 1)).filter(Boolean).join('\n');
  if (typeof value !== 'object') return '';
  for (const key of ['output_text', 'text', 'content', 'message', 'response']) {
    const found = flattenText(value[key], depth + 1);
    if (found) return found;
  }
  if (value.choices) return flattenText(value.choices, depth + 1);
  if (value.output) return flattenText(value.output, depth + 1);
  return Object.values(value).map((item) => flattenText(item, depth + 1)).filter(Boolean).join('\n');
}

async function findDressProducts(message, user) {
  const { searchAmazonProductsForQuery } = await import('./products.js');
  const variants = aiStudioDressSearchVariants(message, user);
  const cacheKey = JSON.stringify({
    variants: variants.map((item) => item.toLowerCase()),
    genderPreference: user?.genderPreference || ''
  });
  const cached = await aiStudioDressResultCache.get(cacheKey);
  if (cached) return Array.isArray(cached) ? { products: cached, source: 'amazon' } : cached;

  const failures = [];
  const products = [];
  const seen = new Set();
  for (const query of variants) {
    try {
      const batch = await searchAmazonProductsForQuery({
        query,
        limit: 4,
        user
      });
      for (const product of batch.filter(productLooksLikeDress)) {
        const key = product.sourceUrl || product.affiliateLink || product.id || product.name;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        products.push(product);
        if (products.length >= 4) break;
      }
      if (products.length >= 4) break;
    } catch (error) {
      failures.push(readableError(error));
    }
  }

  if (products.length) {
    const payload = { products: products.slice(0, 4), source: 'amazon' };
    await aiStudioDressResultCache.set(cacheKey, payload);
    return payload;
  }

  const fallbackProducts = await catalogDressFallback(message, user);
  if (fallbackProducts.length) {
    const payload = {
      products: fallbackProducts,
      source: 'catalog-fallback',
      diagnostics: failures.slice(0, 5)
    };
    await aiStudioDressResultCache.set(cacheKey, payload);
    return payload;
  }

  const error = new Error(aiStudioSearchFailureReply(failures.join(' | ')));
  error.statusCode = 200;
  error.publicMessage = error.message;
  error.diagnostics = failures.slice(0, 5);
  throw error;
}

function dressFollowUps(message) {
  const lower = String(message || '').toLowerCase();
  if (/wedding|party|dinner|date|office|interview/.test(lower)) return ['Black midi dress', 'Under ₹999 dress', 'Premium evening dress'];
  if (/summer|vacation|beach|brunch/.test(lower)) return ['Floral summer dress', 'Casual cotton dress', 'White day dress'];
  if (/black|red|white|blue|pink/.test(lower)) return ['More premium dress', 'Short dress', 'Long dress'];
  return ['Wedding guest dress', 'Black party dress', 'Under ₹999 dress'];
}

function aiStudioPrompt({ message, history, products, source = 'amazon' }) {
  const sourceLabel = source === 'catalog-fallback' ? 'Lookmefy catalog' : 'Amazon';
  return [
    'You are Lookmefy AI Studio, a dress-only shopping chatbot.',
    `Recommend only dresses from the ${sourceLabel} result cards below.`,
    'Never recommend shirts, pants, shoes, accessories, beauty, ethnic wear, innerwear, skirts, or other non-dress categories.',
    'If no result card fits, say that no matching dresses are available and ask for another dress preference.',
    source === 'catalog-fallback' ? 'Be transparent that live Amazon results were unavailable and these are catalog fallback picks.' : '',
    'Reply conversationally in 2-4 short sentences. Do not claim a try-on image was generated.',
    '',
    `Latest user request: ${message}`,
    '',
    `Recent conversation: ${JSON.stringify((Array.isArray(history) ? history : [])
      .slice(-8)
      .map((entry) => ({ role: entry.role === 'user' ? 'user' : 'assistant', text: String(entry.text || '').slice(0, 400) })))}`,
    '',
    `${sourceLabel} result cards: ${JSON.stringify(products.slice(0, 6).map(({ name, brand, category, gender, price, currency, colors, tags }) => ({
      name,
      brand,
      category,
      gender,
      price,
      currency,
      colors,
      tags
    })))}`
  ].join('\n');
}

function localDressReply(message, products, source = 'amazon') {
  if (!products.length) {
    return 'I could not find matching dress results. Try a colour, occasion, budget, or length and I will search dresses again.';
  }
  const top = products.slice(0, 3).map((product) => product.name).filter(Boolean);
  if (source === 'catalog-fallback') {
    return `Live Amazon did not expose usable product cards, so I pulled matching dresses from the Lookmefy catalog for now. Start with ${top[0]}, then compare ${top.slice(1).join(' or ') || 'the remaining picks'} by price, colour, and occasion fit.`;
  }
  if (/black/i.test(message)) {
    return `I found black dress options from Amazon. Start with ${top[0]}, and compare it with ${top.slice(1).join(' or ') || 'the other dress picks'} based on length, sleeve style, and price.`;
  }
  return `I found a few Amazon dress options that match your brief. Start with ${top[0]}, then compare ${top.slice(1).join(' or ') || 'the remaining picks'} for colour, fabric, and occasion fit.`;
}

async function falAiStudioDressReply({ message, history, products, source }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.FAL_AI_STUDIO_TIMEOUT_MS || 20_000));
  try {
    const response = await fetch(`https://fal.run/${falAiStudioEndpoint()}`, {
      method: 'POST',
      headers: falHeaders(),
      signal: controller.signal,
      body: JSON.stringify({
        model: falAiStudioModel(),
        prompt: aiStudioPrompt({ message, history, products, source }),
        max_tokens: 420,
        temperature: 0.35
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(readableError(data.error || data.detail || data.message || data, 'AI Studio request failed')), { statusCode: response.status || 503 });
    const text = flattenText(data).trim();
    if (!text) throw Object.assign(new Error('AI Studio did not return a response'), { statusCode: 503 });
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

async function aiStudioDressChatService({ userId, body = {} }) {
  const user = await User.findById(userId);
  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 401;
    throw error;
  }
  const message = String(body?.message || '').trim().slice(0, 600);
  if (!message) {
    const error = new Error('Message AI Studio first');
    error.statusCode = 400;
    throw error;
  }

  await UserEvent.create({
    user: user._id,
    type: 'style_bot_query',
    query: message,
    weight: eventWeight('style_bot_query'),
    metadata: { source: 'ai_studio_dress_search' }
  });
  await updatePreference({ userId: user._id, type: 'style_bot_query', query: message, metadata: { source: 'ai_studio_dress_search' } });

  const blocked = dressSearchBlock(message);
  if (blocked) {
    return {
      reply: blocked,
      products: [],
      suggestions: dressFollowUps('')
    };
  }

  try {
    const result = await findDressProducts(message, user);
    const products = result.products || [];
    let reply = '';
    try {
      reply = await falAiStudioDressReply({ message, history: body?.history, products, source: result.source });
    } catch (error) {
      console.warn('[ai-studio] FAL request failed', readableError(error));
      reply = localDressReply(message, products, result.source);
    }
    return {
      reply,
      products: products.slice(0, 4),
      suggestions: dressFollowUps(message)
    };
  } catch (error) {
    const detail = readableError(error, 'Could not search Amazon for dresses right now. Try another dress colour, budget, or occasion.');
    const reply = error.publicMessage || aiStudioSearchFailureReply(detail);
    console.warn('[ai-studio] Amazon dress search failed', detail);
    return {
      reply,
      products: [],
      suggestions: dressFollowUps(message)
    };
  }
}

async function aiStudioDressChat(req, res) {
  const message = String(req.body?.message || '').trim().slice(0, 600);
  if (!message) return res.status(400).json({ message: 'Message AI Studio first' });

  try {
    return inlineOrQueue({
      req,
      res,
      type: 'ai-studio-search',
      key: `${req.user._id}:dress:${message.toLowerCase()}`,
      payload: {
        body: {
          message,
          history: Array.isArray(req.body?.history) ? req.body.history.slice(-8) : []
        }
      },
      maxAttempts: 1,
      runInline: async () => ({
        statusCode: 200,
        body: await aiStudioDressChatService({ userId: req.user._id, body: req.body })
      })
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ message: readableError(error, 'AI Studio request failed') });
  }
}

function registerRecommendationJobHandlers() {
  registerJobHandler('ai-studio-search', async ({ payload, job }) => (
    aiStudioDressChatService({ userId: job.user, body: payload.body })
  ));
}

router.post('/studio-chat', requireUser, aiStudioDressChat);
router.post('/stylist-chat', requireUser, aiStudioDressChat);

router.get('/admin/stats', requireAdmin, async (_req, res) => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [totalEvents, activeUsers, eventCounts, topProducts, preferences, recentEvents] = await Promise.all([
    UserEvent.countDocuments(),
    UserEvent.distinct('user', { createdAt: { $gte: since } }),
    UserEvent.aggregate([
      { $group: { _id: '$type', count: { $sum: 1 }, weight: { $sum: '$weight' } } },
      { $sort: { count: -1 } }
    ]),
    UserEvent.aggregate([
      { $match: { product: { $exists: true, $ne: null } } },
      { $group: { _id: '$product', count: { $sum: 1 }, weight: { $sum: '$weight' } } },
      { $sort: { weight: -1, count: -1 } },
      { $limit: 8 },
      { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' },
      { $project: { count: 1, weight: 1, name: '$product.name', brand: '$product.brand', category: '$product.category' } }
    ]),
    UserPreference.find({}).limit(500).lean(),
    UserEvent.find({}).sort({ createdAt: -1 }).limit(12).populate('product', 'name brand category').lean()
  ]);

  const rollup = (bucket) => {
    const totals = new Map();
    preferences.forEach((preference) => {
      const entries = preference[bucket] instanceof Map ? preference[bucket].entries() : Object.entries(preference[bucket] || {});
      for (const [key, value] of entries) totals.set(key, (totals.get(key) || 0) + Number(value || 0));
    });
    return [...totals.entries()]
      .map(([key, weight]) => ({ key, label: key.replace(/_/g, ' '), weight: Math.round(weight * 10) / 10 }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 10);
  };

  const priceTotal = preferences.reduce((sum, preference) => sum + Number(preference.priceTotal || 0), 0);
  const priceCount = preferences.reduce((sum, preference) => sum + Number(preference.priceCount || 0), 0);

  res.json({
    totals: {
      events: totalEvents,
      activeUsers30d: activeUsers.length,
      preferenceProfiles: preferences.length,
      averagePreferredPrice: priceCount ? Math.round(priceTotal / priceCount) : 0
    },
    eventCounts: eventCounts.map((item) => ({ type: item._id, count: item.count, weight: Math.round(item.weight * 10) / 10 })),
    topProducts: topProducts.map((item) => ({
      id: item._id.toString(),
      name: item.name,
      brand: item.brand,
      category: item.category,
      count: item.count,
      weight: Math.round(item.weight * 10) / 10
    })),
    topCategories: rollup('categories'),
    topBrands: rollup('brands'),
    topTags: rollup('tags'),
    topGenders: rollup('genders'),
    recentEvents: recentEvents.map((event) => ({
      id: event._id.toString(),
      type: event.type,
      query: event.query,
      weight: event.weight,
      product: event.product ? {
        name: event.product.name,
        brand: event.product.brand,
        category: event.product.category
      } : null,
      createdAt: event.createdAt
    }))
  });
});

router.get('/for-you', requireUser, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 8, 24);
  const preference = await UserPreference.findOne({ user: req.user._id }).lean();
  const products = await productPoolCache.remember(
    'for-you-catalog',
    () => Product.find(catalogFilter()).sort({ isFeatured: -1, createdAt: -1 }).limit(180).lean()
  );
  const ranked = products
    .map((product) => ({ product, score: scoreProduct(product, preference) }))
    .sort((a, b) => b.score - a.score || Number(b.product.rating || 0) - Number(a.product.rating || 0))
    .slice(0, limit)
    .map(({ product, score }) => ({ ...productToClient(product), recommendationScore: Math.round(score * 100) / 100 }));

  res.json({ products: ranked, personalized: Boolean(preference) });
});

router.get('/similar/:productId', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.productId)) return res.status(404).json({ message: 'Product not found' });
  const limit = Math.min(Number(req.query.limit) || 4, 12);
  const cacheKey = `${req.params.productId}:${limit}`;
  const cached = await similarProductsCache.get(cacheKey);
  if (cached) return res.json(cached);

  const base = await Product.findOne({ _id: req.params.productId, isActive: true }).lean();
  if (!base) return res.status(404).json({ message: 'Product not found' });
  const products = await Product.find(catalogFilter({ _id: { $ne: base._id } })).limit(160).lean();
  const ranked = products
    .map((product) => ({ product, score: similarScore(base, product) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ product, score }) => ({ ...productToClient(product), recommendationScore: Math.round(score * 100) / 100 }));
  const payload = { products: ranked };
  await similarProductsCache.set(cacheKey, payload);
  res.json(payload);
});

export default router;
export { clearRecommendationCaches };
export { registerRecommendationJobHandlers };
