import { ArgumentsHost } from '@nestjs/common';
import { TransformFileAuthRedirectException } from './transform-file-auth-redirect.exception';
import { TransformFileAuthRedirectFilter } from './transform-file-auth-redirect.filter';

describe('TransformFileAuthRedirectFilter', () => {
  it('issues a 302 redirect to the exception URL', () => {
    const redirect = jest.fn();
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ redirect }) }),
    } as unknown as ArgumentsHost;
    const filter = new TransformFileAuthRedirectFilter();
    const url = 'http://localhost:3000/login?url=https%3A%2F%2Fapi.example.com%2Fapi%2Fmedia%2Ftransform-file%2F5';

    filter.catch(new TransformFileAuthRedirectException(url), host);

    expect(redirect).toHaveBeenCalledWith(302, url);
  });
});
