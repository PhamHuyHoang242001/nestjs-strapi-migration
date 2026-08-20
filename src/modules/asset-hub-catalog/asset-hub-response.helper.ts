// Strip fields that belong only on item/version detail. The skill path spreads whole entities
// through formatVersion, so usage_guide_html (up to ~200k) and zip_tree would otherwise ride
// every list/review/version-management row. Prompt versions have no zip_tree — delete is a no-op.
export function stripGuide<T extends { usage_guide_html?: string; zip_tree?: unknown }>(
  version: T | null | undefined,
): Omit<T, 'usage_guide_html' | 'zip_tree'> | null | undefined {
  if (!version) return version as null | undefined;
  const rest = { ...(version as T & { usage_guide_html?: string; zip_tree?: unknown }) };
  delete rest.usage_guide_html;
  delete rest.zip_tree;
  return rest as Omit<T, 'usage_guide_html' | 'zip_tree'>;
}
