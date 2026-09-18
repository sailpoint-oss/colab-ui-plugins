import { EMPTY_STATE_ART } from "./empty-state";
import type { OrgIdentity } from "./org-nav";
import type { ActionKey } from "./org-view";

// The identity Related Actions menu, wired to the tenant APIs behind ISC's own
// admin actions. Each runs as the signed-in admin (the plugin's scoped token),
// asks for confirmation first — the destructive ones with a red button and
// Cancel focused — and reports the outcome in a toast, with the API's own
// message when it refuses.

export interface ActionEnv {
  /** Tenant API origin, e.g. https://acme.api.identitynow.com. */
  apiBase: string;
  /** The scoped bearer token; `refresh` forces a new one after a 401. */
  token: (refresh?: boolean) => Promise<string>;
  /** The SDK's own api.* offers only GET and POST, so calls go through fetch. */
  fetchApi: typeof fetch;
  /** Called after an action that changes the hierarchy (a deletion). */
  onChanged: () => void;
  /** The tenant's branded product name, shown as the source on a password reset. */
  productName?: string;
  /**
   * Whether the tenant holds a licence, by `licenseId` or `legacyFeatureName`
   * (`context.tenant.products[].licenses`). The user levels drawer hides the
   * levels that belong to products the tenant has not bought.
   */
  hasLicense?: (id: string) => boolean;
}

// The user levels ISC offers, as auth-user capabilities, in its own order.
export const USER_LEVELS: Array<[capability: string, label: string]> = [
  ["ORG_ADMIN", "Admin"],
  ["HELPDESK", "Helpdesk"],
  ["CERT_ADMIN", "Certification Admin"],
  ["REPORT_ADMIN", "Report Admin"],
  ["ROLE_ADMIN", "Role Admin"],
  ["ROLE_SUBADMIN", "Role Subadmin"],
  ["SOURCE_ADMIN", "Source Admin"],
  ["SOURCE_SUBADMIN", "Source Subadmin"],
  ["POLICY_ADMIN", "Policy Admin"],
  ["DASHBOARD", "Dashboard"],
  ["CLOUD_GOV_ADMIN", "Cloud Governance Admin"],
  ["CLOUD_GOV_USER", "Cloud Governance User"],
  ["SAAS_MANAGEMENT_ADMIN", "SaaS Management Admin"],
  ["SAAS_MANAGEMENT_READER", "SaaS Management Reader"],
];

// `slide(400, 100, 0)` on `slpt-overlay`: how long the drawer takes to arrive.
const PANEL_SLIDE_MS = 400;

// `identity-set-permissions-overlay` pages its levels ten at a time. The drawer
// opens on the first two pages and fills in the rest behind itself, so it is not
// waiting on a call per ten levels before it shows anything.
const LEVELS_PAGE = 10;
const LEVELS_EAGER = 2;
const LEVELS_MAX = 500;

const SEARCH_ICON = `<svg class="wd-search-icon" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true"><path d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"/></svg>`;
// `slpt-sort-dropdown`'s trigger carries the `sortAsc` icon — Font Awesome's
// arrow-down-short-wide.
const SORT_ICON = `<svg viewBox="0 0 576 512" fill="currentColor" aria-hidden="true"><path d="M151.6 469.6C145.5 476.2 137 480 128 480s-17.5-3.8-23.6-10.4l-88-96c-11.9-13-11.1-33.3 2-45.2s33.3-11.1 45.2 2L96 365.7 96 64c0-17.7 14.3-32 32-32s32 14.3 32 32l0 301.7 32.4-35.4c11.9-13 32.2-13.9 45.2-2s13.9 32.2 2 45.2l-88 96zM320 480c-17.7 0-32-14.3-32-32s14.3-32 32-32l32 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-32 0zm0-128c-17.7 0-32-14.3-32-32s14.3-32 32-32l96 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-96 0zm0-128c-17.7 0-32-14.3-32-32s14.3-32 32-32l160 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-160 0zm0-128c-17.7 0-32-14.3-32-32s14.3-32 32-32l224 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L320 96z"/></svg>`;
const CHEVRON_LEFT = `<svg viewBox="0 0 320 512" fill="currentColor" aria-hidden="true"><path d="M9.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l192 192c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L77.3 256 246.6 86.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-192 192z"/></svg>`;
const CHEVRON_RIGHT = `<svg viewBox="0 0 320 512" fill="currentColor" aria-hidden="true"><path d="M310.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-192 192c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L242.7 256 73.4 86.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l192 192z"/></svg>`;

// How long a Reset Password one-time code stays valid, and its length.
export const CODE_MINUTES = 15;
const CODE_LENGTH = 8;

interface LifecycleState {
  id: string;
  name: string;
  technicalName?: string | null;
  /** Whether the identity profile has this state switched on. */
  enabled?: boolean;
  /** ISC's own ordering for the list, in tens: Pre Hire 10, Active 20, … */
  priority?: number | null;
}

class ActionError extends Error {}

export function createActionRunner(env: ActionEnv): (key: ActionKey, person: OrgIdentity) => Promise<void> {
  return async (key, person) => {
    try {
      const outcome = await ACTIONS[key](env, person);
      if (outcome) showNotice(outcome, "success");
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      showNotice(`${LABELS[key]} failed for ${person.name} — ${why}`, "error");
    }
  };
}

const LABELS: Record<ActionKey, string> = {
  process: "Process Identity",
  lifecycle: "Set Lifecycle State",
  sync: "Synchronize Attributes",
  invite: "Invite Identity",
  delete: "Delete Identity",
  reset: "Reset Identity",
  password: "Reset Password",
  levels: "Set User Levels",
  disable: "Disable Identity",
  enable: "Enable Identity",
};

const enc = encodeURIComponent;
const who = (p: OrgIdentity): string => `<strong>${esc(p.name)}</strong>`;

// Each action returns the success message to toast, or null when the viewer
// cancelled (or the outcome was already shown).
const ACTIONS: Record<ActionKey, (env: ActionEnv, p: OrgIdentity) => Promise<string | null>> = {
  // Straight from the menu, no question in the way: refreshing an identity from
  // its own accounts changes nothing on its own, and ISC asks nothing either.
  async process(env, p) {
    await call(env, "POST", "/identities/v1/process", { identityIds: [p.id] });
    return "Success! Your identity is now processing.";
  },

  // Queued straight from the menu, as ISC does: pushing identity attributes out
  // to connected accounts asks nothing first, and reports in these words.
  async sync(env, p) {
    await call(env, "POST", `/identities/v1/${enc(p.id)}/synchronize-attributes`);
    return "Success! Attribute sync has been queued.";
  },

  // No confirmation: ISC invites straight from its own menu, and says so with a
  // notification rather than a question. The call is queued tenant-side (202),
  // so "Sending invitations." is the whole outcome — there is no later signal to
  // wait for, which is why the platform's copy is worded as it is.
  async invite(env, p) {
    const sending = showNotice("Sending invitations.");
    try {
      await call(env, "POST", "/identities/v1/invite", { ids: [p.id], uninvited: false });
    } finally {
      sending.close(); // whatever comes next replaces it
    }
    // The platform's own wording for the queued job finishing, which is all a
    // 202 tells us: one identity went to it, so one invitation.
    return "Complete! 1 invitation was sent successfully.";
  },

  async reset(env, p) {
    if (!(await confirmAction("reset", `Resetting an identity prevents the user from signing in, and they must be reinvited to use IdentityNow.`, "Reset Identity", { tone: "danger", guarded: true }))) return null;
    await call(env, "POST", `/identities/v1/${enc(p.id)}/reset`);
    return "Success! The identity has been reset.";
  },

  async delete(env, p) {
    if (!(await confirmAction("delete", `Deleting an identity removes it from the Identity List. It must be aggregated again from an authoritative source to be recreated.`, "Delete Identity", { tone: "info", guarded: true }))) return null;
    await call(env, "DELETE", `/identities/v1/${enc(p.id)}`);
    env.onChanged();
    return "Success! The identity has been deleted.";
  },

  // ISC's own wording for the question and the outcome (ADMIRAL's
  // DISABLE_IDENTITY_INFO and SUCCESS_THE_IDENTITY_HAS_BEEN_DISABLED).
  async disable(env, p) {
    if (!(await confirmAction("disable", `Disabling an identity prevents the user from signing in to IdentityNow.`, "Disable Identity", { tone: "danger", guarded: true }))) return null;
    await call(env, "POST", `/identities-accounts/v1/${enc(p.id)}/disable`);
    p.cloudStatus = "DISABLED"; // the menu offers Enable from here on
    return "Success! The identity has been disabled.";
  },

  // Offered in Disable's place once the identity is disabled (see actionsFor),
  // and unlike Disable it asks nothing first: giving someone their sign-in back
  // is the undo, not the destructive half of the pair.
  async enable(env, p) {
    await call(env, "POST", `/identities-accounts/v1/${enc(p.id)}/enable`);
    p.cloudStatus = "ACTIVE";
    return "Success! The identity has been enabled.";
  },

  async lifecycle(env, p) {
    if (!p.profileId) throw new ActionError("they have no identity profile");
    const all = (await call<LifecycleState[]>(env, "GET", `/identity-profiles/v1/${enc(p.profileId)}/lifecycle-states`)) ?? [];
    // Only states the profile has switched on can be assigned — setting a
    // disabled one fails with "The system is currently not in a state in which
    // it can fulfill the request". ISC's own overlay never offers them:
    // `setRadioOptions` filters on `item.enabled` before building the list.
    const states = all.filter((s) => s.enabled);
    if (!states.length) {
      throw new ActionError(
        "there are no lifecycle states enabled on this user's identity profile — create and enable one for the profile",
      );
    }
    // The API returns them in no order at all. Sort by the priority ISC itself
    // lists them in, which reads as the lifecycle rather than the alphabet —
    // Pre Hire, Active, Leave of Absence, Terminated, Archived — and fall back
    // to the name where a tenant leaves priorities equal or unset.
    const ordered = [...states].sort(
      (a, b) => (a.priority ?? Infinity) - (b.priority ?? Infinity) || a.name.localeCompare(b.name),
    );
    const current = p.lifecycleState?.toLowerCase();
    const isCurrent = (s: LifecycleState): boolean =>
      [s.technicalName, s.name].some((n) => n?.toLowerCase() === current);
    const form = await openDialog({
      // The platform names the person in the title rather than in a line of
      // body copy above the choices.
      title: `${LABELS.lifecycle} for ${p.name}`,
      confirm: "Save",
      panel: true,
      confirmWhenChanged: true,
      body: `<fieldset class="wd-choices">${ordered
          .map(
            (s) =>
              `<label class="wd-choice"><input type="radio" name="state" value="${esc(s.id)}"${isCurrent(s) ? " checked" : ""}><span>${esc(s.name)}</span></label>`,
          )
          .join("")}</fieldset>`,
    });
    const chosen = states.find((s) => s.id === form?.get("state"));
    if (!chosen) return null;
    await call(env, "POST", `/identities/v1/${enc(p.id)}/set-lifecycle-state`, { lifecycleStateId: chosen.id });
    // The tree loaded this identity once, so its copy still holds the state it
    // had then and reopening this dialog would preselect that. The tenant has
    // taken the change, so carry it into the card we were handed rather than
    // reloading the whole hierarchy for one attribute. Stored as the identity
    // carries it — `cloudLifecycleState` is the technical name.
    p.lifecycleState = chosen.technicalName ?? chosen.name;
    return `${p.name} is now ${chosen.name}.`;
  },

  // ISC emails the user a reset link rather than handing the admin a code: an
  // `info` dialog naming the source, the work address, and a choice of personal
  // where the identity has one. The route behind it is the platform's own
  // (`identities-service-api.resetPasswordV3`), which refuses an external token
  // — whether the App Shell's counts as one decides if this works in the embed,
  // so a refusal falls through to the one-time code, which always works.
  async password(env, p) {
    const sendTo = (kind: string, email: string): string => `Send to ${kind} email: ${esc(email)}`;
    const choice = p.personalEmail
      ? `<fieldset class="wd-choices">
           <label class="wd-choice"><input type="radio" name="via" value="LINK_WORK" checked><span>${sendTo("work", p.email ?? "—")}</span></label>
           <label class="wd-choice"><input type="radio" name="via" value="LINK_PERSONAL"><span>${sendTo("personal", p.personalEmail)}</span></label>
         </fieldset>`
      : `<p>${sendTo("work", p.email ?? "—")}</p>`;
    const form = await openDialog({
      title: `Reset password for ${p.name}`,
      tone: "info",
      variant: "reset-password",
      confirm: "Send",
      body: `<p class="wd-attr-key">Source Name</p>
        <p class="wd-attr-value">${esc(env.productName ?? "SailPoint")}</p>
        <div class="wd-send-to">${choice}</div>`,
    });
    if (!form) return null;
    const via = String(form.get("via") ?? "LINK_WORK");

    try {
      await call(env, "POST", `/pigs/password-v3/identities/${enc(p.id)}/verification/account/send`, { via });
      return `Success! ${p.name} will receive an email to reset their password.`;
    } catch (error) {
      return codeFallback(env, p, error);
    }
  },

  // ISC opens this as a drawer over the list: a search, a bar counting results
  // and selections, the levels as selectable cards carrying their descriptions,
  // and a pager ten at a time (`identity-set-permissions-overlay`).
  async levels(env, p) {
    const [user, first] = await Promise.all([
      call<{ capabilities?: string[] | null }>(env, "GET", `/auth-users/v1/${enc(p.id)}`),
      firstUserLevels(env),
    ]);
    const held = new Set<string>(user?.capabilities ?? []);
    const source: LevelSource = { levels: first.levels, total: first.total ?? first.levels.length };
    // The selection is only about levels the drawer offers; anything else the
    // identity holds (Data Access Security, Config Hub…) is carried through
    // untouched on save rather than silently removed by the replace.
    const selected = new Set<string>();
    const opened = new Set<string>();
    // Levels arriving later are held-checked the same way, so a level on a page
    // that had not loaded yet still opens ticked — and does not read as a change.
    const absorb = (batch: UserLevel[]): void => {
      for (const l of batch) {
        if (held.has(l.id)) {
          selected.add(l.id);
          opened.add(l.id);
        }
      }
    };
    absorb(source.levels);

    const ok = await openDialog({
      title: `Set the user levels for ${p.name}`,
      confirm: "Save",
      panel: true,
      variant: "user-levels",
      body: userLevelsBody(),
      isDirty: () =>
        selected.size !== opened.size || [...selected].some((cap) => !opened.has(cap)),
      onOpen: (form) => {
        const redraw = wireUserLevels(form, source, selected, opened);
        if (first.more) void fillUserLevels(env, form, source, absorb, redraw);
      },
    });
    if (!ok) return null;
    const offered = new Set(source.levels.map((l) => l.id));
    const value = [...selected, ...[...held].filter((cap) => !offered.has(cap))];
    await call(env, "PATCH", `/auth-users/v1/${enc(p.id)}`, [{ op: "replace", path: "/capabilities", value }], "application/json-patch+json");
    return "Success! User levels updated.";
  },
};

export interface UserLevel {
  /** The capability as `/auth-users` carries it, e.g. `ORG_ADMIN`. */
  id: string;
  name: string;
  description: string;
}

// ISC lists 33 levels with their descriptions from its authorization service.
// That route refuses an external token, so where it is closed to us the drawer
// falls back to the capabilities this plugin knows by name — fewer, and without
// descriptions, but the same ids, so a save still means the same thing.
// Ordinal, not locale-aware: the service orders by codepoint, where an
// uppercase letter sorts before a lowercase one. That puts "AR Policy Admin"
// straight after "AAA Policy Admin", where `localeCompare` — which folds case —
// would drop it past "Admin".
const byName = (a: UserLevel, b: UserLevel): number =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : 0;

// The levels this plugin knows by name, without descriptions — what the drawer
// shows when the authorization route is closed to it.
const fallbackLevels = (): UserLevel[] =>
  USER_LEVELS.map(([id, name]) => ({ id, name, description: "" })).sort(byName);

// The filter ISC puts on the level list besides `adminAssignable`: a level for a
// product the tenant has not licensed is not offered at all. Mirrors
// `buildProductFilter` in `identity-set-permissions-overlay`, whose flags are
// `@LacksProductFlag` decorators over the same licence ids.
function productFilter(env: ActionEnv): string {
  const has = env.hasLicense ?? (() => true);
  const lacks = (...ids: string[]): boolean => !ids.some(has);
  const terms = ['not id eq "idn:dashboard"'];
  if (lacks("idn:certification")) terms.push('not id eq "idn:cert-admin"');
  if (lacks("idn:saas-management")) {
    terms.push('not id eq "idn:saas-management-admin" and not id eq "idn:saas-management-reader"');
  }
  if (lacks("idn:cloud-access-management", "idn:ciem")) {
    terms.push('not id eq "cam:cloud-gov-admin" and not id eq "cam:cloud-gov-user"');
  }
  if (lacks("DATA_ACCESS_SECURITY")) terms.push('not id co "das:"');
  if (lacks("iai:access-insights")) terms.push('not id co "sp:aic"');
  if (lacks("IDG_BASE", "IDENTITY_RISK")) terms.push('not id co "idg:"');
  return terms.join(" and ");
}

// One run of pages from the authorization service, starting at `offset`.
// `more` is false once a short page says the list is exhausted.
async function fetchLevels(
  env: ActionEnv,
  offset: number,
  pages: number,
): Promise<{ levels: UserLevel[]; more: boolean; total: number | null }> {
  interface Capability {
    id?: string;
    /**
     * The capability id `/auth-users` accepts, e.g. `ORG_ADMIN`. The list route
     * calls it `legacyGroup` and leaves it `""` where there is none; the
     * identity's own capabilities call the same thing `legacyId`.
     */
    legacyGroup?: string;
    legacyId?: string;
    name?: string;
    description?: string;
    /** What ISC shows in place of `name`, where the capability has one. */
    translatedName?: string;
    translatedDescription?: string;
  }
  const levels: UserLevel[] = [];
  let total: number | null = null;
  let at = offset;
  for (let i = 0; i < pages; i++, at += LEVELS_PAGE) {
    // `adminAssignable eq true` and `detailLevel=slim`, as the overlay asks:
    // without the filter the service also answers with capabilities no admin can
    // grant, which is why the unfiltered list is half again as long.
    const filters = `adminAssignable eq true and ${productFilter(env)}`;
    // `sorters=name`, as the overlay sends: it also keeps paging stable, since
    // an unordered list can repeat or skip rows between pages.
    const query =
      `limit=${LEVELS_PAGE}&offset=${at}&count=true&detailLevel=slim&sorters=name` +
      `&filters=${encodeURIComponent(filters)}`;
    const { body, res } = await request<Capability[]>(
      env,
      "GET",
      `/ams/v3/authorization/authorization-capabilities/?${query}`,
    );
    const counted = Number(res.headers.get("x-total-count"));
    if (Number.isFinite(counted) && counted > 0) total = counted;
    const page = body ?? [];
    for (const c of page) {
      // `legacyGroup || legacyId || id`, as `getRowId` does. It matters: a
      // level saved under its service id — `idn:admin` rather than `ORG_ADMIN`
      // — comes back as `Illegal attempt to modify "capabilities:[idn:admin]"`.
      // Truthiness, not `??`: the list sends `""` for a level that has none.
      const id = c.legacyGroup || c.legacyId || c.id;
      if (id) {
        levels.push({
          id,
          name: c.translatedName || c.name || id,
          description: c.translatedDescription || c.description || "",
        });
      }
    }
    if (page.length < LEVELS_PAGE) return { levels, more: false, total };
  }
  return { levels, more: at < LEVELS_MAX, total };
}

// The first couple of pages, which is what the drawer opens on. The rest is
// fetched behind it (see `levels`), so the wait is two calls rather than one per
// ten levels. A route that refuses us falls back to the built-in list.
async function firstUserLevels(
  env: ActionEnv,
): Promise<{ levels: UserLevel[]; more: boolean; total: number | null }> {
  try {
    const first = await fetchLevels(env, 0, LEVELS_EAGER);
    if (first.levels.length) {
      return { levels: first.levels.sort(byName), more: first.more, total: first.total };
    }
  } catch {
    // The authorization route is closed to this token.
  }
  const levels = fallbackLevels();
  return { levels, more: false, total: levels.length };
}

// The rest of the list, fetched behind the open drawer a couple of pages at a
// time and folded in as it arrives. Stops when the list is exhausted, when the
// route refuses a later page, or when the drawer has been closed.
async function fillUserLevels(
  env: ActionEnv,
  form: HTMLFormElement,
  source: LevelSource,
  absorb: (batch: UserLevel[]) => void,
  redraw: () => void,
): Promise<void> {
  let offset = source.levels.length;
  for (;;) {
    if (!form.isConnected) return; // closed while we were fetching
    let batch;
    try {
      batch = await fetchLevels(env, offset, LEVELS_EAGER);
    } catch {
      return; // keep what is already on screen
    }
    if (!batch.levels.length) return;
    offset += batch.levels.length;
    source.levels.push(...batch.levels);
    source.levels.sort(byName);
    if (batch.total) source.total = batch.total;
    absorb(batch.levels);
    if (form.isConnected) redraw();
    // Stop at the total the tenant reported, not only when a short page says
    // so: a route that keeps answering full pages would otherwise be followed
    // until the hard cap, inflating the very count this is meant to steady.
    if (!batch.more || source.levels.length >= source.total) return;
  }
}

// `loading-mask`: a half-opaque sheet over whatever is there, carrying the
// platform loader and the word beneath it.
const LOADING_MASK = `<div class="wd-loading-mask" role="status">
    <span class="wd-loader" aria-hidden="true"></span>
    <p>Loading</p>
  </div>`;

// `slpt-empty-state`: the illustration, then the message beneath it.
const emptyState = (message: string): string =>
  `<div class="wd-empty-state">
    ${EMPTY_STATE_ART}
    <div class="wd-empty-msg"><h2>${esc(message)}</h2></div>
  </div>`;

// The drawer's shell. Everything inside `.wd-levels-list` and the counts is
// redrawn by `wireUserLevels` as the viewer searches, pages or selects.
function userLevelsBody(): string {
  return `<div class="wd-levels">
      <div class="wd-levels-query-row">
        <div class="wd-levels-search">
          ${SEARCH_ICON}
          <input type="search" class="wd-levels-query" placeholder="Search User Levels" aria-label="Search User Levels">
        </div>
        <div class="wd-sort">
          <button type="button" class="wd-sort-trigger" data-sort-open aria-label="Sort" aria-haspopup="true" aria-expanded="false">${SORT_ICON}</button>
          <div class="wd-sort-menu" data-popover hidden>
            <div class="wd-sort-order">
              <span class="wd-form-label">Sort Order</span>
              <div class="wd-toggle-group">
                <button type="button" class="wd-toggle on" data-order="asc">Ascending</button>
                <button type="button" class="wd-toggle" data-order="desc">Descending</button>
              </div>
            </div>
            <div>
              <span class="wd-form-label">Sort by</span>
              <label class="wd-choice"><input type="radio" name="sortby" value="name" checked><span>Name</span></label>
              <div class="wd-sort-apply">
                <button type="button" class="wd-btn wd-btn-primary" data-sort-apply>Sort</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="wd-levels-bar">
        <span class="wd-levels-count"></span>
        <span class="wd-levels-selected"></span>
        <button type="button" class="wd-link" data-view></button>
      </div>
      <div class="wd-levels-list"></div>
      <div class="wd-levels-pager">
        <span>Page</span>
        <span class="wd-levels-page" aria-live="polite"></span>
        <span class="wd-levels-of"></span>
        <button type="button" class="wd-page-btn" data-prev aria-label="Previous page">${CHEVRON_LEFT}</button>
        <button type="button" class="wd-page-btn" data-next aria-label="Next page">${CHEVRON_RIGHT}</button>
      </div>
    </div>`;
}

// Search, paging, selection and the Save button's own state. Selection lives in
// `selected` rather than in the checkboxes, which come and go as pages change.
interface LevelSource {
  /** What has arrived so far, growing as later pages land. */
  levels: UserLevel[];
  /** How many there are in all, from `x-total-count` — known before they are. */
  total: number;
}

function wireUserLevels(
  form: HTMLFormElement,
  source: LevelSource,
  selected: Set<string>,
  /** The selection as the drawer opened, which Save waits to differ from. */
  opened: Set<string>,
): () => void {
  const q = form.querySelector<HTMLInputElement>(".wd-levels-query")!;
  const list = form.querySelector<HTMLElement>(".wd-levels-list")!;
  const save = form.querySelector<HTMLButtonElement>("[data-confirm]")!;
  const viewBtn = form.querySelector<HTMLButtonElement>("[data-view]")!;
  let page = 0;
  let onlySelected = false;
  let descending = false;

  // Unfiltered, the count is the tenant's total rather than however many pages
  // have arrived — otherwise the results and page numbers climb as the list
  // fills in behind the drawer, which reads as the numbers being unreliable.
  const filtering = (): boolean => !!q.value.trim() || onlySelected;
  const ordered = (list: UserLevel[]): UserLevel[] =>
    descending ? [...list].reverse() : list;
  const matching = (): UserLevel[] => {
    const needle = q.value.trim().toLowerCase();
    return source.levels.filter(
      (l) =>
        (!onlySelected || selected.has(l.id)) &&
        (!needle ||
          l.name.toLowerCase().includes(needle) ||
          l.description.toLowerCase().includes(needle)),
    );
  };

  const draw = (): void => {
    const shown = matching();
    const count = filtering() ? shown.length : Math.max(source.total, shown.length);
    const pages = Math.max(1, Math.ceil(count / LEVELS_PAGE));
    page = Math.min(page, pages - 1);
    const slice = ordered(shown).slice(page * LEVELS_PAGE, (page + 1) * LEVELS_PAGE);
    // A page whose levels have not arrived yet: the count already knows they
    // exist, so say they are coming rather than showing an empty page.
    const pending = !slice.length && !filtering() && shown.length < count;
    list.innerHTML = pending
      ? emptyState("No user levels found") + LOADING_MASK
      : slice.length
      ? slice
          .map(
            (l) => `<label class="wd-level">
              <input type="checkbox" class="wd-check-input" value="${esc(l.id)}"${selected.has(l.id) ? " checked" : ""}>
              <span class="wd-check" aria-hidden="true">${FA_CHECK}</span>
              <span class="wd-level-text">
                <span class="wd-level-name">${esc(l.name)}</span>
                ${l.description ? `<span class="wd-level-desc">${esc(l.description)}</span>` : ""}
              </span>
            </label>`,
          )
          .join("")
      : emptyState(onlySelected ? "No user levels selected" : "No user levels found");

    // The pager goes with the list: ISC shows the empty state on its own.
    form.querySelector<HTMLElement>(".wd-levels-pager")!.hidden = !slice.length && !pending;
    form.querySelector<HTMLElement>(".wd-levels-count")!.textContent =
      `${count} ${count === 1 ? "Result" : "Results"}`;
    form.querySelector<HTMLElement>(".wd-levels-selected")!.textContent = `${selected.size} Total Selected`;
    viewBtn.textContent = onlySelected ? "Clear" : "View";
    form.querySelector<HTMLElement>(".wd-levels-page")!.textContent = String(page + 1);
    form.querySelector<HTMLElement>(".wd-levels-of")!.textContent = `of ${pages}`;
    form.querySelector<HTMLButtonElement>("[data-prev]")!.disabled = page === 0;
    form.querySelector<HTMLButtonElement>("[data-next]")!.disabled = page >= pages - 1;
    // Nothing to save until the selection differs from how it opened.
    save.disabled =
      selected.size === opened.size && [...selected].every((c) => opened.has(c));
  };

  list.addEventListener("change", (e) => {
    const box = e.target as HTMLInputElement;
    if (box.type !== "checkbox") return;
    if (box.checked) selected.add(box.value);
    else selected.delete(box.value);
    draw();
  });
  q.addEventListener("input", () => {
    page = 0;
    draw();
  });
  viewBtn.addEventListener("click", () => {
    onlySelected = !onlySelected;
    page = 0;
    draw();
  });
  // `slpt-sort-dropdown`: the order is chosen in the popover and applied by its
  // own Sort button, not as the toggles are clicked.
  const sortMenu = form.querySelector<HTMLElement>(".wd-sort-menu")!;
  const sortTrigger = form.querySelector<HTMLButtonElement>("[data-sort-open]")!;
  let pickedDescending = descending;
  // Clicking away closes it, as a dropdown should. The listener lives only
  // while the popover is open, and lets go if the drawer closes under it.
  const onAway = (e: Event): void => {
    if (!form.isConnected) return closeSort();
    if (!(e.target instanceof Node) || !form.querySelector(".wd-sort")!.contains(e.target)) closeSort();
  };
  const onSortKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      closeSort();
      sortTrigger.focus();
    }
  };
  const closeSort = (): void => {
    sortMenu.hidden = true;
    sortTrigger.setAttribute("aria-expanded", "false");
    document.removeEventListener("mousedown", onAway, true);
    document.removeEventListener("keydown", onSortKey, true);
  };
  sortTrigger.addEventListener("click", () => {
    if (!sortMenu.hidden) return closeSort();
    sortMenu.hidden = false;
    sortTrigger.setAttribute("aria-expanded", "true");
    document.addEventListener("mousedown", onAway, true);
    document.addEventListener("keydown", onSortKey, true);
  });
  sortMenu.querySelectorAll<HTMLButtonElement>("[data-order]").forEach((b) =>
    b.addEventListener("click", () => {
      pickedDescending = b.dataset.order === "desc";
      sortMenu
        .querySelectorAll<HTMLElement>("[data-order]")
        .forEach((x) => x.classList.toggle("on", x === b));
    }),
  );
  form.querySelector("[data-sort-apply]")!.addEventListener("click", () => {
    descending = pickedDescending;
    page = 0;
    closeSort();
    draw();
  });

  form.querySelector("[data-prev]")!.addEventListener("click", () => {
    page = Math.max(0, page - 1);
    draw();
  });
  form.querySelector("[data-next]")!.addEventListener("click", () => {
    page += 1;
    draw();
  });
  draw();
  return draw;
}

// When the tenant will not send the reset email, fall back to the one-time code
// the admin reads out — `/generate-password-reset-token/v1/digit` is open to a
// plugin's token where the email route may not be. The dialog says which of the
// two happened, so nobody waits for an email that was never sent.
async function codeFallback(env: ActionEnv, p: OrgIdentity, why: unknown): Promise<string | null> {
  const token = await call<{ digitToken?: string }>(env, "POST", "/generate-password-reset-token/v1/digit", {
    userId: p.uid ?? p.id,
    length: CODE_LENGTH,
    durationMinutes: CODE_MINUTES,
  });
  if (!token?.digitToken) throw why instanceof Error ? why : new ActionError(String(why));
  await openDialog({
    title: `Reset password for ${p.name}`,
    tone: "info",
    confirm: "Done",
    cancel: false,
    body: `<p>The reset email could not be sent from here, so this one-time code stands in.
        Give it to ${who(p)} — it expires in ${CODE_MINUTES} minutes.</p>
      <p class="wd-code" aria-label="One-time code">${esc(token.digitToken)}</p>`,
  });
  return null; // the code itself was the outcome
}

// One authenticated call to the tenant API, retried once with a fresh token on
// a 401. Throws with the API's own message on failure.
async function call<T = unknown>(
  env: ActionEnv,
  method: string,
  path: string,
  body?: unknown,
  contentType = "application/json",
): Promise<T | null> {
  return (await request<T>(env, method, path, body, contentType)).body;
}

// As `call`, but hands back the response as well — the level list reads its
// total from `x-total-count` rather than counting pages as they arrive.
async function request<T = unknown>(
  env: ActionEnv,
  method: string,
  path: string,
  body?: unknown,
  contentType = "application/json",
): Promise<{ body: T | null; res: Response }> {
  const send = async (refresh: boolean): Promise<Response> => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await env.token(refresh)}`,
      // Several of these routes sit behind SailPoint's experimental flag and
      // answer 400 "Experimental Header 'X-SailPoint-Experimental' is missing
      // or invalid" without it — invite, process, synchronize-attributes and
      // the password token, as of 2026-09. Sent on every call: the routes that
      // do not require it ignore it, and which ones are gated is SailPoint's to
      // change, as this bill already came due once.
      "X-SailPoint-Experimental": "true",
    };
    if (body !== undefined) headers["Content-Type"] = contentType;
    return env.fetchApi(`${env.apiBase.replace(/\/+$/, "")}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };
  let res = await send(false);
  if (res.status === 401) res = await send(true);
  const text = await res.text();
  const json = text ? parse(text) : null;
  if (!res.ok) throw new ActionError(apiMessage(json) ?? `${res.status} ${res.statusText}`.trim());
  return { body: json as T | null, res };
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function apiMessage(body: unknown): string | null {
  if (typeof body === "string") return body || null;
  const messages = (body as { messages?: Array<{ text?: string }> } | null)?.messages;
  return messages?.find((m) => m.text)?.text ?? null;
}

const confirmAction = async (
  key: ActionKey,
  question: string,
  confirm: string,
  o: { tone?: DialogOptions["tone"]; guarded?: boolean } = {},
): Promise<boolean> =>
  (await openDialog({ title: LABELS[key], body: `<p>${question}</p>`, confirm, ...o })) !== null;

interface DialogOptions {
  title: string;
  /** Trusted HTML: callers escape anything that came from the tenant. */
  body: string;
  confirm: string;
  /**
   * The header's band and mark, from the platform's notification types. Which
   * one a dialog carries is ISC's own choice per action rather than a rule:
   * Disable and Reset are `error`, Delete is `info` (see `identities.modal.ts`).
   */
  tone?: "danger" | "info";
  /**
   * Put focus on Cancel rather than the form, so Enter cannot confirm. Kept
   * separate from `tone`, which is only how the header looks — Delete reads as
   * info and still wants the guard.
   */
  guarded?: boolean;
  /**
   * A per-dialog hook, as ISC's own components carry their own SCSS alongside
   * the shared modal — rendered as `wd-dialog-<variant>`.
   */
  variant?: string;
  /** Called once the dialog is on screen, for a body that drives itself. */
  onOpen?: (form: HTMLFormElement) => void;
  /** False for a dialog with a single acknowledging button. */
  cancel?: boolean;
  /**
   * Render as a right-hand drawer rather than a centred modal — what ISC opens
   * for a form, keeping the list it was launched from in view beside it.
   */
  panel?: boolean;
  /** Hold the confirm button disabled until the form differs from how it opened. */
  confirmWhenChanged?: boolean;
  /**
   * Whether there is work to lose. Backing out of a dialog that says yes asks
   * first, as ISC's overlays do (`openUnsavedChangesModal`). Defaults to the
   * same test `confirmWhenChanged` uses.
   */
  isDirty?: () => boolean;
  /** `width: 'sm'` on ISC's modal: 500px rather than the 600px default. */
  small?: boolean;
}

// A modal form; resolves with its data on confirm, null on Cancel, Escape or a
// click outside. Destructive dialogs focus Cancel, so Enter can't confirm them.
// The dialogs on screen, innermost last: a confirmation opened over another
// dialog is the one Escape belongs to.
const openBackdrops: HTMLElement[] = [];

// `unsavedFormChangesModal`: ISC's own wording and shape for backing out of a
// form with work in it — its info header, Yes over Cancel, and the small width.
async function confirmDiscard(): Promise<boolean> {
  return (
    (await openDialog({
      title: "Unsaved changes",
      body: "<p>Are you sure you want to discard your work?</p>",
      confirm: "Yes",
      tone: "info",
      small: true,
    })) !== null
  );
}

function openDialog(o: DialogOptions): Promise<FormData | null> {
  return new Promise((resolve) => {
    const before = document.activeElement as HTMLElement | null;
    const backdrop = document.createElement("div");
    backdrop.className = `wd-dialog-backdrop${o.panel ? " wd-drawer" : ""}`;
    backdrop.innerHTML = `
      <form class="wd-dialog${o.tone ? ` wd-dialog-${o.tone}` : ""}${o.variant ? ` wd-dialog-${o.variant}` : ""}${o.small ? " wd-dialog-sm" : ""}" role="dialog" aria-modal="true" aria-labelledby="wd-dialog-title">
        <header class="wd-dialog-head">
          ${o.tone ? `<span class="wd-note-mark" aria-hidden="true">${o.tone === "danger" ? BANG : INFO}</span>` : ""}
          <h2 id="wd-dialog-title">${esc(o.title)}</h2>
          <button type="button" class="wd-dialog-close" data-close aria-label="Close">${FA_CLOSE}</button>
        </header>
        <div class="wd-dialog-body">${o.body}</div>
        <div class="wd-dialog-actions">
          ${o.cancel === false ? "" : `<button type="button" class="wd-btn" data-cancel>Cancel</button>`}
          <button type="button" class="wd-btn wd-btn-primary" data-confirm>${esc(o.confirm)}</button>
        </div>
      </form>`;
    const form = backdrop.querySelector("form")!;
    let changed: (() => boolean) | null = null;
    const finish = (result: FormData | null): void => {
      const at = openBackdrops.indexOf(backdrop);
      if (at >= 0) openBackdrops.splice(at, 1);
      document.removeEventListener("keydown", onKey, true);
      before?.focus?.();
      // The drawer slides back out before it goes; the caller carries on
      // meanwhile, so the work it was opened for is not waiting on the motion.
      if (o.panel && form.style.transition) {
        // Marked on the way out: it is on screen until the slide finishes, but
        // it is no longer the dialog anyone should find or click.
        backdrop.classList.add("wd-closing");
        backdrop.style.pointerEvents = "none";
        form.style.transform = "translateX(100%)";
        window.setTimeout(() => backdrop.remove(), PANEL_SLIDE_MS);
      } else {
        backdrop.remove();
      }
      resolve(result);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") return;
      // Only the topmost dialog answers Escape: a confirmation opened over this
      // one takes it, and closing that must not take this one with it.
      if (openBackdrops[openBackdrops.length - 1] !== backdrop) return;
      // A popover open inside the dialog takes Escape first and closes alone.
      // Both handlers capture on `document`, and this one was registered first,
      // so the popover cannot simply stop the event reaching it.
      if (form.querySelector("[data-popover]:not([hidden])")) return;
      e.preventDefault();
      dismiss();
    };
    // Confirming is a click, never a submit. The plugin is embedded in a sandbox
    // without `allow-forms`, where the browser blocks submission before any
    // handler runs — "Blocked form submission to ''" — which left every confirm
    // button dead in the real embed while working locally. The element stays a
    // <form> so FormData can read the choices; the guard below catches any
    // submission a future text field might otherwise trigger with Enter.
    form.addEventListener("submit", (e) => e.preventDefault());
    form.querySelector("[data-confirm]")!.addEventListener("click", () => finish(new FormData(form)));
    // Backing out asks first where there is work to lose.
    const dirty = (): boolean => (o.isDirty ? o.isDirty() : !!changed?.());
    const dismiss = (): void => {
      if (!dirty()) return finish(null);
      void confirmDiscard().then((discard) => {
        if (discard) finish(null);
      });
    };
    // Cancel and the header's × both back out; only the former takes focus on a
    // destructive dialog, so they stay separate attributes.
    backdrop
      .querySelectorAll("[data-cancel], [data-close]")
      .forEach((el) => el.addEventListener("click", dismiss));
    backdrop.addEventListener("mousedown", (e) => {
      if (e.target === backdrop) dismiss();
    });
    // Nothing chosen yet, nothing to save: the confirm button waits for the form
    // to differ from how it opened, as the platform's own does.
    if (o.confirmWhenChanged) {
      const submit = form.querySelector<HTMLButtonElement>("[data-confirm]")!;
      const snapshot = (): string => [...new FormData(form)].map(([k, v]) => `${k}=${String(v)}`).join("&");
      const opened = snapshot();
      changed = () => snapshot() !== opened;
      submit.disabled = true;
      form.addEventListener("change", () => {
        submit.disabled = !changed!();
      });
    }
    document.addEventListener("keydown", onKey, true);
    document.body.append(backdrop);
    openBackdrops.push(backdrop);
    // `slpt-overlay` carries `slide(400, 100, 0)`: in from one panel-width to
    // the right, 400ms ease-out, and back out the same way. Only the drawer
    // travels — a modal has no slide of its own.
    if (o.panel) {
      form.style.transform = "translateX(100%)";
      requestAnimationFrame(() => {
        form.style.transition = `transform ${PANEL_SLIDE_MS}ms ease-out`;
        form.style.transform = "translateX(0)";
      });
    }
    o.onOpen?.(form);
    const first = o.guarded
      ? form.querySelector<HTMLElement>("[data-cancel]")
      : form.querySelector<HTMLElement>("input:checked, input, [data-confirm]");
    first?.focus();
  });
}

type NoticeKind = "progress" | "success" | "error";

// The platform's own notification, bottom-left: a status mark, the message, and
// a dismiss. `progress` carries ISC's loader for work it has queued; the other
// two are how that work reports back. Returns a handle so a caller can take it
// down when it has something else to say.
function showNotice(message: string, kind: NoticeKind = "progress"): { close: () => void } {
  const host = noticeHost();
  const notice = document.createElement("div");
  notice.className = `wd-note wd-note-${kind}`;
  const mark =
    kind === "progress"
      ? `<span class="wd-loader" aria-hidden="true"></span>`
      : `<span class="wd-note-mark" aria-hidden="true">${kind === "success" ? CHECK : BANG}</span>`;
  notice.innerHTML = `
    ${mark}
    <p class="wd-note-text">${esc(message)}</p>
    <button type="button" class="wd-note-close" aria-label="Dismiss">${FA_CLOSE}</button>`;
  const close = (): void => notice.remove();
  notice.querySelector("button")!.addEventListener("click", close);
  host.append(notice);
  window.setTimeout(close, kind === "error" ? 8000 : 5000);
  return { close };
}

// Geometry rather than glyphs: `✓` sits off-centre in its em box, and the
// plugin CSP allows `img-src 'self'` only, so an icon file is out.
// Armada's overlay dismiss is a Font Awesome glyph, not strokes:
// `<i class="fa-close fa-solid" style="color: var(--color-g4); font-size: 20px">`.
// We cannot load the icon font here, so this is that glyph's own path (FA6
// solid `xmark`, which `fa-close` aliases), with the viewBox cropped to its ink
// so the drawn size is the size it occupies.
const FA_CLOSE = `<svg viewBox="41 105 302 302" fill="currentColor" aria-hidden="true"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg>`;
// The marks a notification-header carries, from `icon.model.ts`: `complete` is
// `circle-check`, `error` is `circle-exclamation`, `info` is `circle-info`, each
// Font Awesome solid. One filled path apiece, with the glyph wound the other way
// so it is knocked out of the disc rather than drawn over it — which is why
// these are the real paths and not a disc with a stroke on top.
const fa = (d: string): string =>
  `<svg viewBox="0 0 512 512" fill="currentColor" aria-hidden="true"><path d="${d}"/></svg>`;
const CHECK = fa(
  "M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z",
);
const BANG = fa(
  "M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM232 152c0-13.3 10.7-24 24-24s24 10.7 24 24l0 112c0 13.3-10.7 24-24 24s-24-10.7-24-24l0-112zm56 216a32 32 0 1 1 -64 0 32 32 0 1 1 64 0z",
);
// `fa-check fa-solid` at 12px, which is what a checked box carries — an input
// cannot hold a glyph, so as ISC does the real control sits behind a span that
// draws the box and the tick.
const FA_CHECK = fa(
  "M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z",
);
const INFO = fa(
  "M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM216 336l24 0 0-64-24 0c-13.3 0-24-10.7-24-24s10.7-24 24-24l48 0c13.3 0 24 10.7 24 24l0 88 8 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-80 0c-13.3 0-24-10.7-24-24s10.7-24 24-24zm40-208a32 32 0 1 1 0 64 32 32 0 1 1 0-64z",
);

function noticeHost(): HTMLElement {
  let host = document.querySelector<HTMLElement>(".wd-notes");
  if (!host) {
    host = document.createElement("div");
    host.className = "wd-notes";
    host.setAttribute("role", "status");
    host.setAttribute("aria-live", "polite");
    document.body.append(host);
  }
  return host;
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!,
  );
}
