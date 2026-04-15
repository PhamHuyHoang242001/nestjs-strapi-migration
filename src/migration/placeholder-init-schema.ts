/**
 * placeholder-init-schema.ts
 *
 * PLACEHOLDER — InitSchema migration was NOT auto-generated.
 *
 * Reason: `typeorm:generate` script in package.json references
 * `src/config/orm.config.ts` which does not exist. The actual config
 * is at `src/configuration/orm.config.ts`. Additionally, the orm config
 * uses compiled dist entities (`dist/**\/*.entity.js`), so a prior
 * `nest build` AND a working DB connection are required.
 *
 * To generate the real InitSchema migration, run:
 *
 *   1. Ensure .env is populated with DB_HOST, DB_PORT, DB_USERNAME,
 *      DB_PASSWORD, DB_NAME pointing to a reachable Postgres instance.
 *
 *   2. Run:
 *        npm run build
 *        npx ts-node -r tsconfig-paths/register \
 *          ./node_modules/typeorm/cli.js \
 *          --config src/configuration/orm.config.ts \
 *          migration:generate -- -d src/migration -n InitSchema
 *
 *   3. Delete this placeholder file after the real migration is generated.
 *
 * Note: The package.json `typeorm` script path must also be corrected from
 * `src/config/orm.config.ts` → `src/configuration/orm.config.ts`.
 */
