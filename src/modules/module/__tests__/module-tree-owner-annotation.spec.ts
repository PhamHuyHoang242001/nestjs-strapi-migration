import { ModuleManagementService } from '../module-management.service';

const mockRepo = {
  findTrees: jest.fn(),
  find: jest.fn(),
  findOneBy: jest.fn(),
  findOneByIdValid: jest.fn(),
  findDetailWithRelations: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  softDelete: jest.fn(),
  buildQueryBuilder: jest.fn(),
};

function createService() {
  return new ModuleManagementService(mockRepo as any);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getTree() — ownerResourceType annotation', () => {
  it('annotates root module with matching ROOT_OWNER_CONFIG table_name', async () => {
    const service = createService();
    mockRepo.findTrees.mockResolvedValue([
      { id: 1, name: 'DataUploader', table_name: 'ma_tool_workspaces', children: [] },
    ]);

    const result = await service.getTree();

    expect((result.data[0] as any).ownerResourceType).toBe('workspace');
  });

  it('annotates bi_hub root module', async () => {
    const service = createService();
    mockRepo.findTrees.mockResolvedValue([
      { id: 2, name: 'BI Hub', table_name: 'bi_hub_bicc_departments', children: [] },
    ]);

    const result = await service.getTree();

    expect((result.data[0] as any).ownerResourceType).toBe('bicc_department');
  });

  it('does NOT annotate modules without ROOT_OWNER_CONFIG', async () => {
    const service = createService();
    mockRepo.findTrees.mockResolvedValue([
      { id: 3, name: 'BI Payment', table_name: 'bi_payment_projects', children: [] },
    ]);

    const result = await service.getTree();

    expect((result.data[0] as any).ownerResourceType).toBeUndefined();
  });

  it('does NOT annotate modules without table_name', async () => {
    const service = createService();
    mockRepo.findTrees.mockResolvedValue([{ id: 4, name: 'Home', table_name: null, children: [] }]);

    const result = await service.getTree();

    expect((result.data[0] as any).ownerResourceType).toBeUndefined();
  });

  it('annotates child nodes with matching table_name', async () => {
    const service = createService();
    mockRepo.findTrees.mockResolvedValue([
      {
        id: 1,
        name: 'Parent',
        table_name: null,
        children: [
          { id: 2, name: 'DataUploader', table_name: 'ma_tool_workspaces', children: [] },
          { id: 3, name: 'Other', table_name: 'some_table', children: [] },
        ],
      },
    ]);

    const result = await service.getTree();

    expect((result.data[0] as any).ownerResourceType).toBeUndefined();
    expect((result.data[0].children[0] as any).ownerResourceType).toBe('workspace');
    expect((result.data[0].children[1] as any).ownerResourceType).toBeUndefined();
  });
});
