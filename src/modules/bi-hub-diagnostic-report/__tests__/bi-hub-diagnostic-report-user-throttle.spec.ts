import 'reflect-metadata';
import { THROTTLER_LIMIT, THROTTLER_TTL } from '@nestjs/throttler/dist/throttler.constants';
import { BiHubDiagnosticReportUserController } from '../bi-hub-diagnostic-report-user.controller';

// Guards the per-route rate limit on POST /bi-hub/diagnostic-report/view:
// 5 requests / minute, overriding the permissive global throttler.
describe('BiHubDiagnosticReportUserController throttle mapping', () => {
  const method = BiHubDiagnosticReportUserController.prototype.increaseView;
  const read = (key: string): unknown => Reflect.getMetadata(`${key}default`, method);

  it('increaseView limited to 5 requests per 60s', () => {
    expect(read(THROTTLER_LIMIT)).toBe(5);
    expect(read(THROTTLER_TTL)).toBe(60000);
  });
});
