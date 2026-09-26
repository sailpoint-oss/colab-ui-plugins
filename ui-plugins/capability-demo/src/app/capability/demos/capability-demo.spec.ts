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

  it('styles the new-tab link as a button', () => {
    const fixture = TestBed.createComponent(CapabilityDemo);
    fixture.componentRef.setInput(
      'def',
      CAPABILITY_CATALOG.find((item) => item.id === 'open-link-new-tab'),
    );
    fixture.componentRef.setInput('hostUrl', 'https://acme.identitynow.com/ui/d/mysailpoint');
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector('a[target="_blank"]') as HTMLAnchorElement;
    expect(link).toBeTruthy();
    expect(link.className).toContain('p-button');
    expect(link.textContent?.trim()).toBe('Open MySailPoint in a new tab');
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
