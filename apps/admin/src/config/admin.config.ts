/**
 * Admin dashboard configuration — all configurable values.
 * Never hardcode page sizes, defaults, etc. in page components.
 */
export const adminConfig = {
  defaultPageSize: 20,
  maxPageSize: 100,
  defaultServiceAreaRadiusKm: 15,
  defaultMinProvidersToLaunch: 5,
} as const;
