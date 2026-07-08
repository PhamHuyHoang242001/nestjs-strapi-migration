import 'reflect-metadata';
import { PERMISSION_META_KEY } from '@common/authorization/constants/authorization.constant';
import { BiPaymentCategoryController } from '../bi-payment-category.controller';

// Category perm mapping — verify decorators wired per ma trận.
// create/delete = project create/edit OR; view = project view. Whole-table (no DA).
describe('BiPaymentCategoryController perm mapping', () => {
  const getPerm = (prop: string): string[] | undefined =>
    Reflect.getMetadata(PERMISSION_META_KEY, BiPaymentCategoryController.prototype, prop);

  it('search gắn bp_project_view', () => {
    expect(getPerm('search')).toEqual(['bp_project_view']);
  });

  it('create gắn bp_project_create | bp_project_edit (OR)', () => {
    expect(getPerm('create')).toEqual(['bp_project_create', 'bp_project_edit']);
  });

  it('delete gắn bp_project_create | bp_project_edit (OR)', () => {
    expect(getPerm('delete')).toEqual(['bp_project_create', 'bp_project_edit']);
  });

  it('deleteMany gắn bp_project_create | bp_project_edit (OR)', () => {
    expect(getPerm('deleteMany')).toEqual(['bp_project_create', 'bp_project_edit']);
  });
});
