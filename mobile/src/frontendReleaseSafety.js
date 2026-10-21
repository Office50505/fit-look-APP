// Frontend-only decisions. No network, account deletion, persistence or provider configuration.
function formField(body, name) {
  if (typeof body?.get === 'function') return body.get(name);
  return body?._parts?.find(([key]) => key === name)?.[1];
}

export function aiPhotoSubmissionNotice(path, options = {}) {
  if (String(options.method || 'GET').toUpperCase() !== 'POST') return null;
  const route = String(path).split('?')[0];
  if (['/auth/signup/complete', '/auth/body-photo'].includes(route)) {
    if (formField(options.body, 'profilePhotoMode') === 'uploaded') return null;
    return { purpose: 'prepare your AI profile', data: 'your selected profile photo', providers: 'fal' };
  }
  if (['/closet/items', '/closet/items/analyze'].includes(route)) {
    return { purpose: 'identify clothing details', data: 'your selected clothing photo', providers: 'fal' };
  }
  if (/^\/tryons(?:\/|$)/.test(route) || route === '/closet/outfits/generate') {
    return { purpose: 'create your requested AI look', data: 'your saved profile photo, selected clothing images and styling instructions', providers: 'Pruna, FitRoom, fal or PixVerse, depending on the feature and server configuration' };
  }
  return null;
}

export function createPhotoConsentGate() {
  let present = null;
  let pending = null;
  const respond = (accepted) => {
    const resolve = pending;
    pending = null;
    present?.(null);
    resolve?.(accepted === true);
  };
  return {
    setPresenter(next) { respond(false); present = next; },
    respond,
    request(notice) {
      if (!present || pending) return Promise.resolve(false);
      return new Promise((resolve) => { pending = resolve; present(notice); });
    }
  };
}

export async function guardAiPhotoSubmission(transport, path, options, requestConsent) {
  const notice = aiPhotoSubmissionNotice(path, options);
  if (notice && await requestConsent(notice) !== true) {
    const error = new Error('Photo sharing was not allowed. Nothing was uploaded for this request.');
    error.code = 'photo_consent_declined';
    throw error;
  }
  return transport(path, options);
}

export function accountDeletionOutcome(data) {
  if (['failed', 'error'].includes(String(data?.status || '').toLowerCase()) || ['failed', 'error'].includes(String(data?.cleanupStatus || '').toLowerCase())) {
    return { state: 'error', message: 'Account cleanup was not confirmed. Contact support to check your deletion request before trying again.' };
  }
  // A pending/partial response must never become a completion notification.
  if (['pending', 'processing', 'accepted'].includes(String(data?.status || '').toLowerCase()) || data?.pending === true || data?.storageCleanupComplete === false) {
    return { state: 'pending', message: 'Your deletion request is pending. Completion is not confirmed. Contact support to check its status before trying again.' };
  }
  if (data?.deleted === true && !['failed', 'error'].includes(String(data?.status || '').toLowerCase())) {
    return { state: 'complete', message: 'The server confirmed your account deletion. See the deletion policy for any records retained for legal or transaction purposes.' };
  }
  return { state: 'error', message: 'We could not confirm account deletion. Your account has not been confirmed deleted. Check its status before trying again.' };
}

export const contentReportReasons = ['unsafe', 'sexual', 'hate', 'violence', 'misleading', 'other'];
const reportTypes = ['product_tryon', 'custom_tryon', 'external_tryon', 'wardrobe_outfit', 'stylist_message'];
export function reportContentReference(record, type) {
  const id = record?.tryOnId || record?.id || record?._id;
  return reportTypes.includes(type) && typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id)
    ? { type, id } : null;
}

// Proposed contract only. No POST is possible without an authenticated, versioned
// capability response for this content type. No photos, signed URLs or prompts sent.
export function createContentReportClient(transport, currentOwner) {
  let capability = null;
  let loading = false;
  let submitting = false;
  const attempts = new Map();
  function assertOwner(owner) {
    if (!owner || currentOwner() !== owner) throw new Error('Sign in again before reporting this content.');
  }
  return {
    async availability(owner, content) {
      capability = null;
      assertOwner(owner);
      if (!content || !reportContentReference(content, content.type) || loading) return false;
      loading = true;
      try {
        const data = await transport('/content-reports/capabilities', { noCache: true, timeoutMs: 8000 });
        assertOwner(owner);
        if (data?.contractVersion !== 1 || data?.enabled !== true || !Array.isArray(data?.contentTypes) || !data.contentTypes.includes(content.type)
          || !Array.isArray(data?.reasons) || !contentReportReasons.every(reason => data.reasons.includes(reason))) return false;
        capability = { owner, type: content.type, id: content.id };
        return true;
      } finally { loading = false; }
    },
    async submit(owner, content, reason) {
      assertOwner(owner);
      const reference = reportContentReference(content, content?.type);
      if (!reference || !contentReportReasons.includes(reason)) throw new Error('Choose valid content and a reporting reason.');
      if (!capability || capability.owner !== owner || capability.type !== reference.type || capability.id !== reference.id) throw new Error('In-app reporting is unavailable. No report was submitted.');
      if (submitting) throw new Error('A report is already being submitted.');
      const key = JSON.stringify([owner, reference.type, reference.id, reason]);
      const attempt = attempts.get(key) || { requestId: `report-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}` };
      attempts.set(key, attempt);
      if (attempt.response) return attempt.response;
      submitting = true;
      try {
        const data = await transport('/content-reports', {
          method: 'POST', timeoutMs: 15000, pollJob: false,
          headers: { 'Idempotency-Key': attempt.requestId },
          body: JSON.stringify({ contractVersion: 1, content: reference, reason })
        });
        assertOwner(owner);
        if (data?.accepted !== true || !/^[A-Za-z0-9_-]{1,128}$/.test(String(data?.reportId || ''))
          || !['received', 'under_review'].includes(data?.status)) throw new Error('Report receipt could not be confirmed. Retry or contact support.');
        attempt.response = data;
        return data;
      } finally { submitting = false; }
    }
  };
}

export function requireGeneratedImage(result, label = 'Your AI look') {
  if (!result?.imageUrl) throw new Error(`${label} is not ready yet. Please try again in a moment.`);
  return result;
}
