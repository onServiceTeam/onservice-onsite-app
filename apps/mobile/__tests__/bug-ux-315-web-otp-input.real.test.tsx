import React from 'react';
import { Platform } from 'react-native';
import { fireEvent, render } from '@testing-library/react';
import OTPInput from '@/components/ui/OTPInput';

it('Bug UX-315 — browser OTP entry uses a full-size interactive input and reports entered digits', () => {
  const originalPlatform = Platform.OS;
  Platform.OS = 'web';
  const onChange = jest.fn();

  try {
    const view = render(<OTPInput value="" onChange={onChange} />);
    const input = view.getByLabelText('Enter 6-digit code');

    expect(input.getAttribute('style')).toEqual(expect.stringContaining('width: 100%'));
    expect(input.getAttribute('style')).toEqual(expect.stringContaining('height: 100%'));
    expect(input.getAttribute('style')).toEqual(expect.stringContaining('opacity: 0.01'));
    fireEvent.change(input, { target: { value: '12a34567' } });
    expect(onChange).toHaveBeenCalledWith('123456');
  } finally {
    Platform.OS = originalPlatform;
  }
});
