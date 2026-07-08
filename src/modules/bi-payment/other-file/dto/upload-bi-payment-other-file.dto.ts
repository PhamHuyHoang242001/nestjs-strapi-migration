import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

// Strapi parity (IOtherFile + ICreateOtherFileByCheckListId): camelCase.
export class OtherFileItemDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  id?: number;

  @ApiProperty({ required: true, description: 'Uploaded file path/url' })
  @IsString()
  fileUrl: string;

  @ApiProperty({ required: false, description: 'File extension/type' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  fileSize?: string;
}

// Upload payload — batch other-files for one checklist.
export class UploadBiPaymentOtherFileDto {
  @ApiProperty({ required: true })
  @IsInt()
  checkListId: number;

  @ApiProperty({ required: true, type: [OtherFileItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OtherFileItemDto)
  files: OtherFileItemDto[];
}
