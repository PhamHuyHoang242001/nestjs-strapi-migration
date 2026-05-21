import { DataSelfServeRequest } from '@modules/databases/data-self-serve-request.entity';

export const DATA_SELF_SERVE_SORT_MAP: Record<string, string> = {
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  code: 'code',
  requestStatus: 'request_status',
  requestGroup: 'request_group',
  inputMethod: 'input_method',
};

export function formatRequest(request: DataSelfServeRequest) {
  return {
    id: request.id,
    code: request.code,
    request_status: request.request_status,
    request_group: request.request_group,
    validation_status: request.validation_status,
    input_method: request.input_method,
    estimated_completion_hours: request.estimated_completion_hours,
    request_completed_at: request.request_completed_at,
    request_params: request.request_params,
    short_description: request.short_description,
    createdAt: request.created_at,
    updatedAt: request.updated_at,
  };
}

export function normalizeFileName(fileName: string) {
  return (fileName || 'downloaded-file').replace(/[^\w.\-]/g, '_');
}
