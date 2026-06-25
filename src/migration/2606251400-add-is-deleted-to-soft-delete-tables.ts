import { MigrationInterface, QueryRunner } from 'typeorm';

// is_deleted now lives on BaseSoftDeleteEntity, so every soft-delete entity's model
// declares it. With synchronize disabled in production, each such table needs the
// physical column or SELECT * (TypeORM find) breaks. This adds is_deleted to every
// public table that has deleted_at but is still missing is_deleted — self-adjusting
// so newly added soft-delete tables are covered without editing a hardcoded list.
export class AddIsDeletedToSoftDeleteTables2606251400 implements MigrationInterface {
  name = 'AddIsDeletedToSoftDeleteTables2606251400';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE r record;
      BEGIN
        FOR r IN
          SELECT c.table_name
          FROM information_schema.columns c
          WHERE c.table_schema = 'public'
            AND c.column_name = 'deleted_at'
            AND NOT EXISTS (
              SELECT 1 FROM information_schema.columns x
              WHERE x.table_schema = 'public'
                AND x.table_name = c.table_name
                AND x.column_name = 'is_deleted'
            )
        LOOP
          EXECUTE format('ALTER TABLE %I ADD COLUMN is_deleted boolean DEFAULT false', r.table_name);
        END LOOP;
      END $$;
    `);
  }

  // No-op: is_deleted cannot be safely dropped on rollback because this migration
  // cannot distinguish columns it added from ones that pre-existed, and dropping a
  // soft-delete flag would lose data. The nullable boolean is harmless to retain.
  public async down(): Promise<void> {}
}
