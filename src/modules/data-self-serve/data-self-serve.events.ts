export const DATA_SELF_SERVE_EVENTS = {
  VALIDATE_FILE_INPUT: 'data-self-serve.validate-file-input',
  PUSH_PAYLOAD_TO_DPC: 'data-self-serve.push-payload-to-dpc',
  PUSH_FILE_INPUT_TO_S3: 'data-self-serve.push-file-input-to-s3',
  COMPLETED_REQUEST: 'data-self-serve.completed-request',
} as const;

export interface DataSelfServeEventPayload {
  user: Record<string, unknown>;
  requestId: number;
  requestGroup?: string;
  requestCode?: string;
  requestStatus?: string;
  fileUrl?: string;
  fileSize?: string;
  destinationPath?: string;
  reason?: string;
}
