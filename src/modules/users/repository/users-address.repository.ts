import { BaseRepository } from '@common/repository/base-repository';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserAddress } from '@modules/databases/user-address.entity';
import { SearchUserAddressDto } from '../dto/search-user-address.dto';

@Injectable()
export class UserAddressRepository extends BaseRepository<UserAddress> {
  constructor(private dataSource: DataSource) {
    super(UserAddress, dataSource);
  }

  async findAll(query: SearchUserAddressDto) {
    const { user_id, sort, page, limit } = query;
    const userAddressQuery = this.createQueryBuilder('user_address')
      .innerJoin('user_address.user', 'user', 'user.id = :user_id', { user_id })
      .where('user_address.is_save = :isSave', { isSave: true })
      .select('user_address.id as id')
      .addSelect('user_address.address_line_2 as address_line_2')
      .addSelect('user_address.province as province')

      .addSelect('user_address.created_at as created_at');

    if (sort) {
      userAddressQuery.orderBy({ ...sort });
    }
    userAddressQuery.groupBy('user_address.id');
    const [entities, itemCount] = await Promise.all([
      userAddressQuery
        .offset((page - 1) * limit)
        .limit(limit)
        .getRawMany(),
      userAddressQuery.getCount(),
    ]);
    return {
      entities,
      itemCount,
    };
  }
}
