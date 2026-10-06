import { BadRequestException, NotFoundException } from '@nestjs/common';
import AdmZip = require('adm-zip');
import { SkillZipPreviewService } from '../skill-zip-preview.service';

function zipOf(files: Record<string, string | Buffer>): Buffer {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(files)) {
    zip.addFile(name, Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8'));
  }
  return zip.toBuffer();
}

describe('SkillZipPreviewService', () => {
  const query = { resolveActiveZip: jest.fn() };
  const files = { downloadZip: jest.fn() };
  let service: SkillZipPreviewService;

  beforeEach(() => {
    jest.clearAllMocks();
    query.resolveActiveZip.mockResolvedValue({ fileUrl: '/uploads/a.zip', name: 'S', versionNo: 1 });
    service = new SkillZipPreviewService(query as any, files as any);
  });

  it('resolves active zip then returns the named text entry', async () => {
    files.downloadZip.mockResolvedValue({
      buffer: zipOf({ 'README.md': '# hi\n', 'skill.md': 'md' }),
    });
    const res = await service.preview(7, 99, '  README.md  ');
    expect(query.resolveActiveZip).toHaveBeenCalledWith(7, 99);
    expect(files.downloadZip).toHaveBeenCalledWith('/uploads/a.zip');
    expect(res).toEqual({ path: 'README.md', content: '# hi\n' });
  });

  it('propagates resolveActiveZip 404 (same as download)', async () => {
    query.resolveActiveZip.mockRejectedValue(new NotFoundException('Skill package not found'));
    await expect(service.preview(7, 99, 'a.txt')).rejects.toBeInstanceOf(NotFoundException);
    expect(files.downloadZip).not.toHaveBeenCalled();
  });

  it('400 when the zip entry is binary', async () => {
    files.downloadZip.mockResolvedValue({
      buffer: zipOf({ 'README.md': Buffer.from([0x89, 0x50, 0x00]), 'skill.md': 'md' }),
    });
    await expect(service.preview(7, 99, 'README.md')).rejects.toBeInstanceOf(BadRequestException);
  });
});
