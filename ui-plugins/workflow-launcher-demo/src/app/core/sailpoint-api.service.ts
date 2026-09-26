import { computed, inject, Injectable } from '@angular/core';
import { Configuration } from '@sailpoint/api-client/configuration';
import { defer, type Observable } from 'rxjs';

import { SailpointPluginService } from './sailpoint-plugin.service';

const API_UNAVAILABLE =
  'SailPoint API client is not available until the App Shell handshake completes. Open the plugin in SailPoint Identity Security with ?spPluginDev=<alias>.';

/** Constructor for a partition API class from @sailpoint/api-client. */
export type SailPointApiConstructor<T> = new (
  configuration: Configuration,
) => T;

const CONFIG_SINGLETON_KEY = Symbol.for(
  '@sailpoint/ui-plugin-sdk#api-configuration',
);

type GlobalWithConfig = typeof globalThis & {
  [CONFIG_SINGLETON_KEY]?: Promise<Configuration>;
};

/**
 * Handshake-aware access to @sailpoint/api-client. Owns one shared
 * {@link Configuration} (via {@link Configuration.autoconfigure}) and factories
 * for typed partition API classes.
 *
 * Inject this service for typed REST calls. Use {@link SailpointPluginService}
 * for COIP context and simple get()/post() helpers.
 */
@Injectable({ providedIn: 'root' })
export class SailpointApiService {
  private readonly plugin = inject(SailpointPluginService);

  /** True when the App Shell handshake finished and typed API calls may run. */
  readonly apiReady = computed(() => this.plugin.status() === 'ready');

  /**
   * Shared Configuration wired to window.sailpointConfig (registered by the UI
   * Plugin SDK after handshake). Cached on globalThis so dev-server HMR does not
   * autoconfigure again on every module reload.
   */
  getConfiguration(): Promise<Configuration> {
    const globalRef = globalThis as GlobalWithConfig;
    const existing = globalRef[CONFIG_SINGLETON_KEY];
    if (existing) {
      return existing;
    }

    const promise = this.loadConfiguration();
    globalRef[CONFIG_SINGLETON_KEY] = promise;
    return promise;
  }

  /** Construct any partition API class after autoconfigure.
   *
   * Use this when you prefer `async`/`await` or Promise-based control flow (for
   * example event handlers, `resource()` loaders, or sequential call chains).
   * Waits for the App Shell handshake, autoconfigures once, then returns a new
   * partition client instance. Individual SDK methods still return Promises;
   * this method only resolves the client itself.
   *
   * Import API classes from a partition sub-path (for example
   * `@sailpoint/api-client/tenant/api`) to keep bundles smaller than a root import.
   *
   * @param ApiClass - Constructor for a partition API from `@sailpoint/api-client`.
   * @returns A Promise that resolves to a configured partition client.
   * @throws When the handshake did not complete (plugin opened outside SailPoint
   * Identity Security).
   *
   * @example
   * ```typescript
   * import { inject } from '@angular/core';
   * import { SailpointApiService } from '@core';
   * import { TenantApi } from '@sailpoint/api-client/tenant/api';
   *
   * const api = inject(SailpointApiService);
   *
   * try {
   *   const tenantApi = await api.getApi(TenantApi);
   *   const response = await tenantApi.getTenantV1();
   *   console.log(response.data);
   * } catch (err) {
   *   console.error(err);
   * }
   * ```
   */
  async getApi<T>(ApiClass: SailPointApiConstructor<T>): Promise<T> {
    const config = await this.getConfiguration();
    return new ApiClass(config);
  }

  /** Observable factory for any partition API class after autoconfigure.
   *
   * Use this when you prefer RxJS pipelines (`pipe`, `switchMap`, `catchError`,
   * etc.). Each subscription waits for the handshake and autoconfigures once,
   * then emits a single configured partition client. The stream completes after
   * that emission unless the underlying Promise rejects.
   *
   * This does not convert individual SDK methods to Observables. Wrap endpoint
   * calls with `from()` inside `switchMap` (or similar) when you need the HTTP
   * response as part of an Observable chain.
   *
   * @param ApiClass - Constructor for a partition API from `@sailpoint/api-client`.
   * @returns An Observable that emits one configured partition client, then completes.
   * Errors (including a failed handshake) propagate on the Observable error channel.
   *
   * @example
   * ```typescript
   * import { inject } from '@angular/core';
   * import { EMPTY, from } from 'rxjs';
   * import { switchMap, catchError } from 'rxjs/operators';
   * import { SailpointApiService } from '@core';
   * import { TenantApi } from '@sailpoint/api-client/tenant/api';
   *
   * const api = inject(SailpointApiService);
   *
   * api.getApi$(TenantApi).pipe(
   *   switchMap(tenantApi => from(tenantApi.getTenantV1())),
   *   catchError(err => {
   *     console.error(err);
   *     return EMPTY;
   *   }),
   * ).subscribe(response => {
   *   console.log(response.data);
   * });
   * ```
   */
  getApi$<T>(ApiClass: SailPointApiConstructor<T>): Observable<T> {
    return defer(() => this.getApi(ApiClass));
  }

  private async loadConfiguration(): Promise<Configuration> {
    try {
      await this.plugin.whenReady();
    } catch {
      throw new Error(API_UNAVAILABLE);
    }

    if (this.plugin.status() !== 'ready') {
      throw new Error(API_UNAVAILABLE);
    }

    return Configuration.autoconfigure();
  }
}
