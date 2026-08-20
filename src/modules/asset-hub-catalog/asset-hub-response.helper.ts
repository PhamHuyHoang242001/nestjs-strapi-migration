// Remove the usage guide from a version payload. The skill path spreads whole entities through
// formatVersion, and the prompt path returns them directly, so in both workspaces the guide —
// which can run to 200k characters — would otherwise ride along on every row of every list.
// It belongs only on the two single-item surfaces (item detail and version detail); every list,
// review queue and version-management page drops it here.
export function stripGuide<T extends { usage_guide_html?: string }>(
  version: T | null | undefined,
): Omit<T, 'usage_guide_html'> | null | undefined {
  if (!version) return version as null | undefined;
  // Copy-then-delete rather than a discarded destructuring binding, which lint reads as dead code.
  const rest = { ...(version as T & { usage_guide_html?: string }) };
  delete rest.usage_guide_html;
  return rest as Omit<T, 'usage_guide_html'>;
}
