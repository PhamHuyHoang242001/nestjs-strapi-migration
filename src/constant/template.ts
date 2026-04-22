import { OTP_TYPE } from './otp';

export enum OTP_STATE {
  PENDING = 'pending',
  PROCESSING = 'processing',
  FAILED = 'failed',
  SUCCESS = 'success',
}
export enum NOTIFICATION_ID {
  ADMIN_UPDATE_USER_ACCOUNT = 'adminn_update_user_account',
  APPROVE_USER_ACCOUNT = 'approve_user_account',
  REJECT_USER_ACCOUNT = 'reject_user_account',

  USER_UP_RANK = 'user_up_rank',
  TECHNICIAN_UP_RANK = 'technician_up_rank',
  USER_DOWN_RANK = 'user_down_rank',
  TECHNICIAN_DOWN_RANK = 'technician_down_rank',

  PRE_USER_UP_RANK = 'pre_user_up_rank',
  PRE_TECHNICIAN_UP_RANK = 'pre_technician_up_rank',

  USER_RESET_RANK = 'user_reset_rank',
  TECHNICIAN_RESET_RANK = 'technician_reset_rank',

  SYSTEM_RESET_RANK = 'system_reset_rank',
}
export enum TEMPLATE_ID {
  ADMIN_RESET_PASSWORD = 'admin_reset_password',
  USER_FORGOT_PASSWORD = 'user_forgot_password',
  CREATE_NEW_USER = 'create_new_user',
  USER_DELETE_ACCOUNT = 'user_delete_account',
  VERFIFY_EMAIL = 'verify_email',
  ORDER_SUCCESSFULLY = 'order_successfully',
  CANCEL_ORDER = 'cancel_order',
  ORDER_ON_DELIVERY = 'order_on_delivery',
}

export enum TEMPLATE_LIMIT {
  USER_FORGOT_PASSWORD = 5,
  VERIFY_EMAIL = 6,
}

export enum SEND_MAIL_TEMPLATE {
  ACTIVE_TIME_LIMIT_SEND_MAIL = 30, // 30 minutes
  ACTIVE_TIME_CODE = 1, // 1 minutes
}

export enum RANK_CHANGE_STATUS {
  DOWN,
  UP,
  RESET,
}

export const OPT_TYPE = {
  [OTP_TYPE.REGISTER]: 1,
  [OTP_TYPE.RECOVER_PASSWORD]: 1,
  [OTP_TYPE.DELETE_ACCOUNT]: 1,
};

export const TEMPPLATE = {
  [OTP_TYPE.REGISTER]: {
    title: 'title',
    content: ` Ma OTP cua Quy Khach la {{value}} . Khong chia se cho nguoi khac tranh bi loi dung. Hotline: {{hotline}}`,
  },
  [OTP_TYPE.RECOVER_PASSWORD]: {
    title: 'title',
    content: ` Ma OTP cua Quy Khach la {{value}} . Khong chia se cho nguoi khac tranh bi loi dung. Hotline: {{hotline}}`,
  },
  [OTP_TYPE.CHANGE_PASSWORD]: {
    title: 'title',
    content: ` Ma OTP cua Quy Khach la {{value}} . Khong chia se cho nguoi khac tranh bi loi dung. Hotline: {{hotline}}`,
  },
  [OTP_TYPE.DELETE_ACCOUNT]: {
    title: 'title',
    content: ` Ma OTP cua Quy Khach la {{value}} . Khong chia se cho nguoi khac tranh bi loi dung. Hotline: {{hotline}}`,
  },
  [OTP_TYPE.RESET_PASSWORD]: {
    title: 'title',
    content: `title: Mat khau moi cua Quy khach la {{value}}`,
  },

  /**
   * ==================================================================================
   * ==================================================================================
   * ==================================================================================
   * mail mail mail
   */
  [TEMPLATE_ID.ADMIN_RESET_PASSWORD]: {
    title: 'RESET MẬT KHẨU TÀI KHOẢN CMS ',
    content: '',
    template: 'reset-password',
  },
  [TEMPLATE_ID.CREATE_NEW_USER]: {
    title: 'THÔNG TIN ĐĂNG NHẬP TÀI KHOẢN CMS ',
    content: '',
    template: 'create_new_user',
  },
  [TEMPLATE_ID.USER_DELETE_ACCOUNT]: {
    title: 'THƯ KHUYẾN NGHỊ',
    content: '',
    template: 'user_delete_account',
  },
  [TEMPLATE_ID.VERFIFY_EMAIL]: {
    title: 'Check OTP To Verify Email when signing up ',
    content: ``,
    template: 'verify_email',
  },
  [TEMPLATE_ID.USER_FORGOT_PASSWORD]: {
    title: 'Reset Your Password for TheFancho.com',
    content: ``,
    template: 'user_forgot_password',
  },
  [TEMPLATE_ID.ORDER_SUCCESSFULLY]: {
    title: 'Your Order Confirmation: Order Placed Successfully!',
    content: ``,
    template: 'order_successfully',
  },
  [TEMPLATE_ID.CANCEL_ORDER]: {
    title: 'Order Cancellation Notification',
    content: ``,
    template: 'cancel_order',
  },
  [TEMPLATE_ID.ORDER_ON_DELIVERY]: {
    title: 'Order Shipment Notification: Order is on the way to you',
    content: ``,
    template: 'order_on_delivery',
  },

  /**
   * ==================================================================================
   * ==================================================================================
   * ==================================================================================
   * notify
   */

  [NOTIFICATION_ID.ADMIN_UPDATE_USER_ACCOUNT]: {
    title: `Thông tin tài khoản được cập nhật.`,
    content: `Thông tin của bạn đã được cập nhật. Vui lòng kiểm tra tại mục Thông tin của tôi để biết thêm chi tiết.`,
  },

  [NOTIFICATION_ID.APPROVE_USER_ACCOUNT]: {
    title: `Duyệt yêu cầu cập nhật thông tin tài khoản`,
    content: `Yêu cầu cập nhật thông tin của Quý khách đã được phê duyệt thành công`,
  },

  [NOTIFICATION_ID.REJECT_USER_ACCOUNT]: {
    title: `Từ chối yêu cầu cập nhật thông tin tài khoản`,
    content: `Yêu cầu cập nhật thông tin của Quý khách đã bị từ chối. Lý do: {{reason}}.`,
  },
  [NOTIFICATION_ID.USER_UP_RANK]: {
    title: `Tài khoản thăng hạng`,
    content: `Chúc mừng tài khoản đã đạt hạng {{rank_name}} của ngành hàng {{industry_sector_name}}. `,
  },

  [NOTIFICATION_ID.TECHNICIAN_UP_RANK]: {
    title: `Tài khoản thăng hạng`,
    content: `Chúc mừng tài khoản đã đạt hạng {{rank_name}} của ngành hàng {{industry_sector_name}}. `,
  },

  [NOTIFICATION_ID.USER_DOWN_RANK]: {
    title: `Tài khoản xuống hạng`,
    content: `Hạng tài khoản hiện nay của bạn ở ngành hàng {{industry_sector_name}} là {{rank_name}}. `,
  },

  [NOTIFICATION_ID.TECHNICIAN_DOWN_RANK]: {
    title: `Tài khoản xuống hạng`,
    content: `Chúc mừng tài khoản đã đạt mức {{rank_name}} của ngành hàng {{industry_sector_name}}. `,
  },

  [NOTIFICATION_ID.PRE_USER_UP_RANK]: {
    title: `Tài khoản sắp thăng hạng`,
    content: `Chỉ còn {{value}} điểm để đạt được hạng {{rank_name}} của ngành hàng {{industry_sector_name}}. `,
  },

  [NOTIFICATION_ID.PRE_TECHNICIAN_UP_RANK]: {
    title: `Tài khoản sắp thăng hạng`,
    content: `Chỉ còn {{value}} điểm để đạt được hạng {{rank_name}} của ngành hàng {{industry_sector_name}}`,
  },

  [NOTIFICATION_ID.USER_RESET_RANK]: {
    title: `Tài khoản tụt hạng`,
    content: `Điểm của bạn ở ngành hàng {{industry_sector_name}} đã bị reset về 0 do không phát huy giao dịch tích luỹ trong 6 tháng. Hãy tiếp tục tích luỹ sản phẩm để hưởng nhiều ưu đãi hơn với Điện máy Hoà Phát.`,
  },

  [NOTIFICATION_ID.TECHNICIAN_RESET_RANK]: {
    title: `Tài khoản tụt hạng`,
    content: `Điểm của bạn ở ngành hàng {{industry_sector_name}} đã bị reset về 0 do không phát huy giao dịch kích hoạt bảo hành trong 6 tháng. `,
  },

  [NOTIFICATION_ID.SYSTEM_RESET_RANK]: {
    title: `Cập nhật hạng tài khoản`,
    content: `Hạng tài khoản của bạn hiện nay của bạn là {{rank_name}}
    `,
  },
};

export const CONTACT_SUPPORT = 'Company name';
export const CUSTOMER_SUPPORT_EMAIL = 'support@fancho.com';
export const CUSTOMER_SUPPORT_PHONE = '0123456789';

export const COMPANY_NAME = 'Company name';
export const HOT_LINE = 'hotline value';
export const REQUEST_TIMEOUT = 110 * 1000;
