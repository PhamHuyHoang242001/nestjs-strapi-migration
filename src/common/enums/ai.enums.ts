// AI domain enums extracted from Strapi schemas

export enum AiModelType {
  AI_HUB = 'ai-hub',
  BI_HUB = 'bi-hub',
  ECOSYSTEM = 'ecosystem',
  DATA_HUB = 'data-hub',
  GOVERNANCE = 'governance',
  STRATEGY_INNOVATION = 'strategy-innovation',
}

export enum AiUsecaseStatus {
  DEVELOPMENT = 'development',
  PILOT = 'pilot',
  PRODUCTION = 'production',
}

export enum AiAppApiMethod {
  POST = 'POST',
  GET = 'GET',
}

export enum VocHistoryProduct {
  ALL = 'all',
  NEOAPP = 'neoapp',
  LOAN = 'loan',
  CARD = 'card',
  CREDITCARD = 'creditcard',
  OTHER = 'other',
}
