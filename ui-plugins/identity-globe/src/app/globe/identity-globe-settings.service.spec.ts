import { TestBed } from '@angular/core/testing';
import { IdentityGlobeSettingsService, OPERATOR_SETTINGS_STORAGE_KEY } from './identity-globe-settings.service';
import { DEFAULT_OPERATOR_SETTINGS } from './operator-settings';

describe('IdentityGlobeSettingsService', () => {
  let service: IdentityGlobeSettingsService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(IdentityGlobeSettingsService);
  });

  it('loads defaults when storage is empty', () => {
    expect(service.configured()).toBe(false);
    expect(service.settings()).toEqual(DEFAULT_OPERATOR_SETTINGS);
  });

  it('clears saved settings back to unconfigured defaults', () => {
    service.save({ ...DEFAULT_OPERATOR_SETTINGS, locationAttribute: 'customLoc' });

    service.clear();

    expect(localStorage.getItem(OPERATOR_SETTINGS_STORAGE_KEY)).toBeNull();
    expect(service.configured()).toBe(false);
    expect(service.settings()).toEqual(DEFAULT_OPERATOR_SETTINGS);
  });

  it('saves and loads valid settings', () => {
    const custom = {
      ...DEFAULT_OPERATOR_SETTINGS,
      locationAttribute: 'customLoc',
    };
    service.save(custom);
    
    expect(service.configured()).toBe(true);
    expect(service.settings().locationAttribute).toBe('customLoc');
    expect(JSON.parse(localStorage.getItem(OPERATOR_SETTINGS_STORAGE_KEY)!)).toEqual(custom);

    // Create a new instance to test loading from storage
    const service2 = new IdentityGlobeSettingsService();
    expect(service2.configured()).toBe(true);
    expect(service2.settings().locationAttribute).toBe('customLoc');
  });

  it('reverts to defaults and clears storage if stored data is invalid', () => {
    localStorage.setItem(OPERATOR_SETTINGS_STORAGE_KEY, JSON.stringify({ schemaVersion: 999 }));
    
    const service2 = new IdentityGlobeSettingsService();
    expect(service2.configured()).toBe(false);
    expect(service2.settings()).toEqual(DEFAULT_OPERATOR_SETTINGS);
    expect(localStorage.getItem(OPERATOR_SETTINGS_STORAGE_KEY)).toBeNull();
  });
});
