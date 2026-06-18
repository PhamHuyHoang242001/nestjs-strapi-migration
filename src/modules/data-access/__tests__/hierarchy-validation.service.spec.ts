import { HierarchyValidationService } from '../hierarchy-validation.service';
import { DataSource } from 'typeorm';
import { BadRequestException } from '@nestjs/common';

// ── Mock factory ────────────────────────────────────────────────────────────

function createService(queryMock: jest.Mock) {
  const mockDataSource = { query: queryMock } as unknown as DataSource;
  return new HierarchyValidationService(mockDataSource);
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('HierarchyValidationService', () => {
  describe('validate()', () => {
    it('returns empty for tables without hierarchy config', async () => {
      const service = createService(jest.fn());
      const result = await service.validate([1], 'ma_tool_workspaces', [10], [3]);
      expect(result).toEqual([]);
    });

    it('returns empty when all parents have allow rules', async () => {
      const queryMock = jest
        .fn()
        // Step 1: get parent IDs for bi_hub_reports
        .mockResolvedValueOnce([{ id: 1, parent_id: 100 }])
        // Step 2: check existing allow rules — parent 100 has rule
        .mockResolvedValueOnce([{ data_id: 100 }]);

      const service = createService(queryMock);
      const result = await service.validate([1], 'bi_hub_reports', [10], [3]);
      expect(result).toEqual([]);
    });

    it('returns missing ancestors when parent lacks allow rules', async () => {
      const queryMock = jest
        .fn()
        // Step 1: get parent IDs
        .mockResolvedValueOnce([{ id: 1, parent_id: 100 }])
        // Step 2: no existing rules for parent
        .mockResolvedValueOnce([])
        // Step 3: get display names for missing parents
        .mockResolvedValueOnce([{ id: 100, display_name: 'Department A' }]);
      // No grandparent for bi_hub_bicc_departments (null hierarchy)

      const service = createService(queryMock);
      const result = await service.validate([1], 'bi_hub_reports', [10], [3]);

      expect(result).toHaveLength(1);
      expect(result[0].table_name).toBe('bi_hub_bicc_departments');
      expect(result[0].items).toEqual([{ data_id: 100, display_name: 'Department A' }]);
    });

    it('handles records with no FK (null parent_id)', async () => {
      const queryMock = jest.fn().mockResolvedValueOnce([{ id: 1, parent_id: null }]);

      const service = createService(queryMock);
      const result = await service.validate([1], 'bi_hub_reports', [10], []);
      expect(result).toEqual([]);
    });

    it('deduplicates parent IDs across multiple data_ids', async () => {
      const queryMock = jest
        .fn()
        // Both records point to same parent 100
        .mockResolvedValueOnce([
          { id: 1, parent_id: 100 },
          { id: 2, parent_id: 100 },
        ])
        .mockResolvedValueOnce([{ data_id: 100 }]);

      const service = createService(queryMock);
      const result = await service.validate([1, 2], 'bi_hub_reports', [], [3]);
      expect(result).toEqual([]);
    });

    it('recursively checks grandparents (ma_tool 3-level hierarchy)', async () => {
      const queryMock = jest
        .fn()
        // Level 1: documents → templates (parent_id)
        .mockResolvedValueOnce([{ id: 1, parent_id: 50 }])
        // Level 1: check rules for template 50 — missing
        .mockResolvedValueOnce([])
        // Level 1: get display name for template 50
        .mockResolvedValueOnce([{ id: 50, display_name: 'Template X' }])
        // Level 2 (recurse): templates → workspaces
        .mockResolvedValueOnce([{ id: 50, parent_id: 200 }])
        // Level 2: check rules for workspace 200 — missing
        .mockResolvedValueOnce([])
        // Level 2: get display name for workspace 200
        .mockResolvedValueOnce([{ id: 200, display_name: 'Workspace Z' }]);
      // Level 3: workspaces has null hierarchy → stops

      const service = createService(queryMock);
      const result = await service.validate([1], 'ma_tool_documents', [10], []);

      // Should return grandparent first, then parent (top-down)
      expect(result).toHaveLength(2);
      expect(result[0].table_name).toBe('ma_tool_workspaces');
      expect(result[0].items[0].display_name).toBe('Workspace Z');
      expect(result[1].table_name).toBe('ma_tool_templates');
      expect(result[1].items[0].display_name).toBe('Template X');
    });

    it('builds correct user+role condition when both provided', async () => {
      const queryMock = jest
        .fn()
        .mockResolvedValueOnce([{ id: 1, parent_id: 100 }])
        .mockResolvedValueOnce([{ data_id: 100 }]);

      const service = createService(queryMock);
      await service.validate([1], 'bi_hub_reports', [10, 20], [3, 5]);

      // Step 2 query should contain both user and role IDs in params
      const step2Params = queryMock.mock.calls[1][1] as any[];
      expect(step2Params).toContain(100); // parent ID
      expect(step2Params).toContain(10);
      expect(step2Params).toContain(20);
      expect(step2Params).toContain(3);
      expect(step2Params).toContain(5);
    });

    it('builds user-only condition when no roles', async () => {
      const queryMock = jest
        .fn()
        .mockResolvedValueOnce([{ id: 1, parent_id: 100 }])
        .mockResolvedValueOnce([{ data_id: 100 }]);

      const service = createService(queryMock);
      await service.validate([1], 'bi_hub_reports', [10], []);

      const step2SQL = queryMock.mock.calls[1][0] as string;
      expect(step2SQL).toContain('dau.user_id IN');
      expect(step2SQL).not.toContain('dar.role_id IN');
    });

    it('builds role-only condition when no users', async () => {
      const queryMock = jest
        .fn()
        .mockResolvedValueOnce([{ id: 1, parent_id: 100 }])
        .mockResolvedValueOnce([{ data_id: 100 }]);

      const service = createService(queryMock);
      await service.validate([1], 'bi_hub_reports', [], [3]);

      const step2SQL = queryMock.mock.calls[1][0] as string;
      expect(step2SQL).toContain('dar.role_id IN');
      expect(step2SQL).not.toContain('dau.user_id IN');
    });
  });

  describe('enforce()', () => {
    it('does not throw when validation passes', async () => {
      const queryMock = jest
        .fn()
        .mockResolvedValueOnce([{ id: 1, parent_id: 100 }])
        .mockResolvedValueOnce([{ data_id: 100 }]);

      const service = createService(queryMock);
      await expect(service.enforce([1], 'bi_hub_reports', [10], [3])).resolves.toBeUndefined();
    });

    it('throws BadRequestException with missing_ancestors when validation fails', async () => {
      const queryMock = jest
        .fn()
        .mockResolvedValueOnce([{ id: 1, parent_id: 100 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 100, display_name: 'Dept A' }]);

      const service = createService(queryMock);

      try {
        await service.enforce([1], 'bi_hub_reports', [10], []);
        fail('should have thrown');
      } catch (err: any) {
        expect(err).toBeInstanceOf(BadRequestException);
        const response = err.getResponse();
        expect(response.message).toBe('missing_parent_access_rules');
        expect(response.data.missing_ancestors).toHaveLength(1);
        expect(response.data.missing_ancestors[0].table_name).toBe('bi_hub_bicc_departments');
      }
    });
  });
});
