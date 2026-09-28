import { inject, Injectable } from '@angular/core';
import { DefaultApi } from '@sailpoint/api-client/generic/api';
import type { Launcher } from '@sailpoint/api-client/launchers/api';
import { SailpointApiService } from '@core';

/**
 * Launchpad lists a user's launchers with `GET /beta/launchers/my/assigned` and
 * starts one with `POST /beta/launchers/{id}/launch`. `LaunchersApi` has no
 * `my/assigned` method, so this uses the api-client Generic partition
 * (`DefaultApi.genericGet` / `genericPost`), which also sends
 * `X-SailPoint-Experimental`.
 *
 * genericGet/genericPost `encodeURIComponent` the whole path, so slashes become
 * `%2F`. A request interceptor on this service's axios client turns those back
 * into path separators so the call matches Launchpad.
 */
const EXPERIMENTAL = 'true';

interface AssignedLaunchersResponse {
  items?: Launcher[];
}

interface LaunchResponse {
  interactiveProcessId?: string;
}

@Injectable({ providedIn: 'root' })
export class LauncherService {
  private readonly api = inject(SailpointApiService);

  /** Launchers assigned to the signed-in user, in the order Launchpad uses. */
  async listLaunchers(): Promise<Launcher[]> {
    const genericApi = await this.genericApi();
    const response = await genericApi.genericGet(
      {
        path: 'beta/launchers/my/assigned',
        limit: 100,
        xSailPointExperimental: EXPERIMENTAL,
      },
      { params: { sorters: 'name' } },
    );
    const data = response.data as AssignedLaunchersResponse;
    return data.items ?? [];
  }

  /**
   * Start a Launcher and return the Interactive Process it created.
   *
   * The workflow runs server-side; the returned ID is the handle the user needs
   * to complete any interactive steps in the Launchpad.
   */
  async startLauncher(launcherId: string): Promise<string> {
    const genericApi = await this.genericApi();
    const response = await genericApi.genericPost({
      path: `beta/launchers/${encodeURIComponent(launcherId)}/launch`,
      xSailPointExperimental: EXPERIMENTAL,
      requestBody: {},
    });
    const data = response.data as LaunchResponse;
    if (!data.interactiveProcessId) {
      throw new Error('Launcher started without an interactive process id.');
    }
    return data.interactiveProcessId;
  }

  private async genericApi(): Promise<DefaultApi> {
    const config = await this.api.getConfiguration();
    const http = config.axiosInstance.create();
    http.interceptors.request.use((request) => {
      if (typeof request.url === 'string') {
        request.url = request.url.replaceAll('%2F', '/');
      }
      return request;
    });
    return new DefaultApi(config, undefined, http);
  }
}
