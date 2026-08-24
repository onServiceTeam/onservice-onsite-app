import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));

import FilterModal from '@/components/FilterModal';

it('Bug UX-296 — shared search/list filters render as a bounded tablet and desktop workspace', () => {
  render(
    <FilterModal
      visible
      title="Filter Search"
      groups={[{ key: 'rating', label: 'Minimum Rating', options: [{ value: '4', label: '4 and up' }] }]}
      initialValue={{}}
      onApply={jest.fn()}
      onClose={jest.fn()}
    />,
  );

  expect(screen.getByLabelText('Bounded tablet and desktop filter workspace')).toBeTruthy();
  expect(screen.getByText('Minimum Rating')).toBeTruthy();
  expect(screen.getByText('4 and up')).toBeTruthy();
});
