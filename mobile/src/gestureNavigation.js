export function routeTransitionSpec(direction, width, reduceMotion = false, platform = 'ios') {
  if (reduceMotion || direction === 'replace' || direction === 'pop') return { offset: 0, duration: 0 };
  const android = platform === 'android';
  const distance = android
    ? Math.min(26, Math.max(18, Math.round((Number(width) || 360) * 0.055)))
    : Math.min(46, Math.max(28, Math.round((Number(width) || 360) * 0.085)));
  return {
    offset: direction === 'back' ? -distance : distance,
    duration: android
      ? direction === 'back' ? 190 : 220
      : direction === 'back' ? 360 : 410
  };
}
