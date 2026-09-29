import { describe, it, expect, vi, afterEach } from "vitest";
import { renderOrgNavigator, SWAP_MS, DRAW_MS, SCROLL_MS } from "../src/org-view";
import type { OrgIdentity } from "../src/org-nav";

const person = (id: string, manager: string | null, name = `n${id}`): OrgIdentity => ({
  id,
  name,
  title: "t",
  location: "loc",
  orgUnit: "org",
  manager: manager ? { id: manager, name: manager } : null,
});

// Two disconnected trees, the shape a tenant with sparse `manager` data yields:
// Ana → {Bo, Cy}, and Zoe → Dee.
const forest = [
  person("1", null, "Ana"),
  person("2", "1", "Bo"),
  person("3", "1", "Cy"),
  person("9", null, "Zoe"),
  person("10", "9", "Dee"),
];

// Ana → {Bo, Cy, Dee}; Cy → {Dot, Eve}. Cy is both a manager (so its card gets a
// chevron) and the middle of the row (so the circled chevron hangs off it).
const deepForest = [
  person("1", null, "Ana"),
  person("2", "1", "Bo"),
  person("3", "1", "Cy"),
  person("6", "1", "Dee"),
  person("4", "3", "Dot"),
  person("5", "3", "Eve"),
];

const render = (
  identities: OrgIdentity[],
  startId?: string,
  identityUrl?: (id: string) => string,
  // The tree picker is admin-only, so the view leaves it out unless asked for
  // it. Most tests want it; the ones about hiding it pass false.
  canSwitchTree = true,
): HTMLElement => {
  const container = document.createElement("div");
  renderOrgNavigator(
    container,
    identities,
    startId,
    identityUrl,
    undefined,
    undefined,
    undefined,
    canSwitchTree,
  );
  return container;
};

// Comfortably past every beat, so the transition has fully settled.
const SETTLED_MS = SWAP_MS + DRAW_MS + SCROLL_MS + 1000;

const trigger = (c: HTMLElement) => c.querySelector<HTMLButtonElement>(".wd-select-trigger");
const panel = (c: HTMLElement) => c.querySelector<HTMLElement>(".wd-select-panel")!;
const options = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>("[role=option]")];
const text = (el: Element) => el.textContent!.trim().replace(/\s+/g, " ");
const press = (el: HTMLElement, key: string) =>
  el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
const cards = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>(live + ".wd-report")];
const toggle = (c: HTMLElement) => c.querySelector<HTMLButtonElement>(live + "[data-toggle]");
// A manager with nine reports; the fourth of them has reports of their own.
const bigTeam = [
  person("1", null, "Boss"),
  ...Array.from({ length: 9 }, (_, i) => person(`r${i}`, "1", `Rep${i}`)),
  person("deep", "r3", "Deep"),
];

const downArrows = (c: HTMLElement) => [...c.querySelectorAll<HTMLButtonElement>(".wd-down")];
// During a scroll the outgoing level is cloned in alongside the new one, so
// every lookup has to ignore the ghost or it reads the level being left behind.
const live = ".wd-stage:not(.wd-ghost) ";
const focusName = (c: HTMLElement) => c.querySelector(live + ".wd-focus .wd-name")!.textContent;

describe("root switcher", () => {
  it("offers one option per disconnected tree, largest first, with its size", () => {
    const c = render(forest);
    expect(options(c).map(text)).toEqual(["Ana 3", "Zoe 2"]);
    expect(text(c.querySelector(".wd-roots-label")!)).toBe("2 Organization trees"); // one line
    expect(c.querySelector(".wd-roots-help")).toBeNull();
  });

  it("shows the tree the focused person belongs to on the closed dropdown", () => {
    const c = render(forest, "10"); // Dee, in Zoe's tree
    expect(text(trigger(c)!)).toBe("Zoe");
    expect(options(c).find((o) => o.getAttribute("aria-selected") === "true")!.textContent).toContain("Zoe");
  });

  it("opens on click and closes again on a second click", () => {
    const c = render(forest);
    expect(panel(c).hidden).toBe(true);

    trigger(c)!.click();
    expect(panel(c).hidden).toBe(false);
    expect(trigger(c)!.getAttribute("aria-expanded")).toBe("true");

    trigger(c)!.click();
    expect(panel(c).hidden).toBe(true);
    expect(trigger(c)!.getAttribute("aria-expanded")).toBe("false");
  });

  it("crosses into another tree on selection — unreachable via manager/report links", () => {
    const c = render(forest);
    expect(focusName(c)).toBe("Ana");

    trigger(c)!.click();
    options(c)[1].click();

    expect(focusName(c)).toBe("Zoe");
    expect(text(trigger(c)!)).toBe("Zoe");
    expect(panel(c).hidden).toBe(true);
  });

  it("picks a tree with the keyboard", () => {
    const c = render(forest);
    document.body.append(c);

    press(trigger(c)!, "ArrowDown");
    press(panel(c), "ArrowDown");
    expect(panel(c).getAttribute("aria-activedescendant")).toBe(options(c)[1].id);
    press(panel(c), "Enter");

    expect(focusName(c)).toBe("Zoe");
    expect(document.activeElement).toBe(trigger(c));
    c.remove();
  });

  it("jumps to a tree by typing the first letter of its root", () => {
    const c = render(forest);
    trigger(c)!.click();

    press(panel(c), "z");

    expect(panel(c).getAttribute("aria-activedescendant")).toBe(options(c)[1].id);
  });

  it("closes on Escape without changing tree", () => {
    const c = render(forest);
    trigger(c)!.click();
    press(panel(c), "ArrowDown");

    press(panel(c), "Escape");

    expect(panel(c).hidden).toBe(true);
    expect(focusName(c)).toBe("Ana");
  });

  it("marks only the managers in the row with a down chevron", () => {
    const c = render(deepForest);
    // Bo has no reports and gets none; Cy has two and does.
    expect(downArrows(c).map((b) => b.dataset.down)).toEqual(["3"]);
  });

  it("draws no long connector below the row", () => {
    // The per-card chevrons descend a level; a circled chevron on a long line
    // below the row read as one line running the height of the page.
    expect(render(deepForest).querySelector(".wd-drill")).toBeNull();
    expect(render(deepForest).querySelector(".wd-line-long")).toBeNull();
  });

  it("stays hidden when the whole population forms one tree", () => {
    const c = render([person("1", null, "Ana"), person("2", "1", "Bo")]);
    expect(trigger(c)).toBeNull();
  });

  // Crossing into a tree you have no part in is an admin's view of the tenant,
  // so main.ts offers the picker to admins only.
  it("stays hidden from a viewer who may not switch tree, forest or not", () => {
    const c = render(forest, undefined, undefined, false);
    expect(trigger(c)).toBeNull();
    expect(options(c)).toHaveLength(0);
    // Their own hierarchy is untouched: Ana on top, Bo and Cy below.
    expect(focusName(c)).toBe("Ana");
    expect(cards(c).map(text)).toHaveLength(2);
  });
});

describe("identity link", () => {
  const url = (id: string) => `https://tenant.example.com/ui/identities/${id}`;

  it("makes the whole card a link to the identity, not just the name", () => {
    const c = render(forest, undefined, url);
    const a = c.querySelector<HTMLAnchorElement>(".wd-focus a.wd-open")!;
    expect(a.getAttribute("href")).toBe("https://tenant.example.com/ui/identities/1");
    // The host sandbox has no `allow-popups`, so a new window is blocked and the
    // link has to drive the top frame instead.
    expect(a.target).toBe("_top");
    // The name is plain text now that the card itself carries the link.
    expect(c.querySelector("a.wd-name")).toBeNull();
    expect(c.querySelector(".wd-focus .wd-name")!.textContent).toBe("Ana");
  });

  it("links every report card too", () => {
    const c = render(forest, undefined, url);
    const hrefs = [...c.querySelectorAll<HTMLAnchorElement>(".wd-report a.wd-open")].map(
      (a) => a.getAttribute("href"),
    );
    expect(hrefs).toEqual([
      "https://tenant.example.com/ui/identities/2",
      "https://tenant.example.com/ui/identities/3",
    ]);
  });

  it("falls back to no link at all when no URL builder is supplied", () => {
    const c = render(forest);
    expect(c.querySelector("a.wd-open")).toBeNull();
    expect(c.querySelector(".wd-focus .wd-name")!.textContent).toBe("Ana");
  });

  it("does not navigate to the identity when the down chevron is clicked", () => {
    const c = render(deepForest, undefined, url);
    const navigated: Event[] = [];
    c.querySelectorAll("a.wd-open").forEach((a) => a.addEventListener("click", (e) => navigated.push(e)));

    downArrows(c)[0].click();

    // The chevron descends a level; it must not also open the identity page.
    expect(navigated).toHaveLength(0);
    expect(focusName(c)).toBe("Cy");
  });
});

// happy-dom does no layout, so every rect is zero and the navigator takes its
// no-animation path. Patch the prototype rather than one render's elements, so
// the cards a redraw creates mid-animation are measurable too.
const realRect = HTMLElement.prototype.getBoundingClientRect;
const realOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
const box = (left: number, top: number, w = 210, h = 150): DOMRect =>
  ({ left, top, width: w, height: h, right: left + w, bottom: top + h }) as DOMRect;

// The state the pointer leaves the clicked card in: `.wd-card:hover` lifts it
// 3px and scales it 1.04, so its top sits ~8px above its neighbours' and it is
// a few pixels wider. Its line has not changed.
const stubHovered = (hoveredId: string): void => {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains("wd-stage") ? 400 : 0;
    },
  });
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement): DOMRect {
    if (this.classList.contains("wd-focus")) return box(0, 100);
    if (this.classList.contains("wd-report")) {
      const left = [...(this.parentElement?.children ?? [])].indexOf(this) * 230 + 1;
      return this.dataset.card === hoveredId
        ? box(left - 4, 292, 218, 156)
        : box(left, 300);
    }
    return box(0, 0);
  };
};

const stubLayout = (): void => {
  // The scroll measures stage heights with offsetHeight, which happy-dom reports
  // as 0 — that is the navigator's "no layout, do not animate" signal.
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains("wd-stage") ? 400 : 0;
    },
  });
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement): DOMRect {
    if (this.classList.contains("wd-focus")) return box(0, 100);
    if (this.classList.contains("wd-report")) {
      return box([...(this.parentElement?.children ?? [])].indexOf(this) * 230 + 1, 300);
    }
    return box(0, 0);
  };
};
const restoreLayout = (): void => {
  HTMLElement.prototype.getBoundingClientRect = realRect;
  if (realOffsetHeight) {
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", realOffsetHeight);
  }
};

// A row wide enough to wrap: seven tiles on the first line, the rest 200px
// below it, which is how a nine-report row lays out.
const stubWrapped = (): void => {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains("wd-stage") ? 400 : 0;
    },
  });
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement): DOMRect {
    if (this.classList.contains("wd-focus")) return box(690, 100);
    if (this.classList.contains("wd-report")) {
      const i = [...(this.parentElement?.children ?? [])].indexOf(this);
      return box((i % 7) * 230 + 1, 300 + Math.floor(i / 7) * 200);
    }
    return box(0, 0);
  };
};

const downArrowFor = (c: HTMLElement, id: string): HTMLButtonElement | null =>
  c.querySelector<HTMLButtonElement>(`[data-down="${id}"]`);

const cardFor = (c: HTMLElement, id: string): HTMLElement =>
  [...c.querySelectorAll<HTMLElement>(live + ".wd-report")].find((el) => el.dataset.card === id)!;

describe("descend animation", () => {
  afterEach(() => {
    vi.useRealTimers();
    restoreLayout();
  });

  it("trades places with the centred card first, before any scrolling", () => {
    const c = render(deepForest);
    stubLayout();
    const [bo, cy] = [...c.querySelectorAll<HTMLElement>(".wd-report")];

    downArrows(c)[0].click(); // Cy, second in the row

    // Beat one: the two cards exchange horizontally and the level has not
    // changed yet — the clicked card slides to the centre rather than jumping.
    expect(focusName(c)).toBe("Ana");
    expect(cy.style.transform).toBe("translate(-230px, 0px)");
    expect(bo.style.transform).toBe("translate(230px, 0px)");
  });

  it("trades by centres, so a card lifted by :hover still lands in the manager's column", () => {
    const c = render(deepForest);
    stubLayout();
    // The pointer rests on Cy as its chevron is clicked: :hover scales the card
    // 4%, which moves its left edge but not its centre.
    const unscaled = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement): DOMRect {
      const r = unscaled.call(this);
      if (this.dataset.card !== "3" || this.style.transform) return r;
      const grow = r.width * 0.04;
      return { ...r, left: r.left - grow / 2, right: r.right + grow / 2, width: r.width + grow } as DOMRect;
    };

    downArrows(c)[0].click(); // Cy, second in the row

    // Measured by the left edge this was translate(-225.8px): 4.2px off.
    expect(cardFor(c, "3").style.transform).toBe("translate(-230px, 0px)");
    expect(cardFor(c, "2").style.transform).toBe("translate(230px, 0px)");
  });

  // A row too wide for one line wraps, and only the first line sits under the
  // manager. Trading a card up from the second line is a move up as much as
  // across — sliding it sideways alone left it centred but still a line low.
  // The hovered card's own lift once counted as a line of its own: it measured
  // as the topmost card in the row, so it was picked as the card under the
  // manager, matched itself, and no trade ran at all.
  it("still trades on one line, with the clicked card sitting high under the pointer", () => {
    const c = render(deepForest);
    stubHovered("3"); // Cy, the card about to be clicked

    downArrows(c)[0].click();

    // Bo holds the slot under the manager and they swap, purely sideways.
    expect(cardFor(c, "3").style.transform).toBe("translate(-230px, 0px)");
    expect(cardFor(c, "2").style.transform).toBe("translate(230px, 0px)");
  });

  it("trades a card up from a wrapped row's second line, not just across", () => {
    // Nine reports wrap onto two lines, and the one with reports of its own —
    // the only kind you can descend into — sits on the second.
    const wideTeam = [
      person("1", null, "Boss"),
      ...Array.from({ length: 9 }, (_, i) => person(`r${i}`, "1", `Rep${i}`)),
      person("deep", "r7", "Deep"),
    ];
    const c = render(wideTeam);
    stubWrapped();
    const second = cardFor(c, "r7"); // line two, first column

    downArrowFor(c, "r7")!.click();

    // The card under the manager is r3, the middle of line one — not r0, which
    // shares a column with r7 but sits a line lower.
    const centred = cardFor(c, "r3");
    expect(second.style.transform).toBe("translate(690px, -200px)");
    expect(centred.style.transform).toBe("translate(-690px, 200px)");
  });

  it("draws the line down from the card once it is centred, before the level changes", async () => {
    vi.useFakeTimers();
    const c = render(deepForest);
    stubLayout();

    downArrows(c)[0].click(); // Cy
    expect(c.querySelector(".wd-trail")).toBeNull(); // still trading
    await vi.advanceTimersByTimeAsync(SWAP_MS + 20);

    // Beat two: the trade is done, the connector is growing, the level is unchanged.
    // It hangs from the row, first, so every card paints over it.
    const trail = c.querySelector<HTMLElement>(live + ".wd-reports > .wd-trail:first-child")!;
    expect(trail).not.toBeNull();
    expect(trail.style.transform).toBe("scaleY(1)");
    expect(trail.style.transition).toContain(`${DRAW_MS}ms`);
    expect(focusName(c)).toBe("Ana");
  });

  it("draws the line straight away when the card is already centred", async () => {
    vi.useFakeTimers();
    // Ana → Bo → Cy: Bo is Ana's only report, so already under her.
    const c = render([person("1", null, "Ana"), person("2", "1", "Bo"), person("3", "2", "Cy")]);
    stubLayout();

    downArrows(c)[0].click();

    expect(c.querySelector(live + ".wd-reports > .wd-trail")).not.toBeNull();
    expect(cardFor(c, "2").style.transform).toBe(""); // nothing traded
    await vi.advanceTimersByTimeAsync(DRAW_MS + 20);
    expect(focusName(c)).toBe("Bo");
  });

  it("moves one card down out of the row rather than showing it twice", async () => {
    vi.useFakeTimers();
    const c = render(deepForest);
    stubLayout();

    downArrows(c)[0].click(); // Cy
    await vi.advanceTimersByTimeAsync(SWAP_MS + DRAW_MS + 20);

    // Mid-scroll: the row's copy of Cy is hidden and the focused copy travels
    // from where it sat, along with the scroll.
    const rowCopy = [...c.querySelectorAll<HTMLElement>(".wd-ghost .wd-report")].find(
      (el) => el.dataset.card === "3",
    )!;
    expect(rowCopy.style.visibility).toBe("hidden");
    expect(c.querySelector<HTMLElement>(live + ".wd-focus")!.style.transition).toContain(`${SCROLL_MS}ms`);

    await vi.advanceTimersByTimeAsync(SETTLED_MS);
    expect(c.querySelector(".wd-ghost")).toBeNull();
    expect(c.querySelector<HTMLElement>(".wd-focus")!.style.transition).toBe("");
  });

  it("scrolls the level in only after the line is drawn", async () => {
    vi.useFakeTimers();
    const c = render(deepForest);
    stubLayout();

    downArrows(c)[0].click();
    await vi.advanceTimersByTimeAsync(SWAP_MS + DRAW_MS + 20);

    // Beat three: only now does the level change, and the stage is mid-scroll —
    // the offset itself is cleared on the next frame, so assert the transition.
    expect(focusName(c)).toBe("Cy");
    expect(c.querySelector<HTMLElement>(".wd-scroll")!.style.transition).toContain(
      `${SCROLL_MS}ms`,
    );

    await vi.advanceTimersByTimeAsync(SETTLED_MS);
    expect(c.querySelector<HTMLElement>(".wd-scroll")!.style.transform).toBe("");
  });

  it("ignores a second navigation while one is in flight", async () => {
    vi.useFakeTimers();
    const c = render(deepForest);
    stubLayout();

    downArrows(c)[0].click(); // descend into Cy
    downArrows(c)[0].click(); // and immediately again

    await vi.advanceTimersByTimeAsync(SETTLED_MS);
    expect(focusName(c)).toBe("Cy");
  });

  it("descends without animating when the viewer prefers reduced motion", () => {
    const c = render(deepForest);
    stubLayout();
    vi.stubGlobal("matchMedia", () => ({ matches: true }));

    downArrows(c)[0].click();

    expect(focusName(c)).toBe("Cy");
    vi.unstubAllGlobals();
  });
});

describe("climbing to the manager", () => {
  afterEach(() => {
    vi.useRealTimers();
    restoreLayout();
  });

  it("arms the scroll on the stage, moving only the card it came from", () => {
    const c = render(deepForest, "3"); // Cy, who reports to Ana
    stubLayout();

    c.querySelector<HTMLElement>(".wd-up")!.click();

    expect(focusName(c)).toBe("Ana");
    // Both levels are on screen during the scroll, so what is observable is the
    // wrapper carrying them and the outgoing level cloned in beside the new one.
    const scroll = c.querySelector<HTMLElement>(".wd-scroll")!;
    expect(scroll.style.transition).toContain(`${SCROLL_MS}ms`);
    expect(c.querySelectorAll(".wd-stage")).toHaveLength(2);
    // Cy travels up from the focused slot into Ana's row; Bo stays put.
    expect(cardFor(c, "3").style.transition).toContain(`${SCROLL_MS}ms`);
    expect(cardFor(c, "2").style.transform).toBe("");
  });

  it("keeps the traded positions when climbing back to a row", async () => {
    vi.useFakeTimers();
    const c = render(deepForest);
    stubLayout();
    expect(cards(c).map((el) => el.dataset.card)).toEqual(["2", "3", "6"]);

    downArrows(c)[0].click(); // descend into Cy, trading it with the centred card
    await vi.advanceTimersByTimeAsync(SETTLED_MS);
    c.querySelector<HTMLElement>(".wd-up")!.click();
    await vi.advanceTimersByTimeAsync(SETTLED_MS);

    // Cy holds the slot it was traded into rather than snapping back to sorted.
    expect(cards(c).map((el) => el.dataset.card)).toEqual(["3", "2", "6"]);
  });

  it("shows the card it came from once, rising on a line held until the scroll lands", async () => {
    vi.useFakeTimers();
    const c = render(deepForest);
    stubLayout();
    downArrows(c)[0].click(); // descend into Cy, trading it under Ana
    await vi.advanceTimersByTimeAsync(SETTLED_MS);

    c.querySelector<HTMLElement>(".wd-up")!.click();

    // The outgoing focused copy is hidden; the row copy travels, on a rail.
    expect(c.querySelector<HTMLElement>(".wd-ghost .wd-focus")!.style.visibility).toBe("hidden");
    expect(cardFor(c, "3").style.transition).toContain(`${SCROLL_MS}ms`);
    expect(c.querySelector(live + ".wd-reports .wd-rail")).not.toBeNull();
    await vi.advanceTimersByTimeAsync(SCROLL_MS - 50);
    expect(c.querySelector(".wd-rail")).not.toBeNull();

    await vi.advanceTimersByTimeAsync(100);
    expect(c.querySelector(".wd-rail")).toBeNull();
    expect(cardFor(c, "3").style.transition).toBe("");
  });

  it("draws no rail from a card outside the centre column", () => {
    const c = render(deepForest, "3"); // opened on Cy: never traded under Ana
    stubLayout();

    c.querySelector<HTMLElement>(".wd-up")!.click();

    expect(c.querySelector(".wd-rail")).toBeNull();
    expect(c.querySelector<HTMLElement>(".wd-ghost .wd-focus")!.style.visibility).toBe("hidden");
  });

  it("settles the stage into place once the scroll is done", async () => {
    vi.useFakeTimers();
    const c = render(deepForest, "3");
    stubLayout();

    c.querySelector<HTMLElement>(".wd-up")!.click();
    await vi.advanceTimersByTimeAsync(SETTLED_MS);

    expect(c.querySelector<HTMLElement>(".wd-scroll")!.style.transform).toBe("");
    // The cloned outgoing level is cleaned up once the scroll finishes.
    expect(c.querySelectorAll(".wd-stage")).toHaveLength(1);
  });

  it("climbs without animating when the viewer prefers reduced motion", () => {
    const c = render(deepForest, "3");
    stubLayout();
    vi.stubGlobal("matchMedia", () => ({ matches: true }));

    c.querySelector<HTMLElement>(".wd-up")!.click();

    expect(focusName(c)).toBe("Ana");
    expect(c.querySelector<HTMLElement>(".wd-stage")!.style.transform).toBe("");
    vi.unstubAllGlobals();
  });
});

const crumbs = (c: HTMLElement) => [...c.querySelectorAll<HTMLButtonElement>(".wd-crumb")];
const crumbFor = (c: HTMLElement, name: string) => crumbs(c).find((b) => b.textContent === name)!;

describe("climbing from the breadcrumb trail", () => {
  afterEach(() => {
    vi.useRealTimers();
    restoreLayout();
  });

  it("scrolls to the manager rather than cutting to their level", () => {
    const c = render(deepForest, "4"); // Dot, under Cy, under Ana
    stubLayout();

    crumbFor(c, "Cy").click();

    expect(focusName(c)).toBe("Cy");
    expect(c.querySelector<HTMLElement>(".wd-scroll")!.style.transition).toContain(`${SCROLL_MS}ms`);
    expect(c.querySelectorAll(".wd-stage")).toHaveLength(2);
  });

  it("passes through the levels in between on the way to a higher manager", async () => {
    vi.useFakeTimers();
    const c = render(deepForest, "4");
    stubLayout();

    crumbFor(c, "Ana").click();

    // The step onto Cy runs first, and is shorter than a single-level climb so
    // the two-level trip doesn't take twice as long.
    expect(focusName(c)).toBe("Cy");
    const step = Number(/(\d+)ms/.exec(c.querySelector<HTMLElement>(".wd-scroll")!.style.transition)![1]);
    expect(step).toBeLessThan(SCROLL_MS);

    await vi.advanceTimersByTimeAsync(SETTLED_MS);
    expect(focusName(c)).toBe("Ana");
    expect(c.querySelectorAll(".wd-stage")).toHaveLength(1);
  });

  // Victor.Pierce opens on his manager and climbs to the top: every level in
  // between belongs to someone nobody descended from, so nothing had arranged
  // those rows and the chain wandered off to the right as it rose.
  it("brings the card it came from under its manager, level by level", async () => {
    vi.useFakeTimers();
    // Zed sorts last of Boss's three reports, so alphabetical order leaves the
    // chain off-centre: the climb has to trade Zed into the middle slot.
    const c = render(
      [
        person("1", null, "Boss"),
        person("a", "1", "Ann"),
        person("m", "1", "Mia"),
        person("z", "1", "Zed"),
        person("k", "z", "Kid"),
      ],
      "k",
    );
    stubLayout();
    expect(crumbs(c).map((b) => b.textContent)).toEqual(["Boss", "Zed", "Kid"]);

    crumbFor(c, "Boss").click();
    await vi.advanceTimersByTimeAsync(SETTLED_MS);

    expect(focusName(c)).toBe("Boss");
    // Zed holds the middle of the row, directly below Boss, rather than the
    // last slot alphabetical order put them in.
    expect(cards(c).map((el) => el.dataset.card)).toEqual(["a", "z", "m"]);
  });

  it("orders an even row it climbs into without shifting it", () => {
    const c = render(deepForest, "4"); // Dot, one of Cy's two reports
    stubLayout();

    crumbFor(c, "Cy").click();

    // Dot takes the slot right of centre, as a descent into Dot would have
    // left them — but arriving is not choosing, so the row stays centred and
    // the slot is not brought under Cy.
    expect(cards(c).map((el) => el.dataset.card)).toEqual(["5", "4"]);
    expect(c.querySelector<HTMLElement>(live + ".wd-reports")!.dataset.count).toBeUndefined();
  });

  it("stays put when the crumb for the focused person is clicked", () => {
    const c = render(deepForest, "4");
    stubLayout();

    crumbFor(c, "Dot").click();

    expect(focusName(c)).toBe("Dot");
    expect(c.querySelectorAll(".wd-stage")).toHaveLength(1);
  });

  it("jumps without animating when the viewer prefers reduced motion", () => {
    const c = render(deepForest, "4");
    stubLayout();
    vi.stubGlobal("matchMedia", () => ({ matches: true }));

    crumbFor(c, "Ana").click();

    expect(focusName(c)).toBe("Ana");
    expect(c.querySelectorAll(".wd-stage")).toHaveLength(1);
    vi.unstubAllGlobals();
  });
});

describe("changing level with the wheel", () => {
  const wheel = (c: HTMLElement, deltaY: number): void => {
    c.dispatchEvent(new WheelEvent("wheel", { deltaY, bubbles: true }));
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  it("descends into the chosen report on a scroll down", () => {
    const c = render(deepForest); // Ana → {Bo, Cy, Dee}
    downArrows(c)[0].click(); // choosing Cy, which focuses them
    c.querySelector<HTMLButtonElement>(".wd-up")!.click();
    expect(focusName(c)).toBe("Ana");

    wheel(c, 200);

    expect(focusName(c)).toBe("Cy");
  });

  it("ends there when no report has been chosen", () => {
    const c = render(deepForest);

    wheel(c, 200);

    // An unchosen row has nobody under the manager to descend into.
    expect(focusName(c)).toBe("Ana");
  });

  it("climbs to the manager on a scroll up", () => {
    const c = render(deepForest, "3"); // Cy

    wheel(c, -200);

    expect(focusName(c)).toBe("Ana");
  });

  it("ends there at a root", () => {
    const c = render(deepForest);

    wheel(c, -200);

    expect(focusName(c)).toBe("Ana");
  });

  // A trackpad sends a burst of small deltas rather than one notch.
  it("takes a notch's worth of gesture, not the first flick of one", () => {
    const c = render(deepForest, "3");

    wheel(c, -40);
    wheel(c, -40);
    expect(focusName(c)).toBe("Cy");

    wheel(c, -40);
    expect(focusName(c)).toBe("Ana");
  });

  it("starts the count over when the gesture reverses", () => {
    const c = render(deepForest, "3");

    wheel(c, -100);
    wheel(c, 100); // not -100 + 100 = 0, and not 200 either: a fresh gesture
    expect(focusName(c)).toBe("Cy");
  });

  // Ana → Cy → Dot: one flick up from Dot reaches Cy, and its momentum must not
  // carry on to Ana.
  it("does not fall a second level on the momentum of one flick", async () => {
    vi.useFakeTimers();
    const c = render(deepForest, "4"); // Dot

    wheel(c, -200);
    expect(focusName(c)).toBe("Cy");
    wheel(c, -200);
    expect(focusName(c)).toBe("Cy");

    // Once the wheel has been quiet, the next gesture counts again.
    await vi.advanceTimersByTimeAsync(400);
    wheel(c, -200);
    expect(focusName(c)).toBe("Ana");
  });

  // Climbing is a round trip: the level just left is where a scroll back down
  // goes, even though arriving at a row is not choosing from it.
  it("comes back down to the level it climbed from", async () => {
    vi.useFakeTimers();
    const c = render(deepForest, "3"); // Cy, below Ana

    wheel(c, -200);
    expect(focusName(c)).toBe("Ana");

    await vi.advanceTimersByTimeAsync(400);
    wheel(c, 200);

    expect(focusName(c)).toBe("Cy");
  });

  // The tree opens on the viewer's manager with the viewer's own card already
  // under them, so the first scroll down has somewhere to go.
  it("descends into the signed-in viewer from the level it opens on", () => {
    const c = document.createElement("div");
    // As main.ts opens it: startId is the viewer's manager (levelOf), and the
    // viewer's own card is the one placed under them.
    renderOrgNavigator(c, deepForest, "1", undefined, undefined, undefined, "3");

    wheel(c, 200);

    expect(focusName(c)).toBe("Cy");
  });

  it("leaves the wheel alone for a viewer who asked for less motion", () => {
    const c = render(deepForest, "3");
    vi.stubGlobal("matchMedia", () => ({ matches: true }));

    wheel(c, -200);

    expect(focusName(c)).toBe("Cy");
    vi.unstubAllGlobals();
  });
});

describe("aligning a row under its manager", () => {
  const row = (c: HTMLElement) => c.querySelector<HTMLElement>(live + ".wd-reports")!;

  it("keeps an even row centred until one of its reports is chosen", () => {
    expect(row(render(forest)).dataset.count).toBeUndefined(); // Ana → Bo, Cy
  });

  it("shifts an even row once one of its reports has been chosen", () => {
    // Ana → {Bo, Cy}, Cy → Dot: choose Cy, climb back, and Ana's row is shifted.
    const c = render([person("1", null, "Ana"), person("2", "1", "Bo"), person("3", "1", "Cy"), person("4", "3", "Dot")]);
    downArrows(c)[0].click();
    c.querySelector<HTMLElement>(".wd-up")!.click();

    expect(focusName(c)).toBe("Ana");
    expect(row(c).dataset.count).toBe("2");
  });

  it("leaves an odd row alone — its middle card is already under the manager", () => {
    expect(row(render(deepForest)).dataset.count).toBeUndefined(); // three reports
  });

  it("leaves a stacked row alone — its full first line is seven tiles, an odd count", () => {
    const c = render(bigTeam);
    expect(row(c).dataset.count).toBeUndefined();
    toggle(c)!.click();
    expect(row(c).dataset.count).toBeUndefined();
  });
});

describe("remembering where you left off", () => {
  // Ana → {Bo, Cy}, Cy → Dot; and a second tree, Zoe → Dee.
  const twoTrees = [
    person("1", null, "Ana"),
    person("2", "1", "Bo"),
    person("3", "1", "Cy"),
    person("4", "3", "Dot"),
    person("9", null, "Zoe"),
    person("10", "9", "Dee"),
  ];
  const pickTree = (c: HTMLElement, root: string) => {
    trigger(c)!.click();
    options(c).find((o) => text(o).startsWith(root))!.click();
  };
  const KEY = "test:org-tree:view";
  const open = (startId?: string) => {
    const c = document.createElement("div");
    renderOrgNavigator(c, twoTrees, startId, undefined, undefined, KEY, undefined, true);
    return c;
  };

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("brings you back to the level you left when you pick a tree again", () => {
    const c = render(twoTrees);
    downArrows(c)[0].click(); // into Cy
    pickTree(c, "Zoe");
    expect(focusName(c)).toBe("Zoe");

    pickTree(c, "Ana");

    expect(focusName(c)).toBe("Cy");
  });

  it("takes you to the top when you pick the tree you're already in", () => {
    const c = render(twoTrees);
    downArrows(c)[0].click(); // into Cy

    pickTree(c, "Ana");

    expect(focusName(c)).toBe("Ana");
  });

  it("opens where it's told, but remembers each tree's level across a reload", () => {
    const first = open();
    downArrows(first)[0].click(); // into Cy, in Ana's tree
    pickTree(first, "Zoe");

    const again = open("10"); // the signed-in user's level: Dee, in Zoe's tree

    expect(focusName(again)).toBe("Dee"); // not where the last session ended
    pickTree(again, "Ana");
    expect(focusName(again)).toBe("Cy"); // Ana's tree comes back at the level left in it
  });

  // A choice is something the viewer just did. The arrangement it left behind
  // is worth keeping across a reload; the choice itself is not.
  it("comes back with nobody chosen, however the row was left", () => {
    const first = open();
    downArrows(first)[0].click(); // into Cy, which shifts Ana's even row

    const again = open();

    expect(focusName(again)).toBe("Ana");
    // An even row with nobody chosen is centred, not shifted...
    expect(again.querySelector<HTMLElement>(live + ".wd-reports")!.dataset.count).toBeUndefined();
    // ...and a scroll down ends there rather than descending into Cy again.
    again.dispatchEvent(new WheelEvent("wheel", { deltaY: 200, bubbles: true }));
    expect(focusName(again)).toBe("Ana");
  });

  // The arrangement a descent leaves behind is kept, unlike the choice: the
  // saved row order is read back and applied.
  it("keeps the order a descent traded the row into", () => {
    const KEY2 = "test:org-tree:view:order";
    // Ana → {Bo, Cy, Dee}: the row as a past session left it, Cy first.
    const team = [
      person("1", null, "Ana"),
      person("2", "1", "Bo"),
      person("3", "1", "Cy"),
      person("6", "1", "Dee"),
    ];
    localStorage.setItem(KEY2, JSON.stringify({ v: 2, rowOrder: { "1": ["3", "2", "6"] } }));

    const c = document.createElement("div");
    renderOrgNavigator(c, team, undefined, undefined, undefined, KEY2, undefined, true);

    expect(cards(c).map((el) => el.dataset.card)).toEqual(["3", "2", "6"]);
    localStorage.removeItem(KEY2);
  });

  it("restores a collapsed row after a reload", () => {
    const first = document.createElement("div");
    renderOrgNavigator(first, bigTeam, undefined, undefined, undefined, KEY);
    toggle(first)!.click(); // Show Less

    const again = document.createElement("div");
    renderOrgNavigator(again, bigTeam, undefined, undefined, undefined, KEY);

    expect(cards(again)).toHaveLength(6);
    expect(toggle(again)!.textContent).toBe("Show More");
  });

  it("ignores a saved view that no longer fits the data", () => {
    // A person since removed, and Dee filed under the wrong tree.
    localStorage.setItem(KEY, JSON.stringify({ v: 1, lastByRoot: { "9": "gone", "1": "10" } }));

    const c = open("3");
    pickTree(c, "Zoe");

    expect(focusName(c)).toBe("Zoe"); // stale memory dropped: the tree's top
    pickTree(c, "Ana");
    expect(focusName(c)).toBe("Cy"); // Cy was just left in Ana's tree
  });

  it("keeps working when storage is blocked", () => {
    const denied = () => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(denied);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(denied);

    const c = open("3");
    pickTree(c, "Zoe");
    pickTree(c, "Ana");

    expect(focusName(c)).toBe("Cy"); // remembered for the session, if not beyond
  });
});

describe("the signed-in user's card", () => {
  // Opened, as main.ts does, on the user's manager with the user passed along.
  const openAs = (people: OrgIdentity[], managerId: string, me: string) => {
    const c = document.createElement("div");
    renderOrgNavigator(c, people, managerId, undefined, undefined, undefined, me);
    return c;
  };
  const order = (c: HTMLElement) => cards(c).map((el) => el.dataset.card);

  it("sits right below their manager in an odd row: the middle card", () => {
    // Ana → {Bo, Cy, Dee}, signed in as Dee.
    expect(order(openAs(deepForest, "1", "6"))).toEqual(["2", "6", "3"]);
  });

  it("takes the slot right of centre in an even row, which stays centred", () => {
    // Ana → {Bo, Cy}, signed in as Bo. An even row has no slot under its
    // manager unless it is shifted, and opening on a row is not choosing from
    // it — so Bo is ordered right of centre and the row is left centred.
    const c = openAs(forest, "1", "2");
    expect(order(c)).toEqual(["3", "2"]);
    expect(c.querySelector<HTMLElement>(live + ".wd-reports")!.dataset.count).toBeUndefined();
  });

  it("sits in the middle of a stacked row's first line, still shown on Show Less", () => {
    const c = openAs(bigTeam, "1", "r8");
    expect(order(c)[3]).toBe("r8");
    toggle(c)!.click();
    expect(order(c)[3]).toBe("r8");
  });

  it("leaves the row alone when the viewer isn't in it", () => {
    expect(order(openAs(deepForest, "1", "nobody"))).toEqual(["2", "3", "6"]);
  });
});

describe("pinning the up-chevron", () => {
  afterEach(() => {
    vi.useRealTimers();
    restoreLayout();
  });

  // Ana → Cy → Dot → Zed: every level from Cy down has a manager.
  const chain = [person("1", null, "Ana"), person("3", "1", "Cy"), person("4", "3", "Dot"), person("7", "4", "Zed")];
  const shownUps = (c: HTMLElement) =>
    [...c.querySelectorAll<HTMLElement>(".wd-up")].filter((el) => el.style.visibility !== "hidden");

  it("holds one pinned copy still while two managed levels scroll", async () => {
    vi.useFakeTimers();
    const c = render(chain, "3");
    stubLayout();

    downArrows(c)[0].click(); // Dot, already under Cy: no trade
    await vi.advanceTimersByTimeAsync(DRAW_MS + 20);

    const pin = c.querySelector<HTMLElement>(".wd-up-pin")!;
    expect(pin).not.toBeNull();
    expect(shownUps(c)).toEqual([pin]); // both levels' own chevrons stand down
    expect(pin.style.transition).toBe(""); // and it does not move

    await vi.advanceTimersByTimeAsync(SETTLED_MS);
    expect(c.querySelector(".wd-up-pin")).toBeNull();
    expect(shownUps(c)).toHaveLength(1); // the new level's own is back
  });

  it("slides it down from under the header late in the scroll when leaving a root", async () => {
    vi.useFakeTimers();
    const c = render(chain); // Ana, a root: no chevron yet
    stubLayout();

    downArrows(c)[0].click(); // Cy
    await vi.advanceTimersByTimeAsync(DRAW_MS + 20);

    const pin = c.querySelector<HTMLElement>(".wd-up-pin")!;
    expect(pin.style.transform).toBe("");
    expect(pin.style.transition).toMatch(/^transform [\d.]+ms ease-out [\d.]+ms$/); // delayed
    await vi.advanceTimersByTimeAsync(SETTLED_MS);
    expect(c.querySelector(".wd-up-pin")).toBeNull();
    expect(shownUps(c)).toHaveLength(1);
  });

  it("slides it up out of view when climbing to a root", () => {
    const c = render(chain, "3");
    stubLayout();

    c.querySelector<HTMLElement>(".wd-up")!.click(); // to Ana, a root

    const pin = c.querySelector<HTMLElement>(".wd-up-pin")!;
    expect(pin.style.transform).toMatch(/^translateY\(-/);
    expect(pin.style.transition).toMatch(/ease-in$/);
  });
});

describe("stacking a wide row", () => {
  it("shows every report when the row fits", () => {
    expect(cards(render(deepForest))).toHaveLength(3);
    expect(toggle(render(deepForest))).toBeNull();
  });

  it("shows the whole team by default, offering to collapse it", () => {
    const c = render(bigTeam);
    expect(cards(c)).toHaveLength(9);
    expect(toggle(c)!.textContent).toBe("Show Less");
  });

  it("collapses to a single row of tiles on Show Less", () => {
    const c = render(bigTeam);

    toggle(c)!.click();

    // Seven tiles wide: six cards plus Show More, not seven cards plus an eighth.
    expect(cards(c)).toHaveLength(6);
    expect(toggle(c)!.textContent).toBe("Show More");
  });

  it("expands again on Show More", () => {
    const c = render(bigTeam);
    toggle(c)!.click();

    toggle(c)!.click();

    expect(cards(c)).toHaveLength(9);
    expect(toggle(c)!.textContent).toBe("Show Less");
  });

  it("keeps a collapsed row collapsed after visiting a report and climbing back", () => {
    const c = render(bigTeam);
    toggle(c)!.click();
    expect(cards(c)).toHaveLength(6);

    downArrows(c)[0].click(); // descend into Rep3
    c.querySelector<HTMLElement>(".wd-up")!.click(); // and straight back up

    expect(cards(c)).toHaveLength(6);
    expect(toggle(c)!.textContent).toBe("Show More");
  });

  it("remembers the collapse per manager, leaving other big rows expanded", () => {
    // Boss → nine reps, and Rep3 → nine of their own.
    const c = render([
      ...bigTeam.filter((p) => p.id !== "deep"),
      ...Array.from({ length: 9 }, (_, i) => person(`s${i}`, "r3", `Sub${i}`)),
    ]);
    toggle(c)!.click(); // collapse Boss's row

    downArrows(c)[0].click(); // into Rep3
    expect(cards(c)).toHaveLength(9); // never collapsed: opens expanded
    expect(toggle(c)!.textContent).toBe("Show Less");

    c.querySelector<HTMLElement>(".wd-up")!.click(); // back to Boss
    expect(cards(c)).toHaveLength(6);
  });
});

describe("card detail", () => {
  it("shows job title, location and department on every card", () => {
    const c = render(deepForest);
    const card = cardFor(c, "3");
    expect(card.querySelector(".wd-title")!.textContent).toBe("t");
    expect(card.querySelector(".wd-loc")!.textContent).toContain("loc");
    expect(card.querySelector(".wd-org")!.textContent).toBe("org");
  });

  it("paints an identity's photo on a canvas over the initials, never as an <img>", () => {
    const photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";
    const c = render([{ ...person("1", null, "Ana"), photo }, person("2", "1", "Bo")]);
    // The plugin CSP (img-src 'self') blocks a data-URI <img>; a canvas painted
    // from the decoded bytes is not subject to it.
    expect(c.querySelector("img")).toBeNull();
    expect(c.querySelector<HTMLCanvasElement>(".wd-focus canvas.wd-photo")!.dataset.photo).toBe("1");
    expect(c.querySelector(".wd-focus .wd-avatar")!.textContent).toContain("A"); // fallback beneath
    expect(cardFor(c, "2").querySelector("canvas")).toBeNull(); // Bo has none: initials only
    expect(cardFor(c, "2").querySelector(".wd-avatar")!.textContent).toContain("B");
  });

  it("hands a Related Actions choice to the handler with the person", () => {
    const onAction = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    renderOrgNavigator(container, deepForest, undefined, undefined, onAction);

    container.querySelector<HTMLButtonElement>(".wd-focus .wd-actions")!.click();
    document.querySelector<HTMLButtonElement>('.wd-menu-item[data-action="delete"]')!.click();

    expect(onAction).toHaveBeenCalledWith("delete", expect.objectContaining({ id: "1", name: "Ana" }));
    expect(document.querySelector(".wd-menu-pop")).toBeNull(); // the menu closed
    container.remove();
  });

  // ISC hides one of the pair and shows the other on the identity's status, so
  // an identity that is already disabled is offered Enable in its place.
  it("offers Enable in Disable's place once the identity is disabled", () => {
    const openMenu = (extra: Partial<OrgIdentity>) => {
      const container = document.createElement("div");
      document.body.append(container);
      const people = [{ ...person("1", null, "Ana"), ...extra }, person("2", "1", "Bo")];
      renderOrgNavigator(container, people, undefined, undefined, vi.fn());
      container.querySelector<HTMLButtonElement>(".wd-focus .wd-actions")!.click();
      const items = [...document.querySelectorAll<HTMLElement>(".wd-menu-item")].map((b) => ({
        action: b.dataset.action,
        label: b.textContent,
      }));
      document.querySelector(".wd-menu-pop")?.remove();
      container.remove();
      return items;
    };

    const active = openMenu({ cloudStatus: "ACTIVE" });
    expect(active.find((i) => i.action === "disable")?.label).toBe("Disable Identity");
    expect(active.find((i) => i.action === "enable")).toBeUndefined();

    const disabled = openMenu({ cloudStatus: "DISABLED" });
    expect(disabled.find((i) => i.action === "enable")?.label).toBe("Enable Identity");
    expect(disabled.find((i) => i.action === "disable")).toBeUndefined();
    // It takes Disable's place rather than being appended.
    expect(disabled.map((i) => i.action)).toEqual(active.map((i) => (i === active.at(-1) ? "enable" : i.action)));

    // An identity in error, disabled underneath, counts as disabled too.
    expect(openMenu({ cloudStatus: "ERROR", internalCloudStatus: "DISABLED" }).some((i) => i.action === "enable")).toBe(true);
    // In error but not disabled underneath, it does not.
    expect(openMenu({ cloudStatus: "ERROR", internalCloudStatus: "ACTIVE" }).some((i) => i.action === "disable")).toBe(true);
  });

  it("leaves the ··· off every card when nothing can run the actions", () => {
    // main.ts passes no handler to a viewer without admin rights: every action
    // is an admin API that would only answer 403.
    expect(render(deepForest).querySelector(".wd-actions")).toBeNull();
  });

  it("caps every manager's card in blue, and only theirs", () => {
    const c = render(deepForest); // Ana → {Bo, Cy, Dee}; Cy manages Dot and Eve
    expect(cardFor(c, "3").classList.contains("wd-manager")).toBe(true);
    expect(cardFor(c, "2").classList.contains("wd-manager")).toBe(false);
    expect(cardFor(c, "6").classList.contains("wd-manager")).toBe(false);
  });

  it("draws the location pin as an inline svg, not an image the CSP would block", () => {
    const c = render(deepForest);
    expect(cardFor(c, "3").querySelector(".wd-loc svg.wd-pin")).not.toBeNull();
    expect(c.querySelector("img")).toBeNull();
  });
});

