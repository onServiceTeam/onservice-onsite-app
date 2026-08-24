import React from 'react';
import { render, screen } from '@testing-library/react';

import TrustStrip from '../src/components/ui/TrustStrip';

it('Bug UX-216 — the shared trust strip describes verified controls without promising 48-hour coverage', () => {
  render(<TrustStrip />);

  expect(screen.getByLabelText('Vetted pros, verified payments use escrow, in-app case tracking')).toBeTruthy();
  expect(screen.getByText('Verified escrow')).toBeTruthy();
  expect(screen.getByText('Case tracking')).toBeTruthy();
  expect(screen.queryByText('48h cover')).toBeNull();
});
