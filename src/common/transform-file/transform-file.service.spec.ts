import { BadRequestException } from '@nestjs/common';
import { TransformFileService } from './transform-file.service';

describe('TransformFileService', () => {
  it('returns structured validation error for unsupported transform model', async () => {
    const service = new TransformFileService([]);
    let thrownError: unknown;

    try {
      await service.transform({
        id: 1,
        model: 'unsupported_model',
        info: { user: { id: 1 }, client: 'user' },
      });
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toBeInstanceOf(BadRequestException);
    expect((thrownError as BadRequestException).getResponse()).toEqual({
      error: {
        name: 'ValidationError',
        message: 'E003',
        code: 'E003',
        details: {
          status: 400,
          error_message: 'code',
        },
      },
    });
  });
});
