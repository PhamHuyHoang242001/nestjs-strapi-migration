import {
  HIERARCHY_MAP,
  ROOT_OWNER_CONFIG,
  RESOURCE_TYPE_TO_ROOT_TABLE,
  OWNER_ALL_TABLES,
  RULE_TARGET_TABLES,
  ALLOWED_TABLES,
  NAME_COLUMN_MAP,
} from '../constants/hierarchy-config';
import { AI_HUB_PACKAGE_TABLES } from '@modules/asset-hub-catalog/ai-hub-package-access.helper';

const EXPECTED: Array<[string, string]> = [
  ['skill_packages', 'ai_hub_skill'],
  ['prompt_packages', 'ai_hub_prompt'],
  ['api_catalog_packages', 'ai_hub_api_catalog'],
  ['coworker_packages', 'ai_hub_coworker'],
];

describe('AI Hub workspace SO config', () => {
  it.each(EXPECTED)('%s is own-all with resource_type %s', (table, resourceType) => {
    expect(OWNER_ALL_TABLES.has(table)).toBe(true);
    expect(ROOT_OWNER_CONFIG[table]?.resourceType).toBe(resourceType);
    expect(RESOURCE_TYPE_TO_ROOT_TABLE[resourceType]).toBe(table);
    expect(NAME_COLUMN_MAP[table]).toBe('code');
  });

  it('is not in HIERARCHY_MAP / ALLOWED_TABLES / RULE_TARGET_TABLES', () => {
    for (const table of AI_HUB_PACKAGE_TABLES) {
      expect(table in HIERARCHY_MAP).toBe(false);
      expect(ALLOWED_TABLES.has(table)).toBe(false);
      expect(RULE_TARGET_TABLES.has(table)).toBe(false);
    }
  });
});
