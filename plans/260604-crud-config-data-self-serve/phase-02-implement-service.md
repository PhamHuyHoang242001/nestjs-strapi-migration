---
phase: 2
title: "Implement Service"
status: pending
priority: P2
effort: "20m"
dependencies: [1]
---

# Phase 2: Implement Service

## Overview

Create `ConfigDataSelfServeService` with CRUD business logic using TypeORM Repository pattern.

## Related Code Files

- Create: `src/modules/data-self-serve/config-data-self-serve.service.ts`
- Reference: `src/modules/databases/config-data-self-serve.entity.ts`
- Reference: `src/modules/data-self-serve/data-self-serve.service.ts` (existing pattern)

## Implementation Steps

1. Create `src/modules/data-self-serve/config-data-self-serve.service.ts`
2. Inject `@InjectRepository(ConfigDataSelfServe)` as `Repository<ConfigDataSelfServe>`
3. Implement `findAll(query: SearchConfigDataSelfServeDto)`:
   - Build QueryBuilder with optional ILIKE filter on `key` using `keyword`
   - Use `paginate()` from `nestjs-typeorm-paginate` for pagination
   - Return paginated result
4. Implement `findOne(id: number)`:
   - `findOne({ where: { id } })`
   - Throw `NotFoundException` if not found
5. Implement `create(dto: CreateConfigDataSelfServeDto)`:
   - Check key uniqueness: `findOne({ where: { key: dto.key } })`
   - Throw `BadRequestException('Key already exists')` if duplicate
   - `save(create(dto))`
6. Implement `update(id: number, dto: UpdateConfigDataSelfServeDto)`:
   - Check record exists (reuse `findOne`)
   - If `dto.key` provided and different from current, check uniqueness (exclude current id)
   - `save(merge(entity, dto))`
7. Implement `remove(id: number)`:
   - Check record exists (reuse `findOne`)
   - `remove(entity)` — hard delete

## Success Criteria

- [ ] All 5 CRUD methods implemented
- [ ] Key uniqueness enforced on create and update
- [ ] NotFoundException for missing records
- [ ] BadRequestException for duplicate keys
- [ ] Pagination works with keyword search
