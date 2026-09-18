import { createSDK, ApiError } from "@sailpoint/ui-plugin-sdk";
import type {
  PluginContext,
  SailPointPluginSDK,
  SailPointPluginSDKConfig,
} from "@sailpoint/ui-plugin-sdk";
import { renderOrgNavigator, type ActionKey } from "./org-view";
import { createActionRunner } from "./actions";
import { levelOf, withManagers, type OrgIdentity } from "./org-nav";
import {
  fromPublicIdentity,
  toOrgIdentity,
  type IdentityDoc,
  type PublicIdentityDoc,
} from "./identity-doc";
import {
  photoAttributesOf,
  photosByIdentity,
  type AccountDoc,
  type SchemaDoc,
  type SourceDoc,
} from "./photos";
import { DEMO_IDENTITIES } from "./demo-data";

// A plugin is embedded by ISC as an iframe, so a real deployment has a parent
// window (the App Shell). Opened directly — locally or hosted for a demo — it is
// the top window and no App Shell exists, so we install the mock App Shell plus
// a stub fetch to render offline.
const isStandalone = window.parent === window;

// Identity id of the logged-in user; the org tree opens at their level — their
// manager on top, them and their colleagues below (see levelOf).
let currentUserId: string | undefined;

// Builds the ISC link behind each card's name; unset when running standalone.
let identityUrl: ((id: string) => string) | undefined;

// Runs a Related Actions menu choice against the tenant (see actions.ts).
let runAction: ((action: ActionKey, person: OrgIdentity) => void) | undefined;

// Whether the tree picker is offered: jumping between the tenant's disconnected
// trees is an admin's view of the whole population, so everyone else gets the
// one hierarchy they are part of and no dropdown.
let canSwitchTree = false;

// localStorage key for where the viewer left off, per tenant and signed-in
// user: the plugin's origin (the CDN, or localhost when dev-linked) is shared
// across tenants, and a shared browser across people.
let viewKey: string | undefined;

// Demo-only stub for sdk.api.* and the Related Actions: canned data, zero
// credentials, no network. A real ISC embed omits this and uses the
// host-provided fetch/token.
const demoFetch: typeof fetch = async (input, init) => {
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const path = new URL(url).pathname;
  const method = (init?.method ?? "GET").toUpperCase();
  if (path.endsWith("/v3/search")) return jsonResponse(DEMO_IDENTITIES.map(asIdentityDoc));
  if (path.endsWith("/lifecycle-states")) return jsonResponse(DEMO_LIFECYCLE_STATES);
  if (path.startsWith("/auth-users/")) return jsonResponse(method === "GET" ? { capabilities: [] } : {});
  if (path.endsWith("/generate-password-reset-token/v1/digit")) {
    return jsonResponse({ digitToken: "48213957", requestId: "demo" });
  }
  if (method !== "GET") return new Response(null, { status: 202, statusText: "Accepted" });
  return jsonResponse({ messages: [{ text: `No demo stub for ${path}` }] }, 404, "Not Found");
};

const DEMO_LIFECYCLE_STATES = ["Active", "Leave of Absence", "Terminated"].map((name) => ({
  id: name.toLowerCase().replace(/\s+/g, "-"),
  name,
  technicalName: name.toLowerCase().replace(/\s+(\w)/g, (_, c: string) => c.toUpperCase()),
  enabled: true,
}));

// DEMO_IDENTITIES is hand-written in the internal shape because it is easier to
// read as an org chart; project it back onto the wire shape so the stub and the
// real API hand the app identical documents.
function asIdentityDoc(p: OrgIdentity): IdentityDoc {
  return {
    id: p.id,
    name: p.id,
    displayName: p.name,
    manager: p.manager ? { id: p.manager.id, name: p.manager.id, displayName: p.manager.name } : null,
    identityProfile: { id: "demo-profile", name: "Demo" },
    attributes: { title: p.title, location: p.location, department: p.orgUnit, cloudLifecycleState: "active" },
  };
}

function jsonResponse(body: unknown, status = 200, statusText = "OK"): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { "content-type": "application/json" },
  });
}

async function boot(): Promise<void> {
  let config: SailPointPluginSDKConfig | undefined;
  if (isStandalone) {
    const { mockSdkContext } = await import("@sailpoint/ui-plugin-sdk/testing");
    // Demo: make the "logged-in" user Robin Vale (id "10") so the org tree
    // opens on them via the same context.user.id path real ISC uses — as an
    // admin, so the demo shows the Related Actions.
    const probe = mockSdkContext();
    const base = probe.context;
    probe.restore();
    const shell = mockSdkContext({
      token: "demo-token",
      context: {
        ...base,
        user: {
          ...base.user,
          id: "10",
          displayName: "Robin Vale",
          email: "robin.vale@example.com",
          capabilities: { ...base.user.capabilities, isOrgAdmin: true },
        },
      },
    });
    config = { targetOrigin: shell.targetOrigin, fetchApi: demoFetch };
  }

  const sdk = createSDK(config);
  try {
    const context = await sdk.getContext();
    currentUserId = context.user.id;
    // The identity page behind each card and the Related Actions are admin
    // screens and APIs: anyone else would get "Page not found" or a 403.
    const { isOrgAdmin, isHelpdesk } = context.user.capabilities;
    const isAdmin = isOrgAdmin || isHelpdesk;
    identityUrl = isAdmin ? identityUrlFrom(context) : undefined;
    viewKey = `isc-org-tree:view:v1:${context.tenant.org}:${context.user.id}`;
    // Every licence the tenant holds, by id and by legacy name — the levels
    // drawer hides levels belonging to products that are not among them.
    const licenses = new Set(
      context.tenant.products.flatMap((product) =>
        (product.licenses ?? []).flatMap((l) => [l.licenseId, l.legacyFeatureName].filter(Boolean)),
      ),
    );
    const run = createActionRunner({
      apiBase: context.tenant.apiUrl.idn,
      token: (refresh) => sdk.api.getToken(refresh),
      fetchApi: config?.fetchApi ?? window.fetch.bind(window),
      onChanged: () => void loadOrgTree(sdk), // a deletion reshapes the tree
      get productName() {
        return productName; // branding lands after the runner is built
      },
      hasLicense: (id) => licenses.has(id),
    });
    runAction = isAdmin ? (action, person) => void run(action, person) : undefined;
    canSwitchTree = isAdmin;
    render();
    void applyBranding(sdk);
    void loadOrgTree(sdk);
    sdk.events.onViewportChange((d) => console.log(`viewport ${d.width}x${d.height}`));
  } catch (error) {
    renderError(error);
  }
}

// The org tree is the whole page: a slim title bar, then the navigator filling
// everything below it. index.html already draws this shell, loader running, so
// it is kept as is — redrawing would restart the animation mid-cycle. Built
// here only if the page arrives without it; keep the two in step.
function render(): void {
  if (document.getElementById("org-tree")) return;
  const app = document.getElementById("app")!;
  app.innerHTML = `
    <header class="topbar"><h1>My Org Chart</h1></header>
    <div id="org-tree">
      <div class="wd-loading" role="status" aria-label="Loading">
        <span class="wd-loader" aria-hidden="true"></span>
      </div>
    </div>
  `;
}

interface Branding {
  name: string;
  navigationColor?: string | null;
  productName?: string | null;
  actionButtonColor?: string | null;
}

// The tenant's product name, shown as the source on a password reset. ISC falls
// back to its own name where a tenant has not branded one.
let productName = "SailPoint";

// Colour the title bar like ISC's own page header (and isc-request-pro): the
// tenant's branding navigation colour. Best-effort — the branding API may be
// closed to the plugin's token, and style.css already holds SailPoint's navy.
async function applyBranding(sdk: SailPointPluginSDK): Promise<void> {
  try {
    const items = await sdk.api.get<Branding[]>("/brandings/v1");
    const brand = items?.find((b) => b.name === "default") ?? items?.[0];
    if (brand?.navigationColor) {
      document.documentElement.style.setProperty("--nav", brand.navigationColor);
    }
    if (brand?.productName) productName = brand.productName;
    // The primary button follows the tenant's branded action colour, as ISC's
    // own does; unset leaves the platform default in style.css.
    if (brand?.actionButtonColor) {
      document.documentElement.style.setProperty("--action", brand.actionButtonColor);
    }
  } catch {
    // Keep SailPoint's defaults.
  }
}

// Where an identity's detail page lives on the tenant, joined to the origin of
// the host page. Kept as one function so a host route change is a one-line fix.
const identityPath = (id: string): string =>
  `/ui/a/admin/identities/${encodeURIComponent(id)}/details/attributes`;

// `page.route` is the host page's full href, so its origin is the tenant. Absent
// standalone, where the mock reports a localhost route and a link would be wrong.
function identityUrlFrom(ctx: PluginContext): ((id: string) => string) | undefined {
  if (isStandalone) return undefined;
  try {
    const origin = new URL(ctx.page.route).origin;
    return (id) => `${origin}${identityPath(id)}`;
  } catch {
    return undefined;
  }
}

// The index caps a page at 250. Taking only the first page gave the org tree an
// alphabetical slice of the tenant, so most managers referenced by a `manager.id`
// were simply absent and the hierarchy collapsed into orphans. Page until the
// tenant is exhausted, bounded so a large tenant cannot hang the page.
const PAGE_SIZE = 250;
const MAX_IDENTITIES = 2500;

async function allPages<T>(page: (offset: number) => Promise<T[]>): Promise<T[]> {
  const all: T[] = [];
  for (let offset = 0; offset < MAX_IDENTITIES; offset += PAGE_SIZE) {
    const items = await page(offset);
    all.push(...items);
    if (items.length < PAGE_SIZE) break;
  }
  return all;
}

// The search index has every attribute but is open to admins only; anyone
// else gets a 403. Public identities are readable by every signed-in user and
// still carry `manager`, which is all the hierarchy needs — their cards show
// only the attributes the tenant's public identity config exposes.
async function getIdentities(sdk: SailPointPluginSDK): Promise<OrgIdentity[]> {
  try {
    const docs = await allPages((offset) =>
      sdk.api.post<IdentityDoc[]>(
        `/v3/search?limit=${PAGE_SIZE}&offset=${offset}`,
        // Sorted by uid: `displayName` is not a sortable field, and a stable sort
        // is what keeps pages from overlapping or skipping records.
        { indices: ["identities"], query: { query: "*" }, sort: ["name"] },
      ),
    );
    return docs.map(toOrgIdentity);
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 403)) throw error;
    const docs = await allPages((offset) =>
      sdk.api.get<PublicIdentityDoc[]>(
        `/v3/public-identities?limit=${PAGE_SIZE}&offset=${offset}&sorters=name`,
      ),
    );
    return docs.map(fromPublicIdentity);
  }
}

// identityId → avatar, from every source whose account schema declares a photo
// attribute (see photos.ts); accounts are only read where a photo can be.
// Best-effort: no such source, a token that can't read accounts, or a source
// that hasn't aggregated photos just keeps the initials.
//
// Both APIs this uses are admin-only, so for anyone else every call here 403s
// and the map comes back empty — their faces come from the identity document
// instead, where a tenant that promotes the account photo to an identity
// attribute puts one within reach of every signed-in user (see photoFrom in
// identity-doc.ts). This still earns its place: it needs no tenant
// configuration, so it is what an admin sees on a tenant without that mapping.
async function getPhotos(sdk: SailPointPluginSDK): Promise<Map<string, string>> {
  const photos = new Map<string, string>();
  try {
    const sources = await sdk.api.get<SourceDoc[]>("/v3/sources?limit=250");
    const candidates = await Promise.all(
      sources.map(async (source) => ({
        source,
        attributes: photoAttributesOf(
          await sdk.api.get<SchemaDoc[]>(`/v3/sources/${source.id}/schemas`).catch(() => []),
        ),
      })),
    );
    for (const { source, attributes } of candidates) {
      if (!attributes.length) continue;
      const filter = encodeURIComponent(`sourceId eq "${source.id}"`);
      for (let offset = 0; offset < MAX_IDENTITIES; offset += PAGE_SIZE) {
        const page = await sdk.api.get<AccountDoc[]>(
          `/v3/accounts?limit=${PAGE_SIZE}&offset=${offset}&filters=${filter}`,
        );
        photosByIdentity(page, attributes, photos);
        if (page.length < PAGE_SIZE) break;
      }
    }
  } catch {
    // Keep the initials.
  }
  return photos;
}

async function loadOrgTree(sdk: SailPointPluginSDK): Promise<void> {
  const target = document.getElementById("org-tree")!;
  try {
    // Photos load alongside the identities rather than after, so the tree is
    // drawn once, with faces, instead of redrawn under the viewer.
    const [identities, photos] = await Promise.all([getIdentities(sdk), getPhotos(sdk)]);
    // An account photo wins where there is one, and whatever the identity
    // document already carried stands where there is not — which is every card
    // for a viewer whose token cannot read accounts at all.
    for (const identity of identities) identity.photo = photos.get(identity.id) ?? identity.photo;
    const hierarchy = withManagers(identities);
    // Identities came back but none has a manager, so withManagers left nothing.
    // Say that plainly — "no identities returned" points at the API, not the data.
    if (identities.length && !hierarchy.length) {
      target.innerHTML = `<p class="dim">Loaded ${identities.length} identities, but none has a manager set, so there is no org hierarchy to show. Check manager correlation on the authoritative source.</p>`;
      return;
    }
    renderOrgNavigator(
      target,
      hierarchy,
      levelOf(hierarchy, currentUserId),
      identityUrl,
      runAction,
      viewKey,
      currentUserId,
      canSwitchTree,
    );
  } catch (error) {
    const detail = error instanceof ApiError ? `${error.status} ${error.statusText}` : String(error);
    target.innerHTML = `<p class="apierror">Could not load hierarchy — ${esc(detail)}</p>`;
  }
}

function renderError(error: unknown): void {
  const app = document.getElementById("app")!;
  const message = error instanceof Error ? error.message : String(error);
  app.innerHTML = `
    <section class="error">
      <h1>Handshake failed</h1>
      <p class="dim">The plugin could not reach an App Shell.</p>
      <pre>${esc(message)}</pre>
    </section>`;
}

// Coerce first: ISC returns nulls and nested objects where the demo data has
// plain strings, and an unexpected shape should not take down the whole page.
function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[ch]!,
  );
}

void boot();
