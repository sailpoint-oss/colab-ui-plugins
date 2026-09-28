import {
  DEFAULT_OPERATOR_SETTINGS,
  identityAttributeChoices,
  parseOperatorSettings,
  parseOperatorSettingsText,
  settingsForDefaultAttributes,
} from './operator-settings';

describe('operator-settings', () => {
  it('parses valid settings', () => {
    const valid = {
      schemaVersion: 1,
      locationAttribute: 'loc',
      breakdownAttribute: 'dept',
      facets: [
        { selectionKey: 'c', attribute: 'c', label: 'C', omitUnknown: true },
        { selectionKey: 'd', attribute: 'd', label: 'D' },
      ],
    };
    const result = parseOperatorSettings(valid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.locationAttribute).toBe('loc');
      expect(result.config.facets.length).toBe(2);
      expect(result.config.facets[0].omitUnknown).toBe(true);
      expect(result.config.facets[1].omitUnknown).toBe(false);
    }
  });

  it('rejects invalid schema version', () => {
    const invalid = { ...DEFAULT_OPERATOR_SETTINGS, schemaVersion: 2 };
    const result = parseOperatorSettings(invalid);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain('operator settings schemaVersion must be 1');
    }
  });

  it('rejects duplicate facet selection keys', () => {
    const invalid = {
      schemaVersion: 1,
      locationAttribute: 'loc',
      breakdownAttribute: 'dept',
      facets: [
        { selectionKey: 'dup', attribute: 'a', label: 'A' },
        { selectionKey: 'dup', attribute: 'b', label: 'B' },
      ],
    };
    const result = parseOperatorSettings(invalid);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("facets[1] has duplicate selectionKey 'dup'");
    }
  });

  it('rejects malformed JSON', () => {
    const result = parseOperatorSettingsText('not json');
    expect(result.ok).toBe(false);
  });

  it('builds default settings from display names when every default attribute exists', () => {
    const settings = settingsForDefaultAttributes(
      identityAttributeChoices([
        { name: 'city', displayName: 'City' },
        { name: 'department', displayName: 'Department' },
        { name: 'country', displayName: 'Countries' },
        { name: 'title', displayName: 'Job Title' },
        { name: 'email', displayName: 'Email' },
      ]),
    );

    expect(settings).toEqual({
      schemaVersion: 1,
      locationAttribute: 'city',
      breakdownAttribute: 'department',
      facets: [
        { selectionKey: 'country', attribute: 'country', label: 'Countries', omitUnknown: true },
        { selectionKey: 'department', attribute: 'department', label: 'Department', omitUnknown: false },
        { selectionKey: 'title', attribute: 'title', label: 'Job Title', omitUnknown: false },
      ],
    });
  });

  it('leaves first-run settings unset when a default attribute is missing', () => {
    const settings = settingsForDefaultAttributes(
      identityAttributeChoices([
        { name: 'city', displayName: 'City' },
        { name: 'department', displayName: 'Department' },
        { name: 'country', displayName: 'Country' },
      ]),
    );

    expect(settings).toBeNull();
  });
});
