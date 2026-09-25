import {
  classifyCapabilityError,
  formatCapabilityResult,
  POPUP_BLOCKED_RESULT,
  unsupportedResult,
} from './capability-error';

describe('classifyCapabilityError', () => {
  it('classifies window.open null as policy', () => {
    expect(POPUP_BLOCKED_RESULT.kind).toBe('policy');
    expect(POPUP_BLOCKED_RESULT.message).toMatch(/allow-popups/);
  });

  it('classifies NotFoundError as no-hardware', () => {
    const result = classifyCapabilityError(new DOMException('no device', 'NotFoundError'));
    expect(result.kind).toBe('no-hardware');
  });

  it('classifies NotAllowedError with a policy hint as policy', () => {
    const result = classifyCapabilityError(
      new DOMException('Blocked by Permissions-Policy', 'NotAllowedError'),
    );
    expect(result.kind).toBe('policy');
  });

  it('classifies Chrome permissions policy clipboard blocks as policy', () => {
    const result = classifyCapabilityError(
      new DOMException(
        "Failed to execute 'writeText' on 'Clipboard': The Clipboard API has been blocked because of a permissions policy applied to the current document.",
        'NotAllowedError',
      ),
    );
    expect(result.kind).toBe('policy');
  });

  it('classifies other NotAllowedError as user-denied', () => {
    const result = classifyCapabilityError(new DOMException('Permission denied', 'NotAllowedError'));
    expect(result.kind).toBe('user-denied');
  });

  it('classifies geolocation PERMISSION_DENIED as user-denied', () => {
    const err = {
      code: 1,
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
      message: 'User denied Geolocation',
    };
    expect(classifyCapabilityError(err).kind).toBe('user-denied');
  });

  it('classifies geolocation POSITION_UNAVAILABLE as no-hardware', () => {
    const err = {
      code: 2,
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
      message: 'unavailable',
    };
    expect(classifyCapabilityError(err).kind).toBe('no-hardware');
  });

  it('classifies missing APIs as unsupported', () => {
    expect(unsupportedResult('Magnetometer').kind).toBe('unsupported');
  });

  it('formats unknown errors with name and message', () => {
    const result = classifyCapabilityError(new Error('boom'));
    expect(result.kind).toBe('unknown');
    expect(formatCapabilityResult(result)).toContain('boom');
  });
});
