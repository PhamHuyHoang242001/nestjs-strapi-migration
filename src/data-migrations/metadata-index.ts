import { BiHubBiccDepartmentDataMigration } from './metadata/bi-hub-bicc-department.data-migration';
import { BiHubDiagnosticReportDataMigration } from './metadata/bi-hub-diagnostic-report.data-migration';
import { BiHubDiagnosticFileDataMigration } from './metadata/bi-hub-diagnostic-file.data-migration';
import { BiHubDiagnosticHistoryReportDataMigration } from './metadata/bi-hub-diagnostic-history-report.data-migration';
import { BiDiagnosticLogDataMigration } from './metadata/bi-diagnostic-log.data-migration';
import { MaToolWorkspaceDataMigration } from './metadata/ma-tool-workspace.data-migration';
import { MaToolWorkspaceHistoryDataMigration } from './metadata/ma-tool-workspace-history.data-migration';
import { MaToolWorkspaceBookmarkDataMigration } from './metadata/ma-tool-workspace-bookmark.data-migration';

enum TableName {
  BI_HUB_BICC_DEPARTMENT = 'bi_hub_bicc_department',
  BI_HUB_DIAGNOSTIC_REPORT = 'bi_hub_diagnostic_report',
  BI_HUB_DIAGNOSTIC_FILE = 'bi_hub_diagnostic_file',
  BI_HUB_DIAGNOSTIC_HISTORY_REPORT = 'bi_hub_diagnostic_history_report',
  BI_DIAGNOSTIC_LOG = 'bi_diagnostic_log',
  MA_TOOL_WORKSPACE = 'ma_tool_workspace',
  MA_TOOL_WORKSPACE_HISTORY = 'ma_tool_workspace_history',
  MA_TOOL_WORKSPACE_BOOKMARK = 'ma_tool_workspace_bookmark',
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
      const script = new BiHubBiccDepartmentDataMigration(params);
      await script.run();
      break;
    }
    case TableName.BI_HUB_DIAGNOSTIC_REPORT: {
      const script = new BiHubDiagnosticReportDataMigration(params);
      await script.run();
      break;
    }
    case TableName.BI_HUB_DIAGNOSTIC_FILE: {
      const script = new BiHubDiagnosticFileDataMigration(params);
      await script.run();
      break;
    }
    case TableName.BI_HUB_DIAGNOSTIC_HISTORY_REPORT: {
      const script = new BiHubDiagnosticHistoryReportDataMigration(params);
      await script.run();
      break;
    }
    case TableName.BI_DIAGNOSTIC_LOG: {
      const script = new BiDiagnosticLogDataMigration(params);
      await script.run();
      break;
    }
    case TableName.MA_TOOL_WORKSPACE: {
      const script = new MaToolWorkspaceDataMigration(params);
      await script.run();
      break;
    }
    case TableName.MA_TOOL_WORKSPACE_HISTORY: {
      const script = new MaToolWorkspaceHistoryDataMigration(params);
      await script.run();
      break;
    }
    case TableName.MA_TOOL_WORKSPACE_BOOKMARK: {
      const script = new MaToolWorkspaceBookmarkDataMigration(params);
      await script.run();
      break;
    }
    default:
      throw new Error(`Unknown table name: ${params.table_name}`);
  }
};

void main();

// npm run start:data-migration -- --table_name=bi_hub_bicc_department --db_host=localhost --db_port=5432 --db_username=postgres --db_name=eda --db_password=123456aA
// npm run start:data-migration -- --table_name=bi_hub_diagnostic_report --db_host=localhost --db_port=5432 --db_username=postgres --db_name=eda --db_password=123456aA
// npm run start:data-migration -- --table_name=bi_hub_diagnostic_file --db_host=localhost --db_port=5432 --db_username=postgres --db_name=eda --db_password=123456aA
// npm run start:data-migration -- --table_name=bi_hub_diagnostic_history_report --db_host=localhost --db_port=5432 --db_username=postgres --db_name=eda --db_password=123456aA
// npm run start:data-migration -- --table_name=bi_diagnostic_log --db_host=localhost --db_port=5432 --db_username=postgres --db_name=eda --db_password=123456aA
// npm run start:data-migration -- --table_name=ma_tool_workspace --db_host=localhost --db_port=5432 --db_username=postgres --db_name=eda --db_password=123456aA
// npm run start:data-migration -- --table_name=ma_tool_workspace_history --db_host=localhost --db_port=5432 --db_username=postgres --db_name=eda --db_password=123456aA
// npm run start:data-migration -- --table_name=ma_tool_workspace_bookmark --db_host=localhost --db_port=5432 --db_username=postgres --db_name=eda --db_password=123456aA
