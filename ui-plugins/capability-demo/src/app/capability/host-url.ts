import { MY_SAILPOINT_PATH } from './capability-types';

/**
 * Returns `https://{tenantHost}/ui/d/mysailpoint` or null if `page.route`
 * is missing, not a URL, or not https.
 */
export function buildMySailPointUrl(pageRoute: string | null | undefined): string | null {
  if (!pageRoute) {
    return null;
  }

  try {
    const origin = new URL(pageRoute).origin;
    const parsed = new URL(origin);
    if (parsed.protocol !== 'https:') {
      return null;
    }
    return `${origin}${MY_SAILPOINT_PATH}`;
  } catch {
    return null;
  }
}
