import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  MaxLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

// IT hỗ trợ of a data service: free contact info, stored as JSON on the version.
export interface ItSupport {
  email: string | null;
  phone: string | null;
  link: string | null;
}

const listParts = (value: string): string[] =>
  value
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);

// `a ; b;;` -> `a; b`; blank -> undefined so @IsOptional skips it.
const toList = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const joined = listParts(value).join('; ');
  return joined === '' ? undefined : joined;
};

const toTrimmed = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const v = value.trim();
  return v === '' ? undefined : v;
};

@ValidatorConstraint({ name: 'itSupportEmails' })
class EachEmailHasAt implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && listParts(value).every((e) => e.includes('@'));
  }

  defaultMessage(): string {
    return 'it_support.email: every email (separated by ;) must contain @';
  }
}

// At least 7 digits; markup characters are rejected. Extensions such as "(Ext: 8841)" are allowed.
@ValidatorConstraint({ name: 'itSupportPhones' })
class EachPhoneValid implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return (
      typeof value === 'string' &&
      listParts(value).every((p) => p.replace(/\D/g, '').length >= 7 && !/[<>{}[\]=]/.test(p))
    );
  }

  defaultMessage(): string {
    return 'it_support.phone: every phone (separated by ;) must have at least 7 digits';
  }
}

// Group links allowed for IT support, as on the AI Hub coworker channels.
const IT_SUPPORT_LINK_ORIGINS = ['https://teams.microsoft.com', 'https://zalo.me'];

// One absolute URL whose parsed origin equals an allowed one. Comparing origins (not raw prefixes) rejects
// look-alikes such as "https://teams.microsoft.com.evil.vn" and "https://teams.microsoft.com@evil.vn".
@ValidatorConstraint({ name: 'itSupportLink' })
class SingleLink implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || /[\s;,]/.test(value)) return false;
    try {
      const url = new URL(value);
      return !url.username && !url.password && IT_SUPPORT_LINK_ORIGINS.includes(url.origin);
    } catch {
      return false;
    }
  }

  defaultMessage(): string {
    return `it_support.link: must be one link starting with ${IT_SUPPORT_LINK_ORIGINS.join(' or ')}`;
  }
}

export class DataServiceItSupportDto {
  @ApiProperty({ required: false, example: 'hunglt41@vpbank.com.vn; dpis_support@vpbank.com.vn' })
  @Transform(toList)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Validate(EachEmailHasAt)
  readonly email?: string;

  @ApiProperty({ required: false, example: '024.3928.8888 (Ext: 8841); 0901.234.567' })
  @Transform(toList)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Validate(EachPhoneValid)
  readonly phone?: string;

  @ApiProperty({ required: false, example: 'https://teams.microsoft.com/l/chat/0/0?users=hunglt41@vpbank.com.vn' })
  @Transform(toTrimmed)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Validate(SingleLink)
  readonly link?: string;
}

// The parent field needs at least one way to reach IT support.
@ValidatorConstraint({ name: 'hasItSupportContact' })
export class HasItSupportContact implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false;
    const v = value as Partial<ItSupport>;
    return Boolean(v.email || v.phone || v.link);
  }

  defaultMessage(): string {
    return 'it_support: at least one of email, phone or link is required';
  }
}

// Stored shape: every key present, null when not given, so two versions compare key by key.
export const toItSupport = (dto: Partial<ItSupport> | null | undefined): ItSupport | null =>
  dto ? { email: dto.email || null, phone: dto.phone || null, link: dto.link || null } : null;
