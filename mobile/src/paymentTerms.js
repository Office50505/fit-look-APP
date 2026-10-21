export function subscriptionTerms(plan) {
  const setup = Number(plan?.dueTodayAmount ?? plan?.mandate?.setupAmount);
  const recurring = Number(plan?.mandate?.recurringAmount);
  const frequency = String(plan?.mandate?.frequency || '').trim();
  const delay = Number(plan?.mandate?.firstDebitDelayHours);
  if (!Number.isSafeInteger(setup) || setup < 0 || !Number.isSafeInteger(recurring) || recurring <= 0 || !frequency || !Number.isFinite(delay) || delay < 0) {
    return { valid: false, message: 'Billing terms are unavailable. Please try again later.' };
  }
  return {
    valid: true,
    setup,
    recurring,
    frequency,
    timing: `After the setup payment and mandate activation (at least ${delay} hours later)`,
    renewal: `Automatically renews ${frequency.toLowerCase()}.`,
    cancellation: String(plan?.cancellation || 'See account settings or contact support to cancel future renewals.')
  };
}

export function googlePlayDisplayPrice(product) {
  return String(product?.displayPrice || '').trim() || 'Unavailable';
}
