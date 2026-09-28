import { Injectable, signal } from '@angular/core';

import {
  DEFAULT_VIEW_SETTINGS,
  parseViewSettings,
  type ViewSettings,
} from './view-settings';

export const VIEW_SETTINGS_STORAGE_KEY = 'identity-globe.viewSettings';

@Injectable({ providedIn: 'root' })
export class ViewSettingsService {
  private readonly _settings = signal<ViewSettings>(this.read());

  readonly settings = this._settings.asReadonly();

  patch(partial: Partial<ViewSettings>): void {
    const current = this._settings();
    const next: ViewSettings = { ...current, ...partial };
    if (
      next.rotate === current.rotate &&
      next.arcs === current.arcs &&
      next.clouds === current.clouds &&
      next.dayNight === current.dayNight &&
      next.moon === current.moon
    ) {
      return;
    }

    this._settings.set(next);
    localStorage.setItem(VIEW_SETTINGS_STORAGE_KEY, JSON.stringify(next));
  }

  clear(): void {
    localStorage.removeItem(VIEW_SETTINGS_STORAGE_KEY);
    this._settings.set(DEFAULT_VIEW_SETTINGS);
  }

  private read(): ViewSettings {
    const stored = localStorage.getItem(VIEW_SETTINGS_STORAGE_KEY);
    if (!stored) {
      return DEFAULT_VIEW_SETTINGS;
    }

    try {
      const parsed = parseViewSettings(JSON.parse(stored));
      if (parsed) {
        return parsed;
      }
    } catch {
      // Fall through and drop the unreadable value.
    }

    console.warn('Identity Globe display settings are invalid, reverting to defaults.');
    localStorage.removeItem(VIEW_SETTINGS_STORAGE_KEY);
    return DEFAULT_VIEW_SETTINGS;
  }
}
