import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import api from '@/services/api';
import { useOnboardingStore } from '@/stores/onboarding.store';
import { completeApplicationFields, mockDraftSaves, readyApplication } from '../test-support/application-draft-fixture';
import Vetting from '../app/provider-onboarding/vetting';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));

it('Bug UX-1322 — vetting preserves unfinished references in a draft and requires completion or confirmed removal before continuing', async () => {
  const fields = completeApplicationFields();
  fields.vettingAnswers.references.push({ name: 'Second reference in progress', contact: '', relation: 'Supervisor' });
  readyApplication(fields);
  mockDraftSaves();
  render(<Vetting />);
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
  await waitFor(() => expect(screen.getByText('All displayed details are saved as a draft.')).toBeTruthy());
  expect(api.put).toHaveBeenCalledWith('/api/v1/providers/application-draft', expect.objectContaining({ fields: expect.objectContaining({ vettingAnswers: fields.vettingAnswers }) }));
  fireEvent.click(screen.getByRole('button', { name: 'Save & continue' }));
  expect(screen.getByRole('alert').textContent).toContain('reference 2 or remove');
  expect(mockPush).not.toHaveBeenCalled();
  expect(api.put).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Remove reference 2' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByDisplayValue('Second reference in progress')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Remove reference 2' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove reference' }));
  expect(screen.queryByDisplayValue('Second reference in progress')).toBeNull();
  expect(useOnboardingStore.getState().vetting.references).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Save & continue' }));
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/provider-onboarding/documents'));
  expect(useOnboardingStore.getState().vetting.references).toEqual([fields.vettingAnswers.references[0]]);
});
