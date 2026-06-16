import { RequestInfo } from '@common/types/request-with-info';
import type { DataScope } from '@common/authorization/types/data-scope.types';
import { TransformFileModel } from './transform-file-link.helper';

export interface TransformFileRequest {
  id: number;
  model?: string;
  reportCode?: string;
  info: RequestInfo;
  dataScope?: DataScope | null;
}

export interface TransformFileResult {
  url: string;
  type?: string | null;
}

export interface TransformFileResolver {
  supports(model: TransformFileModel): boolean;
  authorize(request: TransformFileRequest): Promise<void>;
  transform(request: TransformFileRequest): Promise<TransformFileResult>;
}
