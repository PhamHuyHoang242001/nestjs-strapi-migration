import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { DataServiceWriteAction } from '../../common/data-hub-access.service';

// create → departments where the caller may create data services; update → may edit them.
export class WritableDepartmentsQueryDto {
  @ApiProperty({ enum: ['create', 'update'] })
  @IsIn(['create', 'update'])
  readonly action: DataServiceWriteAction;
}
