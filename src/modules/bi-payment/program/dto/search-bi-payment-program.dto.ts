import { BaseSearchDto } from '@common/dto/common.dto';
import { ApiProperty } from '@nestjs/swagger';
import { BiPaymentWorkstepCurrent } from '@common/enums/bi-payment.enums';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

// Strapi parity (IFindProgram): camelCase query keys. keyword/sortField/sortValue/page/limit
// inherited from BaseSearchDto (Strapi IBaseSearch parity).
// biccDepartmentId/projectId required trong Strapi, nhưng để GET linh hoạt thì optional ở DTO
// (service check required nếu cần). progressStatus là string (có thể comma-sep).
export class SearchBiPaymentProgramDto extends BaseSearchDto {
  @ApiProperty({ required: false, description: 'Lọc theo BICC department' })
  @IsOptional()
  @IsInt()
  readonly biccDepartmentId?: number;

  @ApiProperty({ required: false, description: 'Lọc theo project cha' })
  @IsOptional()
  @IsInt()
  readonly projectId?: number;

  @ApiProperty({ required: false, enum: BiPaymentWorkstepCurrent, description: 'Lọc theo bước hiện tại' })
  @IsOptional()
  @IsEnum(BiPaymentWorkstepCurrent)
  readonly workstepCurrent?: BiPaymentWorkstepCurrent;

  @ApiProperty({ required: false, description: 'Comma-separated progress status' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  readonly progressStatus?: string;

  @ApiProperty({ required: false, description: 'Comma-separated updated-by ids' })
  @IsOptional()
  @IsString()
  readonly updatedByIds?: string;

  @ApiProperty({ required: false, description: 'Comma-separated category ids' })
  @IsOptional()
  @IsString()
  readonly categoryIds?: string;

  @ApiProperty({ required: false, description: 'Filter upload file duration' })
  @IsOptional()
  @IsString()
  readonly isUploadFileDuration?: string;

  @ApiProperty({ required: false, description: 'Filter create template' })
  @IsOptional()
  @IsString()
  readonly isCreateTemplate?: string;

  @ApiProperty({ required: false, description: 'Permission upload document workstep type' })
  @IsOptional()
  @IsString()
  readonly permissionUploadDocument?: string;

  @ApiProperty({ required: false, description: 'Program version' })
  @IsOptional()
  @IsInt()
  readonly version?: number;
}
