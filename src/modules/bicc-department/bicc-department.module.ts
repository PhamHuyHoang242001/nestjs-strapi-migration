import { BiHubBiccDepartment } from '@modules/databases/bi-hub-bicc-department.entity';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BiccDepartmentController } from './bicc-department.controller';
import { BiccDepartmentService } from './bicc-department.service';

@Module({
  imports: [TypeOrmModule.forFeature([BiHubBiccDepartment])],
  controllers: [BiccDepartmentController],
  providers: [BiccDepartmentService],
  exports: [BiccDepartmentService],
})
export class BiccDepartmentModule {}
