import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { Response } from 'express';
import { TransformFileAuthRedirectException } from './transform-file-auth-redirect.exception';

/**
 * Issues a 302 redirect to the login page when the transform-file guard cannot
 * authenticate a browser request. Scoped to TransformFileController via
 * `@UseFilters`, so global error handling is unaffected.
 */
@Catch(TransformFileAuthRedirectException)
export class TransformFileAuthRedirectFilter implements ExceptionFilter {
  catch(exception: TransformFileAuthRedirectException, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    res.redirect(302, exception.url);
  }
}
