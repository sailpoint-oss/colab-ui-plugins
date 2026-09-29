import type { OrgIdentity } from "./org-nav";
import { PHOTO_ATTRIBUTES, toPhotoUri } from "./photos";

// The identity index returns a document, not an OrgIdentity. Three differences
// bite: `name` is the uid (`aarav.chauhan8c45`), the human name is
// `displayName`, and title/location/department live under `attributes`.
export interface IdentityDoc {
  id: string;
  name: string;
  displayName?: string | null;
  manager?: { id: string; name: string; displayName?: string | null } | null;
  identityProfile?: { id: string; name?: string | null } | null;
  attributes?: Record<string, unknown> | null;
}

// Identity profiles do not agree on what the job-title attribute is called.
// `title` is the usual mapping, but `jobTitle` is just as common and a profile
// built from an HR feed may use either. Location and department are far
// more consistent, which is why a tenant can show those and leave title blank.
const TITLE_KEYS = ["title", "jobTitle", "jobtitle", "job_title", "position"];

// A tenant can promote an account photo onto the identity itself — a
// `profilePhoto` identity attribute mapped from the account, exposed through the
// public identity config. That is the only photo a user without admin rights can
// read: the accounts API photos.ts scans is admin-only, so their tree would
// otherwise be initials all the way down. Same attribute names as an account's.
function photoFrom(attributes: Record<string, unknown>): string | undefined {
  for (const name of PHOTO_ATTRIBUTES) {
    const uri = toPhotoUri(attributes[name]);
    if (uri) return uri;
  }
  return undefined;
}

// First attribute in `keys` holding a non-empty string.
function pick(attributes: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = attributes[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

// The name to show. A tenant can map `displayName` straight from the login name
// — an HR feed mapping it to `userid` is common, and leaves every card reading
// `Isabelle.Lynch` — so where it comes back as nothing but the uid again, build
// the name from first and last instead. A `displayName` that says anything more
// than the uid is kept: it may carry a preferred name that first/last cannot.
function nameOf(doc: IdentityDoc, attributes: Record<string, unknown>): string {
  const display = doc.displayName?.trim();
  if (display && display !== doc.name) return display;
  const full = [pick(attributes, "firstname", "firstName"), pick(attributes, "lastname", "lastName")]
    .filter(Boolean)
    .join(" ");
  return full || display || doc.name; // the uid, so a card never renders blank
}

export function toOrgIdentity(doc: IdentityDoc): OrgIdentity {
  const attributes = doc.attributes ?? {};
  return {
    id: doc.id,
    name: nameOf(doc, attributes),
    title: pick(attributes, ...TITLE_KEYS) ?? "—",
    location: pick(attributes, "location") ?? "—",
    orgUnit: pick(attributes, "department") ?? "—",
    manager: doc.manager
      ? { id: doc.manager.id, name: doc.manager.displayName ?? doc.manager.name }
      : null,
    // What the Related Actions need: the login name, the identity profile
    // (whose lifecycle states apply) and the current state.
    uid: doc.name,
    profileId: doc.identityProfile?.id,
    lifecycleState: pick(attributes, "cloudLifecycleState") ?? undefined,
    email: pick(attributes, "email") ?? undefined,
    personalEmail: pick(attributes, "personalEmail") ?? undefined,
    cloudStatus: pick(attributes, "cloudStatus") ?? undefined,
    internalCloudStatus: pick(attributes, "internalCloudStatus") ?? undefined,
    photo: photoFrom(attributes),
  };
}

// GET /v3/public-identities — what a user without admin rights can read, so
// the fallback when the search index answers 403. Here `name` is the display
// name and `alias` the uid, and the only attributes are the ones the tenant's
// public identity config lists, as key/value pairs rather than a record.
export interface PublicIdentityDoc {
  id: string;
  name: string;
  alias?: string | null;
  manager?: { id: string; name: string } | null;
  attributes?: Array<{ key: string; name?: string | null; value?: string | null }> | null;
}

export function fromPublicIdentity(doc: PublicIdentityDoc): OrgIdentity {
  return toOrgIdentity({
    id: doc.id,
    name: doc.alias ?? doc.name,
    displayName: doc.name,
    manager: doc.manager,
    attributes: Object.fromEntries((doc.attributes ?? []).map((a) => [a.key, a.value])),
  });
}
