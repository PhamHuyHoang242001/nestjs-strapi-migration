import {
  HIERARCHY_MAP,
  ROOT_OWNER_CONFIG,
  RESOURCE_TYPE_TO_ROOT_TABLE,
  NAME_COLUMN_MAP,
  ALLOWED_TABLES,
  OWNER_ALL_TABLES,
  OWNER_ALL_RESOURCE_ID,
  getNameColumn,
} from '../constants/hierarchy-config';
import { DATA_ACCESS_TABLE } from '@common/enums';

const TABLE = 'ma_tool_cstb_rpt_properties';
const RESOURCE_TYPE = 'ma_tool_report';

// Owner-scoped root module paths — any table whose root has ROOT_OWNER_CONFIG.
// getUserImpliedVerbs matches permissions by `module.path LIKE root_path || '%'`,
// so the MA Tool paths must live outside these namespaces to avoid leaking the
// view verb into owners' implied-verb set.
const OWNER_SCOPED_ROOT_PATHS = ['/data-uploader/workspace', '/bi-hub/bicc-department'];
const MA_TOOL_PATHS = ['/ma-tool', '/ma-tool/report'];

describe('ma_tool_cstb_rpt_properties — whole-table SO config', () => {
  it('is a standalone root in HIERARCHY_MAP (no parent)', () => {
    expect(HIERARCHY_MAP[TABLE]).toBeNull();
  });

  it('is registered in ROOT_OWNER_CONFIG as resource_type ma_tool_report', () => {
    expect(ROOT_OWNER_CONFIG[TABLE]?.resourceType).toBe(RESOURCE_TYPE);
  });

  it('resource_type ma_tool_report resolves back to this table', () => {
    expect(RESOURCE_TYPE_TO_ROOT_TABLE[RESOURCE_TYPE]).toBe(TABLE);
  });

  it('is a whole-table (own-all) SO table with a sentinel resource_id', () => {
    expect(OWNER_ALL_TABLES.has(TABLE)).toBe(true);
    expect(OWNER_ALL_RESOURCE_ID).toBe(0);
  });

  it('uses rpt_code as the display column', () => {
    expect(NAME_COLUMN_MAP[TABLE]).toBe('rpt_code');
    expect(getNameColumn(TABLE)).toBe('rpt_code');
  });

  it('is browsable/assignable (in ALLOWED_TABLES)', () => {
    expect(ALLOWED_TABLES.has(TABLE)).toBe(true);
  });

  it('exposes the table via the DATA_ACCESS_TABLE enum', () => {
    expect(DATA_ACCESS_TABLE.MA_TOOL_CSTB_RPT_PROPERTIES).toBe(TABLE);
  });

  it('pins module paths outside every owner-scoped root namespace', () => {
    for (const maPath of MA_TOOL_PATHS) {
      for (const ownerPath of OWNER_SCOPED_ROOT_PATHS) {
        // Neither direction may be a path-prefix of the other.
        expect(maPath.startsWith(ownerPath)).toBe(false);
        expect(ownerPath.startsWith(maPath)).toBe(false);
      }
    }
  });
});
