export function uniqueCategoryTiles(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const key = JSON.stringify(item.params || {});
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildCategorySections(railItems, contentByKey) {
  return railItems.filter((rail) => contentByKey[rail.key]).map((rail) => {
    const content = contentByKey[rail.key];
    return {
      key: rail.key,
      content,
      items: uniqueCategoryTiles([...(content.featured || []), ...(content.items || [])])
    };
  });
}

export function categoryAtScrollPosition(sections, offsets, visibleY) {
  let activeKey = sections[0]?.key || '';
  for (const section of sections) {
    if ((offsets[section.key] ?? Infinity) > visibleY) break;
    activeKey = section.key;
  }
  return activeKey;
}
