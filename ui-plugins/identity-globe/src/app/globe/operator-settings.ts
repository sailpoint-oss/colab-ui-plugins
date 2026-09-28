export interface FacetConfig {
  /** Unique key used in client-side selection state (e.g. 'countries'). */
  readonly selectionKey: string;
  /** Search attribute name (e.g. 'country' for attributes.country). */
  readonly attribute: string;
  /** Display label for the facet group, taken from the attribute display name. */
  readonly label: string;
  /**
   * When true, identities with a blank value are left out of this filter.
   * Kept for the default country facet; the settings screen does not expose it.
   */
  readonly omitUnknown?: boolean;
}

export interface OperatorSettings {
  readonly schemaVersion: 1;
  /** Search attribute name for the identity's city (e.g. 'city'). */
  readonly locationAttribute: string;
  /** Search attribute name for the pie chart breakdown (e.g. 'department'). */
  readonly breakdownAttribute: string;
  /** Facets to display in the drawer. */
  readonly facets: readonly FacetConfig[];
}

export const DEFAULT_OPERATOR_SETTINGS: OperatorSettings = {
  schemaVersion: 1,
  locationAttribute: 'city',
  breakdownAttribute: 'department',
  facets: [
    { selectionKey: 'countries', attribute: 'country', label: 'Country', omitUnknown: true },
    { selectionKey: 'departments', attribute: 'department', label: 'Department' },
    { selectionKey: 'titles', attribute: 'title', label: 'Job title' },
  ],
};

export interface IdentityAttributeChoice {
  readonly name: string;
  readonly label: string;
}

export function identityAttributeChoices(
  attributes: readonly { name?: string; displayName?: string | null }[],
): IdentityAttributeChoice[] {
  return attributes
    .filter((attribute): attribute is { name: string; displayName?: string | null } =>
      typeof attribute.name === 'string' && attribute.name.trim().length > 0,
    )
    .map((attribute) => ({
      name: attribute.name,
      label: attribute.displayName?.trim() || attribute.name,
    }));
}

/**
 * Defaults for a tenant that already defines every attribute the globe starts
 * with. Labels come from the tenant's display names. Returns null when any
 * default attribute is missing.
 */
export function settingsForDefaultAttributes(
  catalog: readonly IdentityAttributeChoice[],
): OperatorSettings | null {
  const labels = new Map(catalog.map((choice) => [choice.name, choice.label]));
  const required = [
    DEFAULT_OPERATOR_SETTINGS.locationAttribute,
    DEFAULT_OPERATOR_SETTINGS.breakdownAttribute,
    ...DEFAULT_OPERATOR_SETTINGS.facets.map((facet) => facet.attribute),
  ];
  if (required.some((name) => !labels.has(name))) {
    return null;
  }

  return {
    schemaVersion: 1,
    locationAttribute: DEFAULT_OPERATOR_SETTINGS.locationAttribute,
    breakdownAttribute: DEFAULT_OPERATOR_SETTINGS.breakdownAttribute,
    facets: DEFAULT_OPERATOR_SETTINGS.facets.map((facet) => ({
      selectionKey: facet.attribute,
      attribute: facet.attribute,
      label: labels.get(facet.attribute) ?? facet.label,
      omitUnknown: facet.omitUnknown ?? false,
    })),
  };
}

export type OperatorSettingsResult =
  | { readonly ok: true; readonly config: OperatorSettings }
  | { readonly ok: false; readonly errors: readonly string[] };

export function parseOperatorSettingsText(text: string): OperatorSettingsResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['operator settings is not valid JSON'] };
  }
  return parseOperatorSettings(raw);
}

export function parseOperatorSettings(raw: unknown): OperatorSettingsResult {
  const errors: string[] = [];
  const root = asRecord(raw);
  if (!root) {
    return { ok: false, errors: ['operator settings must be a JSON object'] };
  }

  if (root['schemaVersion'] !== 1) {
    return { ok: false, errors: ['operator settings schemaVersion must be 1'] };
  }

  const locationAttribute = readString(root, 'locationAttribute', 'locationAttribute', errors);
  const breakdownAttribute = readString(root, 'breakdownAttribute', 'breakdownAttribute', errors);
  const facets = readFacets(root, 'facets', errors);

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    config: {
      schemaVersion: 1,
      locationAttribute,
      breakdownAttribute,
      facets,
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readString(source: Record<string, unknown>, key: string, path: string, errors: string[]): string {
  const value = source[key];
  if (typeof value !== 'string' || !value.trim()) {
    errors.push(`${path} must be a non-empty string`);
    return '';
  }
  return value.trim();
}

function readFacets(source: Record<string, unknown>, key: string, errors: string[]): FacetConfig[] {
  const value = source[key];
  if (!Array.isArray(value)) {
    errors.push(`${key} must be an array of facet configurations`);
    return [];
  }

  const facets: FacetConfig[] = [];
  const seenKeys = new Set<string>();

  for (let i = 0; i < value.length; i++) {
    const item = asRecord(value[i]);
    const path = `${key}[${i}]`;
    if (!item) {
      errors.push(`${path} must be an object`);
      continue;
    }

    const selectionKey = readString(item, 'selectionKey', `${path}.selectionKey`, errors);
    const attribute = readString(item, 'attribute', `${path}.attribute`, errors);
    const label = readString(item, 'label', `${path}.label`, errors);
    
    let omitUnknown = false;
    if (item['omitUnknown'] !== undefined) {
      if (typeof item['omitUnknown'] !== 'boolean') {
        errors.push(`${path}.omitUnknown must be a boolean`);
      } else {
        omitUnknown = item['omitUnknown'];
      }
    }

    if (selectionKey) {
      if (seenKeys.has(selectionKey)) {
        errors.push(`${path} has duplicate selectionKey '${selectionKey}'`);
      } else {
        seenKeys.add(selectionKey);
      }
    }

    facets.push({ selectionKey, attribute, label, omitUnknown });
  }

  return facets;
}

export function searchFieldName(attr: string): string {
  return `attributes.${attr}`;
}
