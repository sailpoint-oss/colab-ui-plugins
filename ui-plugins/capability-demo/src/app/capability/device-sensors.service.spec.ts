import { TestBed } from '@angular/core/testing';

import { DeviceSensorService } from './device-sensors.service';

describe('DeviceSensorService', () => {
  let addSpy: ReturnType<typeof vi.spyOn>;
  let removeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    addSpy = vi.spyOn(window, 'addEventListener');
    removeSpy = vi.spyOn(window, 'removeEventListener');
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('does not double-subscribe when start is called twice', async () => {
    const service = TestBed.inject(DeviceSensorService);
    await service.start();
    await service.start();

    const orientationAdds = addSpy.mock.calls.filter((call: unknown[]) => call[0] === 'deviceorientation');
    expect(orientationAdds).toHaveLength(1);

    service.stop();
    expect(removeSpy).not.toHaveBeenCalled();
    service.stop();
    const orientationRemoves = removeSpy.mock.calls.filter((call: unknown[]) => call[0] === 'deviceorientation');
    expect(orientationRemoves).toHaveLength(1);
  });
});
