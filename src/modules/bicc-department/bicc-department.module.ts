import { BiHubBiccDepartment } from '@modules/databases/bi-hub-bicc-department.entity';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BiccDepartmentController } from './bicc-department.controller';
import { BiccDepartmentService } from './bicc-department.service';
import { AdminRepository } from '@modules/admins/repository/admin.repository';
import { UserRepository } from '@modules/users/repository/users.repository';

@Module({
  imports: [TypeOrmModule.forFeature([BiHubBiccDepartment])],
  controllers: [BiccDepartmentController],
  providers: [BiccDepartmentService, AdminRepository, UserRepository],
  exports: [BiccDepartmentService],
})
export class BiccDepartmentModule {}
