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
  it('binds submitter or package creator only — supporter does not widen', () => {
    const sql = ownVersionScopeSql(1);
    expect(sql).toBe('(v.submitted_by = $1 OR p.created_by = $1)');
    expect(sql).not.toContain('ai_hub_supporters');
    expect(ownVersionScopeSql(2)).toBe('(v.submitted_by = $2 OR p.created_by = $2)');
  });
});

describe('inactive visibility', () => {
  it('canSeeInactivePackage true for owner / supporter / SO; approve does not widen', () => {
    expect(canSeeInactivePackage({ isOwner: true, isSupporter: false, isSo: false })).toBe(true);
    expect(canSeeInactivePackage({ isOwner: false, isSupporter: true, isSo: false })).toBe(true);
    expect(canSeeInactivePackage({ isOwner: false, isSupporter: false, isSo: true })).toBe(true);
    expect(canSeeInactivePackage({ isOwner: false, isSupporter: false, isSo: false })).toBe(false);
  });

  it('inactiveListMode: omitted/active → active; inactive → SO all, else own', () => {
    expect(inactiveListMode(false, false)).toBe('active');
    expect(inactiveListMode(false, true)).toBe('active');
    expect(inactiveListMode(true, true)).toBe('all-inactive');
    expect(inactiveListMode(true, false)).toBe('own-inactive');
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
