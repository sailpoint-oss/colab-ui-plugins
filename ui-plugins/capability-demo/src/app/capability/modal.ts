import type { CapabilityResult } from './capability-types';

/**
 * A shown alert, confirm, prompt, or print dialog blocks script until the user
 * responds. A sandbox without allow-modals ignores the call and returns immediately.
 */
export const MODAL_SHOWN_MS = 100;

export const MODAL_BLOCKED_RESULT: CapabilityResult = {
  ok: false,
  kind: 'policy',
  message: 'Dialog blocked: add allow-modals to iframeSandbox in sp-ui-plugin.json',
};

export function callModal<T>(
  show: () => T,
  now: () => number = () => performance.now(),
): { shown: boolean; value: T } {
  const start = now();
  const value = show();
  return { shown: now() - start >= MODAL_SHOWN_MS, value };
}
