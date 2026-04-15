// BI Hub domain enums extracted from Strapi schemas

export enum BiHubReportType {
  ADHOC = 'adhoc',
  REGULAR = 'regular',
}

export enum BiHubReportProgressStatus {
  INPROGRESS = 'inprogress',
  COMPLETED = 'completed',
  OVERDUE = 'overdue',
}

export enum BiHubReportFrequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  BI_WEEKLY = 'bi_weekly',
  MONTHLY = 'monthly',
  QUATERLY = 'quaterly',
  SEMI_ANNUAL = 'semi_annual',
  YEARLY = 'yearly',
}

export enum BiHubReportStatus {
  ONGOING = 'ongoing',
  CLOSED = 'closed',
}

export enum BiHubReportStatusActive {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export enum BiHubReportRegularType {
  AUTO = 'auto',
  MANUAL = 'manual',
}

export enum BiHubTagType {
  ADHOC = 'adhoc',
  REGULAR = 'regular',
}

export enum BiHubTagStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export enum BiHubRatingStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export enum BiHubReportCommentStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}
