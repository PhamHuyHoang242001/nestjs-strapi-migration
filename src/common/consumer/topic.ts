export enum TopicName {
  NOTIFICATION = 'notification',
  DATA_PROCESSOR = 'data_processor',
  DATA_VALIDATOR = 'data_validator',
}

export enum EventKey {
  PUSH_PAYLOAD_TO_DPC = 'push_payload_to_dpc',
  EXECUTE_VALIDATE_FILE_INPUT_DATA_SELF_SERVE = 'execute_validate_file_input_self_serve',
  PUSH_FILE_INPUT_TO_S3 = 'push_file_input_to_s3',
  COMPLETED_DATA_SELF_SERVE_REQUEST = 'completed_data_self_serve_request',
}

export enum EventName {
  EXECUTE_VALIDATE_FILE_INPUT_DATA_SELF_SERVE = 'execute_validate_file_input_self_serve',
  PUSH_PAYLOAD_TO_DPC = 'push_payload_to_dpc',
  PUSH_FILE_INPUT_TO_S3 = 'push_file_input_to_s3',
  COMPLETED_DATA_SELF_SERVE_REQUEST = 'completed_data_self_serve_request',
}
