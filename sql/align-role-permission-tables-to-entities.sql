-- Aligns legacy role/permission table names + columns to the current TypeORM entities.
-- Data-preserving: renames tables (FKs follow the rename automatically) and only ADDS the
-- columns the entities declare that the legacy schema lacked. No existing column is dropped.
-- Idempotent: safe to re-run.

BEGIN;

-- permission -> permissions (columns already match the Permission entity)
ALTER TABLE IF EXISTS permission RENAME TO permissions;

-- role -> roles, plus audit columns declared on the Role entity (created_by_id/updated_by_id)
ALTER TABLE IF EXISTS role RENAME TO roles;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS created_by_id integer;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS updated_by_id integer;

-- roles_permissions -> role_permissions, plus BaseSoftDeleteEntity columns (id/timestamps/is_deleted)
ALTER TABLE IF EXISTS roles_permissions RENAME TO role_permissions;
ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS deleted_at timestamp without time zone;
ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false;

-- Swap the composite PK for the entity's single serial id PK, keeping the pair unique.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'role_permissions' AND column_name = 'id'
  ) THEN
    ALTER TABLE role_permissions DROP CONSTRAINT IF EXISTS "PK_0cd11f0b35c4d348c6ebb9b36b7";
    ALTER TABLE role_permissions ADD COLUMN id SERIAL PRIMARY KEY;
    ALTER TABLE role_permissions
      ADD CONSTRAINT uq_role_permissions_role_id_permission_id UNIQUE (role_id, permission_id);
  END IF;
END $$;

COMMIT;
