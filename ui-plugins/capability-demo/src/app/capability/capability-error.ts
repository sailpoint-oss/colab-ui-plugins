import type { CapabilityErrorKind, CapabilityResult } from './capability-types';

const POLICY_HINT = /permissions[-\s]policy|\bsandbox\b|\ballow\b/i;

const KIND_LABEL: Record<CapabilityErrorKind, string> = {
  policy: 'Policy blocked',
  'user-denied': 'Browser permission denied',
  'no-hardware': 'No hardware',
  unsupported: 'Unsupported',
  'needs-host': 'Needs Identity Security Cloud',
  unknown: 'Error',
};

export const NEEDS_HOST_RESULT: CapabilityResult = {
  ok: false,
  kind: 'needs-host',
  message: 'Open this plugin inside Identity Security Cloud to try this demo.',
};

export const POPUP_BLOCKED_RESULT: CapabilityResult = {
  ok: false,
  kind: 'policy',
  message: 'popup blocked or sandbox missing allow-popups',
};

export function unsupportedResult(apiName: string): CapabilityResult {
  return {
    ok: false,
    kind: 'unsupported',
    message: `${apiName} is not available in this browser.`,
  };
}

export function successResult(message: string): CapabilityResult {
  return { ok: true, message };
}

export function capabilityErrorLabel(result: CapabilityResult): string {
  if (result.ok) {
    return '';
  }
  return result.kind ? KIND_LABEL[result.kind] : KIND_LABEL.unknown;
}

export function formatCapabilityResult(result: CapabilityResult): string {
  if (result.ok) {
    return result.message;
  }
  return `${capabilityErrorLabel(result)}: ${result.message}`;
}

export function classifyCapabilityError(err: unknown): CapabilityResult {
  if (isGeolocationPositionError(err)) {
    if (err.code === err.POSITION_UNAVAILABLE || err.code === 2) {
      return { ok: false, kind: 'no-hardware', message: geolocationMessage(err) };
    }
    if (err.code === err.PERMISSION_DENIED || err.code === 1) {
      return {
        ok: false,
        kind: POLICY_HINT.test(err.message) ? 'policy' : 'user-denied',
        message: geolocationMessage(err),
      };
    }
    return { ok: false, kind: 'unknown', message: geolocationMessage(err) };
  }

  if (err instanceof Error || isNamedError(err)) {
    const name = err.name || 'Error';
    const message = err.message || String(err);
    const combined = `${name}: ${message}`;

    if (name === 'NotFoundError') {
      return { ok: false, kind: 'no-hardware', message: combined };
    }

    if (name === 'NotAllowedError') {
      return {
        ok: false,
        kind: POLICY_HINT.test(combined) ? 'policy' : 'user-denied',
        message: combined,
      };
    }

    if (name === 'SecurityError' || POLICY_HINT.test(combined)) {
      return { ok: false, kind: 'policy', message: combined };
    }

    if (name === 'TypeError' && /is not a constructor|undefined/i.test(message)) {
      return { ok: false, kind: 'unsupported', message: combined };
    }

    return { ok: false, kind: 'unknown', message: combined };
  }

  return { ok: false, kind: 'unknown', message: String(err) };
}

function geolocationMessage(err: GeolocationPositionError): string {
  return `GeolocationPositionError: ${err.message || err.code}`;
}

function isGeolocationPositionError(err: unknown): err is GeolocationPositionError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as GeolocationPositionError).code === 'number' &&
    'PERMISSION_DENIED' in err
  );
}

function isNamedError(err: unknown): err is { name: string; message: string } {
  return typeof err === 'object' && err !== null && 'name' in err && 'message' in err;
}
