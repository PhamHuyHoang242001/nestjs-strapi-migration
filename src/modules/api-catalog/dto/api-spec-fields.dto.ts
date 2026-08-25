import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiCallMode, ApiHttpMethod, ApiInputFormat } from '@modules/databases/api-catalog-version.entity';

export class ApiSpecFieldsDto {
  @ApiProperty({ enum: ApiHttpMethod })
  @IsEnum(ApiHttpMethod)
  readonly http_method: ApiHttpMethod;

  @ApiProperty({ description: 'Full endpoint path' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  readonly endpoint_path: string;

  @ApiProperty({ enum: ApiInputFormat })
  @IsEnum(ApiInputFormat)
  readonly input_format: ApiInputFormat;

  @ApiProperty({ enum: ApiCallMode, default: ApiCallMode.SYNC })
  @IsEnum(ApiCallMode)
  readonly call_mode: ApiCallMode = ApiCallMode.SYNC;

  @ApiProperty({
    required: false,
    maxLength: 200,
    description: 'Required when call_mode is sync. Omit when async.',
    example: '30s',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  readonly sync_timeout?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  readonly sla?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  readonly tps?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  readonly latency_p95?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  readonly throughput?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  readonly max_payload?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  readonly rate_limit?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  readonly encryption?: string;

  @ApiProperty({
    required: true,
    description:
      'Request JSON: đúng một key trùng call_mode (sync hoặc async). body/query: object. upload_file: { fields, files[] }, mỗi file.url bắt buộc.',
    example: {
      sync: {
        account_id: '123',
        amount: 10000,
      },
    },
    examples: {
      body: {
        summary: 'JSON body',
        value: { sync: { account_id: '123', amount: 10000 } },
      },
      query: {
        summary: 'Query params',
        value: { sync: { q: 'vietcombank', page: 1 } },
      },
      upload_file: {
        summary: 'File upload sample (url only stored)',
        value: {
          sync: {
            fields: { note: 'sao ke T6' },
            files: [
              {
                field: 'file',
                filename: 'statement-sample.pdf',
                mime: 'application/pdf',
                url: 'https://your-strapi.example/uploads/statement-sample.pdf',
              },
            ],
          },
        },
      },
    },
  })
  @IsObject()
  readonly mock_req: Record<string, unknown>;

  @ApiProperty({
    required: true,
    description: 'Sample response: đúng một key trùng call_mode. Value phải là object.',
    example: { sync: { ok: true } },
  })
  @IsObject()
  readonly mock_res: Record<string, unknown>;
}
