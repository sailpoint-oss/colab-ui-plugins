import { TestBed } from '@angular/core/testing';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeng/themes/aura';

import { CapabilityDemo } from './capability-demo';
import { CAPABILITY_CATALOG } from '../capability-catalog';

describe('CapabilityDemo', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CapabilityDemo],
      providers: [providePrimeNG({ theme: { preset: Aura } })],
    }).compileComponents();
  });

  function newTabFixture() {
    const fixture = TestBed.createComponent(CapabilityDemo);
    fixture.componentRef.setInput(
      'def',
      CAPABILITY_CATALOG.find((item) => item.id === 'open-link-new-tab'),
    );
    fixture.componentRef.setInput('hostUrl', 'https://acme.identitynow.com/ui/d/mysailpoint');
    fixture.detectChanges();
    return fixture;
  }

  it('opens MySailPoint in a new tab from a button', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue({ opener: window } as Window);
    const fixture = newTabFixture();

    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.textContent?.trim()).toBe('Open MySailPoint in a new tab');
    button.click();
    fixture.detectChanges();

    expect(open).toHaveBeenCalledWith('https://acme.identitynow.com/ui/d/mysailpoint', '_blank');
    expect(fixture.nativeElement.querySelector('.output-error')).toBeNull();
    open.mockRestore();
  });

  it('reports a policy error when the sandbox blocks the new tab', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => {
      throw new DOMException(
        "Failed to execute 'open' on 'Window': The opener frame is sandboxed and the 'allow-popups' permission is not set.",
        'SecurityError',
      );
    });
    const fixture = newTabFixture();

    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();

    const box = fixture.nativeElement.querySelector('.output-error') as HTMLElement;
    expect(box.textContent).toContain('Policy blocked');
    expect(box.textContent).toContain('allow-popups');
    open.mockRestore();
  });

  it('reports a policy error when the browser returns no new tab', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const fixture = newTabFixture();

    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();

    const box = fixture.nativeElement.querySelector('.output-error') as HTMLElement;
    expect(box.textContent).toContain('Policy blocked');
    expect(box.textContent).toContain('allow-popups');
    open.mockRestore();
  });

  function dialogFixture() {
    const fixture = TestBed.createComponent(CapabilityDemo);
    fixture.componentRef.setInput(
      'def',
      CAPABILITY_CATALOG.find((item) => item.id === 'allow-modals'),
    );
    fixture.detectChanges();
    return fixture;
  }

  it('reports a policy error when a dialog returns immediately', () => {
    vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    const fixture = dialogFixture();

    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();

    const box = fixture.nativeElement.querySelector('.output-error') as HTMLElement;
    expect(box.textContent).toContain('Policy blocked');
    expect(box.textContent).toContain('allow-modals');
    vi.restoreAllMocks();
  });

  it('clears the error when a dialog waits for the user', () => {
    vi.spyOn(window, 'alert').mockImplementation(() => {
      const start = performance.now();
      while (performance.now() - start < 120) {
        // A real dialog blocks until the user responds.
      }
    });
    const fixture = dialogFixture();
    fixture.componentInstance['result'].set({
      ok: false,
      kind: 'policy',
      message: 'previous',
    });

    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.output-error')).toBeNull();
    vi.restoreAllMocks();
  });

  it('offers copy and read buttons on the single clipboard card', () => {
    const fixture = TestBed.createComponent(CapabilityDemo);
    fixture.componentRef.setInput(
      'def',
      CAPABILITY_CATALOG.find((item) => item.id === 'clipboard'),
    );
    fixture.detectChanges();

    const labels = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).map((button) => button.textContent?.trim());
    expect(labels).toEqual(['Copy demo text', 'Read clipboard']);
  });

  it('renders failures in an error box', () => {
    const fixture = TestBed.createComponent(CapabilityDemo);
    fixture.componentRef.setInput(
      'def',
      CAPABILITY_CATALOG.find((item) => item.id === 'clipboard'),
    );
    fixture.detectChanges();

    fixture.componentInstance['result'].set({
      ok: false,
      kind: 'policy',
      message: 'permissions policy blocked writeText',
    });
    fixture.detectChanges();

    const box = fixture.nativeElement.querySelector('.output-error') as HTMLElement;
    expect(box).toBeTruthy();
    expect(box.textContent).toContain('Policy blocked');
    expect(box.textContent).toContain('permissions policy blocked writeText');
  });

  it('offers three live sensor buttons on one card', () => {
    const fixture = TestBed.createComponent(CapabilityDemo);
    fixture.componentRef.setInput(
      'def',
      CAPABILITY_CATALOG.find((item) => item.id === 'device-sensors'),
    );
    fixture.detectChanges();
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).map((button) => button.textContent?.trim());
    expect(buttons).toEqual(['Read gyroscope', 'Read accelerometer', 'Read magnetometer']);
  });

  it('toggles fullscreen with a single button', () => {
    const fixture = TestBed.createComponent(CapabilityDemo);
    fixture.componentRef.setInput(
      'def',
      CAPABILITY_CATALOG.find((item) => item.id === 'fullscreen'),
    );
    fixture.detectChanges();
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).map((button) => button.textContent?.trim());
    expect(buttons).toEqual(['Enter fullscreen']);
  });

  it('starts the microphone with a single listening button', () => {
    const fixture = TestBed.createComponent(CapabilityDemo);
    fixture.componentRef.setInput(
      'def',
      CAPABILITY_CATALOG.find((item) => item.id === 'microphone'),
    );
    fixture.detectChanges();
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).map((button) => button.textContent?.trim());
    expect(buttons).toEqual(['Start listening']);
  });

  it('relabels the microphone button while listening', () => {
    const fixture = TestBed.createComponent(CapabilityDemo);
    fixture.componentRef.setInput(
      'def',
      CAPABILITY_CATALOG.find((item) => item.id === 'microphone'),
    );
    fixture.componentInstance['micActive'].set(true);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.textContent?.trim()).toBe('Stop listening');
  });

  it('toggles the camera with a single button', () => {
    const fixture = TestBed.createComponent(CapabilityDemo);
    fixture.componentRef.setInput(
      'def',
      CAPABILITY_CATALOG.find((item) => item.id === 'camera'),
    );
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('video')).toBeNull();
    const start = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(start.textContent?.trim()).toBe('Start camera');

    fixture.componentInstance['cameraActive'].set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('video')).toBeTruthy();
    const stop = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(stop.textContent?.trim()).toBe('Stop camera');
  });

  it('relabels the active sensor button to stop', () => {
    const fixture = TestBed.createComponent(CapabilityDemo);
    fixture.componentRef.setInput(
      'def',
      CAPABILITY_CATALOG.find((item) => item.id === 'device-sensors'),
    );
    fixture.componentInstance['selectedSensor'].set('gyroscope');
    fixture.componentInstance['sensorListening'].set(true);
    fixture.detectChanges();
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).map((button) => button.textContent?.trim());
    expect(buttons).toEqual(['Stop gyroscope', 'Read accelerometer', 'Read magnetometer']);
  });
});
