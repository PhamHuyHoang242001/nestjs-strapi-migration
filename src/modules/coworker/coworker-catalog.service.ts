import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CoworkerChannel } from '@modules/databases/coworker-channel.entity';
import { CoworkerModel } from '@modules/databases/coworker-model.entity';

@Injectable()
export class CoworkerCatalogService {
  constructor(
    @InjectRepository(CoworkerChannel)
    private readonly channelRepo: Repository<CoworkerChannel>,
    @InjectRepository(CoworkerModel)
    private readonly modelRepo: Repository<CoworkerModel>,
  ) {}

  async listChannels() {
    const rows = await this.channelRepo
      .createQueryBuilder('c')
      .select(['c.id', 'c.name'])
      .where('c.deleted_at IS NULL')
      .andWhere('c.is_deleted IS NOT TRUE')
      .orderBy('c.id', 'ASC')
      .getMany();
    return { data: rows.map((r) => ({ id: r.id, name: r.name })) };
  }

  async listModels() {
    const rows = await this.modelRepo
      .createQueryBuilder('m')
      .select(['m.id', 'm.name'])
      .where('m.deleted_at IS NULL')
      .andWhere('m.is_deleted IS NOT TRUE')
      .orderBy('m.id', 'ASC')
      .getMany();
    return { data: rows.map((r) => ({ id: r.id, name: r.name })) };
  }
}
