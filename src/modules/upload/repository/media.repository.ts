import { BaseRepository } from '@common/repository/base-repository';
import { Media } from '@modules/databases/media.entity';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class MediaRepository extends BaseRepository<Media> {
  constructor(private dataSource: DataSource) {
    super(Media, dataSource);
  }
}
