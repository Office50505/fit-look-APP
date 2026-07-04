import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const localApi = Platform.OS === 'android' ? 'http://10.0.2.2:5050/api' : 'http://localhost:5050/api';
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || localApi).replace(/\/$/, '');
export const API_ORIGIN = API_URL.replace(/\/api\/?$/, '');
const TOKEN_KEY = 'fitlook_token';

export async function getToken() {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function saveToken(token) {
  if (!token) return AsyncStorage.removeItem(TOKEN_KEY);
  return AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function clearToken() {
  return AsyncStorage.removeItem(TOKEN_KEY);
}

export function imageUrl(url) {
  if (!url) return '';
  if (/^(?:https?:|data:image)/i.test(url)) return url;
  return `${API_ORIGIN}${url.startsWith('/') ? url : `/${url}`}`;
}

export function formatMoney(value, currency = 'USD') {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'Price unavailable';
  const normalizedCurrency = String(currency || 'USD').toUpperCase();
  const locale = normalizedCurrency === 'INR' ? 'en-IN' : 'en-US';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: normalizedCurrency }).format(amount);
  } catch {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  }
}

function readableError(value, fallback = 'Request failed') {
  if (!value) return fallback;
  if (typeof value === 'string') return value;
  if (value instanceof Error) return readableError(value.message, fallback);
  if (typeof value === 'object') {
    const nested = value.message || value.detail || value.error || value.errors;
    if (nested && nested !== value) return readableError(nested, fallback);
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return fallback;
    }
  }
  return String(value);
}

export async function api(path, options = {}) {
  const token = await getToken();
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = isForm ? {} : { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...headers, ...options.headers }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(readableError(data, `Request failed (${response.status})`));
  return data;
}

export function filePart(asset, fallbackName = 'upload.jpg') {
  if (!asset?.uri) return null;
  const name = asset.fileName || fallbackName;
  const extension = name.split('.').pop()?.toLowerCase() || 'jpg';
  const type = asset.mimeType || (extension === 'png' ? 'image/png' : 'image/jpeg');
  return { uri: asset.uri, name, type };
}
