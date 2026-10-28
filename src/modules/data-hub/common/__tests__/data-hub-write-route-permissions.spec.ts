import { GUARDS_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { DataHubConsumerController } from '../../consumer/data-hub-consumer.controller';
import { DataHubDataServiceController } from '../../data-service/data-hub-data-service.controller';
import { DepartmentConfigController } from '../../department/department-config.controller';
import { LogicalTermController } from '../../dictionary/logical-term.controller';
import { PhysicalTermController } from '../../dictionary/physical-term.controller';
import { SourceTableController } from '../../dictionary/source-table.controller';
import { DH_PERMISSIONS as P } from '../data-hub-permission-codes';
import {
  DATA_HUB_PERMISSION_KEY,
  DATA_HUB_SUPER_ADMIN_KEY,
  DataHubPermissionGuard,
} from '../data-hub-permission.guard';

type Ctor = { prototype: Record<string, unknown>; name: string };

// Expected gate of every non-GET handler (and of the department-config reads). A new write route without an
// entry here fails this spec, so no write can ship open by accident.
const EXPECTED: Record<string, Record<string, string[] | 'super_admin'>> = {
  DataHubConsumerController: {
    create: [P.CONSUMER_CREATE],
    update: [P.CONSUMER_UPDATE],
    updateStatus: [P.CONSUMER_UPDATE],
  },
  LogicalTermController: {
    create: [P.LOGICAL_TERM_CREATE],
    update: [P.LOGICAL_TERM_UPDATE],
  },
  DataHubDataServiceController: {
    create: [P.DATA_SERVICE_CREATE],
    update: [P.DATA_SERVICE_UPDATE],
    setStatus: [P.DATA_SERVICE_UPDATE],
  },
  DepartmentConfigController: {
    list: [P.DEPARTMENT_VIEW],
    detail: [P.DEPARTMENT_VIEW],
    create: [P.DEPARTMENT_CREATE],
    update: [P.DEPARTMENT_UPDATE],
    remove: [P.DEPARTMENT_DELETE],
    candidates: [P.DEPARTMENT_UPDATE],
    addMembers: [P.DEPARTMENT_UPDATE],
    removeMember: [P.DEPARTMENT_UPDATE],
  },
};

const CONTROLLERS: Ctor[] = [
  DataHubConsumerController,
  LogicalTermController,
  DataHubDataServiceController,
  DepartmentConfigController,
] as never;

const handlers = (c: Ctor) =>
  Object.getOwnPropertyNames(c.prototype).filter(
    (n) => n !== 'constructor' && Reflect.getMetadata(METHOD_METADATA, c.prototype[n] as object) !== undefined,
  );

describe('Data Hub route permissions', () => {
  it.each(CONTROLLERS.map((c) => [c.name, c]))('%s: DataHubPermissionGuard is applied', (_n, c) => {
    const guards = (Reflect.getMetadata(GUARDS_METADATA, c) ?? []) as unknown[];
    const methodGuards = handlers(c).flatMap(
      (h) => (Reflect.getMetadata(GUARDS_METADATA, c.prototype[h] as object) ?? []) as unknown[],
    );
    expect([...guards, ...methodGuards]).toContain(DataHubPermissionGuard);
  });

  it.each(CONTROLLERS.map((c) => [c.name, c]))('%s: every write handler has its expected gate', (name, c) => {
    const expected = EXPECTED[name];
    for (const h of handlers(c)) {
      const fn = c.prototype[h] as object;
      const method = Reflect.getMetadata(METHOD_METADATA, fn) as RequestMethod;
      const codes = Reflect.getMetadata(DATA_HUB_PERMISSION_KEY, fn) as string[] | undefined;
      const superOnly = Reflect.getMetadata(DATA_HUB_SUPER_ADMIN_KEY, fn) as boolean | undefined;
      const gate = superOnly ? 'super_admin' : codes;
      if (method !== RequestMethod.GET || expected[h] !== undefined) {
        expect({ handler: h, gate }).toEqual({ handler: h, gate: expected[h] });
      } else {
        expect({ handler: h, gate }).toEqual({ handler: h, gate: undefined });
      }
    }
  });

  // Physical terms and source tables are written only through the data-service form.
  const READ_ONLY = [PhysicalTermController, SourceTableController] as unknown as Ctor[];
  it.each(READ_ONLY.map((c) => [c.name, c]))('%s exposes reads only', (_n, c) => {
    for (const h of handlers(c)) {
      const method = Reflect.getMetadata(METHOD_METADATA, c.prototype[h] as object) as RequestMethod;
      expect({ handler: h, method }).toEqual({ handler: h, method: RequestMethod.GET });
    }
  });
});
