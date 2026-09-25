import { CLIPBOARD_DISPLAY_MAX } from './capability-types';

export function truncateClipboardText(text: string, max = CLIPBOARD_DISPLAY_MAX): string {
  if (text.length <= max) {
    return text;
  }
  return text.slice(0, max);
}
