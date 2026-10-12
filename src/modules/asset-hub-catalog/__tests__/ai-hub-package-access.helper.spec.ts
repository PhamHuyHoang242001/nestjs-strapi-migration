import {
  canAccessAiHubVersion,
  canBumpPackage,
  canSeeInactivePackage,
  canTogglePackage,
  inactiveListMode,
  isAiHubWorkspaceSO,
  ownVersionScopeSql,
} from '../ai-hub-package-access.helper';

describe('canBumpPackage', () => {
  const base = { userId: 10, createdBy: 10, hasUpload: true, supporterIds: [] as number[] };

  it('true when creator has upload', () => {
    expect(canBumpPackage(base)).toBe(true);
  });

  it('false when creator lacks upload', () => {
    expect(canBumpPackage({ ...base, hasUpload: false })).toBe(false);
  });

  it('true when supporter has upload', () => {
    expect(canBumpPackage({ ...base, createdBy: 99, supporterIds: [10, 11] })).toBe(true);
  });

  it('false when supporter lacks upload', () => {
    expect(canBumpPackage({ ...base, createdBy: 99, hasUpload: false, supporterIds: [10] })).toBe(false);
  });

  it('false for stranger with upload', () => {
    expect(canBumpPackage({ ...base, createdBy: 99, supporterIds: [11] })).toBe(false);
  });

  it('false when supporters empty and not creator', () => {
    expect(canBumpPackage({ ...base, createdBy: 99, supporterIds: [] })).toBe(false);
  });
});

describe('canTogglePackage', () => {
  const base = { userId: 10, createdBy: 10, supporterIds: [] as number[], isSo: false };

  it('true for creator even without upload', () => {
    expect(canTogglePackage(base)).toBe(true);
  });

  it('true for supporter', () => {
    expect(canTogglePackage({ ...base, createdBy: 99, supporterIds: [10] })).toBe(true);
  });

  it('true for SO who is neither', () => {
    expect(canTogglePackage({ ...base, createdBy: 99, isSo: true })).toBe(true);
  });

  it('false for stranger', () => {
    expect(canTogglePackage({ ...base, createdBy: 99, supporterIds: [11] })).toBe(false);
  });
});

describe('canAccessAiHubVersion', () => {
  const base = {
    userId: 10,
    submittedBy: 99,
    createdBy: 88,
    canApprove: false,
    supporterIds: [] as number[],
  };

  it('true for submitter', () => {
    expect(canAccessAiHubVersion({ ...base, submittedBy: 10 })).toBe(true);
  });

  it('true for package creator', () => {
    expect(canAccessAiHubVersion({ ...base, createdBy: 10 })).toBe(true);
  });

  it('true for approver', () => {
    expect(canAccessAiHubVersion({ ...base, canApprove: true })).toBe(true);
  });

  it('true for package supporter', () => {
    expect(canAccessAiHubVersion({ ...base, supporterIds: [10, 11] })).toBe(true);
  });

  it('false for stranger even with empty createdBy', () => {
    expect(canAccessAiHubVersion({ ...base, createdBy: undefined, supporterIds: [11] })).toBe(false);
  });
});

describe('ownVersionScopeSql', () => {
  it('keeps submitter/creator binds and adds live supporter EXISTS', () => {
    const sql = ownVersionScopeSql(1, 'prompt');
    expect(sql).toContain('v.submitted_by = $1 OR p.created_by = $1');
    expect(sql).toContain('FROM ai_hub_supporters s');
    expect(sql).toContain("s.type = 'prompt'");
    expect(sql).toContain('s.user_id = $1');
    expect(sql).toContain('s.deleted_at IS NULL');
    expect(sql).toContain('COALESCE(s.is_deleted, false) = false');
  });

  it('binds api-catalog type with hyphen', () => {
    expect(ownVersionScopeSql(2, 'api-catalog')).toContain("s.type = 'api-catalog'");
    expect(ownVersionScopeSql(2, 'api-catalog')).toContain('$2');
  });
});

describe('inactive visibility', () => {
  it('canSeeInactivePackage true for owner / supporter / approve / SO', () => {
    expect(canSeeInactivePackage({ isOwner: true, isSupporter: false, canApprove: false, isSo: false })).toBe(true);
    expect(canSeeInactivePackage({ isOwner: false, isSupporter: true, canApprove: false, isSo: false })).toBe(true);
    expect(canSeeInactivePackage({ isOwner: false, isSupporter: false, canApprove: true, isSo: false })).toBe(true);
    expect(canSeeInactivePackage({ isOwner: false, isSupporter: false, canApprove: false, isSo: true })).toBe(true);
    expect(canSeeInactivePackage({ isOwner: false, isSupporter: false, canApprove: false, isSo: false })).toBe(false);
  });

  it('inactiveListMode: stranger requesting inactive still own-inactive (not all)', () => {
    expect(inactiveListMode(false, false, false)).toBe('active');
    expect(inactiveListMode(true, true, false)).toBe('all-inactive');
    expect(inactiveListMode(true, false, true)).toBe('all-inactive');
    expect(inactiveListMode(true, false, false)).toBe('own-inactive');
  });
});

describe('isAiHubWorkspaceSO', () => {
  it('true on sentinel rootId 0 for that table', () => {
    expect(isAiHubWorkspaceSO([{ rootTable: 'skill_packages', rootId: 0 }], 'skill_packages')).toBe(true);
  });

  it('false for a real package id (never treat as SO)', () => {
    expect(isAiHubWorkspaceSO([{ rootTable: 'skill_packages', rootId: 12 }], 'skill_packages')).toBe(false);
  });

  it('false for a different workspace table', () => {
    expect(isAiHubWorkspaceSO([{ rootTable: 'skill_packages', rootId: 0 }], 'prompt_packages')).toBe(false);
  });
});
