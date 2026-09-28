import { TestBed } from '@angular/core/testing';
import { Configuration } from '@sailpoint/api-client/configuration';
import { TenantApi } from '@sailpoint/api-client/tenant/api';
import type {
  PluginContext,
  SailPointPluginSDK,
  UserCapabilities,
} from '@sailpoint/ui-plugin-sdk';
import { firstValueFrom } from 'rxjs';

import { SailpointApiService } from './sailpoint-api.service';
import { SailpointPluginService } from './sailpoint-plugin.service';

const SINGLETON_KEY = Symbol.for('@sailpoint/ui-plugin-sdk#singleton');
const CONFIG_SINGLETON_KEY = Symbol.for(
  '@sailpoint/ui-plugin-sdk#api-configuration',
);

const CAPABILITIES: UserCapabilities = {
  isOrgAdmin: false,
  isHelpdesk: false,
  isDashboard: false,
  isCertAdmin: false,
  isReportAdmin: false,
  isSourceAdmin: false,
  isSourceSubadmin: false,
  isRoleAdmin: false,
  isRoleSubadmin: false,
  isCloudGovAdmin: false,
  isCloudGovUser: false,
  isSaasManagementAdmin: false,
  isSaasManagementReader: false,
};

const CONTEXT: PluginContext = {
  tenant: {
    id: 't1',
    scriptName: 'acme',
    org: 'acme',
    name: 'Acme',
    pod: 'useast1',
    region: 'us-east-1',
    apiUrl: { idn: 'https://acme.api.identitynow.com' },
    products: [],
  },
  user: {
    id: 'u1',
    displayName: 'Test User',
    email: 'test@example.com',
    capabilities: CAPABILITIES,
  },
  page: { route: 'https://acme.identitynow.com/plugins/example' },
  slot: {},
  pluginConfiguration: { pluginId: 'plugin-1' },
};

function makeSdk(): SailPointPluginSDK {
  return { api: {} } as unknown as SailPointPluginSDK;
}

describe('SailpointApiService', () => {
  afterEach(() => {
    delete (globalThis as Record<symbol, unknown>)[SINGLETON_KEY];
    delete (globalThis as Record<symbol, unknown>)[CONFIG_SINGLETON_KEY];
    vi.restoreAllMocks();
  });

  function seedPlugin(context: Promise<PluginContext>): SailpointPluginService {
    (globalThis as Record<symbol, unknown>)[SINGLETON_KEY] = {
      sdk: makeSdk(),
      context,
    };
    return TestBed.inject(SailpointPluginService);
  }

  it('reports apiReady from plugin handshake status', async () => {
    seedPlugin(new Promise<PluginContext>(() => {}));
    const api = TestBed.inject(SailpointApiService);
    expect(api.apiReady()).toBe(false);
  });

  it('autoconfigures once and returns TenantApi after handshake', async () => {
    const plugin = seedPlugin(Promise.resolve(CONTEXT));
    const autoconfigure = vi
      .spyOn(Configuration, 'autoconfigure')
      .mockResolvedValue({} as Configuration);

    const api = TestBed.inject(SailpointApiService);
    await plugin.whenReady();

    const tenantApi = await api.getApi(TenantApi);
    expect(tenantApi).toBeInstanceOf(TenantApi);
    expect(autoconfigure).toHaveBeenCalledTimes(1);

    await api.getApi(TenantApi);
    expect(autoconfigure).toHaveBeenCalledTimes(1);
  });

  it('rejects when the handshake did not complete', async () => {
    seedPlugin(Promise.reject(new Error('handshake failed')));
    const api = TestBed.inject(SailpointApiService);

    await expect(api.getConfiguration()).rejects.toThrow(/not available/i);
  });

  it('getApi$ emits TenantApi after handshake', async () => {
    const plugin = seedPlugin(Promise.resolve(CONTEXT));
    vi.spyOn(Configuration, 'autoconfigure').mockResolvedValue(
      {} as Configuration,
    );

    const api = TestBed.inject(SailpointApiService);
    await plugin.whenReady();

    const tenantApi = await firstValueFrom(api.getApi$(TenantApi));
    expect(tenantApi).toBeInstanceOf(TenantApi);
  });
});
