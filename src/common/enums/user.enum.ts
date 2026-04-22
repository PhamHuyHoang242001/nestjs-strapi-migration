export enum USER_STATUS {
  ACTIVE = 'active', // hoạt động
  INACTIVE = 'inactive', // khóa
  VERIFY_CODE = 'verified',
  ANONYMOUS = 'anonymous',
  DELETED = 'deleted',
}

export enum DELTETE_ACCOUNT_REASON {
  NOT_USEFUL = `I don't find the app useful.`,
  MISUNDERSTAND = `I don't understand how it works.`,
  CONCERNS = ` I have safety and privacy conerns.`,
  OTHERS = `Others (Please list your reasons below)`,
}
