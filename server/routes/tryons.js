import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import CustomTryOn from '../models/CustomTryOn.js';
import ExternalTryOn from '../models/ExternalTryOn.js';
import Product from '../models/Product.js';
import TryOn from '../models/TryOn.js';
import User from '../models/User.js';
import { requireUser } from './auth.js';
import { inferTryOnModel, isWanTryOnModel, normalizeTryOnModel, restrictedTryOnFallbackModel } from '../utils/tryOnModel.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');
const imageCacheTtlMs = Number(process.env.TRYON_IMAGE_CACHE_TTL_MS || 15 * 60 * 1000);
const imageCacheMaxItems = Number(process.env.TRYON_IMAGE_CACHE_MAX_ITEMS || 80);
const userTryOnCacheLimit = Number(process.env.USER_TRYON_CACHE_LIMIT || 100);
const localImageDataUriCache = new Map();
const remoteImageDataUriCache = new Map();
const inFlightImageDataUriCache = new Map();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype.startsWith('image/'));
  }
});

function tokenCost() {
  const value = Number(process.env.TRYON_TOKEN_COST || 1);
  return Number.isFinite(value) && value > 0 ? Math.ceil(value) : 1;
}

function devMode() {
  return ['1', 'true', 'yes', 'on'].includes(String(process.env.DEV_MODE || '').toLowerCase());
}

function chargedTokenCost() {
  return devMode() ? 0 : tokenCost();
}

function redactLargeData(value) {
  if (typeof value === 'string') {
    return value.replace(/data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=_-]{120,}/gi, '[data image omitted]');
  }
  return value;
}

function readableError(value, fallback = 'Request failed') {
  if (!value) return fallback;
  if (typeof value === 'string') return redactLargeData(value);
  if (value instanceof Error) return readableError(value.message, fallback);
  if (typeof value === 'object') {
    const nested = value.message || value.detail || value.error || value.errors;
    if (nested && nested !== value) return readableError(nested, fallback);
    try {
      return redactLargeData(JSON.stringify(value, null, 2));
    } catch {
      return fallback;
    }
  }
  return redactLargeData(String(value));
}

function createTimer(label, meta = {}) {
  const start = performance.now();
  let last = start;
  console.log(`[tryon:${label}] start`, meta);
  return {
    mark(step, extra = {}) {
      const now = performance.now();
      console.log(`[tryon:${label}] ${step}`, {
        stepMs: Math.round(now - last),
        totalMs: Math.round(now - start),
        ...extra
      });
      last = now;
    },
    end(extra = {}) {
      const now = performance.now();
      console.log(`[tryon:${label}] done`, {
        totalMs: Math.round(now - start),
        ...extra
      });
    }
  };
}

function imageModel() {
  return process.env.FAL_TRYON_MODEL || 'openai/gpt-image-2/edit';
}

function virtualTryOnTrialModel() {
  return process.env.FAL_VTO_TRIAL_MODEL || 'fal-ai/image-apps-v2/virtual-try-on';
}

function wanImageToImageModel(selectedModel) {
  if (normalizeTryOnModel(selectedModel) === 'wan-v2.6-image-to-image') {
    return process.env.FAL_WAN_V26_IMAGE_TO_IMAGE_MODEL || 'wan/v2.6/image-to-image';
  }
  return process.env.FAL_WAN_IMAGE_TO_IMAGE_MODEL || 'fal-ai/wan/v2.2-a14b/image-to-image';
}

function customTryOnModel(value) {
  return 'wan-v2.6-image-to-image';
}

function tryOnModelForProduct(product) {
  return inferTryOnModel(product);
}

function imageQuality() {
  return process.env.FAL_IMAGE_QUALITY || 'low';
}

function imageSize() {
  const width = Number(process.env.FAL_IMAGE_WIDTH || 1024);
  const height = Number(process.env.FAL_IMAGE_HEIGHT || 768);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 'auto';
  return { width, height };
}

function normalizeAspectRatio(value = '') {
  const ratio = String(value || process.env.FAL_VTO_ASPECT_RATIO || '4:5').trim();
  return /^(?:1:1|3:4|4:3|4:5|5:4|9:16|16:9|2:3|3:2)$/.test(ratio) ? ratio : '4:5';
}

function aspectRatioObject(value = '') {
  const label = normalizeAspectRatio(value);
  const [width, height] = label.split(':').map(Number);
  return { label, value: { width, height } };
}

function normalizeWanAspectRatio(value = '') {
  const ratio = String(value || process.env.FAL_WAN_ASPECT_RATIO || 'auto').trim();
  return /^(?:auto|16:9|9:16|1:1)$/.test(ratio) ? ratio : 'auto';
}

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function booleanEnv(name, fallback) {
  const value = String(process.env[name] || '').trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(value)) return true;
  if (['false', '0', 'no', 'off'].includes(value)) return false;
  return fallback;
}

function safePromptProductText(value) {
  return String(value || '')
    .replace(/\bsexy\b/gi, 'fashion')
    .replace(/\blingerie\b/gi, 'delicate fashion garment')
    .replace(/\bunderwear\b/gi, 'base layer garment')
    .replace(/\binnerwear\b/gi, 'base layer garment')
    .replace(/\bthongs?\b/gi, 'matching bottom piece')
    .replace(/\bpant(?:y|ies)\b/gi, 'bottom piece')
    .replace(/\bbabydoll\b/gi, 'short fashion dress')
    .replace(/\bbra(?:s)?\b/gi, 'top')
    .replace(/\bbralette(?:s)?\b/gi, 'top')
    .replace(/\bbustier(?:s)?\b/gi, 'structured top')
    .replace(/\bcorset(?:s)?\b/gi, 'structured top')
    .replace(/\bnude\b/gi, 'neutral')
    .replace(/\bnudity\b/gi, 'exposure')
    .replace(/\s+/g, ' ')
    .trim();
}

function extensionFor(mimetype) {
  if (mimetype?.includes('png')) return '.png';
  if (mimetype?.includes('webp')) return '.webp';
  if (mimetype?.includes('gif')) return '.gif';
  return '.jpg';
}

function cleanPublicOrigin(value = '') {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return trimmed.replace(/\/api\/?$/i, '').replace(/\/$/, '');
}

function publicServerOrigin() {
  return cleanPublicOrigin(
    process.env.PUBLIC_API_ORIGIN ||
    process.env.SERVER_PUBLIC_ORIGIN ||
    process.env.API_PUBLIC_ORIGIN ||
    process.env.PUBLIC_BASE_URL ||
    process.env.API_BASE_URL ||
    process.env.CLIENT_ORIGIN
  );
}

function canUsePublicOrigin(origin = publicServerOrigin()) {
  return /^https:\/\//i.test(origin) && !/^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(origin);
}

function safeLocalPath(storedPath) {
  const resolved = path.resolve(rootDir, storedPath || '');
  if (!resolved.startsWith(rootDir)) throw new Error('Invalid image path');
  return resolved;
}

function dataUriFromBuffer(file, label) {
  if (!file?.buffer) throw new Error(`${label} image is missing`);
  const mimetype = file.mimetype || 'image/jpeg';
  return `data:${mimetype};base64,${file.buffer.toString('base64')}`;
}

function bufferFromDataUri(value, label) {
  const [, mimetype = 'image/jpeg', base64 = ''] = String(value || '').match(/^data:([^;]+);base64,(.+)$/i) || [];
  if (!base64) throw new Error(`${label} image data URI was invalid`);
  return { bytes: Buffer.from(base64, 'base64'), mimetype };
}

function bufferFromStoredImage(image) {
  if (!image?.data) return null;
  if (Buffer.isBuffer(image.data)) return image.data;
  if (Buffer.isBuffer(image.data?.buffer)) return image.data.buffer;
  return Buffer.from(image.data);
}

function getCachedDataUri(cache, key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  cache.delete(key);
  cache.set(key, entry);
  return entry.value;
}

function setCachedDataUri(cache, key, value) {
  cache.set(key, { value, expiresAt: Date.now() + imageCacheTtlMs });
  while (cache.size > imageCacheMaxItems) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
  return value;
}

async function cachedDataUri({ cache, key, timer, label, load }) {
  const cached = getCachedDataUri(cache, key);
  if (cached) {
    timer?.mark(`${label} cache hit`);
    return cached;
  }

  if (inFlightImageDataUriCache.has(key)) {
    timer?.mark(`${label} cache wait`);
    return inFlightImageDataUriCache.get(key);
  }

  const pending = load()
    .then((value) => setCachedDataUri(cache, key, value))
    .finally(() => inFlightImageDataUriCache.delete(key));
  inFlightImageDataUriCache.set(key, pending);
  return pending;
}

async function dataUriFromUpload(image, label, timer) {
  const storedBuffer = bufferFromStoredImage(image);
  if (storedBuffer) {
    const mimetype = image.mimetype || 'image/jpeg';
    const key = `mongo:${image.filename || label}:${storedBuffer.length}:${mimetype}`;
    return cachedDataUri({
      cache: localImageDataUriCache,
      key,
      timer,
      label,
      load: async () => `data:${mimetype};base64,${storedBuffer.toString('base64')}`
    });
  }

  if (!image?.path) throw new Error(`${label} image is missing`);
  const localPath = safeLocalPath(image.path);
  const mimetype = image.mimetype || 'image/jpeg';
  let stats;
  try {
    stats = await fs.stat(localPath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`${label} image file is missing. Please create a new profile so the photo is saved in MongoDB.`);
    }
    throw error;
  }
  const key = `local:${localPath}:${stats.size}:${stats.mtimeMs}:${mimetype}`;
  return cachedDataUri({
    cache: localImageDataUriCache,
    key,
    timer,
    label,
    load: async () => {
      let bytes;
      try {
        bytes = await fs.readFile(localPath);
      } catch (error) {
        if (error?.code === 'ENOENT') {
          throw new Error(`${label} image file is missing. Please create a new profile so the photo is saved in MongoDB.`);
        }
        throw error;
      }
      return `data:${mimetype};base64,${bytes.toString('base64')}`;
    }
  });
}

async function dataUriFromProduct(product, timer) {
  if (product.image?.remoteUrl) return dataUriFromRemoteImage(product.image.remoteUrl, timer);
  if (product.image?.path) return dataUriFromUpload(product.image, 'product', timer);
  throw new Error('Product image is missing');
}

async function dataUriFromRemoteImage(remoteUrl, timer) {
  const key = `remote:${remoteUrl}`;
  return cachedDataUri({
    cache: remoteImageDataUriCache,
    key,
    timer,
    label: 'product',
    load: async () => {
      const response = await fetch(remoteUrl, {
        headers: {
          accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'user-agent': 'Mozilla/5.0 FitLook image fetcher'
        }
      });
      if (!response.ok) throw new Error('Could not fetch product image');
      const mimetype = response.headers.get('content-type') || 'image/jpeg';
      if (!mimetype.startsWith('image/')) throw new Error('Product image URL is not an image');
      const bytes = Buffer.from(await response.arrayBuffer());
      return `data:${mimetype};base64,${bytes.toString('base64')}`;
    }
  });
}

async function fetchRemoteImageBytes(remoteUrl) {
  const response = await fetch(remoteUrl, {
    headers: {
      accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'user-agent': 'Mozilla/5.0 FitLook image fetcher'
    }
  });
  if (!response.ok) throw new Error('Could not fetch product image');
  const mimetype = response.headers.get('content-type') || 'image/jpeg';
  if (!mimetype.startsWith('image/')) throw new Error('Product image URL is not an image');
  return { bytes: Buffer.from(await response.arrayBuffer()), mimetype };
}

function wanTargetInputSize(width, height) {
  let targetWidth = Math.max(1, Number(width) || 0);
  let targetHeight = Math.max(1, Number(height) || 0);
  if (!targetWidth || !targetHeight) return { width: 1024, height: 1024 };

  if (targetWidth < 384 || targetHeight < 384) {
    const scale = Math.max(384 / targetWidth, 384 / targetHeight);
    targetWidth = Math.ceil(targetWidth * scale);
    targetHeight = Math.ceil(targetHeight * scale);
  }

  if (targetWidth > 5000 || targetHeight > 5000) {
    const scale = Math.min(5000 / targetWidth, 5000 / targetHeight);
    targetWidth = Math.floor(targetWidth * scale);
    targetHeight = Math.floor(targetHeight * scale);
  }

  return {
    width: Math.max(1, targetWidth),
    height: Math.max(1, targetHeight)
  };
}

async function normalizeWanReferenceImage({ bytes, label, timer }) {
  let metadata = {};
  try {
    metadata = await sharp(bytes, { failOn: 'none' }).metadata();
  } catch (error) {
    throw new Error(`${label} image could not be read for WAN v2.6`);
  }

  const target = wanTargetInputSize(metadata.width, metadata.height);
  let output = await sharp(bytes, { failOn: 'none' })
    .rotate()
    .resize({ width: target.width, height: target.height, fit: 'inside', withoutEnlargement: false })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 90 })
    .toBuffer({ resolveWithObject: true });

  if (output.info.width < 384 || output.info.height < 384) {
    const width = Math.max(384, output.info.width);
    const height = Math.max(384, output.info.height);
    const left = Math.floor((width - output.info.width) / 2);
    const top = Math.floor((height - output.info.height) / 2);
    output = await sharp(output.data)
      .extend({
        top,
        bottom: height - output.info.height - top,
        left,
        right: width - output.info.width - left,
        background: '#ffffff'
      })
      .jpeg({ quality: 90 })
      .toBuffer({ resolveWithObject: true });
  }

  if (output.data.length > 9.5 * 1024 * 1024) {
    output = await sharp(output.data)
      .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
  }

  timer?.mark('wan reference normalized', {
    label,
    inputWidth: metadata.width || null,
    inputHeight: metadata.height || null,
    outputWidth: output.info.width,
    outputHeight: output.info.height,
    outputKb: Math.round(output.data.length / 1024)
  });

  const origin = publicServerOrigin();
  if (!canUsePublicOrigin(origin)) {
    return `data:image/jpeg;base64,${output.data.toString('base64')}`;
  }

  const hash = crypto.createHash('sha256').update(output.data).digest('hex').slice(0, 24);
  const filename = `${label}-${hash}.jpg`;
  const storedPath = path.posix.join('uploads', 'wan-inputs', filename);
  const localPath = safeLocalPath(storedPath);
  await fs.mkdir(path.dirname(localPath), { recursive: true });
  try {
    await fs.access(localPath);
  } catch {
    await fs.writeFile(localPath, output.data);
  }
  return `${origin}/${storedPath}`;
}

async function wanReferenceFromUpload(image, label, timer) {
  const storedBuffer = bufferFromStoredImage(image);
  if (storedBuffer) {
    return normalizeWanReferenceImage({ bytes: storedBuffer, label, timer });
  }

  if (!image?.path) throw new Error(`${label} image is missing`);
  const localPath = safeLocalPath(image.path);
  let bytes;
  try {
    bytes = await fs.readFile(localPath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`${label} image file is missing. Please create a new profile so the photo is saved in MongoDB.`);
    }
    throw error;
  }
  return normalizeWanReferenceImage({ bytes, label, timer });
}

async function wanReferenceFromProduct(product, timer) {
  if (product.image?.remoteUrl) {
    const { bytes } = await fetchRemoteImageBytes(product.image.remoteUrl);
    return normalizeWanReferenceImage({ bytes, label: 'product', timer });
  }
  if (product.image?.path) return wanReferenceFromUpload(product.image, 'product', timer);
  throw new Error('Product image is missing');
}

async function wanReferenceFromDataUri(dataUri, label, timer) {
  const { bytes } = bufferFromDataUri(dataUri, label);
  return normalizeWanReferenceImage({ bytes, label, timer });
}

function tryOnPrompt(product) {
  return [
[
  'Generate a photorealistic e-commerce fashion try-on image. This is a standard apparel catalog photo, similar to images on Zara, ASOS, or Nordstrom product pages, showing how a real clothing item fits and drapes on a person.',
  'Reference image 1 is the shopper and is the only identity reference. Preserve their exact identity, face, facial features, hair, skin tone, body shape, pose, camera angle, crop, lighting, and background. Do not beautify, slim, age, sexualize, re-face, or otherwise alter the shopper.',
  `Reference image 2 is only the garment/product reference: "${product.name}" by ${product.brand}. If this product image contains a model, mannequin, face, hair, skin, hands, body, pose, or background, ignore all of those completely. Do not copy, blend, borrow, or average any identity, face, hairstyle, skin tone, body shape, pose, expression, or background from reference image 2.`,
  'Transfer only the visible clothing item from reference image 2 as-is, including its original color, fabric texture, neckline, sleeve length, hemline, cut, seams, buttons, logos, pockets, pattern, and silhouette. Do not modify the garment design.',
  'Fit the garment naturally onto the shopper with correct scale, seams, neckline, sleeve length, hem length, folds, shadows, occlusion, and fabric texture, matching how the garment fits in the original product photo.',
  'The final face must match reference image 1. Keep the shopper eyes, nose, mouth, jawline, facial proportions, hairline, hairstyle, and expression from reference image 1 unchanged.',
  'This is professional, non-sexualized commercial fashion photography intended for a retail product page. The pose, framing, and styling should remain catalog-appropriate and editorial in tone, consistent with mainstream fashion retail imagery.',
  'Keep the shopper hands, face, legs, footwear, and non-target clothing unchanged unless they must be naturally covered by the new garment.',
  'Do not invent extra accessories, logos, text, patterns, buttons, pockets, or colors that are not present in the product image.',
  'Return one clean full-body try-on image suitable for a product card, matching standard fashion e-commerce photography conventions.'
]
  ].join(' ');
}

function customTryOnPrompt() {
  return [
    'Create a photorealistic virtual try-on result for an ecommerce fashion app.',
    'Reference image 1 is the shopper and is the only identity reference. Preserve the shopper exact identity, face, facial features, hair, skin tone, body shape, pose, camera angle, crop, lighting, and background. Do not beautify, slim, age, re-face, or otherwise alter the person.',
    'Reference image 2 is only the clothing reference. If the clothing photo contains a model, mannequin, face, hair, skin, hands, body, pose, or background, ignore all of those completely. Do not copy, blend, borrow, or average any identity, face, hairstyle, skin tone, body shape, expression, pose, or background from reference image 2.',
    'Transfer only the visible garment from reference image 2 onto the shopper, keeping the garment color, fabric texture, neckline, sleeve length, hemline, cut, seams, buttons, logos, pockets, pattern, and silhouette.',
    'Fit the garment naturally with correct scale, seams, neckline, sleeve length, hem length, folds, shadows, occlusion, and fabric texture.',
    'The final face must match reference image 1. Keep the shopper eyes, nose, mouth, jawline, facial proportions, hairline, hairstyle, and expression from reference image 1 unchanged.',
    'Keep the shopper hands, face, legs, footwear, and non-target clothing unchanged unless they must be naturally covered by the uploaded garment.',
    'Do not invent extra accessories, logos, text, patterns, buttons, pockets, or colors that are not present in the clothing reference.',
    'Return one clean full-body try-on image.'
  ].join(' ');
}

function virtualTryOnTrialPrompt(extra = '') {
  return [
'Create a photorealistic virtual try-on image for a standard fashion retail catalog.',
'Use the person photo as the PRIMARY and ONLY source of identity, body geometry, pose, and composition.',
'The person photo is the absolute spatial ground truth. Every pixel outside the garment region must remain unchanged.',
'Strictly preserve the exact pose, body orientation, head position, facial expression, hand placement, leg placement, camera angle, framing, crop, perspective, lighting, and background from the person photo.',
'The face, hair, and neck regions are protected and immutable.',
'Keep the original face fully visible and unobstructed unless it is already obscured in the person photo.',
'The generated image is invalid if the original face visibility changes. The final image must clearly show the same eyes, nose, mouth, jawline, hairline, and facial expression from the person photo.',
'Do not cover, crop, blur, replace, regenerate, stylize, modify, or partially hide the face, hair, or neck with clothing, shadows, accessories, or framing.',
'Do not generate a new pose, reinterpret the pose, rotate the body, reposition limbs, infer a pose from the garment image, or make any composition decisions on your own.',
'The output must be composition-locked to the original person photo, with only the clothing changed.',
'Use the clothing photo only as a garment asset reference.',
'If the clothing photo contains a model, mannequin, face, hair, skin, hands, body, pose, expression, camera angle, crop, or background, ignore all of those completely.',
'Never copy, borrow, blend, infer, or transfer any pose, body positioning, framing, crop, camera angle, identity, hairstyle, skin tone, expression, proportions, or background from the clothing photo.',
'The garment image is texture and construction reference only and must never influence framing, crop, body positioning, face visibility, neck visibility, or composition.',
'Ignore the garment image crop entirely.',
'The garment image may be incomplete or tightly cropped. Infer the missing portions of the garment from the visible garment details and fit it onto the person while preserving the original composition.',
'Transfer only the garment material and design attributes, including color, pattern, texture, neckline, sleeve length, hemline, buttons, logos, seams, pockets, and silhouette.',
'Adapt the garment to the person; never adapt the person to the garment.',
'Preserve the exact amount of visible face, neck, shoulders, and upper chest from the person photo.',
'Never extend the garment upward to match the crop of the clothing photo.',
'Never move the neckline higher than anatomically required by the garment design.',
'Keep every non-target region of the original photo unchanged, including the face, hair, neck, hands, legs, accessories, background, crop, and lighting.',
'If the requested aspect ratio creates extra empty canvas space, fill only that extra space with a plain neutral base color sampled from the original background. Do not generate additional body parts, clothing, furniture, scenery, floor, wall, shadows, or background details.',
'Return one clean, photorealistic result with the identical composition and crop as the original person photo, suitable for an ecommerce product preview.',
'The person photo is the absolute spatial ground truth for pose and composition.',
'The pose is locked and immutable.',
'Preserve the exact pixel-level pose from the person photo, including head tilt, neck angle, shoulder positions, spine curvature, torso orientation, waist position, hip alignment, arm positions, elbow angles, wrist rotations, hand placement, finger positions, leg positions, knee angles, ankle positions, foot placement, and weight distribution.',
'Do not generate, infer, reinterpret, improve, normalize, straighten, stylize, or modify the pose in any way.',
'Do not move, rotate, bend, extend, raise, lower, spread, or reposition any body part.',
'Do not change body proportions, body geometry, body scale, limb lengths, joint angles, or body orientation.',
'The clothing must adapt to the existing body pose exactly as shown in the person photo. The body must never adapt to the clothing.',
'The garment image must have zero influence on pose, body positioning, limb placement, or composition.',
'The final image is invalid if any body part changes position relative to the original person photo.',
'The output must be pose-locked and composition-locked to the person photo, with only the garment pixels changing.',
'Outside the garment region, the generated image should be visually identical to the person photo.',
    extra ? `Additional tester note: ${extra}` : ''
  ].filter(Boolean).join(' ');
}

function virtualTryOnProductPrompt(product) {
  return [
    'Create a photorealistic virtual try-on image for a standard fashion retail product page.',
    'Use the person photo as the PRIMARY and ONLY source of identity, body geometry, pose, and composition.',
    'The person photo is the absolute spatial ground truth. Preserve the exact identity, face, facial features, hair, skin tone, body shape, pose, camera angle, framing, crop, lighting, and background from the person photo.',
    'The face, hair, and neck regions are protected. The final image must clearly show the same eyes, nose, mouth, jawline, hairline, hairstyle, skin tone, and facial expression from the person photo.',
    'Do not replace, blend, beautify, age, slim, re-face, crop, blur, hide, or stylize the person.',
    `Use the clothing/product photo only as the garment reference for "${product.name}" by ${product.brand}.`,
    'If the clothing/product photo contains a model, mannequin, face, hair, skin, hands, body, pose, expression, camera angle, crop, or background, ignore all of those completely.',
    'Never copy, borrow, blend, infer, or transfer any pose, body positioning, framing, crop, camera angle, identity, hairstyle, skin tone, expression, proportions, or background from the clothing/product photo.',
    'Transfer only the garment material and design attributes, including color, pattern, texture, neckline, sleeve length, hemline, buttons, logos, seams, pockets, and silhouette.',
    'Fit the garment naturally onto the existing body pose with correct scale, folds, seams, shadows, occlusion, and fabric texture.',
    'Adapt the garment to the person; never adapt the person to the garment.',
    'Keep every non-target region of the original photo unchanged, including face, hair, neck, hands, legs, accessories, background, crop, and lighting.',
    'If the requested aspect ratio creates extra empty canvas space, fill only that extra space with a plain neutral base color sampled from the original background. Do not generate extra body parts, clothing, scenery, floor, wall, shadows, or background details.',
    'Return one clean, full-body, photorealistic result suitable for an ecommerce product preview.'
  ].join(' ');
}

function wanImageToImageProductPrompt(product) {
  const tags = Array.isArray(product.tags) ? product.tags.filter(Boolean).slice(0, 10).map(safePromptProductText).join(', ') : '';
  const productName = safePromptProductText(product.name);
  const productBrand = safePromptProductText(product.brand);
  const productCategory = safePromptProductText(product.category);
  const productDescription = safePromptProductText(product.description);
  return [
    'Edit this shopper photo into a photorealistic ecommerce fashion try-on preview.',
    'Use the input image as the only identity, face, body, pose, framing, lighting, and background reference.',
    'Preserve the shopper exact face, hair, skin tone, body shape, pose, camera angle, crop, hands, legs, footwear, and background.',
    `Replace only the relevant visible clothing with this product: "${productName}" by ${productBrand}.`,
    productCategory ? `Product category: ${productCategory}.` : '',
    productDescription ? `Product description: ${productDescription}` : '',
    tags ? `Product attributes and tags: ${tags}.` : '',
    'Make the garment look natural on the shopper with realistic scale, folds, seams, neckline, sleeve length, hemline, shadows, occlusion, fabric texture, color, and pattern.',
    'Keep the result non-sexualized, catalog-appropriate, and suitable for a mainstream fashion retail product card.',
    'Do not change identity, pose, body proportions, background, or non-target clothing areas unless naturally covered by the new garment.',
    'Return one clean full-body try-on image.'
  ].filter(Boolean).join(' ');
}

function wanTryOnPrompt(product) {
  const productName = String(product?.name || 'the selected garment').slice(0, 220);
  const productBrand = String(product?.brand || 'the listed brand').slice(0, 120);
  return [
    'Create one photorealistic virtual try-on image for an ecommerce product page.',
    'Image 1 is the shopper and must remain the identity, body, pose, camera, lighting, and background reference.',
    'Preserve the shopper face, hair, skin tone, body shape, hands, legs, pose, framing, and expression exactly.',
    `Image 2 is only the garment reference for "${productName}" by ${productBrand}.`,
    'Transfer only the garment design, color, fabric, texture, neckline, sleeves, hem, seams, closures, logos, pattern, pockets, and silhouette from image 2.',
    'Ignore any model, mannequin, person, face, body, pose, camera angle, crop, lighting, and background present in image 2.',
    'Fit the garment naturally onto the shopper with correct scale, drape, folds, wrinkles, occlusion, and shadows.',
    'Keep every non-garment region from image 1 unchanged. Do not add accessories, styling, text, logos, background details, body changes, or extra skin exposure.',
    'Return one clean, full-body, non-sexualized, photorealistic retail try-on preview.'
  ].join(' ');
}

function wanCustomTryOnPrompt() {
  return [
    'Create one photorealistic virtual try-on image for an ecommerce clothing preview.',
    'Image 1 is the shopper and must remain the identity, body, pose, camera, lighting, and background reference.',
    'Preserve the shopper face, hair, skin tone, body shape, hands, legs, pose, framing, and expression exactly.',
    'Image 2 is only the uploaded garment reference.',
    'Transfer only the garment design, color, fabric, texture, neckline, sleeves, hem, seams, closures, logos, pattern, pockets, and silhouette from image 2.',
    'Ignore any model, mannequin, person, face, body, pose, camera angle, crop, lighting, and background present in image 2.',
    'Fit the garment naturally onto the shopper with correct scale, drape, folds, wrinkles, occlusion, and shadows.',
    'Keep every non-garment region from image 1 unchanged. Do not add accessories, styling, text, logos, background details, body changes, or extra skin exposure.',
    'Return one clean, full-body, non-sexualized, photorealistic retail try-on preview.'
  ].join(' ');
}

function wanNegativePrompt() {
  return 'low resolution, blurry, distorted face, changed identity, changed pose, changed body, extra limbs, extra fingers, missing head, cropped face, copied product model, mannequin, text, watermark, logo hallucination, overexposed, low quality';
}

function isFalContentPolicyError(message = '') {
  return /content[_\s-]?policy|content checker|flagged/i.test(String(message));
}

function isFalPathNotFoundError(message = '') {
  return /(?:path|application).*(?:not found)|not found.*(?:path|application)/i.test(String(message));
}

function falHeaders() {
  if (!process.env.FAL_KEY) throw new Error('FAL_KEY is missing on the server');
  return {
    Authorization: `Key ${process.env.FAL_KEY}`,
    'Content-Type': 'application/json'
  };
}

async function falJson(url, options = {}) {
  const { timeoutMs, ...fetchOptions } = options;
  const controller = timeoutMs ? new AbortController() : null;
  const timeout = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller?.signal || fetchOptions.signal,
      headers: { ...falHeaders(), ...fetchOptions.headers }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(readableError(data.detail || data.error || data.message || data, 'FAL try-on request failed'));
    return data;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`FAL try-on request timed out after ${Math.round(timeoutMs / 1000)} seconds`);
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function waitForFalResult(submission, timer) {
  const statusUrl = submission.status_url;
  const responseUrl = submission.response_url;
  if (!statusUrl || !responseUrl) throw new Error('FAL did not return queue URLs');

  const configuredAttempts = Number(timer?.maxAttempts || 90);
  const configuredPollMs = Number(timer?.pollMs || 1500);
  const maxAttempts = Number.isFinite(configuredAttempts) && configuredAttempts > 0 ? configuredAttempts : 90;
  const pollMs = Number.isFinite(configuredPollMs) && configuredPollMs > 0 ? configuredPollMs : 1500;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const status = await falJson(statusUrl);
    if (attempt === 0 || attempt % 5 === 0) timer?.mark('fal status poll', { attempt, status: status.status });
    if (status.status === 'COMPLETED') {
      timer?.mark('fal completed', { attempt });
      return falJson(responseUrl);
    }
    if (status.status === 'FAILED' || status.error) throw new Error(readableError(status.error || status, 'FAL try-on generation failed'));
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error(`FAL try-on generation timed out after ${Math.round((maxAttempts * pollMs) / 1000)} seconds`);
}

function firstGeneratedImageUrl(value, depth = 0) {
  if (!value || depth > 8) return '';
  if (typeof value === 'string') return /^https?:\/\//i.test(value) || /^data:image\//i.test(value) ? value : '';
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstGeneratedImageUrl(item, depth + 1);
      if (found) return found;
    }
    return '';
  }
  if (typeof value !== 'object') return '';
  for (const key of ['url', 'image_url', 'imageUrl']) {
    const found = firstGeneratedImageUrl(value[key], depth + 1);
    if (found) return found;
  }
  for (const key of ['images', 'image', 'output', 'result', 'data']) {
    const found = firstGeneratedImageUrl(value[key], depth + 1);
    if (found) return found;
  }
  for (const child of Object.values(value)) {
    const found = firstGeneratedImageUrl(child, depth + 1);
    if (found) return found;
  }
  return '';
}

function shortUrlForLog(url = '') {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return 'generated image URL';
  }
}

async function generatedBytesFromUrl(url, timer) {
  if (/^data:image\//i.test(url)) {
    const [, metadata = '', base64 = ''] = url.match(/^data:([^;]+);base64,(.+)$/i) || [];
    if (!base64) throw new Error('Generated image data URI was invalid');
    return {
      bytes: Buffer.from(base64, 'base64'),
      mimetype: metadata || 'image/png'
    };
  }

  let lastStatus = '';
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'user-agent': 'Mozilla/5.0 FitLook generated image fetcher'
      }
    });
    if (response.ok) {
      return {
        bytes: Buffer.from(await response.arrayBuffer()),
        mimetype: response.headers.get('content-type') || 'image/png'
      };
    }
    lastStatus = `${response.status} ${response.statusText}`.trim();
    timer?.mark('generated image download retry', {
      attempt,
      status: lastStatus,
      url: shortUrlForLog(url)
    });
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 900 * (attempt + 1)));
  }

  throw new Error(`Could not download generated try-on image from ${shortUrlForLog(url)} (${lastStatus || 'request failed'})`);
}

async function callFalVirtualTryOnTrial({ personDataUri, garmentDataUri, prompt, aspectRatio, timer }) {
  const endpoint = virtualTryOnTrialModel();
  const ratio = aspectRatioObject(aspectRatio);
  const payload = {
    person_image_url: personDataUri,
    clothing_image_url: garmentDataUri,
    prompt,
    preserve_pose: true,
    aspect_ratio: ratio.value
  };
  const vtoTimer = {
    ...timer,
    maxAttempts: Number(process.env.FAL_VTO_POLL_ATTEMPTS || 240),
    pollMs: Number(process.env.FAL_VTO_POLL_MS || 1500)
  };

  try {
    timer?.mark('fal vto submit attempt', { variant: 'person_clothing', fields: Object.keys(payload) });
    const submission = await falJson(`https://queue.fal.run/${endpoint}`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    timer?.mark('fal vto submitted', { requestId: submission.request_id });
    const result = await waitForFalResult(submission, vtoTimer);
    const generatedUrl = firstGeneratedImageUrl(result);
    if (!generatedUrl) throw new Error(`FAL returned no image. Response keys: ${Object.keys(result || {}).join(', ')}`);
    return { generatedUrl, payloadVariant: 'person_clothing', rawKeys: Object.keys(result || {}), preservePose: true, aspectRatio: ratio.label };
  } catch (error) {
    const message = readableError(error, 'FAL virtual try-on trial failed');
    if (isFalContentPolicyError(message)) {
      throw new Error('FAL accepted the required payload fields, but its content checker blocked this person/clothing image pair. Try a clearly adult, fully clothed person photo and a standard garment product photo with no underwear, swimwear, nudity, transparent clothing, or heavily cropped body framing.');
    }
    throw new Error(message);
  }
}

async function callFalVirtualTryOnProduct({ user, product, timer }) {
  const [person, garment] = await Promise.all([
    dataUriFromUpload(user.bodyPhoto, 'person', timer),
    dataUriFromProduct(product, timer)
  ]);
  timer?.mark('vto reference images prepared', {
    personKb: Math.round(person.length / 1024),
    garmentKb: Math.round(garment.length / 1024)
  });

  const endpoint = virtualTryOnTrialModel();
  const ratio = aspectRatioObject();
  const prompt = virtualTryOnProductPrompt(product);
  const payload = {
    person_image_url: person,
    clothing_image_url: garment,
    prompt,
    preserve_pose: true,
    aspect_ratio: ratio.value
  };
  const vtoTimer = {
    ...timer,
    maxAttempts: Number(process.env.FAL_VTO_POLL_ATTEMPTS || 240),
    pollMs: Number(process.env.FAL_VTO_POLL_MS || 1500)
  };

  try {
    timer?.mark('fal vto submit attempt', { fields: Object.keys(payload), aspectRatio: ratio.label });
    const submission = await falJson(`https://queue.fal.run/${endpoint}`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    timer?.mark('fal vto submitted', { requestId: submission.request_id });
    const result = await waitForFalResult(submission, vtoTimer);
    const generatedUrl = firstGeneratedImageUrl(result);
    if (!generatedUrl) throw new Error(`FAL returned no image. Response keys: ${Object.keys(result || {}).join(', ')}`);
    const { bytes, mimetype } = await generatedBytesFromUrl(generatedUrl, timer);
    timer?.mark('vto generated image downloaded', {
      outputKb: Math.round(bytes.length / 1024),
      aspectRatio: ratio.label
    });
    return {
      bytes,
      mimetype,
      prompt,
      model: endpoint,
      quality: `vto ${ratio.label}`
    };
  } catch (error) {
    const message = readableError(error, 'FAL virtual try-on failed');
    if (isFalContentPolicyError(message)) {
      throw new Error('FAL VTO accepted the product payload, but its content checker blocked this person/clothing pair. Try a clearer fully clothed person photo or switch this product back to GPT Image 2.');
    }
    throw new Error(message);
  }
}

async function callFalWanImageToImage({ user, product, garmentDataUri, selectedModel, prompt, timer }) {
  let endpoint = wanImageToImageModel(selectedModel);
  const endpointIsV26 = /\/v2\.6(?:\/|-)/i.test(endpoint);
  const [person, garment] = await Promise.all([
    endpointIsV26 ? wanReferenceFromUpload(user.bodyPhoto, 'person', timer) : dataUriFromUpload(user.bodyPhoto, 'person', timer),
    endpointIsV26
      ? (garmentDataUri ? wanReferenceFromDataUri(garmentDataUri, 'garment', timer) : wanReferenceFromProduct(product, timer))
      : Promise.resolve(null)
  ]);
  timer?.mark('wan reference images prepared', {
    personRef: /^https?:\/\//i.test(person) ? 'url' : 'data-uri',
    garmentRef: garment ? (/^https?:\/\//i.test(garment) ? 'url' : 'data-uri') : 'none',
    multiImage: endpointIsV26
  });
  const finalPrompt = prompt || (endpointIsV26 ? wanTryOnPrompt(product) : wanImageToImageProductPrompt(product));
  const strength = numberEnv('FAL_WAN_STRENGTH', 0.55);
  const aspectRatio = normalizeWanAspectRatio();
  const payload = endpointIsV26
    ? {
        prompt: finalPrompt,
        image_urls: [person, garment].filter(Boolean),
        negative_prompt: process.env.FAL_WAN_V26_NEGATIVE_PROMPT || wanNegativePrompt(),
        image_size: process.env.FAL_WAN_V26_IMAGE_SIZE || 'portrait_4_3',
        num_images: 1,
        enable_prompt_expansion: booleanEnv('FAL_WAN_PROMPT_EXPANSION', false),
        enable_safety_checker: booleanEnv('FAL_WAN_SAFETY_CHECKER', true)
      }
    : {
        prompt: finalPrompt,
        image_url: person,
        strength,
        negative_prompt: process.env.FAL_WAN_NEGATIVE_PROMPT || 'blur, distorted face, changed identity, changed pose, extra limbs, extra fingers, text, watermark, logo artifacts, nudity',
        aspect_ratio: aspectRatio,
        num_inference_steps: Math.max(1, Math.floor(numberEnv('FAL_WAN_INFERENCE_STEPS', 27))),
        enable_safety_checker: booleanEnv('FAL_WAN_SAFETY_CHECKER', true),
        enable_output_safety_checker: booleanEnv('FAL_WAN_OUTPUT_SAFETY_CHECKER', false),
        enable_prompt_expansion: booleanEnv('FAL_WAN_PROMPT_EXPANSION', false),
        acceleration: process.env.FAL_WAN_ACCELERATION || 'regular',
        guidance_scale: numberEnv('FAL_WAN_GUIDANCE_SCALE', 3.5),
        guidance_scale_2: numberEnv('FAL_WAN_GUIDANCE_SCALE_2', 4),
        shift: numberEnv('FAL_WAN_SHIFT', 2),
        image_format: process.env.FAL_WAN_IMAGE_FORMAT || 'png'
      };

  const wanTimer = {
    ...timer,
    maxAttempts: Number(process.env.FAL_WAN_POLL_ATTEMPTS || 360),
    pollMs: Number(process.env.FAL_WAN_POLL_MS || 1500)
  };

  const runWanEndpoint = async (activeEndpoint) => {
    const activeEndpointIsV26 = /\/v2\.6(?:\/|-)/i.test(activeEndpoint);
    if (activeEndpointIsV26 && String(process.env.FAL_WAN_V26_USE_QUEUE || '').toLowerCase() !== 'true') {
      timer?.mark('fal wan direct attempt', {
        endpoint: activeEndpoint,
        strength,
        aspectRatio,
        fields: Object.keys(payload)
      });
      const result = await falJson(`https://fal.run/${activeEndpoint}`, {
        method: 'POST',
        body: JSON.stringify(payload),
        timeoutMs: Number(process.env.FAL_WAN_V26_RUN_TIMEOUT_MS || 540000)
      });
      timer?.mark('fal wan direct completed', { endpoint: activeEndpoint, keys: Object.keys(result || {}) });
      return result;
    }

    timer?.mark('fal wan submit attempt', {
      endpoint: activeEndpoint,
      strength,
      aspectRatio,
      fields: Object.keys(payload)
    });
    const submission = await falJson(`https://queue.fal.run/${activeEndpoint}`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    timer?.mark('fal wan submitted', { requestId: submission.request_id });
    return waitForFalResult(submission, wanTimer);
  };

  let result;
  try {
    result = await runWanEndpoint(endpoint);
  } catch (error) {
    const message = readableError(error, 'FAL WAN image-to-image failed');
    const fallbackEndpoint = normalizeTryOnModel(selectedModel) === 'wan-v2.6-image-to-image'
      ? process.env.FAL_WAN_V26_FALLBACK_MODEL
      : process.env.FAL_WAN_IMAGE_TO_IMAGE_MODEL || 'fal-ai/wan/v2.2-a14b/image-to-image';
    if (!isFalPathNotFoundError(message) || !fallbackEndpoint || endpoint === fallbackEndpoint) throw new Error(message);
    timer?.mark('fal wan endpoint fallback', { from: endpoint, to: fallbackEndpoint, error: message });
    endpoint = fallbackEndpoint;
    result = await runWanEndpoint(endpoint);
  }

  const generatedUrl = firstGeneratedImageUrl(result);
  if (!generatedUrl) throw new Error(`FAL WAN returned no image. Response keys: ${Object.keys(result || {}).join(', ')}`);
  const { bytes, mimetype } = await generatedBytesFromUrl(generatedUrl, timer);
  timer?.mark('wan generated image downloaded', { outputKb: Math.round(bytes.length / 1024) });
  return {
    bytes,
    mimetype,
    prompt: finalPrompt,
    model: endpoint,
    quality: `wan strength ${strength}`
  };
}

async function callFalWanImageToImageProduct({ user, product, selectedModel, timer }) {
  return callFalWanImageToImage({ user, product, selectedModel, timer });
}

async function callFalImageEdit({ user, product, garmentDataUri, prompt, timer }) {
  const [person, garment] = await Promise.all([
    dataUriFromUpload(user.bodyPhoto, 'person', timer),
    garmentDataUri ? Promise.resolve(garmentDataUri) : dataUriFromProduct(product, timer)
  ]);
  timer?.mark('reference images prepared', {
    personKb: Math.round(person.length / 1024),
    garmentKb: Math.round(garment.length / 1024)
  });
  const finalPrompt = prompt || tryOnPrompt(product);
  const endpoint = imageModel();
  const submission = await falJson(`https://queue.fal.run/${endpoint}`, {
    method: 'POST',
    body: JSON.stringify({
      prompt: finalPrompt,
      image_urls: [person, garment],
      image_size: imageSize(),
      quality: imageQuality(),
      num_images: 1,
      output_format: 'png'
    })
  });
  timer?.mark('fal submitted', { requestId: submission.request_id });
  const result = await waitForFalResult(submission, timer);
  timer?.mark('fal result fetched');
  const generated = result.images?.[0];
  if (!generated?.url) throw new Error('FAL did not return an image');
  const imageResponse = await fetch(generated.url);
  if (!imageResponse.ok) throw new Error('Could not download generated try-on image');
  const bytes = Buffer.from(await imageResponse.arrayBuffer());
  timer?.mark('generated image downloaded', { outputKb: Math.round(bytes.length / 1024) });
  return { bytes, prompt: finalPrompt };
}

async function generateProductTryOnImage({ user, product, selectedModel, timer }) {
  if (selectedModel === 'vto-unrestricted') return callFalVirtualTryOnProduct({ user, product, timer });
  if (isWanTryOnModel(selectedModel)) return callFalWanImageToImageProduct({ user, product, selectedModel, timer });
  try {
    return {
      ...(await callFalImageEdit({ user, product, timer })),
      mimetype: 'image/png',
      model: imageModel(),
      quality: imageQuality()
    };
  } catch (error) {
    const message = readableError(error, 'FAL image edit failed');
    if (!isFalContentPolicyError(message)) throw new Error(message);
    const fallbackModel = restrictedTryOnFallbackModel();
    timer?.mark('fal content policy fallback', { from: selectedModel, to: fallbackModel });
    return callFalWanImageToImageProduct({ user, product, selectedModel: fallbackModel, timer });
  }
}

async function saveUserCacheFile({ user, bytes, filename, mimetype }) {
  const userId = user._id.toString();
  const storedPath = path.posix.join('uploads', 'users', userId, 'tryons', filename);
  await fs.mkdir(path.join(rootDir, 'uploads', 'users', userId, 'tryons'), { recursive: true });
  await fs.writeFile(path.join(rootDir, storedPath), bytes);
  return {
    filename,
    path: storedPath,
    mimetype,
    size: bytes.length
  };
}

function cacheImageMetadata(image) {
  if (!image) return undefined;
  return {
    filename: image.filename,
    path: image.path,
    mimetype: image.mimetype,
    size: image.size
  };
}

async function cacheTryOnForUser(user, entry) {
  const safeLimit = Number.isFinite(userTryOnCacheLimit) && userTryOnCacheLimit > 0 ? Math.floor(userTryOnCacheLimit) : 100;
  const cacheEntry = {
    ...entry,
    image: cacheImageMetadata(entry.image),
    createdAt: new Date()
  };

  await User.updateOne(
    { _id: user._id },
    { $pull: { tryOnCache: { kind: cacheEntry.kind, key: cacheEntry.key } } }
  );
  await User.updateOne(
    { _id: user._id },
    {
      $push: {
        tryOnCache: {
          $each: [cacheEntry],
          $position: 0,
          $slice: safeLimit
        }
      }
    }
  );
}

function cachedTryOnToClient(entry) {
  return {
    kind: entry.kind,
    key: entry.key,
    tryOnId: entry.tryOn?.toString?.() || null,
    externalTryOnId: entry.externalTryOn?.toString?.() || null,
    customTryOnId: entry.customTryOn?.toString?.() || null,
    productId: entry.product?.toString?.() || null,
    sourceUrl: entry.sourceUrl || null,
    label: entry.label || null,
    imageUrl: entry.image?.path ? `/${entry.image.path}` : null,
    createdAt: entry.createdAt
  };
}

async function saveGeneratedTryOn({ user, product, timer }) {
  const selectedModel = tryOnModelForProduct(product);
  timer?.mark('try-on model selected', { selectedModel });
  const generated = await generateProductTryOnImage({ user, product, selectedModel, timer });
  const filename = `tryon-${Date.now()}-${Math.round(Math.random() * 1e9)}${extensionFor(generated.mimetype)}`;
  const image = await saveUserCacheFile({ user, bytes: generated.bytes, filename, mimetype: generated.mimetype });
  timer?.mark('generated image saved', { path: image.path });

  const tryOn = await TryOn.create({
    user: user._id,
    product: product._id,
    provider: 'fal',
    model: generated.model,
    quality: generated.quality,
    prompt: generated.prompt,
    tokenCost: chargedTokenCost(),
    image
  });
  await cacheTryOnForUser(user, {
    kind: 'product',
    key: product._id.toString(),
    tryOn: tryOn._id,
    product: product._id,
    label: product.name,
    image
  });
  return tryOn;
}

function cleanUrl(value) {
  if (!value) return '';
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function externalProductFromBody(value = {}) {
  const sourceUrl = cleanUrl(value.sourceUrl || value.affiliateLink);
  const imageUrl = cleanUrl(value.imageUrl || value.remoteImageUrl);
  if (!sourceUrl) throw new Error('External product link is missing');
  if (!imageUrl) throw new Error('External product image is missing');
  const tryOnModel = 'wan-v2.6-image-to-image';
  return {
    sourceUrl,
    affiliateLink: cleanUrl(value.affiliateLink || sourceUrl),
    name: String(value.name || 'Amazon product').trim(),
    brand: String(value.brand || 'Amazon').trim(),
    category: String(value.category || 'clothing').trim(),
    description: String(value.description || '').trim(),
    tags: Array.isArray(value.tags) ? value.tags : [],
    tryOnModel,
    imageUrl,
    image: { remoteUrl: imageUrl }
  };
}

async function saveGeneratedExternalTryOn({ user, product, timer }) {
  const selectedModel = tryOnModelForProduct(product);
  timer?.mark('external try-on model selected', { selectedModel });
  const generated = await generateProductTryOnImage({ user, product, selectedModel, timer });
  const filename = `tryon-external-${Date.now()}-${Math.round(Math.random() * 1e9)}${extensionFor(generated.mimetype)}`;
  const image = await saveUserCacheFile({ user, bytes: generated.bytes, filename, mimetype: generated.mimetype });
  timer?.mark('external try-on saved', { path: image.path });

  const tryOn = await ExternalTryOn.create({
    user: user._id,
    sourceUrl: product.sourceUrl,
    affiliateLink: product.affiliateLink,
    productName: product.name,
    brand: product.brand,
    category: product.category,
    imageUrl: product.imageUrl,
    provider: 'fal',
    model: generated.model,
    quality: generated.quality,
    prompt: generated.prompt,
    tokenCost: chargedTokenCost(),
    image
  });
  await cacheTryOnForUser(user, {
    kind: 'external',
    key: product.sourceUrl,
    externalTryOn: tryOn._id,
    sourceUrl: product.sourceUrl,
    label: product.name,
    image
  });
  return tryOn;
}

async function saveUploadFile(file, prefix, user) {
  const filename = `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e9)}${extensionFor(file.mimetype)}`;
  const storedPath = user
    ? path.posix.join('uploads', 'users', user._id.toString(), 'garments', filename)
    : path.posix.join('uploads', filename);
  await fs.mkdir(path.dirname(path.join(rootDir, storedPath)), { recursive: true });
  await fs.writeFile(path.join(rootDir, storedPath), file.buffer);
  return {
    filename,
    path: storedPath,
    mimetype: file.mimetype,
    size: file.size
  };
}

async function saveGeneratedCustomTryOn({ user, garmentFile, tryOnModel, timer }) {
  const selectedModel = customTryOnModel(tryOnModel);
  const garmentDataUri = dataUriFromBuffer(garmentFile, 'garment');
  timer?.mark('custom garment prepared', {
    garmentKb: Math.round(garmentDataUri.length / 1024),
    selectedModel
  });

  const generated = await callFalWanImageToImage({
    user,
    garmentDataUri,
    selectedModel,
    prompt: wanCustomTryOnPrompt(),
    timer
  });

  const filename = `tryon-custom-${Date.now()}-${Math.round(Math.random() * 1e9)}${extensionFor(generated.mimetype)}`;
  const image = await saveUserCacheFile({
    user,
    bytes: generated.bytes,
    filename,
    mimetype: generated.mimetype || 'image/png'
  });
  const garment = await saveUploadFile(garmentFile, 'garment', user);
  timer?.mark('custom try-on saved', { path: image.path });

  const tryOn = await CustomTryOn.create({
    user: user._id,
    provider: 'fal',
    model: generated.model,
    quality: generated.quality,
    prompt: generated.prompt,
    tokenCost: chargedTokenCost(),
    garment,
    image
  });
  await cacheTryOnForUser(user, {
    kind: 'custom',
    key: tryOn._id.toString(),
    customTryOn: tryOn._id,
    label: 'Custom try-on',
    image
  });
  return tryOn;
}

async function reserveToken(user, timer) {
  if (devMode()) {
    const fullUser = await User.findById(user._id);
    timer.mark('dev mode token bypass', { tokensRemaining: fullUser?.tokens ?? user.tokens, cost: 0 });
    return fullUser || user;
  }
  const cost = tokenCost();
  const chargedUser = await User.findOneAndUpdate(
    { _id: user._id, tokens: { $gte: cost } },
    { $inc: { tokens: -cost } },
    { new: true }
  );
  if (!chargedUser) return null;
  timer.mark('token reserved', { tokensRemaining: chargedUser.tokens, cost });
  return chargedUser;
}

async function refundToken(user, timer) {
  if (devMode()) {
    timer.mark('dev mode refund skipped', { tokensRemaining: user.tokens, cost: 0 });
    return user;
  }
  const cost = tokenCost();
  const refundedUser = await User.findByIdAndUpdate(user._id, { $inc: { tokens: cost } }, { new: true });
  if (refundedUser) timer.mark('token refunded', { cost, tokensRemaining: refundedUser.tokens });
  return refundedUser || user;
}

router.get('/', requireUser, async (req, res) => {
  const ids = String(req.query.productIds || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 96);
  const filter = { user: req.user._id };
  if (ids.length) filter.product = { $in: ids };
  const tryOns = await TryOn.find(filter).sort({ createdAt: -1 });
  res.json({ tryOns: tryOns.map((tryOn) => tryOn.toClient()) });
});

router.get('/cache', requireUser, async (req, res) => {
  const user = await User.findById(req.user._id).select('tryOnCache');
  res.json({ tryOnCache: (user?.tryOnCache || []).map(cachedTryOnToClient) });
});

router.post('/custom', requireUser, upload.single('garment'), async (req, res) => {
  const timer = createTimer('custom', { userId: req.user._id.toString() });
  let reserved = false;

  try {
    if (!req.file) return res.status(400).json({ message: 'Upload a clothing image first' });
    const chargedUser = await reserveToken(req.user, timer);
    if (!chargedUser) {
      timer.end({ error: 'insufficient tokens' });
      return res.status(402).json({ message: 'Not enough tokens for AI try-on' });
    }
    reserved = true;
    req.user = chargedUser;

    const tryOn = await saveGeneratedCustomTryOn({
      user: req.user,
      garmentFile: req.file,
      tryOnModel: req.body?.tryOnModel,
      timer
    });
    timer.end({ tokensRemaining: req.user.tokens });
    res.status(201).json({ tryOn: tryOn.toClient(), user: req.user.toClient() });
  } catch (error) {
    if (reserved) req.user = await refundToken(req.user, timer);
    const message = readableError(error, 'Could not generate custom AI try-on');
    timer.end({ error: message });
    res.status(400).json({ message });
  }
});

router.post('/external', requireUser, async (req, res) => {
  let product;
  try {
    product = externalProductFromBody(req.body?.product);
  } catch (error) {
    return res.status(400).json({ message: readableError(error, 'External product is missing') });
  }

  const timer = createTimer('external', {
    userId: req.user._id.toString(),
    sourceUrl: product.sourceUrl
  });
  let reserved = false;

  try {
    const existing = await ExternalTryOn.findOne({ user: req.user._id, sourceUrl: product.sourceUrl });
    if (existing) {
      await cacheTryOnForUser(req.user, {
        kind: 'external',
        key: product.sourceUrl,
        externalTryOn: existing._id,
        sourceUrl: product.sourceUrl,
        label: existing.productName || product.name,
        image: existing.image
      });
      timer.end({ reused: true });
      return res.json({ tryOn: existing.toClient(), user: req.user.toClient(), reused: true });
    }

    const chargedUser = await reserveToken(req.user, timer);
    if (!chargedUser) {
      timer.end({ error: 'insufficient tokens' });
      return res.status(402).json({ message: 'Not enough tokens for AI try-on' });
    }
    reserved = true;
    req.user = chargedUser;

    const tryOn = await saveGeneratedExternalTryOn({ user: req.user, product, timer });
    timer.end({ reused: false, tokensRemaining: req.user.tokens });
    res.status(201).json({ tryOn: tryOn.toClient(), user: req.user.toClient(), reused: false });
  } catch (error) {
    if (error.code === 11000) {
      const existing = await ExternalTryOn.findOne({ user: req.user._id, sourceUrl: product.sourceUrl });
      if (existing) {
        if (reserved) {
          req.user = await refundToken(req.user, timer);
          reserved = false;
        }
        await cacheTryOnForUser(req.user, {
          kind: 'external',
          key: product.sourceUrl,
          externalTryOn: existing._id,
          sourceUrl: product.sourceUrl,
          label: existing.productName || product.name,
          image: existing.image
        });
        timer.end({ reused: true, duplicate: true });
        return res.json({ tryOn: existing.toClient(), user: req.user.toClient(), reused: true });
      }
    }
    if (reserved) req.user = await refundToken(req.user, timer);
    const message = readableError(error, 'Could not generate external AI try-on');
    timer.end({ error: message });
    res.status(400).json({ message });
  }
});

router.post('/vto-trial', requireUser, upload.fields([{ name: 'person', maxCount: 1 }, { name: 'garment', maxCount: 1 }]), async (req, res) => {
  const timer = createTimer('vto-trial', { userId: req.user._id.toString(), model: virtualTryOnTrialModel() });

  try {
    const personFile = req.files?.person?.[0];
    const garmentFile = req.files?.garment?.[0];
    if (!personFile) return res.status(400).json({ message: 'Upload a person image first' });
    if (!garmentFile) return res.status(400).json({ message: 'Upload a garment image first' });

    const personDataUri = dataUriFromBuffer(personFile, 'person');
    const garmentDataUri = dataUriFromBuffer(garmentFile, 'garment');
    const prompt = virtualTryOnTrialPrompt(req.body?.note);
    timer.mark('trial images prepared', {
      personKb: Math.round(personDataUri.length / 1024),
      garmentKb: Math.round(garmentDataUri.length / 1024)
    });

    const trial = await callFalVirtualTryOnTrial({ personDataUri, garmentDataUri, prompt, aspectRatio: req.body?.aspectRatio, timer });
    const { bytes, mimetype } = await generatedBytesFromUrl(trial.generatedUrl, timer);
    const filename = `tryon-vto-trial-${Date.now()}-${Math.round(Math.random() * 1e9)}${extensionFor(mimetype)}`;
    const image = await saveUserCacheFile({ user: req.user, bytes, filename, mimetype });
    await cacheTryOnForUser(req.user, {
      kind: 'vto-trial',
      key: `vto-trial:${Date.now()}`,
      label: 'VTO trial',
      image
    });
    timer.end({ payloadVariant: trial.payloadVariant, outputKb: Math.round(bytes.length / 1024), path: image.path });

    res.status(201).json({
      trial: {
        imageUrl: `/${image.path}`,
        model: virtualTryOnTrialModel(),
        prompt,
        payloadVariant: trial.payloadVariant,
        preservePose: trial.preservePose,
        aspectRatio: trial.aspectRatio,
        rawKeys: trial.rawKeys
      },
      user: req.user.toClient()
    });
  } catch (error) {
    const message = readableError(error, 'Could not run virtual try-on trial');
    timer.end({ error: message });
    res.status(400).json({ message });
  }
});

router.post('/:productId', requireUser, async (req, res) => {
  const timer = createTimer('generate', {
    userId: req.user._id.toString(),
    productId: req.params.productId
  });
  let reserved = false;

  try {
    const product = await Product.findOne({ _id: req.params.productId, isActive: true });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    timer.mark('product loaded', { tryOnModel: tryOnModelForProduct(product) });

    const existing = await TryOn.findOne({ user: req.user._id, product: req.params.productId });
    if (existing) {
      await cacheTryOnForUser(req.user, {
        kind: 'product',
        key: product._id.toString(),
        tryOn: existing._id,
        product: product._id,
        label: product.name,
        image: existing.image
      });
      timer.end({ reused: true });
      return res.json({ tryOn: existing.toClient(), user: req.user.toClient(), reused: true });
    }

    const chargedUser = await reserveToken(req.user, timer);
    if (!chargedUser) {
      timer.end({ error: 'insufficient tokens' });
      return res.status(402).json({ message: 'Not enough tokens for AI try-on' });
    }
    reserved = true;
    req.user = chargedUser;

    const tryOn = await saveGeneratedTryOn({ user: req.user, product, timer });
    timer.end({ reused: false, tokensRemaining: req.user.tokens });

    res.status(201).json({ tryOn: tryOn.toClient(), user: req.user.toClient(), reused: false });
  } catch (error) {
    if (error.code === 11000) {
      const existing = await TryOn.findOne({ user: req.user._id, product: req.params.productId });
      if (existing) {
        if (reserved) {
          req.user = await refundToken(req.user, timer);
          reserved = false;
        }
        await cacheTryOnForUser(req.user, {
          kind: 'product',
          key: product._id.toString(),
          tryOn: existing._id,
          product: product._id,
          label: product.name,
          image: existing.image
        });
        timer.end({ reused: true, duplicate: true });
        return res.json({ tryOn: existing.toClient(), user: req.user.toClient(), reused: true });
      }
    }
    if (reserved) {
      req.user = await refundToken(req.user, timer);
    }
    const message = readableError(error, 'Could not generate AI try-on');
    timer.end({ error: message });
    res.status(400).json({ message });
  }
});

export default router;
