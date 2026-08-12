// Dedicated category taxonomy for prompts (independent from SkillCategory).
// Application-level enforcement via @IsEnum on the DTO; the DB column stays a plain varchar.
export enum PromptCategory {
  WRITING = 'writing',
  CODING = 'coding',
  MARKETING = 'marketing',
  ANALYSIS = 'analysis',
  ROLEPLAY = 'roleplay',
  DATA = 'data',
  OTHER = 'other',
}
