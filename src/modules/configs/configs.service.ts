import { standardizePagination } from '@common/utils';
import { Config } from '@modules/databases/config.entity';
import { User } from '@modules/databases/user.entity';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { CONFIG_SORT_MAP, CreateConfigDto, ListConfigDto, UpdateConfigDto } from './dto/config.dto';

/** Minimal author projection returned alongside configs. */
const USER_FIELDS: (keyof User)[] = ['id', 'username', 'email', 'first_name', 'last_name'];

type ConfigValue = Config['value'];

@Injectable()
export class ConfigsService {
  constructor(
    @InjectRepository(Config) private readonly configRepo: Repository<Config>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  async list(query: ListConfigDto) {
    const page = Number(query.page || 1);
    const limit = Math.min(Number(query.limit || 10), 100);
    const qb = this.configRepo.createQueryBuilder('c');

    const keyword = query.keyword?.trim();
    if (keyword) {
      // value is jsonb; cast to text so partial search works on any JSON shape
      qb.andWhere('(c.key ILIKE :keyword OR c.value::text ILIKE :keyword)', { keyword: `%${keyword}%` });
    }

    const sortCol = CONFIG_SORT_MAP[query.sortField || 'id'] || 'id';
    const sortDir = String(query.sortValue).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`c.${sortCol}`, sortDir)
      .addOrderBy('c.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [rows, total] = await qb.getManyAndCount();
    const users = await this.resolveUsers(rows);
    return {
      data: rows.map((row) => this.withAuthors(row, users)),
      meta: standardizePagination(total, rows.length, limit, page),
    };
  }

  async findOne(id: number) {
    const config = await this.configRepo.findOne({ where: { id } });
    if (!config) throw new NotFoundException('Config not found');
    const users = await this.resolveUsers([config]);
    return { data: this.withAuthors(config, users) };
  }

  async create(dto: CreateConfigDto, userId?: number) {
    const key = dto.key.trim();
    await this.assertKeyAvailable(key);
    const saved = await this.configRepo.save(
      this.configRepo.create({
        key,
        value: dto.value as ConfigValue,
        created_by_user_id: userId,
        updated_by_user_id: userId,
      }),
    );
    return this.findOne(saved.id);
  }

  async update(id: number, dto: UpdateConfigDto, userId?: number) {
    const config = await this.configRepo.findOne({ where: { id } });
    if (!config) throw new NotFoundException('Config not found');

    if (dto.key !== undefined) {
      const key = dto.key.trim();
      await this.assertKeyAvailable(key, id);
      config.key = key;
    }
    if (dto.value !== undefined) config.value = dto.value as ConfigValue;
    config.updated_by_user_id = userId;

    await this.configRepo.save(config);
    return this.findOne(id);
  }

  async remove(id: number, userId?: number) {
    const config = await this.configRepo.findOne({ where: { id } });
    if (!config) throw new NotFoundException('Config not found');
    // Soft delete: flag + timestamp, matching the soft-delete convention used across modules
    await this.configRepo.update(id, { is_deleted: true, deleted_at: new Date(), updated_by_user_id: userId });
    return { data: { id, deleted: true } };
  }

  /** Unique key check scoped to non-deleted rows (soft-deleted keys are reusable). */
  private async assertKeyAvailable(key: string, excludeId?: number) {
    if (!key) throw new ConflictException('Config key cannot be empty');
    const existing = await this.configRepo.findOne({
      where: excludeId ? { key, id: Not(excludeId) } : { key },
    });
    if (existing) throw new ConflictException('A config with this key already exists');
  }

  private async resolveUsers(rows: Config[]) {
    const ids = [
      ...new Set(
        rows.flatMap((row) => [row.created_by_user_id, row.updated_by_user_id]).filter((id): id is number => !!id),
      ),
    ];
    if (!ids.length) return new Map<number, Partial<User>>();
    const users = await this.userRepo.find({ where: { id: In(ids) }, select: USER_FIELDS });
    return new Map(users.map((user) => [user.id, user]));
  }

  private withAuthors(config: Config, users: Map<number, Partial<User>>) {
    return {
      ...config,
      created_by_user: users.get(config.created_by_user_id) || null,
      updated_by_user: users.get(config.updated_by_user_id) || null,
    };
  }
}
