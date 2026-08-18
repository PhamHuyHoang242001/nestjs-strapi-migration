import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Category, CategoryType } from '@modules/databases/category.entity';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

const normalized = (name: string) => name.trim().replace(/\s+/g, ' ');

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(Category) private readonly repo: Repository<Category>,
    private readonly dataSource: DataSource,
  ) {}

  list(type: CategoryType, includeInactive = false) {
    return this.repo.find({
      where: includeInactive ? { type } : { type, is_active: true },
      order: { name: 'ASC', id: 'ASC' },
    });
  }

  async create(dto: CreateCategoryDto) {
    const name = normalized(dto.name);
    if (!name) throw new ConflictException('Category name cannot be empty');
    return this.dataSource.transaction(async (manager) => {
      // Advisory transaction lock makes the application-level duplicate check deterministic
      // without introducing the prohibited secondary/unique category index.
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`category:${dto.type}:${name.toLowerCase()}`]);
      const existing = await manager
        .getRepository(Category)
        .createQueryBuilder('c')
        .where('c.type = :type AND lower(trim(c.name)) = lower(:name)', { type: dto.type, name })
        .getOne();
      if (existing) throw new ConflictException('A category with this name already exists');
      return manager.getRepository(Category).save({ name, type: dto.type, is_active: true });
    });
  }

  async update(id: number, dto: UpdateCategoryDto) {
    const category = await this.repo.findOne({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');
    if (dto.name !== undefined) {
      const name = normalized(dto.name);
      if (!name) throw new ConflictException('Category name cannot be empty');
      category.name = name;
    }
    if (dto.is_active !== undefined) category.is_active = dto.is_active;
    return this.repo.save(category);
  }

  async deactivate(id: number) {
    return this.update(id, { is_active: false });
  }

  async validateActive(id: number, type: CategoryType, manager = this.dataSource.manager): Promise<Category> {
    const category = await manager.getRepository(Category).findOne({ where: { id, type, is_active: true } });
    if (!category) throw new NotFoundException('Active category not found for this asset type');
    return category;
  }

  async resolve(ids: number[]) {
    if (!ids.length) return new Map<number, Category>();
    const rows = await this.repo
      .createQueryBuilder('c')
      .where('c.id IN (:...ids)', { ids: [...new Set(ids)] })
      .getMany();
    return new Map(rows.map((row) => [row.id, row]));
  }
}
