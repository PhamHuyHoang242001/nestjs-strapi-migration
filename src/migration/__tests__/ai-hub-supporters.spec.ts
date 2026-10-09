import type { QueryRunner } from 'typeorm';
import { CreateAiHubSupporters2610091500 } from '../2610091500-create-ai-hub-supporters';
import { AiHubSupporter } from '../../modules/databases/ai-hub-supporter.entity';

function makeQueryRunner(): { runner: QueryRunner; statements: string[] } {
  const statements: string[] = [];
  const query = jest.fn((sql: string): Promise<unknown[]> => {
    statements.push(sql);
    return Promise.resolve([]);
  });
  return { runner: { query } as unknown as QueryRunner, statements };
}

const normalize = (sql: string): string => sql.replace(/\s+/g, ' ').trim();

describe('CreateAiHubSupporters2610091500', () => {
  it('creates table + dual-column unique live index', async () => {
    const harness = makeQueryRunner();
    await new CreateAiHubSupporters2610091500().up(harness.runner);
    const sql = harness.statements.map(normalize).join('\n');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS ai_hub_supporters');
    expect(sql).toContain('uq_ai_hub_supporters_live');
    expect(sql).toContain('deleted_at IS NULL AND is_deleted IS NOT TRUE');
    expect(sql).toContain("type IN ('skill', 'prompt', 'api-catalog', 'coworker')");
  });

  it('entity maps to ai_hub_supporters', () => {
    expect(new AiHubSupporter()).toBeInstanceOf(AiHubSupporter);
  });
});
