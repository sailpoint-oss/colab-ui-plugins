import { Component, inject, output, OnInit, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { IdentityAttributesApi } from '@sailpoint/api-client/identity_attributes/api';

import { SailpointApiService } from '@core';

import { IdentityGlobeSettingsService } from './identity-globe-settings.service';
import {
  identityAttributeChoices,
  type IdentityAttributeChoice,
  type OperatorSettings,
  type FacetConfig,
} from './operator-settings';

export type { IdentityAttributeChoice };

type Confirmation = 'reset' | 'discard';

@Component({
  selector: 'app-operator-settings-panel',
  imports: [ReactiveFormsModule],
  templateUrl: './operator-settings-panel.html',
  styleUrl: './operator-settings-panel.scss',
})
export class OperatorSettingsPanel implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly settingsService = inject(IdentityGlobeSettingsService);
  private readonly sailpointApi = inject(SailpointApiService);

  readonly close = output<void>();
  readonly save = output<void>();
  readonly clear = output<void>();

  readonly catalog = signal<readonly IdentityAttributeChoice[]>([]);
  readonly attributesLoading = signal(true);
  readonly attributesError = signal<string | null>(null);
  readonly confirmation = signal<Confirmation | null>(null);

  form = this.fb.group({
    locationAttribute: ['', Validators.required],
    breakdownAttribute: ['', Validators.required],
    facets: this.fb.array<FormGroup>([]),
  });

  get facets() {
    return this.form.get('facets') as FormArray;
  }

  ngOnInit() {
    this.fillForm(this.settingsService.settings());
    void this.loadAttributes();
  }

  /** Close the panel, asking first when the form differs from the saved settings. */
  requestClose() {
    if (this.confirmation()) {
      this.dismissConfirmation();
      return;
    }
    if (!this.fieldsReady()) {
      return;
    }
    if (this.form.dirty) {
      this.confirmation.set('discard');
      return;
    }
    this.close.emit();
  }

  /** Ask before deleting saved settings and starting over. */
  reset() {
    this.confirmation.set('reset');
  }

  dismissConfirmation() {
    this.confirmation.set(null);
  }

  confirmPending() {
    const pending = this.confirmation();
    this.confirmation.set(null);
    if (pending === 'reset') {
      this.clear.emit();
    } else if (pending === 'discard') {
      this.close.emit();
    }
  }

  /**
   * Tenant attributes. A failed list keeps the current names so the form is
   * still usable. A successful list does not invent options for missing names.
   */
  attributeChoices(): readonly IdentityAttributeChoice[] {
    const byName = new Map(this.catalog().map((choice) => [choice.name, choice]));
    if (this.attributesError()) {
      for (const name of this.selectedNames()) {
        if (name && !byName.has(name)) {
          byName.set(name, { name, label: name });
        }
      }
    }
    return [...byName.values()].sort((left, right) =>
      left.label.localeCompare(right.label, undefined, { sensitivity: 'base' }),
    );
  }

  /**
   * Attributes still available for this filter facet. Each facet keeps its own
   * selection and hides attributes already chosen by the other facets.
   */
  facetAttributeChoices(index: number): readonly IdentityAttributeChoice[] {
    const taken = new Set(
      this.facets.controls.flatMap((control, controlIndex) => {
        if (controlIndex === index) {
          return [];
        }
        const name = String(control.get('attribute')?.value ?? '');
        return name ? [name] : [];
      }),
    );
    return this.attributeChoices().filter((choice) => !taken.has(choice.name));
  }

  /** True when the catalog is loaded and this control has no attribute selected. */
  showMissingAttribute(value: unknown): boolean {
    return !this.attributesLoading() && !this.attributesError() && !value;
  }

  /** Every visible field has an attribute from the tenant list. */
  fieldsReady(): boolean {
    if (this.attributesLoading()) {
      return false;
    }
    if (this.attributesError()) {
      return this.form.valid;
    }
    const names = new Set(this.catalog().map((choice) => choice.name));
    return this.selectedNames().every((name) => names.has(name));
  }

  addFacet(facet?: FacetConfig) {
    const facetGroup = this.fb.group({
      attribute: [facet?.attribute || '', Validators.required],
      omitUnknown: [facet?.omitUnknown || false],
    });
    this.facets.push(facetGroup);
  }

  removeFacet(index: number) {
    this.facets.removeAt(index);
  }

  onSubmit(event?: Event) {
    if (event) {
      event.preventDefault();
    }

    this.form.markAllAsTouched();

    if (!this.fieldsReady()) {
      return;
    }

    const value = this.form.getRawValue();
    const newSettings: OperatorSettings = {
      schemaVersion: 1,
      locationAttribute: value.locationAttribute!,
      breakdownAttribute: value.breakdownAttribute!,
      facets: (value.facets || []).map((facet) => ({
        selectionKey: facet['attribute']!,
        attribute: facet['attribute']!,
        label: this.labelFor(facet['attribute']!),
        omitUnknown: facet['omitUnknown'] ?? false,
      })),
    };

    this.settingsService.save(newSettings);
    this.save.emit();
  }

  private fillForm(settings: OperatorSettings) {
    this.facets.clear();
    this.form.patchValue({
      locationAttribute: settings.locationAttribute,
      breakdownAttribute: settings.breakdownAttribute,
    });
    settings.facets.forEach((facet) => this.addFacet(facet));
    this.clearDuplicateFacetAttributes();
    this.form.markAsPristine();
  }

  private selectedNames(): readonly string[] {
    const value = this.form.getRawValue();
    return [
      value.locationAttribute ?? '',
      value.breakdownAttribute ?? '',
      ...(value.facets ?? []).map((facet) => facet['attribute'] ?? ''),
    ];
  }

  /** Blank unknown location and chart values, and drop facets whose attribute is gone. */
  private dropUnavailableAttributes() {
    const names = new Set(this.catalog().map((choice) => choice.name));
    const before = JSON.stringify(this.form.getRawValue());
    const value = this.form.getRawValue();
    this.form.patchValue({
      locationAttribute: names.has(value.locationAttribute ?? '') ? value.locationAttribute : '',
      breakdownAttribute: names.has(value.breakdownAttribute ?? '') ? value.breakdownAttribute : '',
    });
    for (let index = this.facets.length - 1; index >= 0; index -= 1) {
      const attribute = String(this.facets.at(index).get('attribute')?.value ?? '');
      if (attribute && !names.has(attribute)) {
        this.facets.removeAt(index);
      }
    }
    if (JSON.stringify(this.form.getRawValue()) !== before) {
      this.form.markAsDirty();
    }
  }

  /** Later facets lose an attribute that an earlier facet already uses. */
  private clearDuplicateFacetAttributes() {
    const seen = new Set<string>();
    for (const control of this.facets.controls) {
      const attribute = String(control.get('attribute')?.value ?? '');
      if (!attribute || seen.has(attribute)) {
        if (seen.has(attribute)) {
          control.get('attribute')?.setValue('');
        }
        continue;
      }
      seen.add(attribute);
    }
  }

  private labelFor(name: string): string {
    return this.catalog().find((choice) => choice.name === name)?.label || name;
  }

  private async loadAttributes(): Promise<void> {
    try {
      const api = await this.sailpointApi.getApi(IdentityAttributesApi);
      const response = await api.listIdentityAttributesV1({ includeSystem: true });
      this.catalog.set(identityAttributeChoices(response.data ?? []));
      this.attributesError.set(null);
      this.dropUnavailableAttributes();
    } catch {
      this.attributesError.set(
        "Couldn't load identity attributes. The lists show the current values only.",
      );
    } finally {
      this.attributesLoading.set(false);
    }
  }
}
