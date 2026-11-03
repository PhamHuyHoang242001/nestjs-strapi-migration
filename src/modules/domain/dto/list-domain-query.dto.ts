import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { DomainStatus, DomainType } from '@modules/databases/integration-domain-config.entity';

export class ListDomainQueryDto {
  @ApiProperty({ required: false, enum: DomainType })
  @IsOptional()
  @IsEnum(DomainType)
  readonly type?: DomainType;

  // Omitted = active only (what a picker offers).
  @ApiProperty({ required: false, enum: DomainStatus, default: DomainStatus.ACTIVE })
  @IsOptional()
  @IsEnum(DomainStatus)
  readonly status?: DomainStatus;
}
