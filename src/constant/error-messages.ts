import { i18nMsg } from '@common/utils';

export function getMessage(key: string, params: {} = {}) {
  return i18nMsg(key, params);
}
export const STATUS_CODE_DEFAULT = 200;
export const USER_NOT_FOUND = 'user_not_found';

export const URL_NOT_FOUND = 'url_not_found';

export const PERMISSION_INVALID = 'permission_invalid';
export const DATA_INVALID = 'data_invalid';
export const USER_INFO_EXITED = 'user_info_existed';
export const DATA_EXISTED = 'data_existed';
export const PHONE_NUMBER_INVALID = 'phone_number_invalid';
export const REWARD_NOT_COVER_TX_FEE = 'reward_not_cover_tx_fee';
export const USER_WAS_EXISTED = 'user_was_existed';
export const OTP_INVALID_OR_EXPIRED = 'opt_invalid_or_expired';
export const OTP_VALID = 'opt_valid';
export const YOU_HAVE_JUST_SEND_OTP = 'You_have_just_send_otp';
export const YOU_NOT_YET_REGISTER = 'You_not_yet_register';
export const YOUR_USER_WAS_DELETED = 'your_account_was_deleted_wait_5_days';

export const USERNAME_EMAIL_INVALID = 'mail_username_invalid';
export const USERNAME_INVALID = 'username_invalid';
export const EMAIL_INVALID = 'mail_user_invalid';
export const ACCOUNT_NUMBER_INVALID = 'accountnumber_invalid';
export const DOCCUMENT_VALUE_INVALID = 'documentvalue_invalid';

export const SUCCESS = 'success';
export const PARAM_ERROR = 'param_error';
export const NOT_FOUND = 'data_not_found';
export const SYSTEM_ERROR = 'system_error';
export const AUTH_FAIL = 'auth_fail';
export const EXPIRED = 'expired';
export const TOKEN_EXPIRED = 'token_expired';
export const MODEL_AUTH_USERNAME_INVALID = 'username_invalid';
export const MODEL_AUTH_USER_LOCKED = 'account_locked_connect_admin';
export const MODEL_AUTH_PASSWORD_INVALID = 'auth_pass_invalid';
export const MODEL_AUTH_USERNAME_USED = 'username_used';
export const MODEL_AUTH_OLD_PASSWORD_INVALID = 'old_pass_invalid';
export const MODEL_AUTH_CONFIRM_PASSWORD_NOT_MATCH = 'confirm_password_not_match';
export const MODEL_AUTH_NEW_PASSWORD_NEED_DIFFIRENT_CURRENT_PASSWORD = 'new_password_need_diffirent_current_password';
export const MODEL_BIOMETRICT_ID_INVALID = 'biometrict_id_invalid';

export const USER_CANNOT_CHANGE_STATUS = 'user_cannot_change_status';
export const MODEL_USER_SHOP_NAME_INVALID = 'user_shopname_invalid';

export const MODEL_ROLE_NAME_EXISTS = 'role_name_exists';
export const MODEL_ROLE_USING_CAN_NOT_DELETE = 'role_using_cannot_delete';
export const MODEL_SCREEN_PARENT_INVAID = 'screen_parent_invalid';
export const MODEL_SCREEN_USING_CAN_NOT_DELETE = 'screen_using_cannot_delete';
export const MODEL_PERMISSION_PARENT_INVAID = 'permission_parent_invalid';
export const MODEL_PERMISSION_CODE_INVAID = 'permission_code_invalid';
export const MODEL_PERMISSION_USING_CAN_NOT_DELETE = 'permission_using_cannot_delete';

/**
 *IMPORT
 */
export const UNSUPPORT_FILE_TYPE = 'file_import_invalid';
export const IMPORT_FILE_ERROR_FORMAT = 'file_import_wrong_format';
export const COMMON_FILE_IMPORT_IS_EMPTY = 'file_import_is_empty';
export const IMPORT_REPORT = 'import_report';
export const IMPORT_LIMIT_MAX_ROW_UPLOAD_EXCEL = 'file_import_limit';
export const IMPORT_INDEX = 'import_index';

export const CONFIG_FILE_UPLOAD_SIZE_TOO_LARGE = 'file_upload_too_large';
export const CONFIG_FILE_UPLOAD_SIZE_TOO_SMALL = 'file_upload_too_small';
export const IMPORT_EXCEL_FILE_EMPTY = 'import_excel_file_empty';

export const MODEL_AUTH_ACCOUNT_NOT_EXISTS_OR_LOCKED = 'account_hash_not_match';
export const MODEL_AUTH_SEND_SMS_SUCCESS = 'send_sms_success';
export const MODEL_OTP_INVALID = 'opt_invalid';
export const MODEL_OTP_OF_PHONE_INVALID = 'opt_of_phone_invalid';
export const MODEL_AUTH_ACCOUNT_PENDING_REMOVAL = 'account_pending_remmoval';
export const INVALID_FILE_FORMAT = 'invalid_file_format';
export const YOU_MUST_BE_ADMIN = 'you_must_be_admin';

export const PROPERTY_MUST_NOT_EMPTY = 'property_must_not_empty';
export const USER_WAS_DELETED = 'user_was_deleted';
export const TAX_CODE_INVALID = 'taxcode_invalid';

export const STATUS_USER_INVALID = 'status_user_invalid';
export const STATUS_INVALID = 'status_invalid';
export const USER_STATUS_INVALID = 'user_status_forbbiden';
export const ROLE_OF_USER_INVALID = 'role_of_user_invalid';
export const YOU_MUST_SEND_REASON = 'you_must_send_reason';
export const YOU_MUST_BE_NORMAL_USER = 'you_must_be_normal_user';
export const PHONE_WAS_EXISTED = 'phone_was_existed';
export const EMAIL_WAS_EXISTED = 'email_was_existed';
export const YOU_DO_NOT_MANAGE_THIS_USER = 'you_do_not_manage_this_user';
export const THIS_USER_WAS_ASSIGNED_FOR_THIS_PROVINCE = 'this_user_was_assigned_for_this_province';
export const MISSING_START_TIME_AND_END_TIME = 'missing_start_time_and_end_time';
export const START_TIME_MUST_BE_LESS_THAN_END_TIME = 'start_time_must_be_less_than_end_time';
export const START_TIME_MUST_BE_MORE_THAN_NOW = 'start_time_must_be_more_than_now';
export const APPLY_DATES_MUST_NOT_EMPTY = 'apply_dates_must_not_empty';
export const PROPERTY_INVALID = 'property_in_valid';
export const PROPERTY_NOT_FOUND = 'property_not_found';
export const PROPERTY_WAS_EXISTED = 'property_was_existed';
export const PROGRAMMING_WAS_FINISHED_CONFIG = 'programming_was_finished_config';
export const MISSING_PROPERTY = 'missing_proper_type';
export const PROPERTY_NOT_IN = 'property_not_in';

export const YOU_MUST_BE_OWNER_OF_PROPERTY = 'you_must_be_owner_of_property';
export const USER_HAS_NOT_PERMISSION = 'you_has_not_permission';
export const PRODUCT_WAS_ACTIVATED_OR_ACCUMULATED = 'product_was_activated_or_accumulated';
export const YOU_ACTIVATED_THIS_PROPERTY = 'you_activated_this_property';
export const YOU_ACCUMULATED_THIS_PROPERTY = 'you_accumulated_this_property';
export const PROGRAMMING_ACCUMULATION_AND_DISPLAY_ONLY_SUPPORT_USER =
  'programming_accumulation_and_display_only_support_user';
export const PACKAGE_CONFIG_MUST_MATCH_WITH_CONDITION_CONFIG = 'package_config_must_match_with_condition_config';
export const PRODUCT_CONFIG_MUST_MATCH_WITH_CONDITION_CONFIG = 'product_config_must_match_with_condition_config';
export const INDUSTRY_SECTOR_OF_PRODUCT_DIFF_INDUSTRY_SECTOR_OF_ACTIVATION =
  'industry_sector_of_product_diff_industry_sector_of_activation';

export const PROPERTY_MUST_UNIQUE = 'property_must_unique';

export const THROTTLE_MESSAGE = 'Too many request!';

export const INVALID_DATA = 'Invalid data!';

export const PRODUCT_SOLD_OUT_QUANTITY_ERROR = 'Quantity must be greater than sold quantity.';

export const SHIPPING_FEDX_ERROR_MESSAGE = 'Failed to get FedEx shipping rates.';
export const SHIPPING_USPS_ERROR_MESSAGE = 'Failed to get USPS shipping rates.';
export const CREATE_SHIPMENT_ERROR_MESSAGE = 'Failed to create shipment.';
export const UPDATE_SHIPMENT_ERROR_MESSAGE = 'Failed to update shipment.';
export const VERIFY_FEDEX_ADDRESS_ERROR = 'Failed to verify FedEx shipping address.';
export const VERIFY_USPS_ADDRESS_ERROR = 'Failed to verify USPS shipping address.';
export const GET_USPS_SHIPPING_EVENTS_ERROR = 'Failed to get USPS shipping events.';

export const NO_PROPER_PACKAGE_FOUND = 'No proper package found.';
export const INVALID_PICKUP_TIME_ERROR = 'Invalid pick-up time.';

export const DEVICE_NOT_FOUND = 'Device not found.';