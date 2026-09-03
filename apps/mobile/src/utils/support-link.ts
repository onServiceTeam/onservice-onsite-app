import { canonicalRouteUuid, routeParamValue } from './route-id';

export function supportLinkValue(value: unknown): string {
  return routeParamValue(value);
}

export function canonicalSupportUuid(value: unknown): string {
  return canonicalRouteUuid(value);
}
