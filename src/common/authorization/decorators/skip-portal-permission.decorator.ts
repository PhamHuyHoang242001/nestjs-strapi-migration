import { SetMetadata } from '@nestjs/common';
import { SKIP_PORTAL_PERMISSION_META_KEY } from '../constants/authorization.constant';

// Lets a BearerGuard route through for a user without the portal permission (e.g. logout, profile),
// so the web app can still sign them out and show a "no access" screen.
export const SkipPortalPermission = () => SetMetadata(SKIP_PORTAL_PERMISSION_META_KEY, true);
