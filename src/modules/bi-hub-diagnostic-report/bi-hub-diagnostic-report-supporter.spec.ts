import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateDiagnosticReportDto } from './dto/create-diagnostic-report.dto';
import { BiHubDiagnosticReportService } from './bi-hub-diagnostic-report.service';
import { BiHubDiagnosticReportPicService } from './bi-hub-diagnostic-report-pic.service';

// Supporter field: max-10 cap (validation) + read-side attach on findOne.
describe('diagnostic report supporters', () => {
  const baseDto = { name: 'r', icon: 'i', isSensitive: false, biccDepartment: 1, scopes: 's' };
  const makeIds = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

  const hasSupporterError = (errors: { property: string }[]) =>
    errors.some((e) => e.property === 'supporters');

  it('rejects more than 10 supporters', async () => {
    const dto = plainToInstance(CreateDiagnosticReportDto, { ...baseDto, supporters: makeIds(11) });
    expect(hasSupporterError(await validate(dto))).toBe(true);
  });

  it('accepts exactly 10 supporters', async () => {
    const dto = plainToInstance(CreateDiagnosticReportDto, { ...baseDto, supporters: makeIds(10) });
    expect(hasSupporterError(await validate(dto))).toBe(false);
  });

  it('accepts an omitted supporters field', async () => {
    const dto = plainToInstance(CreateDiagnosticReportDto, { ...baseDto });
    expect(hasSupporterError(await validate(dto))).toBe(false);
  });

  it('findOne attaches supporters (and pics) from the pic service', async () => {
    const REPORT_ID = 7;
    const reportQb: any = {
      leftJoinAndSelect: jest.fn(() => reportQb),
      where: jest.fn(() => reportQb),
      andWhere: jest.fn(() => reportQb),
      getOne: jest.fn().mockResolvedValue({ id: REPORT_ID, name: 'Report', bi_hub_diagnostic_files: [] }),
    };
    const reportRepo = { createQueryBuilder: jest.fn(() => reportQb) };
    const permissionCache = {
      getPermissions: jest.fn().mockResolvedValue(new Set<string>()),
      getAccessibleRecords: jest.fn().mockResolvedValue([]),
    };
    const ownerScope = {
      getUserImpliedVerbs: jest.fn().mockResolvedValue(new Set<string>()),
      isInOwnedScope: jest.fn().mockResolvedValue(false),
    };
    const supporters = [{ id: 3, email: 'sup@x.com' }];
    const picService = {
      getPicsByReportIds: jest.fn().mockResolvedValue(new Map([[REPORT_ID, [{ id: 1, email: 'pic@x.com' }]]])),
      getSupportersByReportIds: jest.fn().mockResolvedValue(new Map([[REPORT_ID, supporters]])),
    };

    const service = new BiHubDiagnosticReportService(
      reportRepo as any,
      {} as any,
      {} as any,
      permissionCache as any,
      ownerScope as any,
      picService as any,
    );

    // scope=null → admin bypass; auth=null → flags default false.
    const res: any = await service.findOne(REPORT_ID, null, null);
    expect(res.supporters).toEqual(supporters);
    expect(res.pics).toEqual([{ id: 1, email: 'pic@x.com' }]);
    expect(picService.getSupportersByReportIds).toHaveBeenCalledWith([REPORT_ID]);
  });

  it('findSupporterUsersByDepartment queries the supporters link table with pagination', async () => {
    const users = [{ id: 5, email: 'a@x.com' }];
    const query = jest.fn().mockResolvedValueOnce(users).mockResolvedValueOnce([{ count: '1' }]);
    const svc = new BiHubDiagnosticReportPicService({ query } as any);

    const res = await svc.findSupporterUsersByDepartment({ biccDepartmentId: '3', page: '1', limit: '10' } as any);

    expect(res.data).toEqual(users);
    expect(res.meta.totalItems).toBe(1);
    // Reads from the supporters link table (not the pics table), scoped by department id.
    const listSql = query.mock.calls[0][0] as string;
    expect(listSql).toContain('bi_hub_diagnostic_report_supporters');
    expect(listSql).not.toContain('bi_hub_diagnostic_report_pics');
    expect(query.mock.calls[0][1]).toEqual([3, 10, 0]);
  });
});
