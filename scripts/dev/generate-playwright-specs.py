#!/usr/bin/env python
"""
Phase 14 Remediation #4 — Generate scaffolded Playwright spec files.

Reads scripts/dev/.admin-pages-list.txt (one page path per line) and emits
one apps/admin/tests/visual/<page-slug>.spec.ts per page.

Each spec scaffolds the 4-state (loading/empty/error/success) capture
pattern at 3 viewport widths (1280, 1440, 1920) per Design Contract V2.

See .ai-coder/handoff/F4-playwright-baseline-capture.md for the full
operator runbook.
"""

import os
import re

SPEC_TEMPLATE = '''// Phase 14 Remediation #4 — visual baseline spec for {page_name}
// Page: {page_path}
//
// Captures 4 states (loading, empty, error, success) at 3 viewport
// widths (1280, 1440, 1920). Operator runs
//   pnpm exec playwright test tests/visual/{slug}.spec.ts --update-snapshots
// from apps/admin/ to capture baselines into apps/admin/tests/visual/baselines/.

import {{ test, expect }} from '@playwright/test';

const ROUTE = '{route}';

test.describe('{page_name}', () => {{
  for (const width of [1280, 1440, 1920]) {{
    test.describe(`@${{width}}`, () => {{
      test.use({{ viewport: {{ width, height: 800 }} }});

      test('default render', async ({{ page }}) => {{
        await page.goto(ROUTE);
        await expect(page).toHaveScreenshot(`{slug}-default-${{width}}.png`, {{
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        }});
      }});

      test('loading state', async ({{ page }}) => {{
        // Stall every admin API call so skeleton renders.
        await page.route('**/api/v1/admin/**', (route) => {{
          setTimeout(() => route.continue(), 5000);
        }});
        await page.goto(ROUTE);
        // Operator wires the right test-id selector when the screen's
        // skeleton mounts. Default to a forgiving locator that should
        // match the canonical Skeleton component.
        await expect(page.locator('[data-testid="skeleton"], .skeleton').first()).toBeVisible({{
          timeout: 2000,
        }}).catch(() => {{}});
        await expect(page).toHaveScreenshot(`{slug}-loading-${{width}}.png`, {{
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        }});
      }});

      test('empty state', async ({{ page }}) => {{
        // Force every admin GET to return an empty list so EmptyState renders.
        await page.route('**/api/v1/admin/**', (route) => {{
          if (route.request().method() === 'GET') {{
            route.fulfill({{
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({{ data: [], pagination: {{ total: 0, page: 1 }} }}),
            }});
          }} else {{
            route.continue();
          }}
        }});
        await page.goto(ROUTE);
        await expect(page).toHaveScreenshot(`{slug}-empty-${{width}}.png`, {{
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        }});
      }});

      test('error state', async ({{ page }}) => {{
        // 500 on every admin GET so ErrorState renders.
        await page.route('**/api/v1/admin/**', (route) => {{
          if (route.request().method() === 'GET') {{
            route.fulfill({{
              status: 500,
              contentType: 'application/json',
              body: JSON.stringify({{ error: {{ message: 'server_error' }} }}),
            }});
          }} else {{
            route.continue();
          }}
        }});
        await page.goto(ROUTE);
        await expect(page).toHaveScreenshot(`{slug}-error-${{width}}.png`, {{
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        }});
      }});
    }});
  }}
}});
'''

# Map admin page filename to canonical route. Fallback: convert
# CamelCase → kebab-case + lowercase.
EXPLICIT_ROUTES = {
    "DashboardPage": "/dashboard",
    "LoginPage": "/login",
    "ProvidersPage": "/providers",
    "ProviderDetailPage": "/providers/PV-0001",
    "CustomersPage": "/customers",
    "CustomerDetailPage": "/customers/CU-0001",
    "BookingsPage": "/bookings",
    "BookingDetailPage": "/bookings/BK-0001",
    "DisputesPage": "/disputes",
    "DisputeDetailPage": "/disputes/DSP-0001",
    "FinancialPage": "/financial",
    "PayoutsPage": "/payouts",
    "PromotionsPage": "/promotions",
    "MarketingPage": "/marketing",
    "AnalyticsPage": "/analytics",
    "ReportsPage": "/reports",
    "SettingsPage": "/settings",
    "AdminUsersPage": "/admin-users",
    "AuditLogPage": "/audit-log",
    "BreachLogPage": "/breach-log",
    "ConsentRecordsPage": "/consent-records",
    "DataSubjectRequestsPage": "/data-subject-requests",
    "DispatchConsolePage": "/dispatch-console",
    "ServiceCatalogPage": "/service-catalog",
    "ServiceAreasPage": "/service-areas",
    "TierProgressionPage": "/tier-progression",
    "WaitlistPage": "/waitlist",
    "BusinessAccountsPage": "/business-accounts",
    "ProviderApplicationsPage": "/provider-applications",
}


def slug(page_name):
    s = re.sub(r"Page$", "", page_name)
    s = re.sub(r"(?<!^)(?=[A-Z])", "-", s).lower()
    return s


def main():
    with open("scripts/dev/.admin-pages-list.txt") as f:
        pages = [line.strip() for line in f if line.strip()]

    os.makedirs("apps/admin/tests/visual", exist_ok=True)

    n = 0
    for path in pages:
        page_name = os.path.basename(path).replace(".tsx", "")
        route = EXPLICIT_ROUTES.get(page_name)
        if not route:
            route = "/" + slug(page_name)
        s = slug(page_name)
        out_path = f"apps/admin/tests/visual/{s}.spec.ts"
        content = SPEC_TEMPLATE.format(
            page_name=page_name,
            page_path=path,
            slug=s,
            route=route,
        )
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(content)
        n += 1

    print(f"wrote {n} Playwright spec files")


if __name__ == "__main__":
    main()
