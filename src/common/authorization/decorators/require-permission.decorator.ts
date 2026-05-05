import { SetMetadata } from '@nestjs/common';
import { PERMISSION_META_KEY } from '../constants/authorization.constant';

export const RequirePermission = (...codes: string[]) => SetMetadata(PERMISSION_META_KEY, codes);
