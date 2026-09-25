import { afterNextRender, Component, computed, ElementRef, inject, Injector, input, OnDestroy, signal, viewChild } from '@angular/core';
import { Button, ButtonDirective } from 'primeng/button';

import {
  CLIPBOARD_DEMO_TEXT,
  type CapabilityDef,
  type CapabilityResult,
} from '../capability-types';
import { truncateClipboardText } from '../clipboard';
import {
  capabilityErrorLabel,
  classifyCapabilityError,
  NEEDS_HOST_RESULT,
  unsupportedResult,
} from '../capability-error';
import {
  DeviceSensorService,
  type MagnetometerReading,
  type MotionReading,
  type OrientationReading,
} from '../device-sensors.service';
import { triggerSampleDownload } from '../download';
import { stopMediaStream } from '../media';

@Component({
  selector: 'app-capability-demo',
  imports: [Button, ButtonDirective],
  templateUrl: './capability-demo.html',
  styleUrl: './capability-demo.scss',
})
export class CapabilityDemo implements OnDestroy {
  readonly def = input.required<CapabilityDef>();
  readonly hostUrl = input<string | null>(null);

  private readonly sensors = inject(DeviceSensorService);
  private readonly injector = inject(Injector);

  protected readonly result = signal<CapabilityResult | null>(null);
  protected readonly clipboardOutput = signal<{ label: string; value: string } | null>(null);
  protected readonly geoOutput = signal<{ label: string; value: string } | null>(null);
  protected readonly cameraActive = signal(false);
  protected readonly micActive = signal(false);
  protected readonly micLevel = signal(0);
  protected readonly selectedSensor = signal<'gyroscope' | 'accelerometer' | 'magnetometer' | null>(
    null,
  );
  protected readonly sensorBusy = signal(false);
  protected readonly sensorListening = signal(false);
  protected readonly sensorLiveLabel = computed(() => {
    switch (this.selectedSensor()) {
      case 'gyroscope':
        return 'Gyroscope';
      case 'accelerometer':
        return 'Accelerometer';
      case 'magnetometer':
        return 'Magnetometer';
      default:
        return '';
    }
  });
  protected readonly sensorLiveValue = computed(() => {
    switch (this.selectedSensor()) {
      case 'gyroscope': {
        const reading = this.sensors.orientation();
        return reading ? this.orientationValue(reading) : null;
      }
      case 'accelerometer': {
        const reading = this.sensors.motion();
        return reading ? this.motionValue(reading) : null;
      }
      case 'magnetometer': {
        const reading = this.sensors.magnetometer();
        return reading ? this.compassValue(reading) : null;
      }
      default:
        return null;
    }
  });

  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private animationFrame = 0;
  private sensorTimer = 0;
  private sensorHeld = false;
  private destroyed = false;
  private readonly onFullscreenChange = (): void => {
    const shell = document.getElementById('lab-shell');
    this.fullscreenActive.set(!!shell && document.fullscreenElement === shell);
  };

  readonly videoEl = viewChild<ElementRef<HTMLVideoElement>>('preview');
  protected readonly fullscreenActive = signal(false);

  constructor() {
    document.addEventListener('fullscreenchange', this.onFullscreenChange);
    this.onFullscreenChange();
  }

  protected errorLabel(result: CapabilityResult): string {
    return capabilityErrorLabel(result);
  }

  protected sensorButtonLabel(kind: 'gyroscope' | 'accelerometer' | 'magnetometer'): string {
    if (this.selectedSensor() === kind && this.sensorListening()) {
      return `Stop ${kind}`;
    }
    return `Read ${kind}`;
  }

  protected sensorLines(rows: readonly [string, number | null][]): string {
    return rows.map(([label, value]) => `${label}: ${value ?? '—'}`).join('\n');
  }

  protected orientationValue(reading: OrientationReading): string {
    return this.sensorLines([
      ['Alpha', reading.alpha],
      ['Beta', reading.beta],
      ['Gamma', reading.gamma],
    ]);
  }

  protected motionValue(reading: MotionReading): string {
    return this.sensorLines([
      ['X', reading.x],
      ['Y', reading.y],
      ['Z', reading.z],
    ]);
  }

  protected compassValue(reading: MagnetometerReading): string {
    if (reading.source === 'magnetometer') {
      return this.sensorLines([
        ['X', reading.x],
        ['Y', reading.y],
        ['Z', reading.z],
      ]);
    }
    return this.sensorLines([['Heading', reading.x]]);
  }

  protected hostDemosDisabled(): boolean {
    return !this.hostUrl();
  }

  protected hostDisabledReason(): string {
    return 'Open this plugin inside Identity Security Cloud to try this demo.';
  }

  protected openMySailPointTop(): void {
    if (this.hostDemosDisabled()) {
      this.result.set(NEEDS_HOST_RESULT);
      return;
    }
    const url = this.hostUrl();
    try {
      if (!window.top) {
        throw new Error('window.top is null');
      }
      window.top.location.href = url as string;
    } catch (err) {
      this.result.set(classifyCapabilityError(err));
    }
  }

  protected downloadSample(): void {
    try {
      triggerSampleDownload();
    } catch (err) {
      this.result.set(classifyCapabilityError(err));
    }
  }

  protected runAlert(): void {
    try {
      window.alert('UI Plugin Capability Demo alert');
    } catch (err) {
      this.result.set(classifyCapabilityError(err));
    }
  }

  protected runConfirm(): void {
    try {
      window.confirm('UI Plugin Capability Demo confirm');
    } catch (err) {
      this.result.set(classifyCapabilityError(err));
    }
  }

  protected runPrompt(): void {
    try {
      window.prompt('UI Plugin Capability Demo prompt', 'ok');
    } catch (err) {
      this.result.set(classifyCapabilityError(err));
    }
  }

  protected runPrint(): void {
    try {
      window.print();
    } catch (err) {
      this.result.set(classifyCapabilityError(err));
    }
  }

  protected async copyDemoText(): Promise<void> {
    if (!navigator.clipboard?.writeText) {
      this.failClipboard(unsupportedResult('navigator.clipboard.writeText'));
      return;
    }
    try {
      await navigator.clipboard.writeText(CLIPBOARD_DEMO_TEXT);
      this.result.set(null);
      this.clipboardOutput.set({ label: 'Copied to clipboard', value: CLIPBOARD_DEMO_TEXT });
    } catch (err) {
      this.failClipboard(classifyCapabilityError(err));
    }
  }

  protected async readClipboard(): Promise<void> {
    if (!navigator.clipboard?.readText) {
      this.failClipboard(unsupportedResult('navigator.clipboard.readText'));
      return;
    }
    try {
      const text = truncateClipboardText(await navigator.clipboard.readText());
      this.result.set(null);
      this.clipboardOutput.set({
        label: 'Read from clipboard',
        value: text || '(the clipboard is empty)',
      });
    } catch (err) {
      this.failClipboard(classifyCapabilityError(err));
    }
  }

  private failClipboard(result: CapabilityResult): void {
    this.clipboardOutput.set(null);
    this.result.set(result);
  }

  protected getLocation(): void {
    if (!navigator.geolocation?.getCurrentPosition) {
      this.geoOutput.set(null);
      this.result.set(unsupportedResult('navigator.geolocation'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        this.result.set(null);
        this.geoOutput.set({
          label: 'Location',
          value: `Latitude: ${latitude}\nLongitude: ${longitude}\nAccuracy: ${accuracy}`,
        });
      },
      (err) => {
        this.geoOutput.set(null);
        this.result.set(classifyCapabilityError(err));
      },
    );
  }

  protected async toggleCamera(): Promise<void> {
    if (this.cameraActive()) {
      this.teardownMedia();
      this.result.set(null);
      return;
    }
    await this.startMedia({ video: true }, 'camera');
  }

  protected async toggleMicrophone(): Promise<void> {
    if (this.micActive()) {
      this.teardownMedia();
      this.result.set(null);
      return;
    }
    await this.startMedia({ audio: true }, 'microphone');
  }

  protected async selectSensor(
    kind: 'gyroscope' | 'accelerometer' | 'magnetometer',
  ): Promise<void> {
    if (this.sensorListening() && this.selectedSensor() === kind) {
      this.stopSensors();
      return;
    }
    this.selectedSensor.set(kind);
    this.result.set(null);
    this.clearSensorTimer();
    this.sensorBusy.set(true);
    try {
      if (!this.sensorHeld) {
        await this.sensors.start();
        this.sensorHeld = true;
        this.sensorListening.set(true);
      }
      if (this.destroyed) {
        return;
      }
      if (this.hasSensorData(kind)) {
        return;
      }
      this.sensorTimer = window.setTimeout(() => {
        if (this.destroyed || this.selectedSensor() !== kind || this.hasSensorData(kind)) {
          return;
        }
        if (kind === 'magnetometer' && !this.sensors.magnetometerApiPresent()) {
          this.result.set(unsupportedResult('Magnetometer'));
          return;
        }
        this.result.set({
          ok: false,
          kind: 'no-hardware',
          message: 'No motion data from this device.',
        });
      }, 2000);
    } catch (err) {
      this.result.set(classifyCapabilityError(err));
    } finally {
      this.sensorBusy.set(false);
    }
  }

  private stopSensors(): void {
    this.clearSensorTimer();
    this.releaseSensors();
    this.selectedSensor.set(null);
    this.sensorListening.set(false);
    this.result.set(null);
  }

  protected async toggleFullscreen(): Promise<void> {
    if (this.fullscreenActive()) {
      if (!document.exitFullscreen) {
        this.result.set(unsupportedResult('document.exitFullscreen'));
        return;
      }
      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        }
        this.result.set(null);
      } catch (err) {
        this.result.set(classifyCapabilityError(err));
      }
      return;
    }

    const shell = document.getElementById('lab-shell');
    if (!shell?.requestFullscreen) {
      this.result.set(unsupportedResult('Element.requestFullscreen'));
      return;
    }
    try {
      await shell.requestFullscreen();
      this.result.set(null);
    } catch (err) {
      this.result.set(classifyCapabilityError(err));
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.clearSensorTimer();
    document.removeEventListener('fullscreenchange', this.onFullscreenChange);
    this.teardownMedia();
    this.releaseSensors();
  }

  private clearSensorTimer(): void {
    if (this.sensorTimer) {
      window.clearTimeout(this.sensorTimer);
      this.sensorTimer = 0;
    }
  }

  private releaseSensors(): void {
    if (!this.sensorHeld) {
      return;
    }
    this.sensors.stop();
    this.sensorHeld = false;
    this.sensorListening.set(false);
  }

  private hasSensorData(kind: 'gyroscope' | 'accelerometer' | 'magnetometer'): boolean {
    if (kind === 'gyroscope') {
      return this.sensors.orientation() !== null;
    }
    if (kind === 'accelerometer') {
      return this.sensors.motion() !== null;
    }
    return this.sensors.magnetometer() !== null;
  }

  private async startMedia(
    constraints: MediaStreamConstraints,
    kind: 'camera' | 'microphone',
  ): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.result.set(unsupportedResult('navigator.mediaDevices.getUserMedia'));
      return;
    }
    this.teardownMedia();
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.mediaStream = stream;
      if (kind === 'camera') {
        this.cameraActive.set(true);
        afterNextRender(
          () => {
            const video = this.videoEl()?.nativeElement;
            if (video) {
              video.srcObject = stream;
            }
          },
          { injector: this.injector },
        );
        this.result.set(null);
      } else {
        this.micActive.set(true);
        this.startMicMeter(stream);
        this.result.set(null);
      }
    } catch (err) {
      this.result.set(classifyCapabilityError(err));
    }
  }

  private startMicMeter(stream: MediaStream): void {
    try {
      const context = new AudioContext();
      this.audioContext = context;
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const sample of data) {
          const centered = (sample - 128) / 128;
          sum += centered * centered;
        }
        this.micLevel.set(Math.min(100, Math.round(Math.sqrt(sum / data.length) * 200)));
        this.animationFrame = requestAnimationFrame(tick);
      };
      this.animationFrame = requestAnimationFrame(tick);
    } catch {
      this.micLevel.set(0);
    }
  }

  private teardownMedia(): void {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
    }
    this.audioContext?.close().catch(() => undefined);
    this.audioContext = null;
    stopMediaStream(this.mediaStream);
    this.mediaStream = null;
    const video = this.videoEl()?.nativeElement;
    if (video) {
      video.srcObject = null;
    }
    this.cameraActive.set(false);
    this.micActive.set(false);
    this.micLevel.set(0);
  }
}
