import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '@modules/databases/user.entity';

export interface DirectoryUser {
  id: number;
  email: string;
}

export interface DirectoryPage {
  data: DirectoryUser[];
  meta: { total: number; page: number; limit: number };
}

// Backs the person-in-charge picker. Deliberately projects only id + email: the picker needs a
// stable identifier and something human-readable, and nothing else about a user should travel to
// every caller who happens to hold an upload permission.
@Injectable()
export class AssetHubUserDirectoryService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async list(params: { page?: number; limit?: number; search?: string }): Promise<DirectoryPage> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;

    const qb = this.userRepo
      .createQueryBuilder('u')
      .select(['u.id', 'u.email'])
      .where('u.deleted_at IS NULL')
      .andWhere('COALESCE(u.is_deleted, false) = false')
      .andWhere('u.email IS NOT NULL');

    // Optional narrowing only — with no keyword the picker browses the full directory.
    // Bound as a parameter so the keyword can never reach the SQL text.
    const keyword = params.search?.trim();
    if (keyword) qb.andWhere('u.email ILIKE :search', { search: `%${keyword}%` });

    const [rows, total] = await qb
      .orderBy('u.email', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: rows.map((u) => ({ id: u.id, email: u.email })),
      meta: { total, page, limit },
    };
  }
}
