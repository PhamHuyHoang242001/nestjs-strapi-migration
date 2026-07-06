/**
 * Fixed permission codes attached to every role produced/synced by the group-role sync API.
 * Edit this list to change which permissions the synced roles receive.
 * Codes not present in the permissions table are skipped and reported (never fail the sync).
 */
export const GROUP_ROLE_PERMISSION_CODES: string[] = [
  'bh_report_view',
  // TODO: add the real permission codes here
];

/**
 * email_user in the source table is a bare id (e.g. HOANGPH12).
 * Real user is resolved by: lower(email_user) + this domain.
 */
export const GROUP_ROLE_EMAIL_DOMAIN = '@vpbank.com.vn';
