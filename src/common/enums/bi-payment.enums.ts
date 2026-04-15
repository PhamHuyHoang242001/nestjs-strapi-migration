// BI Payment domain enums extracted from Strapi schemas

export enum BiPaymentCalculatingStatus {
  NO_REVIEW = 'no_review',
  IN_REVIEW = 'in_review',
  APPROVED = 'approved',
}

export enum BiPaymentWorkstepCurrent {
  CREATE_A_PROGRAM = 'create_a_program',
  PREPARING = 'preparing',
  CALCULATING = 'calculating',
  RECONCILIATION = 'reconciliation',
  EXCEPTION = 'exception',
  WAITING_FOR_APPROVAL = 'waiting_for_approval',
  RELEASE = 'release',
}

export enum BiPaymentProgramStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export enum BiPaymentProgressStatus {
  COMPLETED = 'completed',
  OVERDUE = 'overdue',
  INPROGRESS = 'inprogress',
  NOTSTARTED = 'notstarted',
}

export enum BiPaymentProgramType {
  REGULAR = 'regular',
  ADHOC = 'adhoc',
}

export enum BiPaymentProgramFrequency {
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  SEMI_ANNUAL = 'semi-annual',
}

export enum BiPaymentLogMergeFileStatus {
  COMPLETED = 'completed',
  FAILED = 'failed',
  PROCESSING = 'processing',
}

export enum BiPaymentLogMergeFileMode {
  CSV = 'csv',
  EXCEL = 'excel',
}

export enum BiPaymentChecklistType {
  DATA_INPUT = 'data_input',
  OTHER = 'other',
  ALL = 'all',
}

export enum BiPaymentChecklistStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export enum BiPaymentProjectStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}
