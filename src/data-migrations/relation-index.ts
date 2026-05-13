import { BiHubBiccDepartmentRelationDataMigration } from './relation/bi-hub-bicc-department.data-migration';
import { BiHubDiagnosticReportRelationDataMigration } from './relation/bi-hub-diagnostic-report.data-migration';
import { BiHubDiagnosticHistoryReportRelationDataMigration } from './relation/bi-hub-diagnostic-history-report.data-migration';

enum TableName {
  BI_HUB_BICC_DEPARTMENT = 'bi_hub_bicc_department',
  BI_HUB_DIAGNOSTIC_REPORT = 'bi_hub_diagnostic_report',
  BI_HUB_DIAGNOSTIC_HISTORY_REPORT = 'bi_hub_diagnostic_history_report',
}

interface MigrationParams {
  db_host: string;
  db_port: string;
  db_username: string;
  db_name: string;
  db_password: string;
  table_name: string;
}

const main = async () => {
  const args = process.argv.slice(2);
  const params = Object.fromEntries(args.map((arg) => arg.replace(/^--/, '').split('='))) as unknown as MigrationParams;

  if (!params.db_host || !params.db_port || !params.db_username || !params.db_name || !params.db_password) {
    throw new Error('Missing db configuration!');
  }

  if (!params.table_name) {
    throw new Error('Missing table name!');
  }

  switch (params.table_name as TableName) {
    case TableName.BI_HUB_BICC_DEPARTMENT: {
      const script = new BiHubBiccDepartmentRelationDataMigration(params);
      await script.run();
      break;
    }
    case TableName.BI_HUB_DIAGNOSTIC_REPORT: {
      const script = new BiHubDiagnosticReportRelationDataMigration(params);
      await script.run();
      break;
    }
    case TableName.BI_HUB_DIAGNOSTIC_HISTORY_REPORT: {
      const script = new BiHubDiagnosticHistoryReportRelationDataMigration(params);
      await script.run();
      break;
    }
    default:
      throw new Error(`Unknown table name: ${params.table_name}`);
  }
};

void main();

// npm run start:relation-migration -- --table_name=bi_hub_bicc_department --db_host=localhost --db_port=5432 --db_username=postgres --db_name=eda --db_password=123456aA
// npm run start:relation-migration -- --table_name=bi_hub_diagnostic_report --db_host=localhost --db_port=5432 --db_username=postgres --db_name=eda --db_password=123456aA
// npm run start:relation-migration -- --table_name=bi_hub_diagnostic_history_report --db_host=localhost --db_port=5432 --db_username=postgres --db_name=eda --db_password=123456aA
