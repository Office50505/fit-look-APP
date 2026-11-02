export function routeTransitionSpec(direction, width, reduceMotion = false) {
  if (reduceMotion || direction === 'replace') return { offset: 0, duration: 0, opacity: 1 };
  const distance = Math.min(16, Math.max(10, Math.round((Number(width) || 360) * 0.035)));
  return {
    offset: direction === 'back' ? -distance : distance,
    duration: direction === 'back' ? 140 : 160,
    opacity: 0.98
  };
}
