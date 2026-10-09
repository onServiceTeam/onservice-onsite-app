import React from 'react';
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import DataTable from '../DataTable';

it('Bug UX-894 — a failed data table announces its server error instead of leaving assistive technology in a silent empty table', () => {
  render(
    <DataTable
      columns={[{ key: 'name', header: 'Name', render: (row: { id: string; name: string }) => row.name }]}
      data={[]}
      keyExtractor={(row) => row.id}
      isError
      errorMessage="Support queue unavailable."
    />,
  );

  expect(screen.getByRole('alert')).toHaveTextContent('Support queue unavailable.');
  expect(screen.queryByText('No results found.')).toBeNull();
});
