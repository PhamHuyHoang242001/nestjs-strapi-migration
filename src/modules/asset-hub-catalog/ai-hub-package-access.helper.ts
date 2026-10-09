export type AiHubArtifactType = 'skill' | 'prompt' | 'api-catalog' | 'coworker';

export const AI_HUB_ARTIFACT_TYPES: readonly AiHubArtifactType[] = [
  'skill',
  'prompt',
  'api-catalog',
  'coworker',
];

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

export function canSeeInactivePackage(opts: {
  isOwner: boolean;
  isSupporter: boolean;
  canApprove: boolean;
  isSo: boolean;
}): boolean {
  return opts.isOwner || opts.isSupporter || opts.canApprove || opts.isSo;
}

export function inactiveListMode(
  requestedInactive: boolean,
  canApprove: boolean,
  isSo: boolean,
): InactiveListMode {
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
