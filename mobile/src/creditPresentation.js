export function knownCreditBalance(user) {
  if (user?.devMode) return 'Unlimited';
  const value = user?.credits?.remaining ?? user?.tokens ?? user?.remainingCredits ?? user?.creditBalance;
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function creditPackageDisplayPrice(platform, plan, storeProduct) {
  if (platform === 'android' || platform === 'ios') {
    return String(storeProduct?.displayPrice || storeProduct?.localizedPriceIOS || storeProduct?.localizedPrice || '').trim() || 'Unavailable';
  }
  const amount = Number(plan?.amount);
  if (!Number.isSafeInteger(amount) || amount < 0) return 'Unavailable';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: plan?.currency || 'INR' }).format(amount / 100);
}

export function creditPurchaseAvailability({ platform, enabled, connected, product, busy }) {
  if (platform === 'android' && !enabled) return { available: false, label: 'Credit purchases are currently unavailable.' };
  if (platform === 'ios' && !connected) return { available: false, label: 'App Store purchases are currently unavailable.' };
  if ((platform === 'android' || platform === 'ios') && creditPackageDisplayPrice(platform, null, product) === 'Unavailable') return { available: false, label: 'This credit package is unavailable.' };
  if (busy) return { available: false, label: 'Purchase in progress.' };
  return { available: true, label: 'Available to purchase.' };
}

export function creditSubscriptionStatus(subscription) {
  const status = String(subscription?.status || '').toLowerCase();
  if (status === 'active') return 'Active';
  if (status === 'billing_grace') return 'Billing grace period';
  if (['cancelled', 'canceled'].includes(status)) return 'Cancelled';
  if (status === 'expired') return 'Expired';
  if (status === 'inactive') return 'No active subscription';
  if (['pending', 'authenticated'].includes(status)) return 'Pending';
  return 'Unavailable';
}

export function creditPackageDescription(plan) {
  const description = String(plan?.description || '').trim();
  return description && !/\b(best value|better value|save|savings|discount)\b/i.test(description)
    ? description
    : 'One-time credits for image try-ons and videos.';
}

export function paymentCatalogAvailable(subscription, topUps) {
  const validPlan = (plan) => Boolean(String(plan?.id || '').trim())
    && Number.isSafeInteger(Number(plan?.tokens ?? plan?.credits)) && Number(plan?.tokens ?? plan?.credits) > 0
    && Number.isSafeInteger(Number(plan?.amount)) && Number(plan?.amount) > 0
    && Boolean(String(plan?.currency || '').trim());
  if (!validPlan(subscription) || !Array.isArray(topUps) || !topUps.length || !topUps.every(validPlan)) return false;
  return new Set(topUps.map((plan) => String(plan.id))).size === topUps.length;
}

export function recurringPeriodLabel(frequency) {
  const value = String(frequency || '').trim().toLowerCase();
  return { monthly: 'month', weekly: 'week', yearly: 'year', annually: 'year', quarterly: 'quarter' }[value] || value;
}

export function showMandateTermsForPlatform(platform) {
  return platform !== 'android' && platform !== 'ios';
}
