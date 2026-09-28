import { TestBed } from '@angular/core/testing';

import { FacetDrawer } from './facet-drawer';

const OPTIONS = {
  countries: [
    { label: 'India', count: 400 },
    { label: 'USA', count: 624 },
  ],
  departments: [
    { label: 'Engineering', count: 594 },
    { label: 'Legal', count: 0 },
    { label: 'Sales', count: 358 },
  ],
  titles: [{ label: 'Software Engineer', count: 157 }],
};

describe('FacetDrawer', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [FacetDrawer] });
  });

  function createDrawer() {
    const fixture = TestBed.createComponent(FacetDrawer);
    fixture.componentRef.setInput('options', OPTIONS);
    fixture.componentRef.setInput('selection', {
      countries: [],
      departments: [],
      titles: [],
    });
    fixture.detectChanges();
    return fixture;
  }

  it('renders expandable labelled groups, checkbox counts, and reset', () => {
    const fixture = createDrawer();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Country');
    expect(text).toContain('Department');
    expect(text).toContain('Job title');
    expect(text).toContain('Engineering');
    expect(text).toContain('594');
    expect(fixture.nativeElement.querySelectorAll('input[type="checkbox"]')).toHaveLength(6);
    expect(fixture.nativeElement.querySelectorAll('details[open]')).toHaveLength(0);
    const unavailable = fixture.nativeElement.querySelector(
      '.facet-option--unavailable',
    ) as HTMLLabelElement;
    expect(unavailable.textContent).toContain('Legal');
    expect((unavailable.querySelector('input') as HTMLInputElement).disabled).toBe(true);
    expect(
      getComputedStyle(unavailable.querySelector('.option-label') as HTMLElement).textDecorationLine,
    ).not.toBe('line-through');
    expect(
      (fixture.nativeElement.querySelector('.clear-button') as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('emits a facet toggle and clear action', () => {
    const fixture = createDrawer();
    const toggle = vi.fn();
    const clear = vi.fn();
    fixture.componentInstance.toggleFacet.subscribe(toggle);
    fixture.componentInstance.clear.subscribe(clear);

    const engineering = [...fixture.nativeElement.querySelectorAll('label')].find(
      (label: HTMLLabelElement) => label.textContent?.includes('Engineering'),
    )!;
    (engineering.querySelector('input') as HTMLInputElement).click();
    fixture.componentInstance.clear.emit();

    expect(toggle).toHaveBeenCalledWith({
      group: 'departments',
      value: 'Engineering',
      checked: true,
    });
    expect(clear).toHaveBeenCalled();
  });

  it('keeps only one facet group expanded at a time', async () => {
    const fixture = createDrawer();
    const summaries = fixture.nativeElement.querySelectorAll('summary');

    (summaries[0] as HTMLElement).click();
    await vi.waitFor(() =>
      expect(fixture.nativeElement.querySelectorAll('details[open]')).toHaveLength(1),
    );
    expect((summaries[0] as HTMLElement).parentElement?.hasAttribute('open')).toBe(true);

    (summaries[1] as HTMLElement).click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect((summaries[0] as HTMLElement).parentElement?.hasAttribute('open')).toBe(false);
      expect((summaries[1] as HTMLElement).parentElement?.hasAttribute('open')).toBe(true);
    });
  });
});
