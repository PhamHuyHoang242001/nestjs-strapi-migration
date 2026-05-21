import { BadRequestException } from '@nestjs/common';
import { DataSelfServeScopeType, MANUAL_SCOPE_TYPES, UPLOAD_SCOPE_TYPES } from './dto/data-self-serve.dto';

export function assertManualScopeType(scopeType: DataSelfServeScopeType) {
  if (!MANUAL_SCOPE_TYPES.includes(scopeType)) throw new BadRequestException('Invalid scopeType');
}

export function assertUploadScopeType(scopeType: DataSelfServeScopeType) {
  if (!UPLOAD_SCOPE_TYPES.includes(scopeType)) throw new BadRequestException('Invalid scopeType');
}

export function buildScope(scopeType: DataSelfServeScopeType, scopeValue: string[]) {
  return {
    type: scopeType,
    client_no: scopeType === DataSelfServeScopeType.CLIENT_NO ? scopeValue : null,
    loan_no: scopeType === DataSelfServeScopeType.LOAN_NO ? scopeValue : null,
    book: scopeType === DataSelfServeScopeType.BOOK ? scopeValue : null,
    dao: scopeType === DataSelfServeScopeType.DAO ? scopeValue : null,
    segment: scopeType === DataSelfServeScopeType.SEGMENT ? scopeValue : null,
    industry: scopeType === DataSelfServeScopeType.INDUSTRY ? scopeValue : null,
  };
}

export function emptyUploadScope(scopeType: DataSelfServeScopeType) {
  return buildScope(scopeType, []);
}
