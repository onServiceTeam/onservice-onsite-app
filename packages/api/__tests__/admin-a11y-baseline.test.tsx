/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

// Pattern baseline: validates the canonical a11y patterns the Phase 13
// Dispatch F sweep applied across admin pages (filter rows, icon-only
// buttons, modal forms, checkboxes). Full-page a11y assertion requires
// router/query-client/auth context; that is deferred to Phase 14 Playwright
// e2e per LAUNCH-LIMITATIONS.md section 18.

describe('admin a11y baseline (canonical patterns)', () => {
  it('filter row pattern: search input + status select with aria-labels', async () => {
    const { container } = render(
      <div>
        <input
          type="text"
          aria-label="Search bookings by ID or city"
          placeholder="Search..."
        />
        <select aria-label="Filter by status">
          <option value="">All</option>
          <option value="pending">Pending</option>
        </select>
      </div>
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('icon-only action button pattern with aria-label', async () => {
    const { container } = render(
      <table>
        <tbody>
          <tr>
            <td>Maria Santos</td>
            <td>
              <button type="button" aria-label="Edit Maria Santos">
                <svg aria-hidden="true" width="16" height="16">
                  <circle cx="8" cy="8" r="4" />
                </svg>
              </button>
              <button type="button" aria-label="Delete Maria Santos">
                <svg aria-hidden="true" width="16" height="16">
                  <rect x="2" y="2" width="12" height="12" />
                </svg>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('modal form pattern: Label htmlFor + Input id', async () => {
    const { container } = render(
      <form>
        <div>
          <label htmlFor="ab-test-name">Test name</label>
          <input id="ab-test-name" type="text" />
        </div>
        <div>
          <label htmlFor="ab-test-desc">Description</label>
          <textarea id="ab-test-desc" />
        </div>
        <div>
          <label htmlFor="ab-test-metric">Target metric</label>
          <select id="ab-test-metric">
            <option value="cr">Conversion rate</option>
          </select>
        </div>
      </form>
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('checkbox with explicit htmlFor/id pairing', async () => {
    const { container } = render(
      <label htmlFor="filter-overdue">
        <input id="filter-overdue" type="checkbox" />
        {' '}Overdue only
      </label>
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
