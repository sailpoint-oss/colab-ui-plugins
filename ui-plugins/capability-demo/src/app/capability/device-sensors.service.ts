import { Injectable, OnDestroy, signal } from '@angular/core';

export interface OrientationReading {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  compassHeading: number | null;
}

export interface MotionReading {
  x: number | null;
  y: number | null;
  z: number | null;
}

export interface MagnetometerReading {
  x: number | null;
  y: number | null;
  z: number | null;
  source: 'magnetometer' | 'compass';
}

type PermissionedEvent = {
  requestPermission?: () => Promise<PermissionState>;
};

type MagnetometerCtor = new (options?: { frequency?: number }) => MagnetometerLike;

interface MagnetometerLike {
  start(): void;
  stop(): void;
  x?: number;
  y?: number;
  z?: number;
  addEventListener(type: 'reading' | 'error', listener: EventListener): void;
  removeEventListener(type: 'reading' | 'error', listener: EventListener): void;
}

@Injectable({ providedIn: 'root' })
export class DeviceSensorService implements OnDestroy {
  readonly orientation = signal<OrientationReading | null>(null);
  readonly motion = signal<MotionReading | null>(null);
  readonly magnetometer = signal<MagnetometerReading | null>(null);
  readonly magnetometerApiPresent = signal(false);
  readonly listening = signal(false);

  private refCount = 0;
  private magnetometerSensor: MagnetometerLike | null = null;
  private readonly onOrientation = (event: DeviceOrientationEvent) => {
    const compass = compassHeadingFrom(event);
    this.orientation.set({
      alpha: event.alpha,
      beta: event.beta,
      gamma: event.gamma,
      compassHeading: compass,
    });
    if (compass !== null && !this.magnetometerApiPresent()) {
      this.magnetometer.set({ x: compass, y: null, z: null, source: 'compass' });
    }
  };
  private readonly onMotion = (event: DeviceMotionEvent) => {
    this.motion.set({
      x: event.accelerationIncludingGravity?.x ?? event.acceleration?.x ?? null,
      y: event.accelerationIncludingGravity?.y ?? event.acceleration?.y ?? null,
      z: event.accelerationIncludingGravity?.z ?? event.acceleration?.z ?? null,
    });
  };
  private readonly onMagnetometerReading = () => {
    const sensor = this.magnetometerSensor;
    if (!sensor) {
      return;
    }
    this.magnetometer.set({
      x: sensor.x ?? null,
      y: sensor.y ?? null,
      z: sensor.z ?? null,
      source: 'magnetometer',
    });
  };

  async start(): Promise<void> {
    if (this.refCount === 0) {
      await requestSafariPermissions();
      this.clearReadings();
      this.magnetometerApiPresent.set(typeof getMagnetometerCtor() === 'function');
      window.addEventListener('deviceorientation', this.onOrientation);
      window.addEventListener('devicemotion', this.onMotion);
      this.startMagnetometer();
      this.listening.set(true);
    }
    this.refCount += 1;
  }

  stop(): void {
    if (this.refCount === 0) {
      return;
    }
    this.refCount -= 1;
    if (this.refCount > 0) {
      return;
    }
    this.unlisten();
  }

  ngOnDestroy(): void {
    this.refCount = 0;
    this.unlisten();
  }

  private unlisten(): void {
    window.removeEventListener('deviceorientation', this.onOrientation);
    window.removeEventListener('devicemotion', this.onMotion);
    if (this.magnetometerSensor) {
      this.magnetometerSensor.removeEventListener('reading', this.onMagnetometerReading);
      try {
        this.magnetometerSensor.stop();
      } catch {
        // Sensor may already be stopped.
      }
      this.magnetometerSensor = null;
    }
    this.listening.set(false);
    this.clearReadings();
  }

  private clearReadings(): void {
    this.orientation.set(null);
    this.motion.set(null);
    this.magnetometer.set(null);
  }

  private startMagnetometer(): void {
    const Ctor = getMagnetometerCtor();
    if (!Ctor) {
      return;
    }
    try {
      const sensor = new Ctor({ frequency: 10 });
      this.magnetometerSensor = sensor;
      sensor.addEventListener('reading', this.onMagnetometerReading);
      sensor.start();
    } catch {
      this.magnetometerSensor = null;
    }
  }
}

async function requestSafariPermissions(): Promise<void> {
  const orientation = DeviceOrientationEvent as unknown as PermissionedEvent;
  if (typeof orientation.requestPermission === 'function') {
    const state = await orientation.requestPermission();
    if (state !== 'granted') {
      throw new DOMException('Sensor permission denied', 'NotAllowedError');
    }
  }
  const motion = DeviceMotionEvent as unknown as PermissionedEvent;
  if (typeof motion.requestPermission === 'function') {
    const state = await motion.requestPermission();
    if (state !== 'granted') {
      throw new DOMException('Sensor permission denied', 'NotAllowedError');
    }
  }
}

function getMagnetometerCtor(): MagnetometerCtor | undefined {
  return (globalThis as unknown as { Magnetometer?: MagnetometerCtor }).Magnetometer;
}

function compassHeadingFrom(event: DeviceOrientationEvent): number | null {
  const heading = (event as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
  return typeof heading === 'number' ? heading : null;
}
