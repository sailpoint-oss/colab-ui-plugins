// Profile photos live on accounts, as a string attribute some connectors carry:
// Entra's profilePhoto, Active Directory's thumbnailPhoto, an HR file column.
// The identity search document doesn't carry account attributes, so photos are
// read from the accounts API and joined to identities by the account's
// identityId — only for sources whose account schema has a photo attribute.

export interface AccountDoc {
  identityId?: string | null;
  attributes?: Record<string, unknown> | null;
}

export interface SourceDoc {
  id: string;
  name?: string | null;
}

export interface SchemaDoc {
  name: string;
  attributes?: Array<{ name: string }> | null;
}

// The attribute names connectors use for a photo, in order of preference.
export const PHOTO_ATTRIBUTES = ["profilePhoto", "thumbnailPhoto", "jpegPhoto", "photo"];

// The photo attributes an account schema declares, in order of preference.
export function photoAttributesOf(schemas: SchemaDoc[]): string[] {
  const declared = new Set((schemas.find((s) => s.name === "account")?.attributes ?? []).map((a) => a.name));
  return PHOTO_ATTRIBUTES.filter((name) => declared.has(name));
}

// Base64 image payloads announce their format in their first bytes.
const SIGNATURES: Array<[prefix: string, type: string]> = [
  ["/9j/", "image/jpeg"],
  ["iVBORw0KGgo", "image/png"],
  ["R0lGOD", "image/gif"],
  ["UklGR", "image/webp"],
];

// A usable <img> src for an attribute value, or null. Accepts a ready data URI
// or bare base64 of a JPEG, PNG, GIF or WebP. Anything else is ignored — notably
// an http URL, which the plugin CSP would block and Graph would refuse without
// a token of its own.
export function toPhotoUri(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (/^data:image\/[a-z0-9+.-]+;base64,/i.test(trimmed)) return trimmed;
  const base64 = trimmed.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return null;
  const type = SIGNATURES.find(([prefix]) => base64.startsWith(prefix))?.[1];
  return type ? `data:${type};base64,${base64}` : null;
}

// identityId → photo for a page of accounts, added to `into`, reading the first
// of `attributes` that holds an image. When an identity has several
// photographed accounts the first one read wins.
export function photosByIdentity(
  accounts: AccountDoc[],
  attributes: string[] = PHOTO_ATTRIBUTES,
  into = new Map<string, string>(),
): Map<string, string> {
  for (const account of accounts) {
    if (!account.identityId || into.has(account.identityId)) continue;
    for (const name of attributes) {
      const uri = toPhotoUri(account.attributes?.[name]);
      if (uri) {
        into.set(account.identityId, uri);
        break;
      }
    }
  }
  return into;
}
