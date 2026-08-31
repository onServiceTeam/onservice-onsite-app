import { expect, it } from 'vitest';
import { visibleAdminNavGroups } from '../admin-navigation';

it('Bug UX-799 — support admins can navigate to the read-only cancellation comparison workspace', () => {
  const visibleItems = visibleAdminNavGroups('admin').flatMap((group) => group.items);
  const item = visibleItems.find((entry) => entry.to === '/settings/cancellation-policy');

  expect(item).toMatchObject({
    label: 'Cancellation Policy',
    description: 'Compare live refund rules with customer wording',
  });
});
