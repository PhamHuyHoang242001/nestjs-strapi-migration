import { RequestWithInfo } from '@common/types/request-with-info';
import { YOU_MUST_BE_ADMIN } from '@constant/error-messages';
import { RoleRepository } from '@modules/role/repository/role.repository';
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

/** Admin role codes allowed to mint service tokens (mirrors Strapi SUPER/SERVICE_ADMIN). */
export const SERVICE_TOKEN_ADMIN_ROLES = ['SUPER_ADMIN', 'SERVICE_ADMIN'];

/**
 * Restricts a route to admins whose role code is in {@link SERVICE_TOKEN_ADMIN_ROLES}.
 * Runs after BearerGuard + IsAdminGuard, which guarantee `req.info.user` is an admin record.
 */
@Injectable()
export class IsServiceAdminGuard implements CanActivate {
  constructor(private readonly roleRepository: RoleRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithInfo>();
    const roleId = req.info?.user?.['role_id'] as number | undefined;
    if (!roleId) throw new ForbiddenException(YOU_MUST_BE_ADMIN);

    const role = await this.roleRepository.findOneByCondition({ id: roleId }, ['id', 'code']);
    if (!role || !SERVICE_TOKEN_ADMIN_ROLES.includes(role.code)) {
      throw new ForbiddenException(YOU_MUST_BE_ADMIN);
    }
    return true;
  }
}
