import { ApiProperty, IntersectionType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { AssetHubTagKind } from '@modules/databases/asset-hub-tag.entity';
import { ApiPackageStatus } from '@modules/databases/api-catalog-package.entity';
import { MAX_RESPONSIBLE_USERS, MAX_VERSION_COWORKERS } from '@modules/asset-hub-catalog/asset-hub-item-meta.service';
import { ApiSpecFieldsDto } from './api-spec-fields.dto';

// Codes the web UI generates for manually created packages. A sync code may not use this prefix,
// so a third party can never overwrite a package that was created by hand.
export const MANUAL_PACKAGE_CODE_PREFIX = 'api_catalog_';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimEach = ({ value }: { value: unknown }) =>
  Array.isArray(value) ? value.map((v: unknown) => (typeof v === 'string' ? v.trim() : v)) : value;
const lowerTrim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);
const lowerTrimEach = ({ value }: { value: unknown }) =>
  Array.isArray(value) ? value.map((v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : v)) : value;

/**
 * One API sent by the third-party sync job. `code` decides create vs update; every relation is
 * referenced by a human-readable key (name / email / code) instead of an internal id. Usage guide
 * and avatar are not part of the sync: owners add them on the web before submitting the draft.
 */
class SyncApiCatalogItemBaseDto {
  @ApiProperty({
    description: 'Mã định danh do bên đồng bộ quản lý. Chưa có → tạo mới, đã có → cập nhật.',
    example: 'core_bank_transfer',
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, { message: 'code may only contain letters, digits, ".", "_" and "-"' })
  @Matches(/^(?!api_catalog_)/i, { message: `code must not start with "${MANUAL_PACKAGE_CODE_PREFIX}" (reserved)` })
  readonly code: string;

  @ApiProperty({
    enum: ApiPackageStatus,
    required: false,
    description: 'Bỏ trống: tạo mới = active, cập nhật = giữ nguyên',
  })
  @IsOptional()
  @IsEnum(ApiPackageStatus)
  readonly status?: ApiPackageStatus;

  @ApiProperty({ maxLength: 200 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  readonly name: string;

  @ApiProperty({ maxLength: 1000 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  readonly short_description: string;

  @ApiProperty({ enum: AssetHubTagKind })
  @IsEnum(AssetHubTagKind)
  readonly kind: AssetHubTagKind;

  @ApiProperty({ description: 'Tên danh mục (type api-catalog, đang active). Không phân biệt hoa thường.' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  readonly category_name: string;

  @ApiProperty({ description: 'Tên khối chủ quản. Không phân biệt hoa thường.' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  readonly publisher_name: string;

  @ApiProperty({
    required: false,
    maxLength: 500,
    description: 'Trung tâm/phòng ban chủ quản (freetext). Bỏ trống = xoá.',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  readonly owning_unit_name?: string;

  @ApiProperty({
    maxLength: 255,
    description: 'Email người tạo API (user đang hoạt động). Người tạo sửa / submit / bật tắt được API trên web.',
  })
  @Transform(lowerTrim)
  @IsEmail()
  @MaxLength(255)
  readonly creator_email: string;

  @ApiProperty({ type: [String], description: 'Email người phụ trách (user đang hoạt động trên hệ thống).' })
  @Transform(lowerTrimEach)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_RESPONSIBLE_USERS)
  @ArrayUnique()
  @IsEmail({}, { each: true })
  readonly responsible_emails: string[];

  @ApiProperty({ type: [String], required: false, description: 'Mã coworker liên quan. Bỏ trống/[] = không có.' })
  @IsOptional()
  @Transform(trimEach)
  @IsArray()
  @ArrayMaxSize(MAX_VERSION_COWORKERS)
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  readonly coworker_codes?: string[];

  @ApiProperty({ required: false, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  readonly changelog_note?: string;
}

export class SyncApiCatalogItemDto extends IntersectionType(SyncApiCatalogItemBaseDto, ApiSpecFieldsDto) {}
