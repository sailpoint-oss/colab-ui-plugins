import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeng/themes/aura';

import { App } from './app';
import { SailpointPluginService } from '@core';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        providePrimeNG({ theme: { preset: Aura } }),
        {
          provide: SailpointPluginService,
          useValue: { context: signal(null), status: signal('pending') },
        },
      ],
    }).compileComponents();
  });

  it('creates the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the plugin title', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('UI Plugin Capability Demo');
    expect(compiled.textContent).toContain('Available capabilities');
    expect(compiled.textContent).not.toContain('What it is');
    expect(compiled.textContent).not.toContain('What that enables');
    expect(compiled.textContent).not.toContain('App Shell connection');
    expect(compiled.textContent).not.toContain('Baseline');
    expect(compiled.textContent).not.toContain('List identities');
  });

  it('badges every capability as Default or Opt-in', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const badges = fixture.nativeElement.querySelectorAll('p-tag');
    expect(badges.length).toBeGreaterThan(0);
    for (const badge of badges) {
      expect(['Default', 'Opt-in']).toContain(badge.textContent?.trim());
    }
  });
});
