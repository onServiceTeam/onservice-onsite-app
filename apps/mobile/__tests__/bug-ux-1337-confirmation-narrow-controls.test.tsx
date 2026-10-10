import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConfirmModal } from '@/components/ConfirmModal';

jest.mock('react-native', () => {
  const native = jest.requireActual('../__mocks__/react-native.js');
  const runtime = require('react') as typeof React;
  return { ...native,
    View: ({ style, ...props }: { style?: unknown }) => runtime.createElement(native.View, { ...props, style: native.StyleSheet.flatten(style) }),
    Pressable: ({ style, ...props }: { style?: unknown }) => runtime.createElement(native.Pressable, { ...props, style: native.StyleSheet.flatten(style) }),
  };
});

it('Bug UX-1337 — long confirmation actions wrap inside narrow dialogs while cancel and confirm remain separate actions', () => {
  const cancel = jest.fn(), confirm = jest.fn();
  render(<ConfirmModal visible title="Reload saved application?" message="Your unsaved edits will be replaced."
    confirmLabel="Replace with saved draft" onCancel={cancel} onConfirm={confirm} destructive />);
  const cancelButton = screen.getByRole('button', { name: 'Cancel' });
  const confirmButton = screen.getByRole('button', { name: 'Replace with saved draft' });
  expect(cancelButton.parentElement!.style.flexWrap).toBe('wrap');
  for (const control of [cancelButton, confirmButton]) {
    expect(control.style.flexGrow).toBe('1');
    expect(control.style.flexShrink).toBe('1');
    expect(control.style.minHeight).toBe('44px');
  }
  fireEvent.click(cancelButton);
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(confirm).not.toHaveBeenCalled();
  fireEvent.click(confirmButton);
  expect(confirm).toHaveBeenCalledTimes(1);
});
