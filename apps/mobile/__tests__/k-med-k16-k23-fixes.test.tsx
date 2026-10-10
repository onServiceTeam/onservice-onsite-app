// Phase K MED-K16 + K23 - phone input and offline connectivity.
//
// These tests exercise the component and hook at runtime. The connectivity
// probe uses the same NetInfo event surface as the application and verifies
// that the listener is removed when the consuming screen unmounts.

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockNetInfoListener = jest.fn();
const mockNetInfoFetch = jest.fn();
const mockUnsubscribe = jest.fn();
const mockShowToast = jest.fn();
let netInfoListener: ((state: { isInternetReachable: boolean | null }) => void) | undefined;

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: (...args: unknown[]) => mockNetInfoFetch(...args),
    addEventListener: (...args: unknown[]) => mockNetInfoListener(...args),
  },
}));
jest.mock('@/lib/toast', () => ({ showToast: (...args: unknown[]) => mockShowToast(...args) }));

import PhoneInput from '../src/components/PhoneInput';
import { useOffline } from '../src/hooks/useOffline';

function OfflineProbe(): React.ReactElement {
  const isOffline = useOffline();
  return <span>{isOffline ? 'offline' : 'online'}</span>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockNetInfoFetch.mockResolvedValue({ isInternetReachable: true });
  mockNetInfoListener.mockImplementation((listener: (state: { isInternetReachable: boolean | null }) => void) => {
    netInfoListener = listener;
    return mockUnsubscribe;
  });
});

describe('Phase K MED-K16 - Philippine phone input accepts the supported formats', () => {
  it('MED-K16 - a +63 number is accepted by the real input without a validation error', () => {
    const onChange = jest.fn();
    render(<PhoneInput label="Phone number" value="+639171234567" onChange={onChange} errorVisible />);

    expect(screen.queryByText('Please enter a valid Philippine mobile number.')).toBeNull();
    fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '09171234567' } });
    expect(onChange).toHaveBeenCalledWith('09171234567');
    expect(screen.getByLabelText('+63 (Philippines)')).toBeTruthy();
  });

  it('MED-K16 - the real input still reports invalid numbers and normalizes user edits through its callback', () => {
    const onChange = jest.fn();
    render(<PhoneInput label="Phone number" value="5551234567" onChange={onChange} errorVisible />);

    expect(screen.getByText('Please enter a valid Philippine mobile number.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '09171234567' } });
    expect(onChange).toHaveBeenCalledWith('09171234567');
  });
});

describe('Phase K MED-K23 - offline state follows NetInfo events and cleans up', () => {
  it('MED-K23 - initial connectivity and later event transitions reach the rendered consumer', async () => {
    const view = render(<OfflineProbe />);

    await waitFor(() => expect(screen.getByText('online')).toBeTruthy());
    expect(mockNetInfoFetch).toHaveBeenCalledTimes(1);
    expect(mockNetInfoListener).toHaveBeenCalledTimes(1);

    expect(netInfoListener).toBeDefined();
    netInfoListener!({ isInternetReachable: false });
    await waitFor(() => expect(screen.getByText('offline')).toBeTruthy());

    view.unmount();
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });
});
