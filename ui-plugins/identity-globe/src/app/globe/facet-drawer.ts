import { Component, computed, input, output, signal, inject } from '@angular/core';
import { IdentityGlobeSettingsService } from './identity-globe-settings.service';

import type { FacetOption, FacetOptions, FacetSelection } from './models';

export type FacetGroup = string;

export interface FacetToggle {
  readonly group: FacetGroup;
  readonly value: string;
  readonly checked: boolean;
}

@Component({
  selector: 'app-facet-drawer',
  templateUrl: './facet-drawer.html',
  styleUrl: './facet-drawer.scss',
})
export class FacetDrawer {
  private readonly settingsService = inject(IdentityGlobeSettingsService);

  readonly options = input.required<FacetOptions>();
  readonly selection = input.required<FacetSelection>();
  readonly toggleFacet = output<FacetToggle>();
  readonly clear = output<void>();
  readonly close = output<void>();
  protected readonly expandedGroup = signal<FacetGroup | null>(null);

  protected readonly groups = computed<
    readonly { key: FacetGroup; label: string; options: readonly FacetOption[] }[]
  >(() => {
    const settings = this.settingsService.settings();
    const opts = this.options();
    return settings.facets.map((facet) => ({
      key: facet.selectionKey,
      label: facet.label,
      options: opts[facet.selectionKey] || [],
    }));
  });

  protected hasSelection = computed(() =>
    Object.values(this.selection()).some((values) => values?.length > 0),
  );

  protected isChecked(group: FacetGroup, value: string): boolean {
    return this.selection()[group]?.includes(value) ?? false;
  }

  protected onToggle(group: FacetGroup, value: string, event: Event): void {
    this.toggleFacet.emit({
      group,
      value,
      checked: (event.currentTarget as HTMLInputElement).checked,
    });
  }

  protected toggleGroup(event: Event, group: FacetGroup): void {
    event.preventDefault();
    this.expandedGroup.update((current) => (current === group ? null : group));
  }
}
