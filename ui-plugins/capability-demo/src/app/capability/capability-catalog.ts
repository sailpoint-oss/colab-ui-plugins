import type { CapabilityDef } from './capability-types';

function sandboxGrant(tokens: string | string[]): CapabilityDef['declaration'] {
  return { iframeSandbox: Array.isArray(tokens) ? tokens : [tokens] };
}

function manifestPolicy(keys: string | string[]): CapabilityDef['declaration'] {
  const iframeAllow: Record<string, string[]> = {};
  const permissionPolicy: Record<string, string[]> = {};
  for (const key of Array.isArray(keys) ? keys : [keys]) {
    iframeAllow[key] = ["'src'"];
    permissionPolicy[key] = ["'self'"];
  }
  return { iframeAllow, permissionPolicy };
}

export const CAPABILITY_CATALOG: readonly CapabilityDef[] = [
  {
    id: 'allow-top-navigation',
    title: 'Open a link in the same window',
    declaration: sandboxGrant('allow-top-navigation'),
    demo: 'top-navigation',
  },
  {
    id: 'open-link-new-tab',
    title: 'Open a link in a new tab',
    declaration: sandboxGrant(['allow-popups', 'allow-popups-to-escape-sandbox']),
    demo: 'popup-new-tab',
  },
  {
    id: 'allow-downloads',
    title: 'Download a file',
    declaration: sandboxGrant('allow-downloads'),
    demo: 'download',
  },
  {
    id: 'allow-modals',
    title: 'Show browser dialogs',
    declaration: sandboxGrant('allow-modals'),
    demo: 'modals',
  },
  {
    id: 'clipboard',
    title: 'Use the clipboard',
    declaration: manifestPolicy(['clipboard-write', 'clipboard-read']),
    demo: 'clipboard',
  },
  {
    id: 'geolocation',
    title: 'Use this device\'s location',
    declaration: manifestPolicy('geolocation'),
    demo: 'geolocation',
  },
  {
    id: 'device-sensors',
    title: 'Read device sensors',
    declaration: manifestPolicy(['gyroscope', 'accelerometer', 'magnetometer']),
    demo: 'device-sensors',
  },
  {
    id: 'fullscreen',
    title: 'Enter fullscreen',
    declaration: manifestPolicy('fullscreen'),
    demo: 'fullscreen',
  },
  {
    id: 'microphone',
    title: 'Use the microphone',
    declaration: manifestPolicy('microphone'),
    demo: 'microphone',
  },
  {
    id: 'camera',
    title: 'Use the camera',
    declaration: manifestPolicy('camera'),
    demo: 'camera',
  },
];

/** The copyable manifest fragment that opts a plugin in to the capability. */
export function declarationCode(def: CapabilityDef): string {
  const payload: Record<string, unknown> = {};
  if (def.declaration.iframeSandbox) {
    payload['iframeSandbox'] = def.declaration.iframeSandbox;
  }
  if (def.declaration.iframeAllow) {
    payload['iframeAllow'] = def.declaration.iframeAllow;
  }
  if (def.declaration.permissionPolicy) {
    payload['permissionPolicy'] = def.declaration.permissionPolicy;
  }
  return `// sp-ui-plugin.json\n${JSON.stringify(payload, null, 2)}`;
}

export interface CapabilityBadge {
  readonly label: string;
  readonly tooltip: string;
}

/** Every capability is opt-in: the App Shell grants nothing beyond scripts and same-origin. */
export function capabilityBadge(): CapabilityBadge {
  return {
    label: 'Opt-in',
    tooltip:
      'Add the keys shown on this card to sp-ui-plugin.json. The App Shell does not enable this unless you declare it.',
  };
}
