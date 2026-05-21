import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { TransformFileModel } from './transform-file-link.helper';
import { TransformFileRequest, TransformFileResolver, TransformFileResult } from './transform-file.types';

const UNSUPPORTED_TRANSFORM_MODEL_ERROR = {
  error: {
    name: 'ValidationError',
    message: 'E003',
    code: 'E003',
    details: {
      status: 400,
      error_message: 'code',
    },
  },
};

@Injectable()
export class TransformFileService {
  constructor(
    @Inject('TRANSFORM_FILE_RESOLVERS')
    private readonly resolvers: TransformFileResolver[],
  ) {}

  async transform(request: TransformFileRequest): Promise<TransformFileResult> {
    if (!request.id || !request.model) throw new BadRequestException('Invalid transform request');

    const model = request.model as TransformFileModel;
    const resolver = this.resolvers.find((item) => item.supports(model));
    if (!resolver) throw new BadRequestException(UNSUPPORTED_TRANSFORM_MODEL_ERROR);

    await resolver.authorize(request);
    return resolver.transform(request);
  }
}
