import { BaseRepository } from '@common/repository/base-repository';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Media } from '@modules/databases/media.entity';

@Injectable()
export class MediaRepository extends BaseRepository<Media> {
    constructor(private dataSource: DataSource) {
        super(Media, dataSource);
    }

    async createMedia(payload: Partial<Media>): Promise<Media> {
        return this.createData(payload as any);
    }

    async findOneById(id: number) {
        return this.findOneByCondition({ id });
    }
}
