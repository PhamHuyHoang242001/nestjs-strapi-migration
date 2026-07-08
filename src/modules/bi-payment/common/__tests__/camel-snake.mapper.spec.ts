import { mapCamelToSnake, mapCamelQueryToSnake } from '../helpers/camel-snake.mapper';

describe('mapCamelToSnake', () => {
  it('map field theo mapping table', () => {
    const dto = { templateId: 1, programId: 2, fileUrl: 'x' };
    const mapping = { templateId: 'template_id', programId: 'program_id', fileUrl: 'file_url' };
    expect(mapCamelToSnake(dto, mapping)).toEqual({
      template_id: 1,
      program_id: 2,
      file_url: 'x',
    });
  });

  it('bỏ qua field ko có trong mapping (explicit, ko auto-convert)', () => {
    const dto = { templateId: 1, unknownField: 'x' };
    const mapping = { templateId: 'template_id' };
    expect(mapCamelToSnake(dto, mapping)).toEqual({ template_id: 1 });
  });

  it('giữ giá trị null/undefined', () => {
    const dto = { templateId: null, programId: undefined };
    const mapping = { templateId: 'template_id', programId: 'program_id' };
    expect(mapCamelToSnake(dto, mapping)).toEqual({ template_id: null, program_id: undefined });
  });
});

describe('mapCamelQueryToSnake', () => {
  it('map query filter camelCase → snake_case', () => {
    const query = { programId: 5, workstepCurrent: 'preparing' };
    const mapping = { programId: 'program_id', workstepCurrent: 'workstep_current' };
    expect(mapCamelQueryToSnake(query, mapping)).toEqual({
      program_id: 5,
      workstep_current: 'preparing',
    });
  });
});
