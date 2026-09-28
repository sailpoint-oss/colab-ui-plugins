import { buildIdentitySearchQuery, buildIdentitySearchUrl } from './search-link';
import { DEFAULT_OPERATOR_SETTINGS } from './operator-settings';

const SELECTION = {
  countries: ['USA'],
  departments: ['Engineering'],
  titles: ['Senior Software Engineer'],
};

describe('identity Search links', () => {
  it('builds location plus active facet clauses in the product query dialect', () => {
    expect(buildIdentitySearchQuery(['Austin, TX, USA'], SELECTION, DEFAULT_OPERATOR_SETTINGS)).toBe(
      'attributes.city: "Austin, TX, USA" AND attributes.country: "USA" AND ' +
        'attributes.department: "Engineering" AND attributes.title: "Senior Software Engineer"',
    );
  });

  it('groups multiple raw locations and lets a department link override that facet', () => {
    expect(
      buildIdentitySearchQuery(
        ['London, England, United Kingdom', 'London, UK'],
        { ...SELECTION, departments: ['Engineering', 'Sales'] },
        DEFAULT_OPERATOR_SETTINGS,
        { department: ['Finance'] },
      ),
    ).toBe(
      '(attributes.city: "London, England, United Kingdom" OR attributes.city: "London, UK") ' +
        'AND attributes.country: "USA" AND attributes.department: "Finance" AND ' +
        'attributes.title: "Senior Software Engineer"',
    );
  });

  it('escapes quotes and backslashes inside untrusted attribute values', () => {
    expect(
      buildIdentitySearchQuery(['Office "A" \\ West'], {
        countries: [],
        departments: [],
        titles: [],
      }, DEFAULT_OPERATOR_SETTINGS),
    ).toBe('attributes.city: "Office \\"A\\" \\\\ West"');
  });

  it('uses the host page origin and returns null for invalid context or a pole', () => {
    const query = buildIdentitySearchQuery(['Austin, TX, USA'], {
      countries: [],
      departments: [],
      titles: [],
    }, DEFAULT_OPERATOR_SETTINGS);
    const url = buildIdentitySearchUrl(
      'https://acme.identitynow.com/ui/plugin/example?spPluginDev=identity-globe',
      query,
    );

    expect(new URL(url!).origin).toBe('https://acme.identitynow.com');
    expect(new URL(url!).pathname).toBe('/ui/search');
    expect(new URL(url!).searchParams.get('query')).toBe(query);
    expect(buildIdentitySearchUrl('not a URL', query)).toBeNull();
    expect(buildIdentitySearchQuery([], SELECTION, DEFAULT_OPERATOR_SETTINGS)).toBeNull();
  });
});
