import { PartialType } from '@nestjs/swagger';
import { CreateBiccDepartmentDto } from './create-bicc-department.dto';

export class UpdateBiccDepartmentDto extends PartialType(CreateBiccDepartmentDto) {}
