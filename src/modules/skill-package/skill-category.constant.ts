// Closed category set for skill packages (single-select per package).
// Bounds the `category` field to a known enum so arbitrary strings are rejected
// at validation (defense-in-depth alongside parameter-bound queries).
// This is a first-pass taxonomy — the definitive product list is still to be
// confirmed; adjust values here (single source of truth; the FE mirrors it).
export enum SkillCategory {
  General = 'general',
  DataAnalysis = 'data-analysis',
  Automation = 'automation',
  Integration = 'integration',
  Reporting = 'reporting',
  Other = 'other',
}

export const SKILL_CATEGORIES: string[] = Object.values(SkillCategory);
