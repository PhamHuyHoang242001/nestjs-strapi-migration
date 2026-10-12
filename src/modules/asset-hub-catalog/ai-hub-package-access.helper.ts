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

/** My Version list + version detail/diff. Approver is org-wide; supporter is package-scoped. */
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
 * Own-scope predicate for GET list versions. Same user bind for submitter, creator, and live
 * supporter. `artifactType` is a closed union — interpolated as a SQL literal.
 */
export function ownVersionScopeSql(userParamIndex: number, artifactType: AiHubArtifactType): string {
  return `(v.submitted_by = $${userParamIndex} OR p.created_by = $${userParamIndex} OR EXISTS (
      SELECT 1 FROM ai_hub_supporters s
      WHERE s.data_id = p.id
        AND s.type = '${artifactType}'
        AND s.user_id = $${userParamIndex}
        AND s.deleted_at IS NULL AND COALESCE(s.is_deleted, false) = false
    ))`;
}

export function canSeeInactivePackage(opts: {
  isOwner: boolean;
  isSupporter: boolean;
  canApprove: boolean;
  isSo: boolean;
}): boolean {
  return opts.isOwner || opts.isSupporter || opts.canApprove || opts.isSo;
}

export function inactiveListMode(requestedInactive: boolean, canApprove: boolean, isSo: boolean): InactiveListMode {
  if (!requestedInactive) return 'active';
  if (canApprove || isSo) return 'all-inactive';
  return 'own-inactive';
}

export function isAiHubWorkspaceSO(
  ownerScope: ReadonlyArray<{ rootTable: string; rootId: number }>,
  packageTable: string,
): boolean {
  return ownerScope.some((s) => s.rootTable === packageTable && s.rootId === 0);
}
