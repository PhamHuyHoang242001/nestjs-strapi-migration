import { SortType } from '@common/enums';
import { NOT_FOUND } from '@constant/error-messages';
import { LIMIT_GET_ALL } from '@constant/index';
import { NotFoundException } from '@nestjs/common';
import { DataSource, FindOptionsWhere, In, Repository } from 'typeorm';
import { EntityTarget } from 'typeorm/common/EntityTarget';
import { ObjectLiteral } from 'typeorm/common/ObjectLiteral';

export class BaseRepository<T extends ObjectLiteral> extends Repository<T> {
  constructor(type: EntityTarget<T>, dataSource: DataSource) {
    super(type, dataSource.createEntityManager());
  }

  findOneByCondition(
    condition: Record<string, unknown> | Record<string, unknown>[],
    select?: string[],
  ): Promise<T | undefined> {
    return this.findOne({
      // @ts-expect-error - dynamic condition shape not fully typed
      where: condition,
      select: select as (keyof T)[],
    });
  }

  findOneByConditionSortCreatedAt(condition: Record<string, unknown>): Promise<T | undefined> {
    return this.findOne({
      // @ts-expect-error - dynamic condition shape not fully typed
      where: condition,
      // @ts-expect-error - order field not in generic constraint
      order: { created_at: SortType.DESC },
    });
  }

  findByCondition(
    condition: Record<string, unknown>,
    order?: { field: string; type: SortType },
    offset?: number,
    limit?: number,
  ): Promise<T[] | undefined> {
    const query: Record<string, unknown> = { where: condition };
    if (order) {
      query['order'] = { [order.field]: order.type };
    }
    if (offset) {
      query['offset'] = offset;
    }
    if (limit) {
      query['limit'] = limit;
    }
    return this.find(query as Parameters<typeof this.find>[0]);
  }

  findByConditionWithDeleted(
    condition: Record<string, unknown>,
    order?: { field: string; type: SortType },
    offset?: number,
    limit?: number,
  ): Promise<T[] | undefined> {
    const query: Record<string, unknown> = { where: condition };
    if (order) {
      query['order'] = { [order.field]: order.type };
    }
    if (offset) {
      query['offset'] = offset;
    }
    if (limit) {
      query['limit'] = limit;
    }
    query['withDeleted'] = true;
    return this.find(query as Parameters<typeof this.find>[0]);
  }

  findOneByConditionWithDeleted(condition: Record<string, unknown>): Promise<T | undefined> {
    return this.findOne({
      // @ts-expect-error - dynamic condition shape not fully typed
      where: condition,
      withDeleted: true,
      // @ts-expect-error - order field not in generic constraint
      order: { created_at: 'DESC' },
    });
  }

  findOneByConditionWithDeletedSortCreatedAt(condition: Record<string, unknown>): Promise<T | undefined> {
    return this.findOne({
      // @ts-expect-error - dynamic condition shape not fully typed
      where: condition,
      withDeleted: true,
      // @ts-expect-error - order field not in generic constraint
      order: { created_at: SortType.DESC },
    });
  }

  async updateOne(conditions: FindOptionsWhere<T>, data: Partial<T>): Promise<void> {
    await this.update(conditions, data);
  }

  async updateMany(conditions: FindOptionsWhere<T>, data: Partial<T>): Promise<void> {
    await this.update(conditions, data);
  }

  async findOneByIdValid(id: number | string): Promise<T | undefined> {
    const rs = await this.findOneByCondition({ id });
    if (!rs) throw new NotFoundException(NOT_FOUND);
    return rs;
  }

  /* eslint-disable @typescript-eslint/no-unused-vars */
  async findListByCondition(
    condition: FindOptionsWhere<T> | FindOptionsWhere<T>[],
    skip: number,
    take: number,
    order?: Record<string, unknown>,
    _select?: string[],
    _relations?: string[],
  ): Promise<Array<T | undefined>> {
    /* eslint-enable @typescript-eslint/no-unused-vars */
    return this.find({
      where: condition,
      skip,
      take,
      order: order as Parameters<typeof this.find>[0]['order'],
    });
  }

  createData(input: T): Promise<T> {
    return this.save(input);
  }

  async countByConditions(conditions: { key: string; value: Record<string, unknown> }[]) {
    const query = this.createQueryBuilder(this.metadata.tableName).select(['count(id) as c']);
    for (const condition of conditions) {
      query.andWhere(condition.key, condition.value);
    }
    const result = await query.getRawOne<{ c: number }>();
    if (!result) {
      return 0;
    }
    return result.c;
  }

  async countByConditionsWithDelete(conditions: { key: string; value: Record<string, unknown> }[]) {
    const query = this.createQueryBuilder(this.metadata.tableName).select(['count(id) as c']);
    for (const condition of conditions) {
      query.andWhere(condition.key, condition.value);
    }
    query.withDeleted();
    const result = await query.getRawOne<{ c: number }>();
    if (!result) {
      return 0;
    }
    return result.c;
  }

  async findListByIdsAndSelectField(input: number[], select?: string[], key: string = 'id') {
    let result: T[] = [];
    const limit = LIMIT_GET_ALL;
    let payload: number[] = [...input];
    payload = payload.filter((v, i) => payload.findIndex((u) => u === v) === i);

    while (true) {
      const rowQueue = payload.splice(0, limit);
      if (!rowQueue.length) break;
      const data = await this.find({
        where: { [key]: In(rowQueue) } as FindOptionsWhere<T>,
        select: select as (keyof T)[],
      });
      if (!data?.length) break;
      result = result.concat(data);
      if (data?.length < limit) break;
    }
    return result;
  }

  async findListByConditionAndSelectField(
    condition: FindOptionsWhere<T> | FindOptionsWhere<T>[],
    select?: string[],
  ): Promise<Array<T | undefined>> {
    return this.find({
      where: condition,
      select: select as (keyof T)[],
    });
  }
}
