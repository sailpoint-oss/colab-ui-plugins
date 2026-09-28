import type { FacetSelection } from './models';
import type { OperatorSettings } from './operator-settings';

export function buildIdentitySearchQuery(
  rawLocations: readonly string[],
  selection: FacetSelection,
  settings: OperatorSettings,
  override: Record<string, readonly string[]> = {},
): string | null {
  const locations = uniqueValues(rawLocations);
  if (locations.length === 0) {
    return null;
  }

  const clauses = [attributeClause(`attributes.${settings.locationAttribute}`, locations)];

  for (const facet of settings.facets) {
    const values = override[facet.attribute] ?? selection[facet.selectionKey] ?? [];
    clauses.push(attributeClause(`attributes.${facet.attribute}`, values));
  }

  // If there's an override for the breakdown attribute that isn't a facet, add it
  const breakdownAttr = settings.breakdownAttribute;
  if (override[breakdownAttr] && !settings.facets.some(f => f.attribute === breakdownAttr)) {
    clauses.push(attributeClause(`attributes.${breakdownAttr}`, override[breakdownAttr]));
  }

  return clauses
    .filter((clause): clause is string => clause !== null)
    .join(' AND ');
}

/** Resolve the host from COIP page context; invalid context produces plain text. */
export function buildIdentitySearchUrl(pageRoute: string | null | undefined, query: string | null): string | null {
  if (!query || !pageRoute) {
    return null;
  }

  try {
    const origin = new URL(pageRoute).origin;
    return `${origin}/ui/search?query=${encodeURIComponent(query)}`;
  } catch {
    return null;
  }
}

function attributeClause(attribute: string, values: readonly string[]): string | null {
  const clauses = uniqueValues(values).map(
    (value) => `${attribute}: "${escapeQueryValue(value)}"`,
  );
  if (clauses.length === 0) {
    return null;
  }
  return clauses.length === 1 ? clauses[0] : `(${clauses.join(' OR ')})`;
}

function uniqueValues(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function escapeQueryValue(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}
