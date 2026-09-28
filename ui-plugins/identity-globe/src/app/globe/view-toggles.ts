import { Component, inject } from '@angular/core';

import { ViewSettingsService } from './view-settings.service';
import type { ViewSettings } from './view-settings';

interface ViewToggle {
  readonly key: keyof ViewSettings;
  readonly label: string;
  readonly icon: 'rotate' | 'arcs' | 'clouds' | 'dayNight' | 'moon';
}

@Component({
  selector: 'app-view-toggles',
  templateUrl: './view-toggles.html',
  styleUrl: './view-toggles.scss',
})
export class ViewToggles {
  private readonly viewSettings = inject(ViewSettingsService);

  protected readonly settings = this.viewSettings.settings;

  protected readonly toggles: readonly ViewToggle[] = [
    { key: 'rotate', label: 'Rotate', icon: 'rotate' },
    { key: 'arcs', label: 'Arc Lines', icon: 'arcs' },
    { key: 'clouds', label: 'Clouds', icon: 'clouds' },
    { key: 'dayNight', label: 'Day/Night', icon: 'dayNight' },
    { key: 'moon', label: 'Moon', icon: 'moon' },
  ];

  protected label(toggle: ViewToggle): string {
    if (toggle.key === 'clouds' && this.settings().moon) {
      return 'Milkyway';
    }
    return toggle.label;
  }

  protected disabled(key: keyof ViewSettings): boolean {
    return (
      this.settings().moon &&
      key !== 'rotate' &&
      key !== 'arcs' &&
      key !== 'clouds' &&
      key !== 'dayNight' &&
      key !== 'moon'
    );
  }

  protected onToggle(key: keyof ViewSettings): void {
    if (this.disabled(key)) {
      return;
    }
    this.viewSettings.patch({ [key]: !this.settings()[key] });
  }
}
