import { TestBed } from '@angular/core/testing';

import { ViewToggles } from './view-toggles';
import { ViewSettingsService } from './view-settings.service';

describe('ViewToggles', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [ViewToggles] });
  });

  function labels(buttons: HTMLButtonElement[]): (string | null | undefined)[] {
    return buttons.map((button) => button.querySelector('.view-toggle-label')?.textContent);
  }

  it('starts from the defaults and toggles a button on', () => {
    const fixture = TestBed.createComponent(ViewToggles);
    fixture.detectChanges();

    const buttons = [...fixture.nativeElement.querySelectorAll('.view-toggle')] as HTMLButtonElement[];
    expect(labels(buttons)).toEqual(['Rotate', 'Arc Lines', 'Clouds', 'Day/Night', 'Moon']);
    expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual([
      'true',
      'true',
      'false',
      'false',
      'false',
    ]);
    expect(buttons[2].classList.contains('view-toggle--on')).toBe(false);

    buttons[2].click();
    fixture.detectChanges();

    expect(buttons[2].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[2].classList.contains('view-toggle--on')).toBe(true);
  });

  it('keeps rotate, arcs, clouds, and day and night available in Moon view', async () => {
    const fixture = TestBed.createComponent(ViewToggles);
    fixture.detectChanges();
    const buttons = [...fixture.nativeElement.querySelectorAll('.view-toggle')] as HTMLButtonElement[];

    TestBed.inject(ViewSettingsService).patch({ moon: true });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(buttons.map(({ disabled }) => disabled)).toEqual([false, false, false, false, false]);
    expect(labels(buttons)[2]).toBe('Milkyway');
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[4].getAttribute('aria-pressed')).toBe('true');
  });
});
