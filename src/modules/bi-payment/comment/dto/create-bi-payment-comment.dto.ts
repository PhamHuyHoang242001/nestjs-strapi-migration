import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

// Strapi parity (ICreateComment): value, programId, workStep, files, folderId.
export class CommentFileItemDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  id?: number;

  @ApiProperty({ required: true })
  @IsString()
  fileUrl: string;

  @ApiProperty({ required: false })
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

export class CreateBiPaymentCommentDto {
  @ApiProperty({ required: true })
  @IsString()
  @MaxLength(5000)
  value: string;

  @ApiProperty({ required: true })
  @IsInt()
  programId: number;

  @ApiProperty({ required: true, description: 'WorkStepBI: preparing/reconciliation/...' })
  @IsString()
  workStep: string;

  @ApiProperty({ required: true, type: [CommentFileItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CommentFileItemDto)
  files: CommentFileItemDto[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  folderId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  version?: number;
}
