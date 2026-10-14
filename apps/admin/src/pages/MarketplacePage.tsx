/**
 * D38 Milestone 3 (Ken, 2026-10-13): the Marketplace back office at
 * /marketplace (admin and super_admin; dpo is sent to /privacy by the route
 * guard in App.tsx). Ken's notes: "show insights towards anytime there has
 * been a service request where a customer has submitted a request for help
 * and no one responded", so the team can call providers, recruit faster ones
 * or add more.
 *
 * Tabs live in the URL (?tab=waiting|lost|response-times|providers|coverage)
 * so a view can be reloaded or shared; the dashboard card and the alert
 * banner link to ?tab=waiting. Radix renders only the open tab, so only that
 * tab loads. Every tab reads from /api/v1/admin/marketplace-health and has a
 * loading, an empty and an error-with-retry state. Nothing on this page
 * contacts a provider or changes a request; "Call provider" reveals one
 * number through the audit-logged reveal-contact route.
 *
 * Plan: qa-frameworks/human-audit-2026-10-13/design-admin.md section 6.
 */
import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Timer } from '@/components/icons';
import { WaitingNowTab } from '@/components/marketplace/WaitingNowTab';
import { LostOpportunitiesTab } from '@/components/marketplace/LostOpportunitiesTab';
import { ResponseTimesTab } from '@/components/marketplace/ResponseTimesTab';
import { ProvidersResponsivenessTab } from '@/components/marketplace/ProvidersResponsivenessTab';
import { CoverageTab } from '@/components/marketplace/CoverageTab';
import { AlertSoundToggle } from '@/components/marketplace/AlertSoundToggle';

export const MARKETPLACE_TABS = ['waiting', 'lost', 'response-times', 'providers', 'coverage'] as const;
export type MarketplaceTab = typeof MARKETPLACE_TABS[number];

function parseTab(value: string | null): MarketplaceTab {
  return MARKETPLACE_TABS.includes(value as MarketplaceTab) ? (value as MarketplaceTab) : 'waiting';
}

export default function MarketplacePage(): React.ReactElement {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get('tab'));

  const selectTab = (value: string): void => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('tab', parseTab(value));
      return next;
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-text-tertiary)]">Operations</p>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-[var(--color-text)]">
            <Timer size={24} aria-hidden="true" /> Marketplace
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--color-text-secondary)]">
            Quote requests waiting for a provider, requests that were lost, how fast providers answer, and where we need more
            providers. This page only reads: it never contacts a provider or changes a request.
          </p>
        </div>
        <AlertSoundToggle />
      </div>

      <Tabs value={tab} onValueChange={selectTab}>
        <TabsList aria-label="Marketplace views" className="flex h-auto min-h-11 w-full justify-start gap-1 overflow-x-auto rounded-xl p-1">
          <TabsTrigger className="min-h-11 shrink-0" value="waiting">Waiting now</TabsTrigger>
          <TabsTrigger className="min-h-11 shrink-0" value="lost">Lost opportunities</TabsTrigger>
          <TabsTrigger className="min-h-11 shrink-0" value="response-times">Response times</TabsTrigger>
          <TabsTrigger className="min-h-11 shrink-0" value="providers">Providers</TabsTrigger>
          <TabsTrigger className="min-h-11 shrink-0" value="coverage">Coverage</TabsTrigger>
        </TabsList>
        <TabsContent value="waiting" className="mt-4">
          <WaitingNowTab />
        </TabsContent>
        <TabsContent value="lost" className="mt-4">
          <LostOpportunitiesTab />
        </TabsContent>
        <TabsContent value="response-times" className="mt-4">
          <ResponseTimesTab />
        </TabsContent>
        <TabsContent value="providers" className="mt-4">
          <ProvidersResponsivenessTab />
        </TabsContent>
        <TabsContent value="coverage" className="mt-4">
          <CoverageTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
