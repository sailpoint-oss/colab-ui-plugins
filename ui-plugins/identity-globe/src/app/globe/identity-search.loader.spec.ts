import { TestBed } from '@angular/core/testing';
import { SearchApi } from '@sailpoint/api-client/search/api';

import { SailpointApiService } from '@core';

import { IdentitySearchLoader } from './identity-search.loader';
import { DEFAULT_OPERATOR_SETTINGS } from './operator-settings';
import type { GazetteerCity } from './models';

const AUSTIN: GazetteerCity = {
  cityNorm: 'austin',
  admin1Norm: 'texas|tx',
  countryNorm: 'united states|usa|us',
  countryCode: 'US',
  displayName: 'Austin',
  lat: 30.2672,
  lng: -97.7431,
  population: 979882,
};

function hit(id: string, department = 'Engineering'): object {
  return {
    id,
    name: `Ignored ${id}`,
    attributes: {
      city: 'Austin, TX, USA',
      department,
      country: 'USA',
      title: 'Software Engineer',
      ignored: '<script>ignored</script>',
    },
  };
}

describe('IdentitySearchLoader', () => {
  it('pages with searchAfter and aggregates before requesting the next page', async () => {
    const firstPage = Array.from({ length: 250 }, (_, index) =>
      hit(`id-${index.toString().padStart(3, '0')}`),
    );
    const searchPostV1 = vi
      .fn()
      .mockResolvedValueOnce({
        data: firstPage,
        headers: { 'x-total-count': '251' },
      })
      .mockResolvedValueOnce({
        data: [hit('id-250', 'Sales')],
        headers: {},
      });
    TestBed.configureTestingModule({
      providers: [
        IdentitySearchLoader,
        {
          provide: SailpointApiService,
          useValue: {
            getApi: vi.fn().mockImplementation((type) => {
              expect(type).toBe(SearchApi);
              return Promise.resolve({ searchPostV1 });
            }),
          },
        },
      ],
    });
    const loader = TestBed.inject(IdentitySearchLoader);

    await loader.start([AUSTIN], DEFAULT_OPERATOR_SETTINGS);

    expect(searchPostV1).toHaveBeenCalledTimes(2);
    expect(searchPostV1.mock.calls[0][0]).toMatchObject({
      limit: 250,
      count: true,
      search: {
        indices: ['identities'],
        query: { query: '*' },
        sort: ['id'],
        queryResultFilter: {
          includes: [
            'id',
            'name',
            'attributes.city',
            'attributes.department',
            'attributes.country',
            'attributes.title',
          ],
        },
      },
    });
    expect(searchPostV1.mock.calls[1][0]).toMatchObject({
      count: false,
      search: { searchAfter: ['id-249'] },
    });
    expect(loader.loadedCount()).toBe(251);
    expect(loader.totalCount()).toBe(251);
    expect(loader.locations()).toEqual([
      expect.objectContaining({
        displayName: 'Austin',
        count: 251,
        breakdown: { Engineering: 250, Sales: 1 },
      }),
    ]);
    expect(loader.facts()).toHaveLength(251);
      expect(loader.facts()[0]).toEqual({
        locationKey: expect.any(String),
        rawLocation: 'Austin, TX, USA',
        breakdown: 'Engineering',
        facets: {
          countries: 'USA',
          departments: 'Engineering',
          titles: 'Software Engineer',
        },
        countryCode: 'US',
      });
  });

  it('keeps the globe dataset unpublished until paging finishes', async () => {
    let releaseSecondPage: (value: { data: object[]; headers: object }) => void = () => undefined;
    const secondPage = new Promise<{ data: object[]; headers: object }>((resolve) => {
      releaseSecondPage = resolve;
    });
    const searchPostV1 = vi
      .fn()
      .mockResolvedValueOnce({
        data: Array.from({ length: 250 }, (_, index) => hit(`id-${index}`)),
        headers: { 'x-total-count': '251' },
      })
      .mockImplementationOnce(() => secondPage);
    TestBed.configureTestingModule({
      providers: [
        IdentitySearchLoader,
        {
          provide: SailpointApiService,
          useValue: { getApi: vi.fn().mockResolvedValue({ searchPostV1 }) },
        },
      ],
    });
    const loader = TestBed.inject(IdentitySearchLoader);

    const pending = loader.start([AUSTIN], DEFAULT_OPERATOR_SETTINGS);
    await vi.waitFor(() => expect(loader.loadedCount()).toBe(250));

    expect(loader.locations()).toEqual([]);
    expect(loader.facts()).toEqual([]);

    releaseSecondPage({ data: [hit('id-250', 'Sales')], headers: {} });
    await pending;

    expect(loader.locations()).toEqual([
      expect.objectContaining({ displayName: 'Austin', count: 251 }),
    ]);
    expect(loader.facts()).toHaveLength(251);
  });

  it('starts over with new settings when started again', async () => {
    const searchPostV1 = vi
      .fn()
      .mockResolvedValueOnce({ data: [hit('id-1')], headers: { 'x-total-count': '1' } })
      .mockResolvedValueOnce({ data: [hit('id-2', 'Sales')], headers: { 'x-total-count': '1' } });
    TestBed.configureTestingModule({
      providers: [
        IdentitySearchLoader,
        {
          provide: SailpointApiService,
          useValue: { getApi: vi.fn().mockResolvedValue({ searchPostV1 }) },
        },
      ],
    });
    const loader = TestBed.inject(IdentitySearchLoader);

    await loader.start([AUSTIN], DEFAULT_OPERATOR_SETTINGS);
    await loader.start([AUSTIN], { ...DEFAULT_OPERATOR_SETTINGS, breakdownAttribute: 'title' });

    expect(searchPostV1).toHaveBeenCalledTimes(2);
    expect(loader.loadedCount()).toBe(1);
    expect(loader.locations()[0]?.breakdown).toEqual({ 'Software Engineer': 1 });
  });

  it('keeps prior aggregates and stops when a later page fails', async () => {
    const searchPostV1 = vi
      .fn()
      .mockResolvedValueOnce({
        data: Array.from({ length: 250 }, (_, index) => hit(`id-${index}`)),
        headers: {},
      })
      .mockRejectedValueOnce(new Error('response body must not be shown'));
    TestBed.configureTestingModule({
      providers: [
        IdentitySearchLoader,
        {
          provide: SailpointApiService,
          useValue: {
            getApi: vi.fn().mockResolvedValue({ searchPostV1 }),
          },
        },
      ],
    });
    const loader = TestBed.inject(IdentitySearchLoader);

    await loader.start([AUSTIN], DEFAULT_OPERATOR_SETTINGS);

    expect(loader.loadedCount()).toBe(250);
    expect(loader.locations()[0]?.count).toBe(250);
    expect(loader.error()).not.toContain('response body');
    expect(searchPostV1).toHaveBeenCalledTimes(2);
  });
});
