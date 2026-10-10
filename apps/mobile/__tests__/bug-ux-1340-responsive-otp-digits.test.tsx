import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import OTPInput from '@/components/ui/OTPInput';

jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  return {
    ...actual,
    View: ({ children, style }: { children?: React.ReactNode; style?: object }) => (
      <div style={actual.StyleSheet.flatten(style)}>{children}</div>
    ),
  };
});

it('Bug UX-1340 — verification digits shrink within their row while retaining configured code entry', () => {
  // jsdom verifies the actual rendered flex contract, not pixel layout.
  // The compiled-browser audit additionally measures every cell's bounds.
  for (const length of [4, 5, 6, 7, 8]) {
    const onChange = jest.fn();
    const view = render(<OTPInput length={length} value="" onChange={onChange} />);
    const input = view.getByLabelText(`Enter ${length}-digit code`);
    const row = input.previousElementSibling;
    expect(row?.childElementCount).toBe(length);
    for (const cell of Array.from(row?.children ?? [])) {
      expect(cell.getAttribute('style')).toEqual(expect.stringContaining('flex-shrink: 1'));
      expect(cell.getAttribute('style')).toEqual(expect.stringContaining('height: 56px'));
    }
    fireEvent.change(input, { target: { value: '12a3456789' } });
    const expected = '123456789'.slice(0, length);
    expect(onChange).toHaveBeenLastCalledWith(expected);
    view.rerender(<OTPInput length={length} value={expected} onChange={onChange} />);
    expect(view.getByLabelText(`Verification code input, ${length} of ${length} digits entered`)).toBeTruthy();
    expect(Array.from(row?.children ?? []).map(cell => cell.textContent).join('')).toBe(expected);
    view.unmount();
  }
});
