import { isArchiveContentAllowed as realIsArchiveContentAllowed } from '@common/archive-scan';
import { RequestWithInfo } from '@common/types/request-with-info';
import { BadRequestException } from '@nestjs/common';
import { CustomUploadController } from '../custom-upload.controller';
import { CustomUploadService, UploadedDiskFile } from '../custom-upload.service';

jest.mock('@common/archive-scan', () => ({ isArchiveContentAllowed: jest.fn() }));

const isArchiveContentAllowed = realIsArchiveContentAllowed as jest.MockedFunction<typeof realIsArchiveContentAllowed>;

describe('CustomUploadController', () => {
  let controller: CustomUploadController;
  let service: jest.Mocked<Pick<CustomUploadService, 'moveAndCreateMedia' | 'cleanupTempFiles'>>;

  const file = (originalname: string): UploadedDiskFile => ({
    path: `/tmp/custom-upload/${originalname}.tmp`,
    originalname,
    mimetype: 'application/zip',
    size: 10,
  });

  const req = { info: { user: { id: 7 } } } as unknown as RequestWithInfo;

  beforeEach(() => {
    jest.clearAllMocks();
    service = {
      moveAndCreateMedia: jest.fn().mockResolvedValue([{ id: 1 }]),
      cleanupTempFiles: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<Pick<CustomUploadService, 'moveAndCreateMedia' | 'cleanupTempFiles'>>;
    controller = new CustomUploadController(service as unknown as CustomUploadService);
    isArchiveContentAllowed.mockResolvedValue(true);
  });

  it('rejects a request with no file', async () => {
    await expect(controller.customFileUpload([], req)).rejects.toThrow(BadRequestException);
    await expect(controller.customFileUpload([], req)).rejects.toThrow(/INVALID_DATA/);
    expect(service.moveAndCreateMedia).not.toHaveBeenCalled();
  });

  it('rejects when multer supplies undefined instead of an empty array', async () => {
    await expect(controller.customFileUpload(undefined as unknown as UploadedDiskFile[], req)).rejects.toThrow(
      /INVALID_DATA/,
    );
  });

  it('rejects an archive holding a disallowed entry', async () => {
    isArchiveContentAllowed.mockResolvedValue(false);

    await expect(controller.customFileUpload([file('bad.zip')], req)).rejects.toThrow(/FILE_NOT_ALLOWED/);
    expect(service.moveAndCreateMedia).not.toHaveBeenCalled();
  });

  it('deletes the temp file when the scan rejects it, so nothing lands in public/', async () => {
    isArchiveContentAllowed.mockResolvedValue(false);
    const rejected = file('bad.zip');

    await expect(controller.customFileUpload([rejected], req)).rejects.toThrow();

    expect(service.cleanupTempFiles).toHaveBeenCalledWith([rejected]);
  });

  it('stores the files once the scan passes', async () => {
    const files = [file('ok.zip'), file('a.pdf')];

    const result = await controller.customFileUpload(files, req);

    expect(isArchiveContentAllowed).toHaveBeenCalledWith(files);
    expect(service.moveAndCreateMedia).toHaveBeenCalledWith(files, req.info);
    expect(result).toEqual([{ id: 1 }]);
  });

  it('sweeps temp files even on the success path', async () => {
    const files = [file('ok.zip')];

    await controller.customFileUpload(files, req);

    expect(service.cleanupTempFiles).toHaveBeenCalledWith(files);
  });

  it('sweeps temp files when storing blows up mid-way', async () => {
    service.moveAndCreateMedia.mockRejectedValue(new Error('disk full'));
    const files = [file('ok.zip')];

    await expect(controller.customFileUpload(files, req)).rejects.toThrow('disk full');

    expect(service.cleanupTempFiles).toHaveBeenCalledWith(files);
  });

  it('returns a bare array so the frontend can read res[0].url', async () => {
    // EDA_FE/src/pages/aiHub/aiApp/groupApp/appDetail/views/appDetail.tsx:63 does
    // setUrlFile(res[0].url) — wrapping the payload in an object would break that call.
    service.moveAndCreateMedia.mockResolvedValue([{ url: '/uploads/a_0123456789.pdf' }] as never);

    const result = await controller.customFileUpload([file('a.pdf')], req);

    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toHaveProperty('url', '/uploads/a_0123456789.pdf');
  });

  it('tolerates a request with no info attached', async () => {
    await controller.customFileUpload([file('ok.zip')], {} as RequestWithInfo);

    expect(service.moveAndCreateMedia).toHaveBeenCalledWith(expect.anything(), {});
  });
});
