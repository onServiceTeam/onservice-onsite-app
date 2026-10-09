const transactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: jest.fn(), transaction: transactionMock },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
  createTemplate,
  deleteTemplate,
  updateTemplate,
} from '../src/services/notification-template.service';

it('Bug OPS-370 — notification-template services reject invalid reasons and no-op updates before database work', async () => {
  await expect(createTemplate('admin-1', {
    slug: 'reference_notice',
    titleTemplate: 'Reference notice',
    bodyTemplate: 'This is reviewed reference notification copy.',
    type: 'system',
    reason: 'short',
  })).rejects.toMatchObject({ statusCode: 400 });

  await expect(updateTemplate('template-1', 'admin-1', {
    reason: 'This has a valid reason but no changed field.',
  })).rejects.toMatchObject({ statusCode: 400 });

  await expect(deleteTemplate('template-1', 'admin-1', 'short'))
    .rejects.toMatchObject({ statusCode: 400 });

  expect(transactionMock).not.toHaveBeenCalled();
});
