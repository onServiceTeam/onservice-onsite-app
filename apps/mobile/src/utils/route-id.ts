const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function routeParamValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function canonicalRouteUuid(value: unknown): string {
  const candidate = routeParamValue(value);
  return UUID_REGEX.test(candidate) ? candidate.toLowerCase() : '';
}
