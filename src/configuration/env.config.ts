import * as dotenv from 'dotenv';

dotenv.config();

// Single-line exports for environment variables with sensible defaults
export const NODE_ENV: string = process.env.NODE_ENV ?? 'development';
export const PORT: number = Number(process.env.PORT ?? '3002');

// Database
export const DB_HOST: string = process.env.DB_HOST ?? 'localhost';
export const DB_PORT: number = Number(process.env.DB_PORT ?? '5432');
export const DB_USERNAME: string = process.env.DB_USERNAME ?? 'db_user';
export const DB_PASSWORD: string = process.env.DB_PASSWORD ?? '';
export const DB_NAME: string = process.env.DB_NAME ?? 'db_name';
// Whether TypeORM should auto-sync entity schema on boot. Must stay off against a populated
// schema: sync drops/recreates constraints and can fail or mutate data on every startup.
export const DB_SYNCHRONIZE: boolean = (process.env.DB_SYNCHRONIZE ?? 'false').toLowerCase() === 'true';

// Redis
export const REDIS_HOST: string = process.env.REDIS_HOST ?? '127.0.0.1';
export const REDIS_PORT: number = Number(process.env.REDIS_PORT ?? '6379');

// Service
export const ENCRYPT_KEY: string = process.env.ENCRYPT_KEY ?? '12345';
// Secret used to sign service tokens (name-compatible with the Strapi backend).
export const ADMIN_JWT_SECRET: string = process.env.ADMIN_JWT_SECRET ?? process.env.ENCRYPT_KEY ?? '12345';
export const ENABLE_CRONJOB: string = process.env.ENABLE_CRONJOB ?? 'enable';
export const BASE_URL: string = process.env.BASE_URL ?? 'api';
export const SWAGGER_BASE_URL: string = process.env.SWAGGER_BASE_URL ?? process.env.DOCS_BASE_URL ?? 'api/docs';
export const APP_VERSION: string = process.env.APP_VERSION ?? process.env.API_VERSION ?? '1.0';
export const BACKEND_URL: string = process.env.BACKEND_URL ?? process.env.BACKEND_BASE_URL ?? '';
export const FRONTEND_BASE_URL: string = process.env.FRONTEND_BASE_URL ?? 'http://localhost:3000';
// Public-facing origin (scheme + host + any gateway path prefix, e.g. `/v2`) used to
// rebuild absolute return URLs. Behind an ingress the pod sees the internal host,
// plain http, and a stripped path prefix, so request runtime values cannot be trusted.
export const PUBLIC_BASE_URL: string = process.env.PUBLIC_BASE_URL ?? FRONTEND_BASE_URL;

// Allowed browser origins for CORS. Comma-separated list in env; reflected back per-request
// so credentialed requests work (the `*` wildcard is invalid when credentials are enabled).
export const CORS_ORIGINS: string[] = (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:3001')
  .split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

// Logger
export const LOGGER_LEVEL: string = process.env.LOGGER_LEVEL ?? 'debug';
export const LOGGER_MODE: string = process.env.LOGGER_MODE ?? process.env.AUTO_LOGGING ?? 'true';

// AWS / CDN
export const AWS_ACCESS_KEY_ID: string = process.env.AWS_ACCESS_KEY_ID ?? '';
export const AWS_SECRET_ACCESS_KEY: string = process.env.AWS_SECRET_ACCESS_KEY ?? '';
export const AWS_REGION: string = process.env.AWS_REGION ?? 'ap-southeast-1';
export const AWS_BUCKET: string = process.env.AWS_BUCKET ?? '';
export const AWS_API_VERSION: string = process.env.AWS_API_VERSION ?? '';
export const AWS_PATH: string = process.env.AWS_PATH ?? '';
export const ENABLE_UPLOAD_EXCEL: string = process.env.ENABLE_UPLOAD_EXCEL ?? 'disable';
export const LINK_STATIC: string =
  AWS_BUCKET && AWS_REGION ? `https://${AWS_BUCKET}.s3.${AWS_REGION}.amazonaws.com/` : '';
export const LINK_CDN: string =
  process.env.LINK_CDN ?? (process.env.CDN_BASE_URL ? `${process.env.CDN_BASE_URL}/` : '');

// SMS
export const SMS_ENDPOINT: string = process.env.SMS_ENDPOINT ?? process.env.SMS_ENPOINT ?? '';
export const SMS_PARTNER_CODE: string = process.env.SMS_PARTNER_CODE ?? process.env.SMS_PARTNER_CODE ?? '';
export const SMS_SECRET_KEY: string = process.env.SMS_SECRET_KEY ?? '';
export const SMS_KEYWORD: string = process.env.SMS_KEYWORD ?? '';
export const SMS_BRANCH_NAME: string = process.env.SMS_BRANCH_NAME ?? '';
export const ENABLE_SMS: string = process.env.ENABLE_SMS ?? 'false';

// RabbitMQ
export const RABBITMQ_URI: string = process.env.RABBITMQ_URI ?? '';

// Firebase
export const FIREBASE_PROJECT_ID: string = process.env.FIREBASE_PROJECT_ID ?? '';
export const FIREBASE_PRIVATE_KEY: string = (process.env.FIREBASE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');
export const FIREBASE_CLIENT_EMAIL: string = process.env.FIREBASE_CLIENT_EMAIL ?? '';
export const FIREBASE_DATABASE_URL: string = process.env.FIREBASE_DATABASE_URL ?? '';
export const ENABLE_SEND_NOTIFICATION: string = process.env.ENABLE_SEND_NOTIFICATION ?? 'disable';

// Mail
export const MAIL_HOST: string = process.env.MAIL_HOST ?? '';
export const MAIL_USER: string = process.env.MAIL_USER ?? '';
export const MAIL_PASS: string = process.env.MAIL_PASS ?? '';
export const MAIL_PORT: number = Number(process.env.MAIL_PORT ?? '587');
export const ENABLE_SEND_MAIL: string = process.env.ENABLE_SEND_MAIL ?? 'disable';

// Country API
export const COUNTRY_API_KEY: string = process.env.COUNTRY_API_KEY ?? '';
export const COUNTRY_API_LIST: string = process.env.COUNTRY_API_LIST ?? '';
export const COUNTRY_API_DETAIL: string = process.env.COUNTRY_API_DETAIL ?? '';
export const COUNTRY_API_STATE_BY_COUNTRY: string = process.env.COUNTRY_API_STATE_BY_COUNTRY ?? '';
export const COUNTRY_API_STATE_DETAIL: string = process.env.COUNTRY_API_STATE_DETAIL ?? '';
export const COUNTRY_API_PUBLIC_LIST_COUNTRY: string = process.env.COUNTRY_API_PUBLIC_LIST_COUNTRY ?? '';
export const COUNTRY_API_CITIES_BY_STATE: string = process.env.COUNTRY_API_CITIES_BY_STATE ?? '';

// Google / OAuth
export const GOOGLE_WEB_CLIENT_ID: string = process.env.GOOGLE_WEB_CLIENT_ID ?? '';
export const GOOGLE_WEB_CLIENT_SECRET: string = process.env.GOOGLE_WEB_CLIENT_SECRET ?? '';
export const GOOGLE_ANDROID_CLIENT_ID: string = process.env.GOOGLE_ANDROID_CLIENT_ID ?? '';
export const GOOGLE_ANDROID_CLIENT_ID_PROD: string = process.env.GOOGLE_ANDROID_CLIENT_ID_PROD ?? '';
export const GOOGLE_PROJECT_ID: string = process.env.GOOGLE_PROJECT_ID ?? '';
export const GOOGLE_CERT_PATH: string = process.env.GOOGLE_CERT_PATH ?? '';
export const GOOGLE_STORAGE_BUCKET: string = process.env.GOOGLE_STORAGE_BUCKET ?? '';
export const GOOGLE_STORAGE_ENDPOINT: string = process.env.GOOGLE_STORAGE_ENDPOINT ?? 'https://storage.googleapis.com';

// Apple
export const APPLE_TEAM_ID: string = process.env.APPLE_TEAM_ID ?? '';
export const APPLE_CLIENT_ID: string = process.env.APPLE_CLIENT_ID ?? '';
export const APPLE_PRIVATE_KEY: string = process.env.APPLE_PRIVATE_KEY ?? '';
export const APPLE_KEY_IDENTIFIER: string = process.env.APPLE_KEY_IDENTIFIER ?? '';
export const APPLE_REDIRECT_URI: string = process.env.APPLE_REDIRECT_URI ?? '';

// Twitter
export const TWITTER_API_KEY: string = process.env.TWITTER_API_KEY ?? '';
export const TWITTER_API_SECRET_KEY: string = process.env.TWITTER_API_SECRET_KEY ?? '';
export const TWITTER_ACCESS_TOKEN: string = process.env.TWITTER_ACCESS_TOKEN ?? '';
export const TWITTER_ACCESS_TOKEN_SECRET: string = process.env.TWITTER_ACCESS_TOKEN_SECRET ?? '';
export const TWITTER_API_ENDPOINT: string = process.env.TWITTER_API_ENDPOINT ?? '';

// Redis
export const REDIS_URI: string = process.env.REDIS_URI;
export const REDIS_REPORT_EXPIRE_TIME: number = Number(process.env.REDIS_REPORT_EXPIRE_TIME);
export const REDIS_CACHE_PERMISSION_EXPIRE_TIME: number = Number(process.env.REDIS_CACHE_PERMISSION_EXPIRE_TIME);

// Kafka
export const KAFKA_CLIENT_ID: string = process.env.KAFKA_CLIENT_ID ?? process.env.APP_NAME ?? 'base-backend';
export const KAFKA_BROKERS: string = process.env.KAFKA_BROKERS ?? '';
export const KAFKA_SSL: boolean = process.env.KAFKA_SSL === 'true';
export const KAFKA_USERNAME: string = process.env.KAFKA_USERNAME ?? '';
export const KAFKA_PASSWORD: string = process.env.KAFKA_PASSWORD ?? '';
export const APP_IDENTIFIER: string = process.env.APP_IDENTIFIER ?? process.env.APP_NAME ?? 'base-backend';

// Facebook
export const FACEBOOK_APP_ID: string = process.env.FACEBOOK_APP_ID ?? '';
export const FACEBOOK_APP_SECRET: string = process.env.FACEBOOK_APP_SECRET ?? '';
export const FACEBOOK_GRAPH_API_ENDPOINT: string = process.env.FACEBOOK_GRAPH_API_ENDPOINT ?? '';

// Payments
export const STRIPE_SECRET_KEY: string = process.env.STRIPE_SECRET_KEY ?? '';
export const STRIPE_PUBLISH_KEY: string = process.env.STRIPE_PUBLISH_KEY ?? '';
export const BRAINTREE_ACCESS_TOKEN: string =
  process.env.PAYPAL_BRAINTREE_ACCESS_TOKEN ?? process.env.BRAINTREE_ACCESS_TOKEN ?? '';

// Shipment defaults
export const FANCHO_STREET_ADDRESS: string = process.env.FANCHO_STREET_ADDRESS ?? '';
export const FANCHO_CITY_ADDRESS: string = process.env.FANCHO_CITY_ADDRESS ?? '';
export const FANCHO_STATE_CODE: string = process.env.FANCHO_STATE_CODE ?? '';
export const FANCHO_STATE_NAME: string = process.env.FANCHO_STATE_NAME ?? '';
export const FANCHO_COUNTRY_CODE: string = process.env.FANCHO_COUNTRY_CODE ?? '';
export const FANCHO_COUNTRY_NAME: string = process.env.FANCHO_COUNTRY_NAME ?? '';
export const FANCHO_POSTAL_CODE: string = process.env.FANCHO_POSTAL_CODE ?? '';
export const FANCHO_PHONE_NUMBER: string = process.env.FANCHO_PHONE_NUMBER ?? '';

// FedEx
export const FEDEX_ACCOUNT_NUMBER: string = process.env.FEDEX_ACCOUNT_NUMBER ?? '';
export const FEDEX_CLIENT_ID: string = process.env.FEDEX_CLIENT_ID ?? '';
export const FEDEX_SECRET_KEY: string = process.env.FEDEX_SECRET_KEY ?? '';
export const FEDEX_API_ENDPOINT: string = process.env.FEDEX_API_ENDPOINT ?? '';
export const FEDEX_WEBHOOK_SECRET_TOKEN: string = process.env.FEDEX_WEBHOOK_SECRET_TOKEN ?? '';
export const FEDEX_TRACKING_BASE_URL: string = process.env.FEDEX_TRACKING_BASE_URL ?? '';

// USPS
export const USPS_CONSUMER_KEY: string = process.env.USPS_CONSUMER_KEY ?? '';
export const USPS_CONSUMER_SECRET: string = process.env.USPS_CONSUMER_SECRET ?? '';
export const USPS_API_ENDPOINT: string = process.env.USPS_API_ENDPOINT ?? '';
export const USPS_CRID: string = process.env.USPS_CRID ?? '';
export const USPS_MID: string = process.env.USPS_MID ?? '';
export const USPS_MANIFEST_MID: string = process.env.USPS_MANIFEST_MID ?? '';
export const USPS_ACCOUNT_TYPE: string = process.env.USPS_ACCOUNT_TYPE ?? '';
export const USPS_ACCOUNT_NUMBER: string = process.env.USPS_ACCOUNT_NUMBER ?? '';
export const USPS_TRACKING_BASE_URL: string = process.env.USPS_TRACKING_BASE_URL ?? '';

// TaxCloud
export const TAX_CLOUD_BASE_API: string =
  process.env.TAX_CLOUD_BASE_API ?? process.env.TAX_BASE_API ?? 'https://api.taxcloud.net/1.0/TaxCloud';
export const TAX_CLOUD_API_KEY: string = process.env.TAX_CLOUD_API_KEY ?? '';
export const TAX_CLOUD_API_LOGIN_ID: string = process.env.TAX_CLOUD_API_LOGIN_ID ?? '';
export const TAX_CLOUD_TIC: string = process.env.TAX_CLOUD_TIC ?? '';

// OIDC / SSO (optional)
export const OIDC_ISSUER: string = process.env.OIDC_ISSUER ?? '';
export const OIDC_CLIENT_ID: string = process.env.OIDC_CLIENT_ID ?? '';
export const OIDC_CLIENT_SECRET: string = process.env.OIDC_CLIENT_SECRET ?? '';
export const OIDC_REDIRECT_URI: string = process.env.OIDC_REDIRECT_URI ?? '';
export const OIDC_SCOPE: string = process.env.OIDC_SCOPE ?? 'openid profile email';
export const OIDC_AUTHORIZATION_ENDPOINT: string = process.env.OIDC_AUTHORIZATION_ENDPOINT ?? '';
export const OIDC_TOKEN_ENDPOINT: string = process.env.OIDC_TOKEN_ENDPOINT ?? '';
export const OIDC_USERINFO_ENDPOINT: string = process.env.OIDC_USERINFO_ENDPOINT ?? '';

// MA Tool Report Config
export const MA_REPORT_WHOLE_BANK_CODE: string = process.env.MA_REPORT_WHOLE_BANK_CODE ?? '';
export const MA_REPORT_HEAD_OFFICE_CODE: string = process.env.MA_REPORT_HEAD_OFFICE_CODE ?? '';
export const MA_REPORT_TEMPLATE_FOLDER: string = process.env.MA_REPORT_TEMPLATE_FOLDER ?? '';
export const MA_REQUEST_DOWNLOAD: string = process.env.MA_REQUEST_DOWNLOAD ?? '';
export const MA_OUTPUT_BUCKET: string = process.env.MA_OUTPUT_BUCKET ?? '';
export const AWS_ENDPOINT: string = process.env.AWS_ENDPOINT ?? '';
