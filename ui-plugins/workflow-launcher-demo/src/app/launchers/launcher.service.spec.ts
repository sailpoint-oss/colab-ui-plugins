import { TestBed } from '@angular/core/testing';
import type { Launcher } from '@sailpoint/api-client/launchers/api';
import { SailpointApiService } from '@core';

import { LauncherService } from './launcher.service';

function makeLauncher(overrides: Partial<Launcher> = {}): Launcher {
  return {
    id: 'launcher-1',
    created: '2026-09-10T10:00:00Z',
    modified: '2026-09-10T10:00:00Z',
    owner: { type: 'IDENTITY', id: 'identity-1' },
    name: 'UI Plugin Launcher Demo Workflow',
    description: 'Demonstrate triggering a workflow from a UI Plugin.',
    type: 'INTERACTIVE_PROCESS',
    disabled: false,
    config: '{}',
    ...overrides,
  };
}

describe('LauncherService', () => {
  const genericGet = vi.fn();
  const genericPost = vi.fn();
  const requestUse = vi.fn();

  beforeEach(() => {
    genericGet.mockReset();
    genericPost.mockReset();
    requestUse.mockReset();

    TestBed.configureTestingModule({
      providers: [
        {
          provide: SailpointApiService,
          useValue: {
            getConfiguration: () =>
              Promise.resolve({
                axiosInstance: {
                  create: () => ({
                    interceptors: { request: { use: requestUse } },
                    request: vi.fn(),
                  }),
                },
              }),
          },
        },
      ],
    });
  });

  it('lists assigned launchers through genericGet', async () => {
    const items = [
      makeLauncher({ id: 'a', name: 'Alpha' }),
      makeLauncher({ id: 'b', name: 'Beta' }),
    ];
    genericGet.mockResolvedValue({ data: { items } });

    const { DefaultApi } = await import('@sailpoint/api-client/generic/api');
    vi.spyOn(DefaultApi.prototype, 'genericGet').mockImplementation(genericGet);
    vi.spyOn(DefaultApi.prototype, 'genericPost').mockImplementation(
      genericPost,
    );

    const launchers = await TestBed.inject(LauncherService).listLaunchers();

    expect(launchers.map((launcher) => launcher.id)).toEqual(['a', 'b']);
    expect(genericGet).toHaveBeenCalledWith(
      {
        path: 'beta/launchers/my/assigned',
        limit: 100,
        xSailPointExperimental: 'true',
      },
      { params: { sorters: 'name' } },
    );
    expect(requestUse).toHaveBeenCalled();
  });

  it('treats a response with no items as an empty list', async () => {
    genericGet.mockResolvedValue({ data: {} });
    const { DefaultApi } = await import('@sailpoint/api-client/generic/api');
    vi.spyOn(DefaultApi.prototype, 'genericGet').mockImplementation(genericGet);

    await expect(
      TestBed.inject(LauncherService).listLaunchers(),
    ).resolves.toEqual([]);
  });

  it('starts a launcher through genericPost', async () => {
    genericPost.mockResolvedValue({
      data: { interactiveProcessId: '01M28MF4E05GCY7CW20HAAV681' },
    });
    const { DefaultApi } = await import('@sailpoint/api-client/generic/api');
    vi.spyOn(DefaultApi.prototype, 'genericPost').mockImplementation(
      genericPost,
    );

    const processId =
      await TestBed.inject(LauncherService).startLauncher('launcher-1');

    expect(processId).toBe('01M28MF4E05GCY7CW20HAAV681');
    expect(genericPost).toHaveBeenCalledWith({
      path: 'beta/launchers/launcher-1/launch',
      xSailPointExperimental: 'true',
      requestBody: {},
    });
  });
});
