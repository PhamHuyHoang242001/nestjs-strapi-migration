import { standardizePagination } from '@common/utils';
import { ConfigDataSelfServe } from '@modules/databases/config-data-self-serve.entity';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CreateConfigDataSelfServeDto,
  SearchConfigDataSelfServeDto,
  UpdateConfigDataSelfServeDto,
} from './dto/config-data-self-serve.dto';

@Injectable()
export class ConfigDataSelfServeService {
  constructor(
    @InjectRepository(ConfigDataSelfServe)
    private readonly configRepo: Repository<ConfigDataSelfServe>,
  ) {}

  async findAll(query: SearchConfigDataSelfServeDto) {
    const page = Number(query.page || 1);
    const limit = Math.min(Number(query.limit || 10), 100);

    const qb = this.configRepo.createQueryBuilder('config');

    if (query.keyword?.trim()) {
      qb.andWhere('config.key ILIKE :keyword', { keyword: `%${query.keyword.trim()}%` });
    }

    qb.orderBy('config.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [rows, total] = await qb.getManyAndCount();
    return { data: rows, meta: standardizePagination(total, rows.length, limit, page) };
  }

  async findOne(id: number) {
    const config = await this.configRepo.findOne({ where: { id } });
    if (!config) throw new NotFoundException('Config not found');
    return { data: config };
  }

  async create(dto: CreateConfigDataSelfServeDto, userId: number) {
    await this.assertKeyUnique(dto.key);
    try {
      const entity = this.configRepo.create({
        ...dto,
        created_by_user_id: userId,
        updated_by_user_id: userId,
      });
      const saved = await this.configRepo.save(entity);
      return { data: saved };
    } catch (error) {
      if (error?.code === '23505') throw new BadRequestException('Key already exists');
      throw error;
    }
  }

  async update(id: number, dto: UpdateConfigDataSelfServeDto, userId: number) {
    const config = await this.configRepo.findOne({ where: { id } });
    if (!config) throw new NotFoundException('Config not found');

    if (dto.key && dto.key !== config.key) {
      await this.assertKeyUnique(dto.key);
    }

    try {
      const merged = this.configRepo.merge(config, { ...dto, updated_by_user_id: userId });
      const saved = await this.configRepo.save(merged);
      return { data: saved };
    } catch (error) {
      if (error?.code === '23505') throw new BadRequestException('Key already exists');
      throw error;
    }
  }

  async remove(id: number) {
    const config = await this.configRepo.findOne({ where: { id } });
    if (!config) throw new NotFoundException('Config not found');
    await this.configRepo.remove(config);
    return { data: { id } };
  }

  private async assertKeyUnique(key: string) {
    const existing = await this.configRepo.findOne({ where: { key } });
    if (existing) throw new BadRequestException('Key already exists');
  }
}
