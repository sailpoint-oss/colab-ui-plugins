import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { SailpointApiService } from '@core';

import {
  IdentityGlobeSettingsService,
  OPERATOR_SETTINGS_STORAGE_KEY,
} from './identity-globe-settings.service';

import { OperatorSettingsPanel } from './operator-settings-panel';
import { DEFAULT_OPERATOR_SETTINGS } from './operator-settings';

const ATTRIBUTES = [
  { name: 'city', displayName: 'City' },
  { name: 'department', displayName: 'Department' },
  { name: 'country', displayName: 'Countries' },
  { name: 'title', displayName: 'Job Title' },
];

describe('OperatorSettingsPanel', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  function setup(listIdentityAttributes: () => Promise<unknown>) {
    TestBed.configureTestingModule({
      imports: [OperatorSettingsPanel],
      providers: [
        {
          provide: SailpointApiService,
          useValue: {
            getApi: () => Promise.resolve({ listIdentityAttributesV1: listIdentityAttributes }),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(OperatorSettingsPanel);
    fixture.detectChanges();
    return fixture;
  }

  async function settle(fixture: ReturnType<typeof setup>) {
    await vi.waitFor(() => {
      expect(fixture.componentInstance.attributesLoading()).toBe(false);
    });
    fixture.detectChanges();
  }

  it('fills dropdowns from identity attributes and saves their display names', async () => {
    const fixture = setup(() => Promise.resolve({ data: ATTRIBUTES }));
    await settle(fixture);

    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('City Chart Attribute');
    expect(root.textContent).toContain('Filter Facets');
    expect(root.textContent).toContain('The Search attributes used to filter identities on the globe.');
    expect(root.querySelector('#locationAttribute')?.tagName).toBe('SELECT');
    expect(root.textContent).toContain('Countries');
    expect(root.querySelector('input[type="checkbox"]')).toBeNull();

    const settings = TestBed.inject(IdentityGlobeSettingsService);
    fixture.componentInstance.onSubmit();

    const country = settings.settings().facets.find((facet) => facet.attribute === 'country');
    expect(country).toEqual({
      selectionKey: 'country',
      attribute: 'country',
      label: 'Countries',
      omitUnknown: true,
    });
    expect(settings.configured()).toBe(true);
  });

  it('credits GeoNames in the settings panel', async () => {
    const fixture = setup(() => Promise.resolve({ data: ATTRIBUTES }));
    await settle(fixture);

    const help = (fixture.nativeElement as HTMLElement).querySelector(
      'label[for="locationAttribute"] + small',
    );
    const links = [...(help?.querySelectorAll('a') ?? [])].map((link) => link.getAttribute('href'));

    expect(help?.textContent).toContain("The identity's city");
    expect(help?.textContent).toContain('GeoNames');
    expect(help?.textContent).toContain('CC BY 4.0');
    expect(help?.textContent).toContain('filtered');
    expect(links).toEqual([
      'https://www.geonames.org/',
      'https://creativecommons.org/licenses/by/4.0/',
    ]);
  });

  it('labels the actions Reset and Save', async () => {
    const fixture = setup(() => Promise.resolve({ data: ATTRIBUTES }));
    await settle(fixture);

    const labels = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.form-actions button')]
      .map((button) => button.textContent?.trim());
    expect(labels).toEqual(['Reset', 'Save']);
  });

  function clickButton(fixture: ReturnType<typeof setup>, label: string) {
    const button = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find(
      (candidate) => candidate.textContent?.trim() === label,
    ) as HTMLButtonElement;
    button.click();
    fixture.detectChanges();
  }

  it('asks before reset deletes saved settings', async () => {
    const fixture = setup(() => Promise.resolve({ data: ATTRIBUTES }));
    await settle(fixture);
    const cleared = vi.fn();
    fixture.componentInstance.clear.subscribe(cleared);

    clickButton(fixture, 'Reset');
    const dialog = (fixture.nativeElement as HTMLElement).querySelector('[role="alertdialog"]');
    expect(dialog?.textContent).toContain('deletes all Identity Globe settings');
    expect(cleared).not.toHaveBeenCalled();

    clickButton(fixture, 'Cancel');
    expect(fixture.nativeElement.querySelector('[role="alertdialog"]')).toBeNull();
    expect(cleared).not.toHaveBeenCalled();

    clickButton(fixture, 'Reset');
    const confirm = [...(fixture.nativeElement as HTMLElement).querySelectorAll('[role="alertdialog"] button')].find(
      (button) => button.textContent?.trim() === 'Reset',
    ) as HTMLButtonElement;
    confirm.click();
    expect(cleared).toHaveBeenCalledTimes(1);
  });

  it('asks before closing when there are unsaved changes', async () => {
    const fixture = setup(() => Promise.resolve({ data: ATTRIBUTES }));
    await settle(fixture);
    const closed = vi.fn();
    fixture.componentInstance.close.subscribe(closed);
    const location = fixture.nativeElement.querySelector('#locationAttribute') as HTMLSelectElement;
    location.value = 'title';
    location.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    fixture.componentInstance.requestClose();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Close settings without saving?');
    expect(closed).not.toHaveBeenCalled();

    clickButton(fixture, 'Close');
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('closes without asking when nothing has changed', async () => {
    const fixture = setup(() => Promise.resolve({ data: ATTRIBUTES }));
    await settle(fixture);
    const closed = vi.fn();
    fixture.componentInstance.close.subscribe(closed);

    fixture.componentInstance.requestClose();

    expect(fixture.nativeElement.querySelector('[role="alertdialog"]')).toBeNull();
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('says there are no filter facets when the list is empty', async () => {
    localStorage.setItem(
      OPERATOR_SETTINGS_STORAGE_KEY,
      JSON.stringify({ ...DEFAULT_OPERATOR_SETTINGS, facets: [] }),
    );
    const fixture = setup(() => Promise.resolve({ data: ATTRIBUTES }));
    await settle(fixture);

    const root = fixture.nativeElement as HTMLElement;
    const empty = root.querySelector('.empty-facets');
    expect(empty?.textContent).toContain('There are no filter facets.');
    expect(empty?.textContent).toContain('to add one.');

    const addFacet = empty?.querySelector('button');
    expect(addFacet?.textContent?.trim()).toBe('Add Facet');
    addFacet?.click();
    fixture.detectChanges();

    expect(root.querySelector('.empty-facets')).toBeNull();
    expect(root.querySelectorAll('.facet-item')).toHaveLength(1);
  });

  it('hides attributes already chosen by other filter facets', async () => {
    const fixture = setup(() => Promise.resolve({ data: ATTRIBUTES }));
    await settle(fixture);

    const root = fixture.nativeElement as HTMLElement;
    const optionValues = (select: Element) =>
      [...(select as HTMLSelectElement).options].map((option) => option.value);
    const selects = [...root.querySelectorAll('[id^="attribute-"]')];
    expect(optionValues(selects[0])).toEqual(['city', 'country']);
    expect(optionValues(selects[1])).toEqual(['city', 'department']);
    expect(optionValues(selects[2])).toEqual(['city', 'title']);

    clickButton(fixture, 'Add Facet');
    const added = [...root.querySelectorAll('[id^="attribute-"]')].at(-1) as HTMLSelectElement;
    expect(optionValues(added)).toEqual(['', 'city']);
    expect(added.value).toBe('');
  });

  it('clears a repeated facet attribute loaded from saved settings', async () => {
    localStorage.setItem(
      OPERATOR_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        ...DEFAULT_OPERATOR_SETTINGS,
        facets: [
          { selectionKey: 'departments', attribute: 'department', label: 'Department' },
          { selectionKey: 'licenseStatus', attribute: 'department', label: 'Department' },
        ],
      }),
    );
    const fixture = setup(() => Promise.resolve({ data: ATTRIBUTES }));
    await settle(fixture);

    const selects = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('[id^="attribute-"]'),
    ] as HTMLSelectElement[];
    expect(selects.map((select) => select.value)).toEqual(['department', '']);
    expect([...selects[1].options].map((option) => option.value)).not.toContain('department');
  });

  it('blanks missing location and chart values, drops missing facets, and blocks save and close', async () => {
    const fixture = setup(() =>
      Promise.resolve({
        data: [
          { name: 'department', displayName: 'Department' },
          { name: 'title', displayName: 'Title' },
        ],
      }),
    );
    await settle(fixture);

    const root = fixture.nativeElement as HTMLElement;
    const location = root.querySelector('#locationAttribute') as HTMLSelectElement;
    expect(location.value).toBe('');
    expect([...location.options].map((option) => option.value)).not.toContain('city');
    expect(root.textContent).toContain('An attribute must be selected.');
    expect(root.querySelector('#breakdownAttribute')).toBeTruthy();
    expect((root.querySelector('#breakdownAttribute') as HTMLSelectElement).value).toBe('department');
    expect(
      [...root.querySelectorAll('[id^="attribute-"]')].map((select) => (select as HTMLSelectElement).value),
    ).toEqual(['department', 'title']);

    const closed = vi.fn();
    fixture.componentInstance.close.subscribe(closed);
    fixture.componentInstance.requestClose();
    expect(closed).not.toHaveBeenCalled();
    expect((root.querySelector('.submit-button') as HTMLButtonElement).disabled).toBe(true);

    fixture.componentInstance.onSubmit();
    expect(TestBed.inject(IdentityGlobeSettingsService).configured()).toBe(false);
  });

  it('keeps the current values selectable when the attribute list fails', async () => {
    const fixture = setup(() => Promise.reject(new Error('offline')));
    await settle(fixture);

    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain("Couldn't load identity attributes");
    const location = root.querySelector('#locationAttribute') as HTMLSelectElement;
    expect([...location.options].map((option) => option.value)).toContain('city');

    fixture.componentInstance.onSubmit();
    const settings = TestBed.inject(IdentityGlobeSettingsService);
    expect(settings.settings().facets.find((facet) => facet.attribute === 'country')?.label).toBe('country');
  });
});
