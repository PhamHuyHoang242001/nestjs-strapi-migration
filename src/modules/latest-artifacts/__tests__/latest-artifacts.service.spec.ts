import { LatestArtifactsService } from '../latest-artifacts.service';
import { LATEST_ARTIFACTS_LIMIT } from '@configuration/env.config';

// DB-mocked composition spec (module convention: no real DB). We stub versionRepo.manager.query and
// assert (a) the emitted SQL/LIMIT param, (b) the reshaped public item shape, and (c) the config vs
// per-request limit resolution. Call order is deterministic: skill fetch → prompt fetch → email
// lookup (Promise.all invokes the two fetch thunks in array order before either awaits).
function makeService() {
  const query = jest.fn();
  const versionRepo = { manager: { query } } as any;
  const service = new LatestArtifactsService(versionRepo);
  return { service, query };
}

const SKILL_ROW = {
  code: 'skill_73',
  version_no: 3,
  created_at: '2026-08-10T17:53:51.000Z',
  name: 'Phân tích Rủi ro',
  short_description: 'desc-skill',
  state: 'pending',
  submitted_by: 85,
};
const PROMPT_ROW = {
  code: 'prompt_57',
  version_no: 1,
  created_at: '2026-08-11T11:22:41.000Z',
  name: 'Prompt Tạo Tiêu đề',
  short_description: 'desc-prompt',
  state: 'approved',
  submitted_by: 218,
};

describe('LatestArtifactsService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('defaults to the configured LATEST_ARTIFACTS_LIMIT when no override is passed', async () => {
    const { service, query } = makeService();
    query
      .mockResolvedValueOnce([SKILL_ROW])
      .mockResolvedValueOnce([PROMPT_ROW])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 85, email: 'skill.uploader@vpbank.com.vn' },
        { id: 218, email: 'prompt.uploader@vpbank.com.vn' },
      ]);

    const res = await service.listLatest();

    expect(res.meta.limit).toBe(LATEST_ARTIFACTS_LIMIT);
    // Both fetch queries bind the resolved limit as $1.
    expect(query.mock.calls[0][1]).toEqual([LATEST_ARTIFACTS_LIMIT]);
    expect(query.mock.calls[1][1]).toEqual([LATEST_ARTIFACTS_LIMIT]);
    // Skill SQL targets skill_versions/skill_packages; prompt SQL targets the prompt tables.
    expect(query.mock.calls[0][0]).toContain('skill_versions');
    expect(query.mock.calls[1][0]).toContain('prompt_versions');
  });

  it('honours a per-request limit override', async () => {
    const { service, query } = makeService();
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const res = await service.listLatest(5);

    expect(res.meta.limit).toBe(5);
    expect(query.mock.calls[0][1]).toEqual([5]);
    expect(query.mock.calls[1][1]).toEqual([5]);
  });

  it('reshapes rows to the public item contract with type + resolved creator email', async () => {
    const { service, query } = makeService();
    query
      .mockResolvedValueOnce([SKILL_ROW])
      .mockResolvedValueOnce([PROMPT_ROW])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 85, email: 'skill.uploader@vpbank.com.vn' },
        { id: 218, email: 'prompt.uploader@vpbank.com.vn' },
      ]);

    const res = await service.listLatest();

    expect(res.data.skills).toEqual([
      {
        code: 'skill_73',
        version: 3,
        created_at: '2026-08-10T17:53:51.000Z',
        name: 'Phân tích Rủi ro',
        description: 'desc-skill',
        type: 'skill',
        state: 'pending',
        created_by: 'skill.uploader@vpbank.com.vn',
      },
    ]);
    expect(res.data.prompts).toEqual([
      {
        code: 'prompt_57',
        version: 1,
        created_at: '2026-08-11T11:22:41.000Z',
        name: 'Prompt Tạo Tiêu đề',
        description: 'desc-prompt',
        type: 'prompt',
        state: 'approved',
        created_by: 'prompt.uploader@vpbank.com.vn',
      },
    ]);
  });

  it('returns created_by=null when the submitter has no matching user row', async () => {
    const { service, query } = makeService();
    query
      .mockResolvedValueOnce([SKILL_ROW])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const res = await service.listLatest();

    expect(res.data.skills[0].created_by).toBeNull();
    // No submitters to resolve on the prompt side → empty group, still well-formed.
    expect(res.data.prompts).toEqual([]);
  });
});
