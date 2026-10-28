import { ForbiddenException } from '@nestjs/common';
import { RequestWithInfo } from '@common/types/request-with-info';
import { DataHubCaller } from './data-hub-access.service';

// Caller of a Data Hub request as set by BearerGuard; 403 when there is no user.
export const dataHubCaller = (req: RequestWithInfo): DataHubCaller => {
  const user = req.info?.user as { id?: number; type?: string } | undefined;
  const id = Number(user?.id);
  if (!id) throw new ForbiddenException('User not authenticated');
  return { id, type: user?.type, client: req.info?.client };
};
