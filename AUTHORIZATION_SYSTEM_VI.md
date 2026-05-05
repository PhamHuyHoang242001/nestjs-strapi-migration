# Hệ thống Permission & Data Access Authorization

Tài liệu này tóm tắt các phần đã thêm trong `src/common/authorization`, mục đích từng hàm/chức năng chính, cách dùng và ví dụ tích hợp vào controller/service.

## Tổng quan luồng xử lý

```text
Request
  -> BearerGuard xác thực JWT và set req.info.user, req.info.client
  -> PermissionGuard kiểm tra quyền theo @RequirePermission(...)
  -> DataAccessInterceptor lấy danh sách record id được phép truy cập theo @RequireDataAccess(...)
  -> Controller/Service xử lý business logic
```

Quy ước chính:

- Admin client (`req.info.client === 'admin'`) được bypass permission và data access.
- User phải có toàn bộ permission code được khai báo trong `@RequirePermission(...)`.
- Data access `deny` luôn thắng `allow`.
- Data access rule không gắn permission cụ thể sẽ áp dụng cho mọi permission.
- Cache Redis:
  - Permission codes: 300 giây.
  - Data access ids: 120 giây.

## File chính

| File                                                                   | Mục đích                                                            |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `src/common/authorization/authorization.module.ts`                     | Global module, khai báo Redis client, service, guard, interceptor   |
| `src/common/authorization/decorators/require-permission.decorator.ts`  | Decorator khai báo permission bắt buộc                              |
| `src/common/authorization/decorators/require-data-access.decorator.ts` | Decorator khai báo bảng và permission dùng để lọc data access       |
| `src/common/authorization/guards/permission.guard.ts`                  | Guard kiểm tra user có đủ permission không                          |
| `src/common/authorization/interceptors/data-access.interceptor.ts`     | Interceptor lấy danh sách `accessibleDataIds` và gắn vào `req.info` |
| `src/common/authorization/services/permission-query.service.ts`        | Query DB bằng raw SQL để lấy permission/data access                 |
| `src/common/authorization/services/permission-cache.service.ts`        | Bọc query service bằng Redis cache và các hàm invalidate            |
| `src/common/authorization/helpers/data-access-scope.helper.ts`         | Helper lọc TypeORM QueryBuilder bằng `accessibleDataIds`            |
| `src/migration/2605050944-add-authorization-indexes.ts`                | Migration thêm index phục vụ query authorization                    |

## Decorators

### `@RequirePermission(...codes)`

Mục đích: khai báo endpoint yêu cầu user có đủ các permission code.

Logic:

- Không có decorator: `PermissionGuard` cho qua.
- Có nhiều code: user phải có tất cả.
- Thiếu bất kỳ code nào: trả `403 Forbidden`.

Ví dụ:

```ts
@Get()
@RequirePermission('report_view')
listReports() {
  return this.reportService.list();
}

@Put(':id')
@RequirePermission('report_view', 'report_edit')
updateReport() {
  return this.reportService.update();
}
```

### `@RequireDataAccess(tableName, permissionCode?)`

Mục đích: khai báo endpoint cần lọc dữ liệu theo bảng và permission code.

Kết quả: `DataAccessInterceptor` sẽ set:

```ts
req.info.accessibleDataIds = [1, 2, 3];
```

Ý nghĩa:

- `undefined`: endpoint không dùng data access, service không cần lọc.
- `[]`: user không có quyền với record nào, service phải trả rỗng.
- `[1, 2, 3]`: chỉ cho phép các record có `id` nằm trong danh sách.

Ví dụ:

```ts
@Get()
@RequirePermission('report_view')
@RequireDataAccess('bi_hub_reports', 'report_view')
list(@Req() req: RequestWithInfo) {
  return this.reportService.findAll(req.info.accessibleDataIds);
}
```

## Guard và Interceptor

### `PermissionGuard.canActivate(context)`

Mục đích: đọc metadata từ `@RequirePermission(...)` và kiểm tra permission của user.

Cách dùng: đặt sau `BearerGuard` trong `@UseGuards`.

```ts
@Controller('v1/reports')
@UseGuards(BearerGuard, PermissionGuard)
export class ReportController {}
```

Nếu `BearerGuard` chưa chạy trước, `req.info.user` có thể chưa có, guard sẽ trả `403`.

### `DataAccessInterceptor.intercept(context, next)`

Mục đích: đọc metadata từ `@RequireDataAccess(...)`, lấy danh sách record id user được phép truy cập, rồi gắn vào request.

Cách dùng:

```ts
@Controller('v1/reports')
@UseGuards(BearerGuard, PermissionGuard)
@UseInterceptors(DataAccessInterceptor)
export class ReportController {}
```

Ví dụ đầy đủ:

```ts
@Controller('v1/reports')
@UseGuards(BearerGuard, PermissionGuard)
@UseInterceptors(DataAccessInterceptor)
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get()
  @RequirePermission('report_view')
  @RequireDataAccess('bi_hub_reports', 'report_view')
  list(@Req() req: RequestWithInfo) {
    return this.reportService.findAll(req.info.accessibleDataIds);
  }
}
```

## PermissionQueryService

Service này query trực tiếp DB bằng `DataSource.query()`.

### `getUserPermissions(userId: number): Promise<string[]>`

Mục đích: lấy tất cả permission code user có.

Nguồn permission:

- Permission từ role active của user.
- Permission exception từ `data_access_users` có `scope_type = 'allow'`.

Ví dụ:

```ts
const codes = await permissionQueryService.getUserPermissions(10);
// ['report_view', 'report_edit']
```

### `hasPermission(userId: number, code: string): Promise<boolean>`

Mục đích: kiểm tra user có một permission code cụ thể không.

Ví dụ:

```ts
const canView = await permissionQueryService.hasPermission(10, 'report_view');
```

Ghi chú: trong runtime nên ưu tiên dùng `PermissionCacheService.hasPermission(...)` để tận dụng Redis.

### `getAccessibleRecords(userId, tableName, permissionCode?)`

Mục đích: lấy danh sách `data_id` user được phép truy cập trong một bảng.

Logic:

- Lấy `allow` qua role.
- Lấy `allow` qua user exception.
- Trừ toàn bộ `deny` qua role/user.
- Nếu truyền `permissionCode`, rule `allow` chỉ match khi:
  - Rule không có dòng `data_permissions`, hoặc
  - Rule có permission đúng code đó.

Ví dụ:

```ts
const ids = await permissionQueryService.getAccessibleRecords(10, 'bi_hub_reports', 'report_view');
// [101, 102, 205]
```

### `getUserIdsByRole(roleId: number): Promise<number[]>`

Mục đích: lấy user id đang thuộc một role, dùng cho cache invalidation.

Ví dụ:

```ts
const userIds = await permissionQueryService.getUserIdsByRole(3);
```

## PermissionCacheService

Service này bọc `PermissionQueryService` bằng Redis cache.

### `getPermissions(userId: number): Promise<Set<string>>`

Mục đích: lấy permission code của user theo cache-first.

Ví dụ:

```ts
const permissions = await permissionCacheService.getPermissions(10);
if (permissions.has('report_view')) {
  // cho phép xử lý
}
```

### `hasPermission(userId: number, code: string): Promise<boolean>`

Mục đích: kiểm tra permission bằng Redis `SISMEMBER` nếu cache đã có.

Ví dụ:

```ts
if (!(await permissionCacheService.hasPermission(10, 'report_edit'))) {
  throw new ForbiddenException('Missing permission');
}
```

### `getAccessibleRecords(userId, tableName, permissionCode?)`

Mục đích: lấy danh sách id được truy cập theo cache-first.

Ví dụ:

```ts
const accessibleIds = await permissionCacheService.getAccessibleRecords(10, 'bi_hub_reports', 'report_view');
```

### `invalidateUser(userId: number)`

Mục đích: xóa mọi cache permission/data access của một user.

Dùng khi:

- Gán role cho user.
- Xóa role khỏi user.
- Thay đổi trực tiếp permission/data access riêng của user.

Ví dụ:

```ts
this.permissionCache.invalidateUser(userId).catch(() => {});
```

### `invalidateByRole(roleId: number)`

Mục đích: tìm tất cả user thuộc role và xóa cache của từng user.

Dùng khi:

- Role đổi permission.
- Role bị active/inactive.
- Role bị xóa.

Ví dụ:

```ts
this.permissionCache.invalidateByRole(roleId).catch(() => {});
```

### `invalidateByTable(tableName: string)`

Mục đích: xóa cache data access liên quan đến một bảng.

Dùng khi:

- Tạo data access rule.
- Update data access rule.
- Delete data access rule.
- Remove link role/user khỏi rule.

Ví dụ:

```ts
this.permissionCache.invalidateByTable('bi_hub_reports').catch(() => {});
```

### `invalidateAll()`

Mục đích: xóa toàn bộ cache authorization.

Dùng khi:

- Có thay đổi lớn về permission/module.
- Cần reset cache thủ công.

Ví dụ:

```ts
await permissionCacheService.invalidateAll();
```

## Helper applyDataAccessScope

### `applyDataAccessScope(qb, alias, accessibleIds)`

Mục đích: thêm điều kiện lọc data access vào TypeORM `SelectQueryBuilder`.

Logic:

- `accessibleIds === undefined`: không thêm filter.
- `accessibleIds.length === 0`: thêm `WHERE 1 = 0` để trả rỗng.
- Có ids: thêm `alias.id IN (:...accessibleIds)`.

Ví dụ trong service:

```ts
import { applyDataAccessScope } from '@common/authorization';

async findAll(accessibleIds?: number[]) {
  const qb = this.repo
    .createQueryBuilder('report')
    .where('report.deleted_at IS NULL');

  applyDataAccessScope(qb, 'report', accessibleIds);

  return qb.orderBy('report.created_at', 'DESC').getMany();
}
```

## Ví dụ kiểm tra access cho endpoint update/delete

Với endpoint thao tác một record cụ thể, interceptor chỉ set danh sách id. Controller hoặc service vẫn cần tự check `id` có nằm trong danh sách không.

```ts
@Put(':id')
@RequirePermission('report_edit')
@RequireDataAccess('bi_hub_reports', 'report_edit')
async update(
  @Param('id') id: string,
  @Body() body: UpdateReportDto,
  @Req() req: RequestWithInfo,
) {
  const recordId = Number(id);
  const accessibleIds = req.info.accessibleDataIds;

  if (accessibleIds !== undefined && !accessibleIds.includes(recordId)) {
    throw new ForbiddenException('No access to this record');
  }

  return this.reportService.update(recordId, body);
}
```

## Ví dụ tích hợp controller hoàn chỉnh

```ts
import { DataAccessInterceptor, PermissionGuard, RequireDataAccess, RequirePermission } from '@common/authorization';
import { RequestWithInfo } from '@common/types/request-with-info';
import { BearerGuard } from '@common/guards';
import { Controller, Get, Req, UseGuards, UseInterceptors } from '@nestjs/common';

@Controller('v1/reports')
@UseGuards(BearerGuard, PermissionGuard)
@UseInterceptors(DataAccessInterceptor)
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get()
  @RequirePermission('report_view')
  @RequireDataAccess('bi_hub_reports', 'report_view')
  list(@Req() req: RequestWithInfo) {
    return this.reportService.findAll(req.info.accessibleDataIds);
  }
}
```

## Các hook invalidation đã tích hợp

| Service                                       | Khi nào invalidate                                    |
| --------------------------------------------- | ----------------------------------------------------- |
| `PermissionMatrixService.updateMatrixForRole` | Sau khi update permission matrix của role             |
| `DataAccessService.create`                    | Sau khi tạo/upsert data access rule                   |
| `DataAccessService.update`                    | Sau khi update data access rule                       |
| `DataAccessService.delete`                    | Sau khi xóa data access rule                          |
| `DataAccessService.removeLink`                | Sau khi remove role/user khỏi rule                    |
| `RoleService.assignUsers`                     | Sau khi gán user vào role                             |
| `RoleService.removeUsers`                     | Sau khi xóa user khỏi role                            |
| `RoleService.update`                          | Sau khi đổi permission hoặc user assignments của role |
| `RoleService.setStatus`                       | Sau khi active/inactive role                          |
| `RoleService.delete`                          | Sau khi xóa role                                      |

Các hook đang chạy kiểu fire-and-forget:

```ts
this.permissionCache.invalidateByRole(roleId).catch(() => {});
```

Lý do: thay đổi business data không bị fail chỉ vì Redis/cache invalidation gặp lỗi.

## Migration index

Migration:

```text
src/migration/2605050944-add-authorization-indexes.ts
```

Mục đích: thêm index cho các query thường dùng:

- `user_roles(user_id)` khi `deleted_at IS NULL`
- `roles_permissions(role_id)`
- `data_access(table_name, scope_type)`
- `data_access(table_name, scope_type, start_date, end_date)`
- `data_access_roles(role_id)`
- `data_access_users(user_id)`
- `data_permissions(data_access_id)`

Chạy migration:

```bash
npm run typeorm:run
```

Rollback:

```bash
npm run typeorm:revert
```

## Lưu ý khi thêm endpoint mới

1. Nếu endpoint chỉ cần auth, dùng `BearerGuard` như hiện tại.
2. Nếu endpoint cần permission, thêm `PermissionGuard` và `@RequirePermission(...)`.
3. Nếu endpoint cần lọc dữ liệu theo record, thêm `DataAccessInterceptor` và `@RequireDataAccess(...)`.
4. Với list endpoint, truyền `req.info.accessibleDataIds` xuống service và dùng `applyDataAccessScope`.
5. Với update/delete/detail endpoint theo `:id`, phải check `accessibleDataIds.includes(id)` trước khi xử lý.
6. Khi code làm thay đổi role/permission/data_access, cần gọi đúng hàm invalidate cache.
