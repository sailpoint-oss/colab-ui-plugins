import { Injectable, signal } from '@angular/core';
import {
  DEFAULT_OPERATOR_SETTINGS,
  type OperatorSettings,
  parseOperatorSettingsText,
} from './operator-settings';

export const OPERATOR_SETTINGS_STORAGE_KEY = 'identity-globe.operatorSettings';

@Injectable({ providedIn: 'root' })
export class IdentityGlobeSettingsService {
  private readonly _settings = signal<OperatorSettings>(DEFAULT_OPERATOR_SETTINGS);
  private readonly _configured = signal<boolean>(false);

  readonly settings = this._settings.asReadonly();
  readonly configured = this._configured.asReadonly();

  constructor() {
    this.load();
  }

  load(): void {
    const stored = localStorage.getItem(OPERATOR_SETTINGS_STORAGE_KEY);
    if (!stored) {
      this._settings.set(DEFAULT_OPERATOR_SETTINGS);
      this._configured.set(false);
      return;
    }

    const result = parseOperatorSettingsText(stored);
    if (result.ok) {
      this._settings.set(result.config);
      this._configured.set(true);
    } else {
      console.warn('Identity Globe operator settings are invalid, reverting to defaults.', result.errors);
      this._settings.set(DEFAULT_OPERATOR_SETTINGS);
      this._configured.set(false);
      localStorage.removeItem(OPERATOR_SETTINGS_STORAGE_KEY);
    }
  }

  save(settings: OperatorSettings): void {
    localStorage.setItem(OPERATOR_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    this._settings.set(settings);
    this._configured.set(true);
  }

  clear(): void {
    localStorage.removeItem(OPERATOR_SETTINGS_STORAGE_KEY);
    this._settings.set(DEFAULT_OPERATOR_SETTINGS);
    this._configured.set(false);
  }
}
