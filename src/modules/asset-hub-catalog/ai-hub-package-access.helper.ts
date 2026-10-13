export type AiHubArtifactType = 'skill' | 'prompt' | 'api-catalog' | 'coworker';

export const AI_HUB_ARTIFACT_TYPES: readonly AiHubArtifactType[] = ['skill', 'prompt', 'api-catalog', 'coworker'];

export const AI_HUB_PACKAGE_TABLES = [
  'skill_packages',
  'prompt_packages',
  'api_catalog_packages',
  'coworker_packages',
] as const;

export type InactiveListMode = 'active' | 'all-inactive' | 'own-inactive';

/** Bump / rejected-edit. SO is NOT included — pending-edit is a separate check. */
export function canBumpPackage(opts: {
  userId: number;
  createdBy: number;
  hasUpload: boolean;
  supporterIds: number[];
}): boolean {
  if (!opts.hasUpload) return false;
  return opts.createdBy === opts.userId || opts.supporterIds.includes(opts.userId);
}

/** Toggle status: creator ∨ supporter ∨ SO. Guard still requires upload OR approve. */
export function canTogglePackage(opts: {
  userId: number;
  createdBy: number;
  supporterIds: number[];
  isSo: boolean;
}): boolean {
  if (opts.isSo) return true;
  return opts.createdBy === opts.userId || opts.supporterIds.includes(opts.userId);
}

/** Version detail/diff. Approver is org-wide; supporter is package-scoped. List uses ownVersionScopeSql. */
export function canAccessAiHubVersion(opts: {
  userId: number;
  submittedBy: number;
  createdBy?: number;
  canApprove: boolean;
  supporterIds: number[];
}): boolean {
  if (opts.submittedBy === opts.userId) return true;
  if (opts.createdBy === opts.userId) return true;
  if (opts.canApprove) return true;
  return opts.supporterIds.includes(opts.userId);
}

/**
 * Own-scope for GET list versions + codesOnly. Submitter or package creator only.
 * Supporter is edit-only: they see a row only after they submit it (v.submitted_by).
 */
export function ownVersionScopeSql(userParamIndex: number): string {
  return `(v.submitted_by = $${userParamIndex} OR p.created_by = $${userParamIndex})`;
}

/** Inactive detail/download: owner ∨ supporter ∨ SO. Approve does not widen (same as list). */
export function canSeeInactivePackage(opts: { isOwner: boolean; isSupporter: boolean; isSo: boolean }): boolean {
  return opts.isOwner || opts.isSupporter || opts.isSo;
}

/** Active (or omitted) → active. Inactive → SO all, everyone else own/supporter. Approve is unused. */
export function inactiveListMode(requestedInactive: boolean, isSo: boolean): InactiveListMode {
  if (!requestedInactive) return 'active';
  return isSo ? 'all-inactive' : 'own-inactive';
}

export function isAiHubWorkspaceSO(
  ownerScope: ReadonlyArray<{ rootTable: string; rootId: number }>,
  packageTable: string,
): boolean {
  return ownerScope.some((s) => s.rootTable === packageTable && s.rootId === 0);
}
