// Android elevation chooses its own blur/opacity. Match the authored iOS
// shadows explicitly on Android versions that support React Native boxShadow.
export function nativeAppearanceStyles(rules, platform, apiLevel) {
  if (platform !== 'android' || Number(apiLevel) < 28) return rules;
  return Object.fromEntries(Object.entries(rules).map(([name, style]) => {
    if (!style.shadowColor || style.shadowOpacity == null) return [name, style];
    const hex = style.shadowColor.slice(1);
    const rgb = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
    if (!/^[a-f\d]{6}$/i.test(rgb)) return [name, style];
    const channels = [0, 2, 4].map((index) => parseInt(rgb.slice(index, index + 2), 16));
    return [name, {
      ...style,
      elevation: 0,
      boxShadow: [{
        offsetX: style.shadowOffset?.width || 0,
        offsetY: style.shadowOffset?.height || 0,
        blurRadius: style.shadowRadius || 0,
        color: `rgba(${channels.join(', ')}, ${style.shadowOpacity})`
      }]
    }];
  }));
}
