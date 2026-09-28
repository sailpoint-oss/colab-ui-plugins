import { DEFAULT_VIEW_SETTINGS, parseViewSettings } from './view-settings';
import { ViewSettingsService, VIEW_SETTINGS_STORAGE_KEY } from './view-settings.service';

describe('parseViewSettings', () => {
  it('fills missing flags from the defaults', () => {
    expect(parseViewSettings({ rotate: false })).toEqual({
      ...DEFAULT_VIEW_SETTINGS,
      rotate: false,
    });
  });

  it('rejects anything that is not an object', () => {
    expect(parseViewSettings(null)).toBeNull();
    expect(parseViewSettings(['rotate'])).toBeNull();
    expect(parseViewSettings('on')).toBeNull();
  });
});

describe('ViewSettingsService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('loads defaults when storage is empty', () => {
    const service = new ViewSettingsService();
    expect(service.settings()).toEqual(DEFAULT_VIEW_SETTINGS);
  });

  it('saves a toggle and reloads it', () => {
    const service = new ViewSettingsService();
    service.patch({ clouds: true, dayNight: true });

    expect(JSON.parse(localStorage.getItem(VIEW_SETTINGS_STORAGE_KEY) ?? '')).toMatchObject({
      clouds: true,
      dayNight: true,
      rotate: true,
    });
    expect(new ViewSettingsService().settings().clouds).toBe(true);
  });

  it('ignores a patch that does not change anything', () => {
    const service = new ViewSettingsService();
    service.patch({ rotate: true });
    expect(localStorage.getItem(VIEW_SETTINGS_STORAGE_KEY)).toBeNull();
  });

  it('clears saved toggles back to the defaults', () => {
    const service = new ViewSettingsService();
    service.patch({ rotate: false, arcs: false });

    service.clear();

    expect(localStorage.getItem(VIEW_SETTINGS_STORAGE_KEY)).toBeNull();
    expect(service.settings()).toEqual(DEFAULT_VIEW_SETTINGS);
  });

  it('drops unreadable storage', () => {
    localStorage.setItem(VIEW_SETTINGS_STORAGE_KEY, '{');
    const service = new ViewSettingsService();
    expect(service.settings()).toEqual(DEFAULT_VIEW_SETTINGS);
    expect(localStorage.getItem(VIEW_SETTINGS_STORAGE_KEY)).toBeNull();
  });
});
