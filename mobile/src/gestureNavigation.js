export function routeTransitionSpec(direction, width, reduceMotion = false) {
  if (reduceMotion || direction === 'replace' || direction === 'pop') return { offset: 0, duration: 0 };
  const distance = Math.min(46, Math.max(28, Math.round((Number(width) || 360) * 0.085)));
  return {
    offset: direction === 'back' ? -distance : distance,
    duration: direction === 'back' ? 360 : 410
  };
}
