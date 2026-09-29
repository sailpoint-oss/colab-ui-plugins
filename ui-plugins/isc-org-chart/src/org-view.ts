import { buildIndex, type OrgIdentity, type OrgIndex } from "./org-nav";

// The standard ISC identity Actions menu (matches the platform's ··· menu).
// Choosing one hands it to the onAction handler; actions.ts runs it against
// the tenant.
export type ActionKey =
  | "process"
  | "lifecycle"
  | "sync"
  | "invite"
  | "delete"
  | "reset"
  | "password"
  | "levels"
  | "disable"
  | "enable";
const IDENTITY_ACTIONS: Array<[key: ActionKey, label: string, destructive?: boolean]> = [
  ["process", "Process Identity"],
  ["lifecycle", "Set Lifecycle State"],
  ["sync", "Synchronize Attributes"],
  ["invite", "Invite Identity"],
  ["delete", "Delete Identity", true],
  ["reset", "Reset Identity"],
  ["password", "Reset Password"],
  ["levels", "Set User Levels"],
  ["disable", "Disable Identity", true],
];

// Enable stands in for Disable on an identity that is already disabled, exactly
// as ISC's own list does: it hides one and shows the other on
// `cloudStatus === DISABLED`, or on `ERROR` where the status underneath it is
// DISABLED (`identity-list-action-dropdown` in saas-ui-monorepo).
const ENABLE: [key: ActionKey, label: string, destructive?: boolean] = ["enable", "Enable Identity"];

export function actionsFor(p: OrgIdentity): typeof IDENTITY_ACTIONS {
  const disabled =
    p.cloudStatus === "DISABLED" || (p.cloudStatus === "ERROR" && p.internalCloudStatus === "DISABLED");
  return disabled ? IDENTITY_ACTIONS.map((a) => (a[0] === "disable" ? ENABLE : a)) : IDENTITY_ACTIONS;
}

// Promotion runs in two beats: the sideways trade, then the rise into focus.
// The trade carries the most meaning — it is what shows which card is being
// promoted and where it came from — so it runs slowest of the three.
// Two cards count as being on the same line when their tops are within this.
// A hovered card is lifted 3px and scaled 1.04, which raises its top by ~8px,
// and a card carrying a chevron is naturally taller than one without — while a
// real second line sits a card's height below. Anything between is slack.
const SAME_LINE = 24;

// A wheel gesture changes one level, as the reference chart does. A trackpad
// sends a burst of small deltas rather than one notch, so the gesture is
// accumulated to a notch's worth and then held closed until the wheel has been
// quiet this long — otherwise the momentum after one flick would fall through
// several levels at once.
//
// The quiet is capped, because momentum on a trackpad can run longer than the
// pause between two deliberate flicks: without the cap, someone flicking again
// while the tail of the last gesture is still arriving re-arms the wait every
// time and the wheel appears to have stopped working altogether.
const WHEEL_STEP = 120;
const WHEEL_QUIET_MS = 200;
const WHEEL_SHUT_MAX_MS = 700;

// The reference chart stacks a wide row rather than letting it run off-screen:
// at most this many tiles sit in a row. A longer row collapses to a single row
// — one tile of which is the Show More toggle, so only ROW_MAX - 1 cards are
// visible.
const ROW_MAX = 7;

// Outline map pin, matching the platform's location glyph. Inline rather than an
// <img> because the plugin CSP allows `img-src 'self'` only.
const PIN = `<svg class="wd-pin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M12 21.5s6.5-5.8 6.5-10.5a6.5 6.5 0 1 0-13 0c0 4.7 6.5 10.5 6.5 10.5Z"/><circle cx="12" cy="10.7" r="2.4"/></svg>`;

// Changing level runs in two beats, as the reference chart does: the clicked
// card first trades places with whichever card sits under the manager, holds
// there, and only then does the view scroll onto the next level. The trade is
// what shows which card was picked, so it runs slowest.
export // Chevrons as geometry, not glyphs: `⌄` and `⌃` sit low in their em box, so a
// centred character still looks off-centre inside its hover target.
const chevron = (d: string): string =>
  `<svg class="wd-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const CHEVRON_DOWN = chevron("M5 8.75l7 6.5 7-6.5");
const CHEVRON_UP = chevron("M5 15.25l7-6.5 7 6.5");

export const SWAP_MS = 600;
// Between the trade and the scroll, the connector grows down from the chosen card.
export const DRAW_MS = 250;
export const SCROLL_MS = 900;
// A breadcrumb can sit several levels up, and one full scroll per level would
// leave a deep chain grinding for seconds. Multi-level climbs share this budget
// instead, down to a floor that keeps each level readable as it passes.
const CLIMB_MS = 1400;
const CLIMB_STEP_MIN_MS = 280;

const reducedMotion = (): boolean =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, ms));

// Slide elements by a delta and resolve once the motion is done. Both axes: a
// row wide enough to wrap trades cards between its lines, which is a move up or
// down as much as across.
function slide(moves: Array<[HTMLElement, number, number]>, ms: number): Promise<void> {
  return new Promise((resolve) => {
    for (const [el, dx, dy] of moves) {
      el.style.zIndex = "3";
      el.style.transition = `transform ${ms}ms ease-in-out`;
      el.style.transform = `translate(${dx}px, ${dy}px)`;
    }
    window.setTimeout(resolve, ms);
  });
}

// Where the viewer left off: the level last left in each tree, and how each
// row was left (collapsed, and the traded order). Kept in localStorage under a
// key main.ts scopes to the tenant and signed-in user. Not where to open — that
// is always the viewer's own level.
//
// Which report was *chosen* is deliberately not among it. A choice is something
// the viewer just did, and it survives only as long as the view is open: a load
// has nobody chosen, however the row was arranged when it was last left.
interface SavedView {
  v: 2;
  lastByRoot?: Record<string, string>;
  collapsed?: string[];
  rowOrder?: Record<string, string[]>;
}

// Both tolerate storage that is blocked (a sandboxed frame, a private window)
// or holds something unexpected: the view then simply isn't remembered.
function loadView(key: string | undefined): SavedView | null {
  if (!key) return null;
  try {
    const view = JSON.parse(localStorage.getItem(key) ?? "null") as SavedView | null;
    // v1 recorded a choice for rows the viewer never picked from, which
    // left even rows shifted; there is nothing to migrate, so it is dropped.
    // A v2 written before choices stopped being saved still carries one; the
    // extra key is simply not read.
    return view?.v === 2 ? view : null;
  } catch {
    return null;
  }
}

function saveView(key: string | undefined, view: SavedView): void {
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(view));
  } catch {
    // Storage unavailable: remember for this session only.
  }
}

// Decoded photos by data URI, shared across redraws so each is decoded once.
const decoded = new Map<string, Promise<ImageBitmap | null>>();

// Decode a data-URI photo from its bytes. createImageBitmap reads a Blob in
// memory and fetches no URL, so the CSP's img-src doesn't apply — unlike an
// <img> or a CSS background, which it blocks for data: URIs.
function decodePhoto(uri: string): Promise<ImageBitmap | null> {
  let bitmap = decoded.get(uri);
  if (!bitmap) {
    bitmap = (async () => {
      try {
        const [head, base64] = uri.split(",", 2);
        const type = /^data:([^;,]+)/.exec(head)?.[1] ?? "image/jpeg";
        const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
        return await createImageBitmap(new Blob([bytes], { type }));
      } catch {
        return null; // no createImageBitmap, or not an image: keep the initials
      }
    })();
    decoded.set(uri, bitmap);
  }
  return bitmap;
}

// Paint every photo canvas under `root`, cropping the photo to a centred
// square. Runs after each draw, and on the scroll's cloned level too, since
// cloning a canvas copies the element but not its pixels.
function paintPhotos(root: ParentNode, photoOf: (id: string) => string | undefined): void {
  for (const canvas of root.querySelectorAll<HTMLCanvasElement>("canvas[data-photo]")) {
    const uri = photoOf(canvas.dataset.photo!);
    if (!uri) continue;
    void decodePhoto(uri).then((bitmap) => {
      const ctx = bitmap ? canvas.getContext("2d") : null;
      if (!bitmap || !ctx) return;
      const side = Math.min(bitmap.width, bitmap.height);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(
        bitmap,
        (bitmap.width - side) / 2,
        (bitmap.height - side) / 2,
        side,
        side,
        0,
        0,
        canvas.width,
        canvas.height,
      );
    });
  }
}

// Play a layout shift already applied to `el` from where it was (FLIP).
function glide(el: HTMLElement, dx: number, ms: number): void {
  el.style.transform = `translateX(${-dx}px)`;
  void el.offsetHeight;
  el.style.transition = `transform ${ms}ms ease-in-out`;
  el.style.transform = "";
}

// Grow a connector down from a card the moment it is chosen, as far as where
// the next level's focused card will sit, so the scroll that follows carries it
// up as the line into that card. It hangs from the report row rather than the
// card, and goes in first: every card paints over it, so on a row wrapped onto
// several lines it passes behind the cards below instead of across them (the
// chosen card itself sits raised, and would lift a child line over them).
function drawTrail(card: HTMLElement, ms: number): Promise<void> {
  const row = card.parentElement!;
  // Settle the trade first: the timer ending it can fire a frame before the
  // transitions do, and measuring then put the line ~1px off the column. The
  // snap to the end is sub-pixel, so invisible.
  for (const el of [card, row]) el.style.transition = "none";
  void row.offsetWidth;
  const c = card.getBoundingClientRect();
  const r = row.getBoundingClientRect();
  const trail = document.createElement("span");
  trail.className = "wd-trail";
  trail.style.left = `${c.left + c.width / 2 - r.left - 0.5}px`;
  trail.style.top = `${c.bottom - r.top}px`;
  // Past any lines of the row below this card, then the next level's lead-in.
  trail.style.height = `calc(var(--stub) + var(--up-size) + var(--drop) + ${r.bottom - c.bottom}px)`;
  row.prepend(trail);
  void trail.offsetHeight; // start from the collapsed state, not the drawn one
  trail.style.transition = `transform ${ms}ms ease-out`;
  trail.style.transform = "scaleY(1)";
  return wait(ms);
}

// Focused navigator: the focused person sits centre-stage with an
// up-chevron to their manager, a breadcrumb of ancestors top-right, and their
// direct reports as a card grid below. Hovering a card raises it and reveals a
// ··· button that opens the identity Actions menu. Clicking a card re-focuses.
export function renderOrgNavigator(
  container: HTMLElement,
  identities: OrgIdentity[],
  startId?: string,
  /** Builds the host URL for an identity; omit to render names as plain text. */
  identityUrl?: (id: string) => string,
  /** Runs a Related Actions choice; omit to leave the ··· menu off the cards. */
  onAction?: (action: ActionKey, person: OrgIdentity) => void,
  /** localStorage key for where the viewer left off; omit to remember nothing. */
  viewKey?: string,
  /** The signed-in user: their card is placed right below their manager. */
  viewerId?: string,
  /**
   * Lets the viewer jump between the tenant's disconnected trees; omit to leave
   * the picker out. Crossing into another tree is an admin's view of the
   * tenant — everyone else navigates the one hierarchy they are part of.
   */
  canSwitchTree?: boolean,
): void {
  if (!identities.length) {
    container.innerHTML = `<p class="dim">No identities returned.</p>`;
    return;
  }
  const index = buildIndex(identities);
  const photoOf = (id: string): string | undefined => index.byId.get(id)?.photo;

  // Where the viewer left off, from an earlier session. Anything that no longer
  // fits the data — someone removed, a tree reshaped — is dropped.
  const saved = loadView(viewKey);
  const known = (id: unknown): id is string => typeof id === "string" && index.byId.has(id);

  // Open on startId — main.ts passes the signed-in user's level (levelOf) —
  // else the largest tree's top. Where the viewer left each tree is restored
  // when that tree is picked again, not on open.
  let focusId = known(startId) ? startId : index.rootId();

  // The level last left in each tree, by root, so picking a tree again in the
  // dropdown comes back to it rather than to its top.
  const lastByRoot = new Map(
    Object.entries(saved?.lastByRoot ?? {}).filter(([root, id]) => known(id) && index.rootOf(id) === root),
  );

  // Managers whose over-long report row the viewer collapsed with Show Less.
  // Rows open expanded — the whole team is the point of the view — but a
  // collapse is remembered per manager, so visiting one of the reports and
  // climbing back finds the row as it was left.
  const collapsed = new Set<string>((saved?.collapsed ?? []).filter(known));

  // Report order per manager, once a descent has traded two cards. The trade is
  // recorded rather than merely animated, so climbing back shows the row as the
  // viewer left it instead of snapping back to alphabetical — and the card they
  // came from is already sitting under its parent, with nothing to slide back.
  const rowOrder = new Map<string, string[]>(
    Object.entries(saved?.rowOrder ?? {})
      .filter(([manager, order]) => known(manager) && Array.isArray(order))
      .map(([manager, order]) => [manager, order.filter(known)]),
  );

  // The report descended into this session, per manager. An even row stays
  // centred until one of its reports is chosen; from then on it is shifted so
  // that report can sit under the manager (see draw and shiftEvenRow), and a
  // scroll down goes into them. Starts empty on every load, saved or not:
  // nothing has been chosen until the viewer chooses it.
  const chosen = new Map<string, string>();

  // The level a climb left behind, per level arrived at. Kept apart from
  // `chosen` because the two answer different questions: `chosen` is a report
  // the viewer picked, which shifts an even row half a tile; this is only the
  // way back, so a climb can be undone without a row moving under the viewer
  // on arrival. A multi-level climb records every level it passes, so the whole
  // chain can be walked back down. Session-only, like `chosen`.
  const cameFrom = new Map<string, string>();

  // The signed-in user's card sits right below their manager, as a descent
  // would have put it — on every open, over whatever order a saved view held.
  const myManager = known(viewerId) ? index.managerOf(viewerId) : null;
  if (myManager && known(viewerId)) {
    centreUnderManager(myManager.id, viewerId);
    // "As a descent would have put it" includes the way back down: the tree
    // opens on the manager's level, so without this the viewer's own card is
    // sitting right there under the manager with no scroll that reaches it.
    cameFrom.set(myManager.id, viewerId);
  }

  // Save where the viewer is after every change, so a reload comes back to it.
  const persist = (): void => {
    lastByRoot.set(index.rootOf(focusId), focusId);
    saveView(viewKey, {
      v: 2,
      lastByRoot: Object.fromEntries(lastByRoot),
      collapsed: [...collapsed],
      rowOrder: Object.fromEntries(rowOrder),
    });
  };

  function orderedReports(managerId: string): OrgIdentity[] {
    const reports = index.reportsOf(managerId);
    const order = rowOrder.get(managerId);
    if (!order) return reports;
    const rank = new Map(order.map((id, i) => [id, i]));
    return [...reports].sort(
      (a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity),
    );
  }

  // Put `reportId` in the slot under their manager, trading with whoever holds
  // it — where a descent from that manager would have left them. The slot is the
  // middle of the row's first line, ROW_MAX tiles wide on a stacked row (which
  // Show Less keeps); on an even row it is the card right of centre. Recorded
  // rather than merely animated, so the row is drawn this way from then on.
  //
  // `choose` is separate, and only a descent passes it: an even row has no slot
  // under its manager until it is shifted half a tile, and it is only shifted
  // once one of its reports has actually been picked (see draw and
  // shiftEvenRow). Arriving at a row — opening on it, or climbing into it — is
  // not picking from it, so such a row is ordered but stays centred.
  function centreUnderManager(managerId: string, reportId: string, choose = false): void {
    const order = orderedReports(managerId).map((r) => r.id);
    const at = order.indexOf(reportId);
    if (at < 0) return;
    const slot = Math.floor(Math.min(order.length, ROW_MAX) / 2);
    [order[at], order[slot]] = [order[slot], order[at]];
    rowOrder.set(managerId, order);
    if (choose) chosen.set(managerId, reportId);
  }

  // Remember that these two swapped places in `managerId`'s row.
  function recordTrade(managerId: string, a: string, b: string): void {
    const order = orderedReports(managerId).map((r) => r.id);
    const i = order.indexOf(a);
    const j = order.indexOf(b);
    if (i < 0 || j < 0) return;
    [order[i], order[j]] = [order[j], order[i]];
    rowOrder.set(managerId, order);
  }

  const setFocus = (id: string): void => {
    focusId = id;
    draw();
  };

  const reportCard = (id: string): HTMLElement | null =>
    [...container.querySelectorAll<HTMLElement>(".wd-report")].find(
      (el) => el.dataset.card === id,
    ) ?? null;

  // The report card sitting closest to directly under the manager. Which one
  // that is depends on how the row wrapped, so measure rather than assume — and
  // a row that wrapped has more than one line, of which only the first sits
  // under the manager at all. A nearer column on a lower line is not nearer to
  // them, so the topmost line wins before any column is compared.
  function centredReport(): HTMLElement | null {
    const focusCard = container.querySelector<HTMLElement>(".wd-focus");
    if (!focusCard) return null;
    const focusRect = focusCard.getBoundingClientRect();
    const centre = focusRect.left + focusRect.width / 2;
    let best: HTMLElement | null = null;
    let bestTop = Infinity;
    let bestGap = Infinity;
    for (const el of container.querySelectorAll<HTMLElement>(".wd-report")) {
      const r = el.getBoundingClientRect();
      const gap = Math.abs(r.left + r.width / 2 - centre);
      const higher = r.top < bestTop - SAME_LINE;
      const sameLine = Math.abs(r.top - bestTop) <= SAME_LINE;
      if (higher || (sameLine && gap < bestGap)) {
        bestTop = r.top;
        bestGap = gap;
        best = el;
      }
    }
    return best;
  }

  // Scroll from the level on screen to the one that replaces it, with both
  // present at once: the outgoing level is cloned, the new one drawn, the pair
  // stacked in the order they sit in the hierarchy, and the wrapper translated
  // from one to the other. Translating a single re-drawn level instead reads as
  // the whole screen sliding, because there is never anything to scroll past.
  // `traveller` is the person on screen twice while both levels are: in the
  // report row of one and as the focused card of the other (see prepareTrip).
  async function scrollBetween(
    redraw: () => void,
    direction: 1 | -1,
    ms: number,
    traveller?: string,
  ): Promise<void> {
    const leaving = container.querySelector<HTMLElement>(".wd-stage");
    if (!leaving || !leaving.offsetHeight) {
      redraw();
      return;
    }
    const ghost = leaving.cloneNode(true) as HTMLElement;
    ghost.classList.add("wd-ghost");
    ghost.setAttribute("aria-hidden", "true");
    paintPhotos(ghost, photoOf); // a cloned canvas comes back blank

    redraw();
    const scroll = container.querySelector<HTMLElement>(".wd-scroll");
    const arriving = scroll?.querySelector<HTMLElement>(".wd-stage");
    if (!scroll || !arriving) return;

    // Descending puts the new level below the old, climbing puts it above.
    if (direction === 1) scroll.insertBefore(ghost, arriving);
    else scroll.append(ghost);

    // Auto margins centre a single level; with two stacked they would fight the
    // translation, and the scroller must not try to follow the taller content.
    scroll.style.marginBlock = "0";
    container.style.overflow = "hidden";
    container.scrollTop = 0;

    const trip = traveller ? prepareTrip(ghost, arriving, traveller, direction) : null;
    const unpin = pinUpChevron(ghost, arriving, ms);

    const from = direction === 1 ? 0 : -arriving.offsetHeight;
    const to = direction === 1 ? -ghost.offsetHeight : 0;
    scroll.style.transition = "none";
    scroll.style.transform = `translateY(${from}px)`;
    void scroll.offsetHeight;
    scroll.style.transition = `transform ${ms}ms ease-in-out`;
    scroll.style.transform = `translateY(${to}px)`;
    if (trip) {
      trip.card.style.transition = `transform ${ms}ms ease-in-out`;
      trip.card.style.transform = "";
    }

    await wait(ms);
    ghost.remove();
    unpin?.();
    if (trip) {
      trip.rail?.remove();
      trip.card.style.transition = "";
      trip.card.style.zIndex = "";
    }
    scroll.style.transition = "";
    scroll.style.transform = "";
    scroll.style.marginBlock = "";
    container.style.overflow = "";
  }

  // While both levels are on screen one person is shown twice: in the report row
  // of one level and as the focused card of the other. Hide the outgoing copy
  // and start the incoming one where the outgoing sat, so a single card travels
  // between the two places — down out of the row on a descent, up into it on a
  // climb — instead of the scroll showing someone reporting to themselves. A
  // rail from the row's bus to the focused slot keeps the card on its line until
  // the scroll lands; only in the centre column, where the levels' own
  // connectors run (a tree opened straight onto someone has them elsewhere).
  function prepareTrip(
    ghost: HTMLElement,
    arriving: HTMLElement,
    id: string,
    direction: 1 | -1,
  ): { card: HTMLElement; rail: HTMLElement | null } | null {
    const inRow = (level: HTMLElement) =>
      [...level.querySelectorAll<HTMLElement>(".wd-report")].find((el) => el.dataset.card === id);
    const rowCopy = inRow(direction === 1 ? ghost : arriving);
    const focusCopy = (direction === 1 ? arriving : ghost).querySelector<HTMLElement>(".wd-focus");
    if (!rowCopy || !focusCopy) return null;
    const [outgoing, incoming] = direction === 1 ? [rowCopy, focusCopy] : [focusCopy, rowCopy];

    const o = outgoing.getBoundingClientRect();
    const n = incoming.getBoundingClientRect();
    const r = rowCopy.getBoundingClientRect();
    const f = focusCopy.getBoundingClientRect();
    const row = rowCopy.parentElement!;
    const bus = row.getBoundingClientRect();

    outgoing.style.visibility = "hidden";
    incoming.style.zIndex = "4"; // over the traded cards, which sit at 3
    // Jump to the start rather than ease there: .wd-card has its own short
    // transform transition (the hover lift), which would carry the card toward
    // the offset — so it never left its final slot, and the row's copy simply
    // vanished while the scroll ran.
    incoming.style.transition = "none";
    incoming.style.transform = `translate(${o.left - n.left}px, ${o.top - n.top}px)`;

    let rail: HTMLElement | null = null;
    const x = r.left + r.width / 2;
    if (Math.abs(x - (f.left + f.width / 2)) < 2) {
      rail = document.createElement("span");
      rail.className = "wd-rail";
      rail.style.left = `${x - bus.left - 0.5}px`;
      // Down through the focused slot to where that level's stem to its reports
      // begins. Mid-flight the card is elsewhere and the slot stands empty, so
      // a rail stopping at the slot's top left a card-high gap above the stem.
      // The travelling card paints over it, so the extra only shows while the
      // slot is empty.
      rail.style.height = `${f.bottom - bus.top}px`;
      row.prepend(rail); // first, so the cards paint over it
    }
    return { card: incoming, rail };
  }

  // The reference chart pins the up-chevron just under the header instead of
  // scrolling it
  // with its level. Between two levels that both have one it holds still while
  // the content scrolls beneath it; arriving from a root it slides down from
  // under the header late in the scroll, and leaving for a root it slides up out
  // of view early on. One pinned copy stands in for both levels' own chevrons,
  // which sit at the same offset in their level, so start and end coincide.
  // Returns the cleanup to run once the scroll has landed.
  function pinUpChevron(ghost: HTMLElement, arriving: HTMLElement, ms: number): (() => void) | null {
    const outgoing = ghost.querySelector<HTMLElement>(".wd-up");
    const incoming = arriving.querySelector<HTMLElement>(".wd-up");
    const model = incoming ?? outgoing;
    const wd = container.querySelector<HTMLElement>(".wd");
    const scroll = model?.closest<HTMLElement>(".wd-scroll");
    if (!model || !wd || !scroll) return null;

    const m = model.getBoundingClientRect();
    const level = model.closest<HTMLElement>(".wd-stage")!.getBoundingClientRect();
    const w = wd.getBoundingClientRect();
    // Its level's offset, measured from where a level starts once it is on screen.
    const top = scroll.getBoundingClientRect().top - w.top + (m.top - level.top);

    const pin = model.cloneNode(true) as HTMLElement;
    pin.classList.add("wd-up-pin");
    pin.removeAttribute("data-goto");
    pin.setAttribute("aria-hidden", "true");
    pin.tabIndex = -1;
    pin.style.top = `${top}px`;
    pin.style.left = `${m.left - w.left}px`;
    for (const own of [outgoing, incoming]) if (own) own.style.visibility = "hidden";
    wd.append(pin);

    // Above the container's top edge, which clips it: under the header.
    const away = `translateY(${-(top + m.height + 4)}px)`;
    if (!outgoing) {
      pin.style.transform = away;
      void pin.offsetHeight;
      pin.style.transition = `transform ${ms * 0.3}ms ease-out ${ms * 0.55}ms`;
      pin.style.transform = "";
    } else if (!incoming) {
      void pin.offsetHeight;
      pin.style.transition = `transform ${ms * 0.3}ms ease-in`;
      pin.style.transform = away;
    }

    return () => {
      pin.remove();
      if (incoming) incoming.style.visibility = "";
    };
  }

  let animating = false;

  // The levels from the focused person up to `targetId`, nearest first and
  // including the target. Empty when the target is the focused person, or is
  // not above them — nothing to climb either way.
  function climbChain(targetId: string): string[] {
    const up = index
      .ancestorsOf(focusId)
      .map((a) => a.id)
      .reverse(); // manager first, root last
    const at = up.indexOf(targetId);
    return at < 0 ? [] : up.slice(0, at + 1);
  }

  // Climbing only has to scroll: the card being left behind is already sitting
  // in the slot under its parent, because the descent recorded that trade. It
  // rises into that slot as the scroll runs (see prepareTrip).
  //
  // A breadcrumb can name someone several levels up, so climb the chain a level
  // at a time rather than cutting straight there: every level in between scrolls
  // past, which is what shows how far the jump went. Those steps share one
  // budget, so a deep chain runs quick instead of a full scroll per ancestor.
  async function ascend(targetId: string): Promise<void> {
    if (animating) return;
    const chain = climbChain(targetId);
    if (!chain.length) {
      if (targetId !== focusId) setFocus(targetId);
      return;
    }
    // Before any of the early returns below: a climb that does not animate is
    // still a climb, and has to be as undoable as one that does.
    let left = focusId;
    for (const id of chain) {
      cameFrom.set(id, left);
      left = id;
    }
    const focused = container.querySelector<HTMLElement>(".wd-focus");
    if (!focused?.getBoundingClientRect().height || reducedMotion()) {
      setFocus(targetId);
      return;
    }
    const ms =
      chain.length === 1
        ? SCROLL_MS
        : Math.max(CLIMB_STEP_MIN_MS, Math.round(CLIMB_MS / chain.length));

    animating = true;
    try {
      for (const id of chain) {
        const from = focusId;
        // Arrange the level being climbed to before it is drawn, so the card
        // rising out of the focused slot lands in the slot under its own
        // manager: the whole management chain then runs straight up the centre
        // line. A climb can reach a level nobody descended from — the tree
        // opens on one, and a breadcrumb jumps over every level in between.
        // Where a descent did record this traveller as the centred card, that
        // arrangement stands: it was made against the row as it was actually
        // laid out, which a row wrapped other than expected knows better than
        // counting tiles does.
        if (chosen.get(id) !== from) centreUnderManager(id, from);
        await scrollBetween(() => setFocus(id), -1, ms, from);
      }
    } finally {
      animating = false;
    }
  }

  // Tag a centred even row the moment one of its reports is chosen (draw() only
  // tags rows that already have one) and return how far that moved it: 0 when
  // it was already shifted, is odd or stacked, or the stage is too narrow for
  // the container query to shift it.
  function shiftEvenRow(row: HTMLElement): number {
    const n = index.reportsOf(focusId).length;
    if (n > ROW_MAX || n % 2 || row.dataset.count) return 0;
    const before = row.getBoundingClientRect().left;
    row.dataset.count = String(n);
    return row.getBoundingClientRect().left - before;
  }

  // Descending: the clicked card trades places with the one under the manager,
  // so it is centred before the level scrolls in behind it.
  async function descend(id: string): Promise<void> {
    if (animating) return;
    chosen.set(focusId, id);
    const card = reportCard(id);
    const start = card?.getBoundingClientRect();
    // No layout to measure (tests, hidden container) or the viewer asked for
    // less motion — switch level immediately rather than animating from nowhere.
    if (!card || !start?.width || reducedMotion()) {
      setFocus(id);
      return;
    }

    animating = true;
    try {
      // Choosing a report in a centred even row shifts the row so a card sits
      // under the manager: measure in the shifted layout, then play the shift
      // from where the row was, alongside the trade.
      const row = card.parentElement!;
      const shift = shiftEvenRow(row);
      // Trade by centres, not left edges: the pointer is usually still resting
      // on the clicked card, and :hover lifts and scales it, which moves its
      // left edge but not its centre. Measured by the edge, it landed ~4px off
      // the manager's column and its drawn line ran beside the next level's.
      // Across by centres, down by tops. Centres dodge the hover's scale, which
      // moves a card's edges but not its middle; tops are what a swap between
      // lines has to match, and they are not thrown off by one card being
      // taller than the other. A move within a line is exactly horizontal —
      // measured, the two tops still differ by the hover's few pixels, so
      // anything under a line's worth of drop is no drop at all.
      const boxOf = (el: HTMLElement): { cx: number; top: number } => {
        const r = el.getBoundingClientRect();
        return { cx: r.left + r.width / 2, top: r.top };
      };
      const centred = centredReport();
      const moves: Array<[HTMLElement, number, number]> = [];
      if (centred && centred !== card) {
        const from = boxOf(card);
        const to = boxOf(centred);
        const dx = to.cx - from.cx;
        const drop = to.top - from.top;
        const dy = Math.abs(drop) < SAME_LINE ? 0 : drop;
        recordTrade(focusId, id, centred.dataset.card!);
        moves.push([card, dx, dy], [centred, -dx, -dy]);
      }
      if (shift) glide(row, shift, SWAP_MS);
      if (moves.length || shift) await slide(moves, SWAP_MS);
      await drawTrail(card, DRAW_MS);
      await scrollBetween(() => setFocus(id), 1, SCROLL_MS, id);
    } finally {
      animating = false;
    }
  }

  // A tenant that populates `manager` on only part of its population yields
  // several disconnected trees. Manager/report navigation alone can never leave
  // the one it starts in, so a dropdown lists every root to jump between them —
  // a dropdown, not a chip per root, because a tenant can have dozens of trees.
  const roots = index.rootIds();

  function rootPicker(currentRoot: string): string {
    const current = index.byId.get(currentRoot)!;
    const option = (id: string, i: number): string => {
      const on = id === currentRoot;
      return `<li class="wd-option${on ? " selected" : ""}" id="wd-root-${i}" role="option" aria-selected="${on}" data-root="${id}" data-testid="org-root-option">
        <span class="wd-option-name">${esc(index.byId.get(id)!.name)}</span>
        <span class="wd-option-n">${index.subtreeSizeOf(id)}</span>
      </li>`;
    };
    // Laid out as Armada's slpt-select-field: a label, then a trigger showing
    // only the selected label — sizes live in the option rows.
    return `
      <div class="wd-roots">
        <span class="wd-roots-label" id="wd-roots-label">${roots.length} Organization trees</span>
        <div class="wd-select">
          <button type="button" class="wd-select-trigger" id="wd-roots-trigger" aria-haspopup="listbox" aria-expanded="false" aria-controls="wd-roots-list" aria-labelledby="wd-roots-label wd-roots-trigger" data-testid="org-root-select">
            <span class="wd-select-value">${esc(current.name)}</span>
            ${CHEVRON_DOWN}
          </button>
          <ul class="wd-select-panel" id="wd-roots-list" role="listbox" tabindex="-1" aria-labelledby="wd-roots-label" hidden>
            ${roots.map(option).join("")}
          </ul>
        </div>
      </div>`;
  }

  // Button + listbox: focus moves into the list while it is open and the
  // highlighted option is announced through aria-activedescendant.
  function wireRootPicker(): void {
    const trigger = container.querySelector<HTMLButtonElement>(".wd-select-trigger");
    const panel = container.querySelector<HTMLElement>(".wd-select-panel");
    if (!trigger || !panel) return;
    const options = [...panel.querySelectorAll<HTMLElement>("[role=option]")];
    const selected = Math.max(0, options.findIndex((o) => o.classList.contains("selected")));
    let active = selected;

    const highlight = (i: number): void => {
      active = Math.min(options.length - 1, Math.max(0, i));
      options.forEach((o, j) => o.classList.toggle("active", j === active));
      panel.setAttribute("aria-activedescendant", options[active].id);
      options[active].scrollIntoView?.({ block: "nearest" });
    };
    const close = (refocus: boolean): void => {
      panel.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      document.removeEventListener("mousedown", onOutside, true);
      if (refocus) trigger.focus();
    };
    const onOutside = (e: MouseEvent): void => {
      if (!trigger.parentElement!.contains(e.target as Node)) close(false);
    };
    const open = (): void => {
      panel.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      highlight(selected);
      panel.focus();
      document.addEventListener("mousedown", onOutside, true);
    };
    const choose = (i: number): void => {
      close(false);
      // Another tree opens at the level last left in it; the tree already on
      // screen goes to its top, as a quick way back up.
      const root = options[i].dataset.root!;
      setFocus(root === index.rootOf(focusId) ? root : (lastByRoot.get(root) ?? root));
      // The redraw replaced the trigger; keep keyboard users where they were.
      container.querySelector<HTMLButtonElement>(".wd-select-trigger")?.focus();
    };

    trigger.addEventListener("click", () => (panel.hidden ? open() : close(true)));
    trigger.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        open();
      }
    });
    panel.addEventListener("keydown", (e) => {
      const moves: Record<string, number> = {
        ArrowDown: active + 1,
        ArrowUp: active - 1,
        Home: 0,
        End: options.length - 1,
      };
      if (e.key in moves) highlight(moves[e.key]);
      else if (e.key === "Enter" || e.key === " ") choose(active);
      else if (e.key === "Escape") close(true);
      else if (e.key === "Tab") return close(false);
      else if (e.key.length === 1) {
        // Type-ahead: the next tree whose root name starts with the key pressed.
        const key = e.key.toLowerCase();
        const names = options.map((o) => o.querySelector(".wd-option-name")!.textContent!.toLowerCase());
        const next = [...names.keys()]
          .map((j) => (active + 1 + j) % names.length)
          .find((j) => names[j].startsWith(key));
        if (next === undefined) return;
        highlight(next);
      } else return;
      e.preventDefault();
    });
    options.forEach((o, i) => {
      o.addEventListener("mouseenter", () => highlight(i));
      o.addEventListener("click", () => choose(i));
    });
    // As Armada does: the highlight follows the pointer and leaves with it.
    panel.addEventListener("mouseleave", () => {
      options.forEach((o) => o.classList.remove("active"));
      panel.removeAttribute("aria-activedescendant");
    });
  }

  function draw(): void {
    const focus = index.byId.get(focusId)!;
    const manager = index.managerOf(focusId);
    const trail = [...index.ancestorsOf(focusId), focus];
    const reports = orderedReports(focusId);
    const stacked = reports.length > ROW_MAX;
    const lessShown = stacked && collapsed.has(focusId);
    const shown = lessShown ? reports.slice(0, ROW_MAX - 1) : reports;
    // A single row with an even count has no card under the manager, only a gap.
    // Once one of its reports has been chosen, tag it so CSS shifts it half a
    // tile left: the card right of centre then sits under the manager, with the
    // extra card on the left. Until then it stays centred.
    const evenRow =
      !stacked && reports.length % 2 === 0 && chosen.has(focusId) ? ` data-count="${reports.length}"` : "";
    const currentRoot = index.rootOf(focusId);

    container.innerHTML = `
      <div class="wd">
        ${canSwitchTree && roots.length > 1 ? rootPicker(currentRoot) : ""}
        <div class="wd-crumbs">
          ${trail
            .map(
              (p) =>
                `<button class="wd-crumb${p.id === focusId ? " current" : ""}" data-goto="${p.id}">${esc(p.name)}</button>`,
            )
            .join("")}
        </div>
        <div class="wd-scroll"><div class="wd-stage">
          <span class="wd-lead wd-line${manager ? "" : " wd-hold"}"></span>
          ${
            manager
              ? `<button class="wd-up" data-goto="${manager.id}" title="Go to ${esc(manager.name)}">${CHEVRON_UP}</button>
                 <span class="wd-line wd-line-down"></span>`
              : // A root keeps the room the chevron and drop would take, as
                // the reference chart does, so the focused card never jumps
                // to the top.
                `<span class="wd-no-manager" aria-hidden="true"></span>`
          }
          <div class="wd-card wd-focus">${cardInner(focus, index, identityUrl, false, !!onAction)}</div>
          ${
            reports.length
              ? `<span class="wd-line"></span>
                 <div class="wd-reports"${evenRow}>
                   ${shown.map((r) => `<div class="wd-card wd-report${index.reportsOf(r.id).length ? " wd-manager" : ""}" data-card="${r.id}">${cardInner(r, index, identityUrl, true, !!onAction)}</div>`).join("")}
                   ${
                     stacked
                       ? `<div class="wd-card wd-more"><button class="wd-more-btn" data-toggle type="button">${lessShown ? "Show More" : "Show Less"}</button></div>`
                       : ""
                   }
                 </div>
`
              : `<p class="wd-empty dim">No direct reports.</p>`
          }
        </div></div>
      </div>`;

    container.querySelector<HTMLButtonElement>("[data-toggle]")?.addEventListener("click", () => {
      if (!collapsed.delete(focusId)) collapsed.add(focusId);
      draw();
    });

    wireRootPicker();

    // Breadcrumbs and the up-chevron both climb, so picking a manager from the
    // trail scrolls up to them rather than cutting to their level.
    container.querySelectorAll<HTMLElement>("[data-goto]").forEach((el) =>
      el.addEventListener("click", () => void ascend(el.dataset.goto!)),
    );

    // The chevron on a manager's card, and the circled one below the row, both
    // descend a level. They sit on top of the card-wide link, so stop the click
    // reaching it — otherwise navigating the tree would leave the plugin.
    container.querySelectorAll<HTMLElement>("[data-down]").forEach((el) =>
      el.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        void descend(el.dataset.down!);
      }),
    );

    // Open the Actions menu (a popover next to the ···) without navigating.
    container.querySelectorAll<HTMLButtonElement>("[data-actions]").forEach((el) =>
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        openActionsMenu(el, index.byId.get(el.dataset.actions!)!, onAction);
      }),
    );

    paintPhotos(container, photoOf);
    persist();
  }

  // Changing level on a wheel gesture, as the reference chart does: down goes
  // into the report under the manager, up goes to the manager.
  //
  // Only from the end of the scroller, so a row taller than the frame can still
  // be read the ordinary way first — the gesture that reaches the bottom is not
  // the one that descends. And only into a report that has been chosen: an
  // unchosen row has nobody under the manager to descend into, so the scroll
  // simply ends there.
  //
  // Left out entirely for a viewer who asked for less motion: taking over the
  // wheel is exactly what they are asking not to happen.
  let wheelAcc = 0;
  let wheelShut: ReturnType<typeof setTimeout> | undefined;
  let wheelShutAt = 0;
  const openWheel = (): void => {
    clearTimeout(wheelShut);
    wheelShut = undefined;
  };
  const shutWheel = (now: number): void => {
    wheelShutAt = now;
    clearTimeout(wheelShut);
    wheelShut = setTimeout(openWheel, WHEEL_QUIET_MS);
  };

  // What the wheel would scroll if we left it alone: the nearest thing under
  // the pointer that can still move that way. Not `container` alone — inside
  // ISC the scrollbar can belong to an ancestor of ours, and a level that fits
  // the frame has no scroller at all. Where nothing can scroll, the gesture is
  // free to change level instead.
  const wouldScroll = (from: EventTarget | null, down: boolean): boolean => {
    for (let el = from as HTMLElement | null; el; el = el.parentElement) {
      const overflow = getComputedStyle(el).overflowY;
      const scrolls =
        (overflow === "auto" || overflow === "scroll" || overflow === "overlay") &&
        (down
          ? el.scrollTop + el.clientHeight < el.scrollHeight - 1
          : el.scrollTop > 1);
      if (scrolls) return true;
    }
    return false;
  };

  container.addEventListener(
    "wheel",
    (e: WheelEvent) => {
      if (reducedMotion() || !e.deltaY) return;
      // A menu, the tree picker or a dialog scrolls itself.
      if ((e.target as HTMLElement | null)?.closest(".wd-menu-pop, .wd-select-panel, .wd-dialog-backdrop")) {
        return;
      }

      const now = e.timeStamp;
      // Still closed from the last gesture: hold it closed until the wheel
      // stops, so trackpad momentum cannot carry into a second level — but
      // never past the cap, or a stream of events would hold it closed for good.
      if (wheelShut !== undefined) {
        if (now - wheelShutAt < WHEEL_SHUT_MAX_MS) {
          clearTimeout(wheelShut);
          wheelShut = setTimeout(openWheel, WHEEL_QUIET_MS);
          return;
        }
        openWheel();
      }
      if (animating) return;

      const down = e.deltaY > 0;
      if (wouldScroll(e.target, down)) {
        // Reading the level the ordinary way: the gesture that reaches the end
        // is not the one that changes level.
        wheelAcc = 0;
        return;
      }
      // A reversal starts a fresh gesture rather than cancelling out.
      if (wheelAcc && wheelAcc > 0 !== down) wheelAcc = 0;
      wheelAcc += e.deltaY;
      if (Math.abs(wheelAcc) < WHEEL_STEP) return;

      const target = down
        ? (chosen.get(focusId) ?? cameFrom.get(focusId))
        : index.managerOf(focusId)?.id;
      wheelAcc = 0;
      // Nothing to move to — the row has no chosen report and no climb to undo,
      // or this is a root.
      // Say so by doing nothing; the scroll has simply ended.
      if (!target) return;
      // Down only into someone still reporting here: a tree can change under a
      // remembered choice.
      if (down && index.managerOf(target)?.id !== focusId) return;

      shutWheel(now);
      void (down ? descend(target) : ascend(target));
    },
    { passive: true },
  );

  draw();
}

function cardInner(
  p: OrgIdentity,
  index: OrgIndex,
  identityUrl?: (id: string) => string,
  descendable = false,
  withActions = false,
): string {
  const count = index.reportsOf(p.id).length;
  const badge = count ? `<span class="wd-badge">${count}</span>` : "";
  // A photo is painted onto a canvas (see paintPhotos): the plugin CSP allows
  // img-src 'self' only, and UMS refuses to extend it, so a data-URI <img> is
  // blocked. The initials stay underneath, showing until the photo is decoded,
  // or for good if it can't be.
  const face = p.photo
    ? `${esc(initials(p.name))}<canvas class="wd-photo" data-photo="${esc(p.id)}" width="112" height="112" aria-hidden="true"></canvas>`
    : esc(initials(p.name));
  const href = identityUrl?.(p.id);
  // The reference chart marks a manager with a chevron on the bottom edge of
  // their card.
  const chevron =
    descendable && count
      ? `<button class="wd-down" data-down="${p.id}" aria-label="Show ${esc(p.name)}'s reports" title="Show ${esc(p.name)}'s reports">${CHEVRON_DOWN}</button>`
      : "";
  // The whole card opens the identity, via a link stretched across it rather
  // than a click handler: it keeps real link semantics (keyboard, middle-click,
  // status-bar URL) and stays valid HTML with the chevron and ··· sitting above
  // it. `_top`, not `_blank`, because the App Shell sandboxes the plugin iframe
  // without `allow-popups`, so a new window is blocked outright ("Blocked
  // opening … whose 'allow-popups' permission is not set"). The manifest has no
  // sandbox field to grant it and the SDK exposes no navigation API, so driving
  // the host frame is the only route out.
  const open = href
    ? `<a class="wd-open" href="${esc(href)}" target="_top" aria-label="Open ${esc(p.name)} in ISC" title="Open ${esc(p.name)} in ISC"></a>`
    : "";
  const actions = withActions
    ? `<button class="wd-actions" data-actions="${p.id}" title="Related Actions" aria-label="Related actions for ${esc(p.name)}">⋯</button>`
    : "";
  return `
    ${open}
    ${actions}
    <span class="wd-avatar">${face}${badge}</span>
    <span class="wd-name">${esc(p.name)}</span>
    <span class="wd-title">${esc(p.title)}</span>
    <span class="wd-loc">${PIN}${esc(p.location)}</span>
    <span class="wd-org">${esc(p.orgUnit)}</span>
    ${chevron}`;
}

let closeActiveMenu: (() => void) | null = null;

// A small popover anchored to the ··· button, like ISC's Actions dropdown.
function openActionsMenu(
  anchor: HTMLElement,
  p: OrgIdentity,
  onAction?: (action: ActionKey, person: OrgIdentity) => void,
): void {
  closeActiveMenu?.();

  const menu = document.createElement("div");
  menu.className = "wd-menu-pop";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", `Related actions for ${p.name}`);
  menu.innerHTML = `
    <ul class="wd-menu">
      ${actionsFor(p).map(
        ([key, label, destructive]) =>
          `<li><button class="wd-menu-item${destructive ? " destructive" : ""}" role="menuitem" data-action="${key}">${esc(label)}</button></li>`,
      ).join("")}
    </ul>`;
  document.body.appendChild(menu);

  // Anchor to the right of the button; flip to the left / clamp to stay on-screen.
  const r = anchor.getBoundingClientRect();
  const mw = menu.offsetWidth;
  const mh = menu.offsetHeight;
  let left = r.right + 6;
  if (left + mw > window.innerWidth - 8) left = Math.max(8, r.left - mw - 6);
  let top = Math.min(r.top, window.innerHeight - mh - 8);
  top = Math.max(8, top);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;

  const close = (): void => {
    menu.remove();
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("click", onDocClick, true);
    window.removeEventListener("scroll", close, true);
    window.removeEventListener("resize", close, true);
    closeActiveMenu = null;
  };
  closeActiveMenu = close;

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") close();
  };
  const onDocClick = (e: MouseEvent): void => {
    if (!menu.contains(e.target as Node)) close();
  };

  menu.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const action = btn.dataset.action as ActionKey;
      close();
      if (onAction) onAction(action, p);
      else console.log(`[no action handler] ${action} → ${p.name} (${p.id})`);
    }),
  );

  // Defer so the opening click doesn't immediately dismiss the menu.
  setTimeout(() => {
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("click", onDocClick, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close, true);
  }, 0);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!,
  );
}
