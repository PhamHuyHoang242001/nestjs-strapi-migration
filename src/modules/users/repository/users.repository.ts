import { BaseRepository } from '@common/repository/base-repository';
import { NOT_FOUND } from '@constant/error-messages';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Brackets, DataSource, UpdateResult } from 'typeorm';
import { Users } from '../../databases/user.entity';
import { USER_STATUS } from '@common/enums';
import { SearchingUserDto } from '../dto';
import { UpdateMyProfileDto } from '../dto/user-profile.dto';
import { DayJS } from '@common/utils/dayjs';
import { ORDER_STATUS } from '@constant/orders';

@Injectable()
export class UserRepository extends BaseRepository<Users> {
  constructor(private dataSource: DataSource) {
    super(Users, dataSource);
  }
  async checkUserValid(condition: Object): Promise<Users | undefined> {
    const user = await this.findOneByCondition({ ...condition });
    if (!user) throw new NotFoundException(NOT_FOUND);
    return user;
  }

  async findAll(query: SearchingUserDto) {
    const { keyword, from_date, to_date, country, state, sort, page, limit } = query;
    const userQuery = this.createQueryBuilder('user')
      .leftJoinAndSelect('user.orders', 'orders', 'orders.status = :orderStatus', {
        orderStatus: ORDER_STATUS.COMPLETED,
      })
      .where('user.status IN (:...uStatus)', { uStatus: [USER_STATUS.ACTIVE, USER_STATUS.INACTIVE] });

    if (keyword) {
      userQuery.andWhere(
        new Brackets((q) => {
          q.orWhere(`(LOWER(CONCAT(user.first_name, ' ', user.last_name)) LIKE :keyword)`, {
            keyword: `%${keyword.toLowerCase()}%`,
          })
            .orWhere(`(LOWER(CONCAT(user.phone_code, user.phone)) LIKE :keyword)`, {
              keyword: `%${keyword.toLowerCase()}%`,
            })
            .orWhere(`(LOWER(user.email) LIKE :keyword)`, { keyword: `%${keyword.toLowerCase()}%` });
        }),
      );
    }

    if (country) {
      userQuery.andWhere('user.country = :uCountry', { uCountry: country });
    }

    if (state) {
      userQuery.andWhere('user.state = :uState', { uState: state });
    }

    if (from_date) {
      userQuery.andWhere('user.created_at >= :uFromDate', { uFromDate: new Date(from_date) });
    }

    if (to_date) {
      userQuery.andWhere('user.created_at <= :uToDate', { uToDate: new Date(to_date) });
    }

    if (sort) {
      userQuery.orderBy({ ...sort });
    }

    this.selectFields(userQuery);

    const [entities, itemCount] = await Promise.all([
      userQuery
        .groupBy('user.id')
        .offset((page - 1) * limit)
        .limit(limit)
        .getRawMany(),
      userQuery.groupBy('user.id').getCount(),
    ]);
    return {
      itemCount,
      entities,
    };
  }

  async findOneById(user_id: number) {
    const userQuery = this.createQueryBuilder('user')
      .leftJoinAndSelect('user.orders', 'orders', 'orders.status = :orderStatus', {
        orderStatus: ORDER_STATUS.COMPLETED,
      })
      .where('user.id = :id', { id: user_id });
    this.selectFields(userQuery);

    return userQuery.groupBy('user.id').getRawOne();
  }

  selectFields(query: any) {
    return query
      .select('user.id as id')
      .addSelect('user.first_name as first_name')
      .addSelect('user.last_name as last_name')
      .addSelect(`CONCAT(user.first_name, ' ', user.last_name) as fullname`)
      .addSelect('user.phone as phone')
      .addSelect('user.phone_code as phone_code')
      .addSelect('user.email as email')
      .addSelect('user.gender as gender')
      .addSelect('user.date_of_birth as date_of_birth')
      .addSelect('user.country as country')
      .addSelect('user.state as state')
      .addSelect('user.status as status')
      .addSelect('user.created_at as created_at')
      .addSelect('COUNT(ud) as total_device')
      .addSelect('COUNT(orders.total_quantity) as total_order_quantity')
      .addSelect('COALESCE(SUM(orders.total_amount), 0) as total_order_amount');
  }

  updateUserProfile(userId: number, data: UpdateMyProfileDto): Promise<UpdateResult> {
    return this.createQueryBuilder()
      .update('users')
      .set(data)
      .where(`id = :userId`, { userId })
      .returning('*')
      .execute();
  }

  deleteMyAccount(userId: number, deleteReason: string): Promise<UpdateResult> {
    return this.createQueryBuilder()
      .update('users')
      .set({ status: USER_STATUS.DELETED, delete_reason: deleteReason, deleted_at: DayJS.utc().toDate() })
      .where(`id = :userId`, { userId })
      .execute();
  }
}
