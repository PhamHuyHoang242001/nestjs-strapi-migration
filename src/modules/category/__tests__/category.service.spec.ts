import { ConflictException, NotFoundException } from '@nestjs/common';
import { CategoryService } from '../category.service';
import { CategoryType } from '@modules/databases/category.entity';

describe('CategoryService', () => {
  const repo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const dataSource = { manager: {}, transaction: jest.fn() };
  let service: CategoryService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CategoryService(repo as never, dataSource as never);
  });

  it('lists only active categories for the requested type by default', async () => {
    repo.find.mockResolvedValue([]);

    await service.list(CategoryType.SKILL);

    expect(repo.find).toHaveBeenCalledWith({
      where: { type: CategoryType.SKILL, is_active: true },
      order: { name: 'ASC', id: 'ASC' },
    });
  });

  it('rejects missing or wrong-type active category IDs', async () => {
    const manager = { getRepository: () => ({ findOne: jest.fn().mockResolvedValue(null) }) } as never;

    await expect(service.validateActive(7, CategoryType.PROMPT, manager)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects duplicate normalized names during create', async () => {
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({ id: 1 }),
    };
    const managerRepo = { createQueryBuilder: () => queryBuilder, save: jest.fn() };
    const manager = { query: jest.fn(), getRepository: () => managerRepo };
    dataSource.transaction.mockImplementation(async (callback: (m: typeof manager) => unknown) => callback(manager));

    await expect(service.create({ name: '  Writing  ', type: CategoryType.PROMPT })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(manager.query).toHaveBeenCalled();
  });

  it('resolves IDs in one batched repository query', async () => {
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([{ id: 2, name: 'Ops', type: CategoryType.SKILL }]),
    };
    repo.createQueryBuilder.mockReturnValue(queryBuilder);

    const result = await service.resolve([2, 2, 3]);

    expect(queryBuilder.where).toHaveBeenCalledWith('c.id IN (:...ids)', { ids: [2, 3] });
    expect(result.get(2)?.name).toBe('Ops');
  });

  it('blocks deactivation while a version references the category', async () => {
    repo.findOne.mockResolvedValue({ id: 4, type: CategoryType.SKILL, is_active: true });
    const manager = {
      query: jest.fn().mockResolvedValue([{ in_use: true }]),
      getRepository: () => repo,
    };
    dataSource.transaction.mockImplementation(async (callback: (m: typeof manager) => unknown) => callback(manager));

    await expect(service.deactivate(4)).rejects.toBeInstanceOf(ConflictException);
  });
});
