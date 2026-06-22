import { resolveHistoryIsChangeLink } from './diagnostic-report-format.helper';

// Regression: history.is_change_link must reflect whether THIS event touched the
// file, so GET /history?isLinkReportChange=true returns the right rows. Previously
// it copied the report's static is_change_link flag and was always false.
describe('resolveHistoryIsChangeLink', () => {
  it('create with a file attached => true', () => {
    expect(resolveHistoryIsChangeLink({ isCreate: true, hasLatestFile: true })).toBe(true);
  });

  it('create without a file => false', () => {
    expect(resolveHistoryIsChangeLink({ isCreate: true, hasLatestFile: false })).toBe(false);
  });

  it('update whose change set includes file => true', () => {
    expect(
      resolveHistoryIsChangeLink({ isCreate: false, changedKeys: ['name', 'file'], hasLatestFile: true }),
    ).toBe(true);
  });

  it('update without file change => false even if a latest file exists', () => {
    expect(
      resolveHistoryIsChangeLink({ isCreate: false, changedKeys: ['name', 'insight'], hasLatestFile: true }),
    ).toBe(false);
  });

  it('update with empty change set => false', () => {
    expect(resolveHistoryIsChangeLink({ isCreate: false, changedKeys: [], hasLatestFile: false })).toBe(false);
  });

  it('update with undefined changedKeys => false', () => {
    expect(resolveHistoryIsChangeLink({ isCreate: false, hasLatestFile: true })).toBe(false);
  });
});
