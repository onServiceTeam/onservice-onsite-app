/**
 * Phase 14 R5b — proof-of-life DOM render test for login.tsx.
 *
 * Mounts the screen via @testing-library/react in jsdom, fires a
 * change event on the phone input + a click on the submit, asserts
 * on rendered validation error text. EXACTLY what the audit's
 * Action 1 asked for, just running in jsdom (custom-element shim of RN
 * primitives) instead of the broken react-test-renderer path.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import LoginScreen from '../../app/auth/login';

describe('LoginScreen — real DOM render (R5b proof, Bug 868/870)', () => {
  it('mounts and shows welcome heading', () => {
    const { container } = render(<LoginScreen />);
    expect(container.textContent).toContain('Welcome back');
  });

  it('Bug 870 — submitting with 10-char invalid PH format shows validation error', () => {
    const { container } = render(<LoginScreen />);

    // Initially no error.
    expect(container.textContent).not.toContain('valid Philippine mobile number');

    // Find the phone input — our RN mock renders TextInput as <input>.
    const input = container.querySelector('input');
    expect(input).not.toBeNull();

    // Type 10 characters that do NOT match PH mobile regex (must start
    // with 9 after country code; "1234567890" doesn't).
    fireEvent.change(input!, { target: { value: '1234567890' } });

    // Find the submit button — our RN mock renders Pressable as <button>.
    const buttons = Array.from(container.querySelectorAll('button'));
    const submit = buttons.find(
      (el) => el.textContent?.includes('Send Verification Code'),
    );
    expect(submit).toBeTruthy();

    fireEvent.click(submit!);

    // Login.tsx sets `error` state when validatePHPhone fails. The
    // Input component's `error` prop renders the message below the
    // input. The error text contains "valid Philippine mobile number".
    expect(container.textContent).toContain('valid Philippine mobile number');
  });
});
