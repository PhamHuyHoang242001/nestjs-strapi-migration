import { Injectable } from '@nestjs/common';
import { SkillPackageQueryService } from './skill-package-query.service';
import { SkillFileFetchService } from './skill-file-fetch.util';
import { readZipTextEntry } from './skill-zip-preview.util';

@Injectable()
export class SkillZipPreviewService {
  constructor(
    private readonly queryService: SkillPackageQueryService,
    private readonly fileFetch: SkillFileFetchService,
  ) {}

  async preview(packageId: number, userId: number, file: string | undefined): Promise<{ path: string; content: string }> {
    const { fileUrl } = await this.queryService.resolveActiveZip(packageId, userId);
    const zip = await this.fileFetch.downloadZip(fileUrl);
    return readZipTextEntry(zip.buffer, file);
  }
}
