const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args) },
}));
jest.mock('../src/services/notification.service', () => ({ createPushNotification: jest.fn() }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { addMember } from '../src/services/business.service';

it('Bug OPS-358 — adding a member cannot create a second owner outside the ownership-transfer transaction', async () => {
  await expect(addMember(
    '35835835-8358-4358-8358-358358358358',
    '35835835-8358-4358-8358-358358358359',
    '35835835-8358-4358-8358-358358358360',
    'owner',
    {},
  )).rejects.toMatchObject({ statusCode: 409, message: 'Use ownership transfer to change the business owner.' });

  expect(queryMock).not.toHaveBeenCalled();
});
