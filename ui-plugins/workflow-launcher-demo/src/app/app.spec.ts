import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { App } from './app';
import { SailpointPluginService } from '@core';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        // Stub the plugin service so the component does not build a real SDK or
        // attempt an App Shell handshake during the test. The component only
        // reads the `context` and `status` signals.
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
    expect(compiled.querySelector('h1')?.textContent).toContain('Workflow Launcher Demo');
  });

  it('does not load launchers before the handshake completes', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const refresh = compiled.querySelector('button') as HTMLButtonElement;
    expect(refresh.disabled).toBe(true);
  });
});
