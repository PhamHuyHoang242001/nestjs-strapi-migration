// Permission codes of the Data Hub module (seeded by migration 2610261000-add-data-hub-permissions).
// Reads (list, detail, export, stats) need no code; every write needs the code of its module.
export const DH_PERMISSIONS = {
  CONSUMER_CREATE: 'dh_consumer_create',
  CONSUMER_UPDATE: 'dh_consumer_update',
  LOGICAL_TERM_CREATE: 'dh_logical_term_create',
  LOGICAL_TERM_UPDATE: 'dh_logical_term_update',
  // Data service writes also require membership of the service's department (Đơn vị phát hành). Source tables
  // and physical terms are written only through the data-service form, so they follow these two codes.
  DATA_SERVICE_CREATE: 'dh_data_service_create',
  DATA_SERVICE_UPDATE: 'dh_data_service_update',
  DEPARTMENT_VIEW: 'dh_department_view',
  DEPARTMENT_CREATE: 'dh_department_create',
  DEPARTMENT_UPDATE: 'dh_department_update',
  DEPARTMENT_DELETE: 'dh_department_delete',
} as const;

export type DataHubPermissionCode = (typeof DH_PERMISSIONS)[keyof typeof DH_PERMISSIONS];
