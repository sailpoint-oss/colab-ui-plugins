import {
  UNKNOWN_BREAKDOWN_LABEL,
  type FacetOption,
  type FacetOptions,
  type FacetSelection,
  type IdentityFact,
  type LocationAggregate,
} from './models';
import { DEFAULT_OPERATOR_SETTINGS } from './operator-settings';

export const EMPTY_FACET_SELECTION: FacetSelection = {};

export function filterFacts(
  facts: readonly IdentityFact[],
  selection: FacetSelection,
  ignoredGroup?: string,
): readonly IdentityFact[] {
  const groups = Object.keys(selection);
  const sets = new Map<string, Set<string>>();
  for (const group of groups) {
    sets.set(group, new Set(selection[group]));
  }

  return facts.filter((fact) => {
    for (const group of groups) {
      if (group === ignoredGroup) {
        continue;
      }
      const selected = sets.get(group)!;
      if (selected.size > 0 && !selected.has(fact.facets[group])) {
        return false;
      }
    }
    return true;
  });
}

/** Build per-city counts and breakdown pies from the current filtered slice. */
export function aggregateFilteredFacts(
  facts: readonly IdentityFact[],
  locationCatalog: readonly LocationAggregate[],
): readonly LocationAggregate[] {
  const locations = new Map(locationCatalog.map((location) => [location.key, location]));
  const buckets = new Map<
    string,
    { count: number; breakdown: Map<string, number>; rawLocations: Set<string> }
  >();

  for (const fact of facts) {
    if (!locations.has(fact.locationKey)) {
      continue;
    }
    const bucket = buckets.get(fact.locationKey) ?? {
      count: 0,
      breakdown: new Map<string, number>(),
      rawLocations: new Set<string>(),
    };
    bucket.count += 1;
    bucket.breakdown.set(
      fact.breakdown,
      (bucket.breakdown.get(fact.breakdown) ?? 0) + 1,
    );
    if (fact.rawLocation) {
      bucket.rawLocations.add(fact.rawLocation);
    }
    buckets.set(fact.locationKey, bucket);
  }

  return [...buckets.entries()]
    .map(([key, bucket]) => {
      const location = locations.get(key)!;
      return {
        ...location,
        count: bucket.count,
        breakdown: Object.fromEntries(
          [...bucket.breakdown.entries()].sort(
            (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
          ),
        ),
        rawLocations: [...bucket.rawLocations].sort(),
      };
    })
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

import { OperatorSettings } from './operator-settings';

/** Amazon-style counts: each group is counted with its own selection ignored. */
export function buildFacetOptions(
  facts: readonly IdentityFact[],
  selection: FacetSelection,
  settings: OperatorSettings,
): FacetOptions {
  const options: FacetOptions = {};
  for (const facet of settings.facets) {
    options[facet.selectionKey] = countOptions(
      facts,
      filterFacts(facts, selection, facet.selectionKey),
      facet.selectionKey,
      facet.omitUnknown,
    );
  }
  return options;
}

function countOptions(
  allFacts: readonly IdentityFact[],
  matchingFacts: readonly IdentityFact[],
  selectionKey: string,
  omitUnknown = false,
): readonly FacetOption[] {
  const labels = new Set(allFacts.map((fact) => fact.facets?.[selectionKey]).filter(Boolean));
  if (omitUnknown) {
    labels.delete(UNKNOWN_BREAKDOWN_LABEL);
  }

  const counts = new Map<string, number>();
  for (const fact of matchingFacts) {
    const val = fact.facets?.[selectionKey];
    if (val) {
      counts.set(val, (counts.get(val) ?? 0) + 1);
    }
  }

  return [...labels]
    .sort((left, right) => left.localeCompare(right))
    .map((label) => ({ label, count: counts.get(label) ?? 0 }));
}
