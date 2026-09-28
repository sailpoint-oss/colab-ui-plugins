import type { CapabilityDef } from './capability-types';

function hostSandbox(sandboxTokens: string | string[]): CapabilityDef['declaration'] {
  return {
    kind: 'host-sandbox',
    sandboxTokens: Array.isArray(sandboxTokens) ? sandboxTokens : [sandboxTokens],
  };
}

function manifestPolicy(keys: string | string[]): CapabilityDef['declaration'] {
  const iframeAllow: Record<string, string[]> = {};
  const permissionPolicy: Record<string, string[]> = {};
  for (const key of Array.isArray(keys) ? keys : [keys]) {
    iframeAllow[key] = ["'src'"];
    permissionPolicy[key] = ["'self'"];
  }
  return { kind: 'manifest', iframeAllow, permissionPolicy };
}

export const CAPABILITY_CATALOG: readonly CapabilityDef[] = [
  {
    id: 'allow-top-navigation',
    title: 'Open a link in the same window',
    declaration: hostSandbox('allow-top-navigation'),
    demo: 'top-navigation',
  },
  {
    id: 'open-link-new-tab',
    title: 'Open a link in a new tab',
    declaration: hostSandbox(['allow-popups', 'allow-popups-to-escape-sandbox']),
    demo: 'popup-new-tab',
  },
  {
    id: 'allow-downloads',
    title: 'Download a file',
    declaration: hostSandbox('allow-downloads'),
    demo: 'download',
  },
  {
    id: 'allow-modals',
    title: 'Show browser dialogs',
    declaration: hostSandbox('allow-modals'),
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

/** The copyable manifest fragment, or null when the App Shell grants the capability. */
export function declarationCode(def: CapabilityDef): string | null {
  if (def.declaration.kind === 'host-sandbox') {
    return null;
  }

  const payload: Record<string, unknown> = {};
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

export function capabilityBadge(def: CapabilityDef): CapabilityBadge {
  if (def.declaration.kind === 'host-sandbox') {
    const tokens = def.declaration.sandboxTokens.join(' and ');
    return {
      label: 'Default',
      tooltip: `The App Shell already enables this for every plugin (${tokens}). You add nothing to sp-ui-plugin.json.`,
    };
  }
  return {
    label: 'Opt-in',
    tooltip:
      'Add the keys shown on this card to sp-ui-plugin.json. The App Shell does not enable this unless you declare it.',
  };
}
