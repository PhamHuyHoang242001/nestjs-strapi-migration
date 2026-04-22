import { TrimSpace } from '@common/decorators/transforms.decorator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';
import { REGEX_PRE_BEAR } from '@constant/validation';

export class LogoutDto {
  @ApiProperty({ description: 'token', required: true })
  @IsString()
  @IsNotEmpty()
  @TrimSpace()
  @Transform((u) =>
    u.value ? (u.value as string).replace(new RegExp(REGEX_PRE_BEAR, 'gm'), '') : (u.value as string | undefined),
  )
  access_token: string;
}
