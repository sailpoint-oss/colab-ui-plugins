export type DemoKind =
  | 'top-navigation'
  | 'popup-new-tab'
  | 'download'
  | 'modals'
  | 'clipboard'
  | 'geolocation'
  | 'camera'
  | 'microphone'
  | 'device-sensors'
  | 'fullscreen';

export type Declaration =
  | {
      kind: 'host-sandbox';
      sandboxTokens: string[];
    }
  | {
      kind: 'manifest';
      iframeAllow?: Record<string, string[]>;
      permissionPolicy?: Record<string, string[]>;
    };

export interface CapabilityDef {
  id: string;
  title: string;
  declaration: Declaration;
  demo: DemoKind;
}

export type CapabilityErrorKind =
  | 'policy'
  | 'user-denied'
  | 'no-hardware'
  | 'unsupported'
  | 'needs-host'
  | 'unknown';

export interface CapabilityResult {
  ok: boolean;
  kind?: CapabilityErrorKind;
  message: string;
}

export const CLIPBOARD_DEMO_TEXT = 'plugin-capability-demo:clipboard-write';
export const CLIPBOARD_DISPLAY_MAX = 2000;
export const DOWNLOAD_FILENAME = 'plugin-capability-demo.txt';
export const DOWNLOAD_BODY = 'UI Plugin Capability Demo sample download.\n';
export const MY_SAILPOINT_PATH = '/ui/d/mysailpoint';
