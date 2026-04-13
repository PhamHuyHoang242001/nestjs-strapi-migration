import { camelCaseToSnakeCase, i18nMsg, setDefaulSort, snakeCaseToCamelCase, success } from '@common/utils/index';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  data: T;
  statusCode: number;
  logout?: boolean;
  message?: string;
  timestamp?: number;
  meta?: {};
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Response<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // Observable<Response<T>>
    const req = context.switchToHttp().getRequest();


    return next.handle().pipe(
      map((payload) => {
        return payload;
      }),
    );
  }
}
