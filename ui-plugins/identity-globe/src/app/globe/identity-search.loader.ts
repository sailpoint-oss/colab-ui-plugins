import { Injectable, inject, signal } from '@angular/core';
import {
  Index,
  QueryType,
  SearchApi,
  type Search,
} from '@sailpoint/api-client/search/api';

import { SailpointApiService } from '@core';

import { LocationAggregator } from './location-aggregator';
import { createLocationMatcher } from './location-matcher';
import type {
  GazetteerCity,
  IdentityFact,
  LocationAggregate,
  SearchIdentityHit,
} from './models';
import { OperatorSettings, searchFieldName } from './operator-settings';

const PAGE_SIZE = 250;

@Injectable({ providedIn: 'root' })
export class IdentitySearchLoader {
  private readonly api = inject(SailpointApiService);
  private readonly _locations = signal<readonly LocationAggregate[]>([]);
  private readonly _facts = signal<readonly IdentityFact[]>([]);
  private readonly _loadedCount = signal(0);
  private readonly _totalCount = signal<number | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal('');
  private generation = 0;

  readonly locations = this._locations.asReadonly();
  readonly facts = this._facts.asReadonly();
  readonly loadedCount = this._loadedCount.asReadonly();
  readonly totalCount = this._totalCount.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  async start(cities: readonly GazetteerCity[], settings: OperatorSettings): Promise<void> {
    this.reset();
    const run = this.generation;
    const isCurrent = () => run === this.generation;
    this._loading.set(true);

    const matcher = createLocationMatcher(cities);
    const aggregator = new LocationAggregator(matcher, settings);

    const includes = [
      'id',
      'name',
      searchFieldName(settings.locationAttribute),
      searchFieldName(settings.breakdownAttribute),
      ...settings.facets.map(f => searchFieldName(f.attribute))
    ];
    
    // Deduplicate includes
    const uniqueIncludes = [...new Set(includes)];

    try {
      const searchApi = await this.api.getApi(SearchApi);
      if (!isCurrent()) {
        return;
      }
      let searchAfter: string[] | undefined;
      let firstPage = true;

      while (true) {
        const search = this.createSearch(uniqueIncludes, searchAfter);
        const response = await searchApi.searchPostV1({
          search,
          limit: PAGE_SIZE,
          count: firstPage,
        });
        if (!isCurrent()) {
          return;
        }
        const hits = Array.isArray(response.data) ? response.data : [];

        if (firstPage) {
          this._totalCount.set(this.readTotalCount(response.headers));
        }
        firstPage = false;

        for (const rawHit of hits) {
          const hit = this.toIdentityInput(rawHit);
          if (hit) {
            aggregator.add(hit);
          }
        }

        this._loadedCount.set(aggregator.identityCount);

        if (hits.length < PAGE_SIZE) {
          break;
        }

        const lastId = this.readId(hits[hits.length - 1]);
        if (!lastId) {
          this._error.set(
            'Identity loading stopped because a Search page did not include a paging id.',
          );
          break;
        }
        searchAfter = [lastId];
        await this.yieldToBrowser();
        if (!isCurrent()) {
          return;
        }
      }

      if (isCurrent()) {
        this.publish(aggregator);
      }
    } catch {
      if (isCurrent()) {
        this.publish(aggregator);
        this._error.set(
          'Identity loading stopped after a Search request failed. Already loaded locations remain available.',
        );
      }
    } finally {
      if (isCurrent()) {
        this._loading.set(false);
      }
    }
  }

  /**
   * Hand the finished aggregates to the globe once. Publishing every page
   * rebuilt the full marker set while Search was still paging.
   */
  private publish(aggregator: LocationAggregator): void {
    this._locations.set(aggregator.snapshot());
    this._facts.set(aggregator.factsSnapshot());
    this._loadedCount.set(aggregator.identityCount);
  }

  /** Stop any in-flight load and drop loaded identities. */
  reset(): void {
    this.generation++;
    this._locations.set([]);
    this._facts.set([]);
    this._loadedCount.set(0);
    this._totalCount.set(null);
    this._loading.set(false);
    this._error.set('');
  }

  private createSearch(includes: string[], searchAfter?: string[]): Search {
    return {
      indices: [Index.Identities],
      queryType: QueryType.Sailpoint,
      query: { query: '*' },
      sort: ['id'],
      queryResultFilter: { includes },
      ...(searchAfter ? { searchAfter } : {}),
    };
  }

  private toIdentityInput(rawHit: object): SearchIdentityHit | null {
    if (!this.isRecord(rawHit)) {
      return null;
    }
    const id = this.readId(rawHit);
    if (!id) {
      return null;
    }

    const attributes = this.isRecord(rawHit['attributes'])
      ? rawHit['attributes']
      : null;
    
    // We pass the raw attributes to LocationAggregator, which uses OperatorSettings to extract them.
    return { id, attributes: attributes ?? {} };
  }

  private readId(rawHit: unknown): string | null {
    if (!this.isRecord(rawHit)) {
      return null;
    }
    const id = rawHit['id'];
    return typeof id === 'string' && id.trim() ? id : null;
  }

  private readTotalCount(headers: unknown): number | null {
    if (!this.isRecord(headers)) {
      return null;
    }
    const getter = headers['get'];
    const value =
      typeof getter === 'function'
        ? getter.call(headers, 'x-total-count')
        : headers['x-total-count'] ?? headers['X-Total-Count'];
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const count = Number(value);
    return Number.isSafeInteger(count) && count >= 0 ? count : null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private yieldToBrowser(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }
}
