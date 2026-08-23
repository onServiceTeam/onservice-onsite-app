import { validatePortfolioPublication } from '../src/services/provider.service';

it('BUG-UX-117 — portfolio publication requires consent and an upload owned by the provider', () => {
  const userId = '22222222-2222-4222-8222-222222222222';
  const ownedUrl = `https://cdn.example/portfolio/${userId}/work.jpg`;

  expect(() => validatePortfolioPublication(ownedUrl, userId, false)).toThrow(/consent/i);
  expect(() => validatePortfolioPublication(
    'https://cdn.example/portfolio/another-user/work.jpg',
    userId,
    true,
  )).toThrow(/uploaded by this account/i);
  expect(() => validatePortfolioPublication(ownedUrl, userId, true)).not.toThrow();
});
