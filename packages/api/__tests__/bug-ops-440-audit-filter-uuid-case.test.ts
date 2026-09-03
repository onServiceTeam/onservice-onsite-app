import { expect, it } from '@jest/globals';
import {
  parseAuditTimelineExportQuery,
  parseAuditTimelineListQuery,
} from '../src/validators/admin-audit-log.validators';

it('Bug OPS-440 - valid uppercase audit UUID filters are canonical for list and export queries', () => {
  const entryId = '12120000-abcd-4abc-8def-000000001212';
  const userId = '12140000-abcd-4abc-8def-000000001214';
  const entityId = '12130000-abcd-4abc-8def-000000001213';
  const uppercaseFilters = {
    entryId: entryId.toUpperCase(),
    userId: userId.toUpperCase(),
    entityId: entityId.toUpperCase(),
    source: 'admin_actions',
  };

  expect(parseAuditTimelineListQuery(uppercaseFilters)).toMatchObject({
    entryId,
    userId,
    entityId,
    source: 'admin_actions',
  });
  expect(parseAuditTimelineExportQuery(uppercaseFilters)).toMatchObject({
    entryId,
    userId,
    entityId,
    source: 'admin_actions',
  });
});
