export interface ServiceScopeCopy {
  text: string;
  isPublished: boolean;
}

/**
 * Customer-safe catalog copy. Legacy production services may not have a
 * description yet, so booking surfaces must never render a blank scope or
 * invent inclusions on the business's behalf.
 */
export function getServiceScopeCopy(
  description: string | null | undefined,
  pricingType?: string | null,
): ServiceScopeCopy {
  const published = description?.trim() ?? '';
  if (published) return { text: published, isPublished: true };

  if (pricingType === 'quote' || pricingType === 'per_unit') {
    return {
      text: 'Describe the work and add photos. Providers will confirm the scope and price in an onService quote before you choose.',
      isPublished: false,
    };
  }

  return {
    text: 'Scope details have not been published yet. Confirm what is included with the provider in onService before work starts.',
    isPublished: false,
  };
}
