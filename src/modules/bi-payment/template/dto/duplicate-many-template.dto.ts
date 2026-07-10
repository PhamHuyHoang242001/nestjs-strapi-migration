import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsString, Min, ValidateNested } from 'class-validator';

// Strapi parity (IDuplicateManyTemplate): duplicate templates from one program
// to another, each with an explicit new name. Names validated unique within the
// batch and against existing active templates.
export class TemplateDuplicateItemDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  id: number;

  @ApiProperty()
  @IsString()
  name: string;
}

export class DuplicateManyTemplateDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  fromProgramId: number;

  @ApiProperty({ required: false })
  @IsInt()
  @Min(1)
  fromProjectId?: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  toProgramId: number;

  @ApiProperty({ type: [TemplateDuplicateItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateDuplicateItemDto)
  listTemplate: TemplateDuplicateItemDto[];
}
