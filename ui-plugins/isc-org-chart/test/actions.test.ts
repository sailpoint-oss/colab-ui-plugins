import { describe, it, expect, vi, afterEach } from "vitest";
import { createActionRunner, CODE_MINUTES } from "../src/actions";
import type { OrgIdentity } from "../src/org-nav";

const mira: OrgIdentity = {
  id: "id-mira",
  name: "Mira Santos",
  title: "t",
  location: "loc",
  orgUnit: "org",
  manager: null,
  uid: "Mira.Santos",
  profileId: "prof-1",
  lifecycleState: "active",
};

interface Call {
  method: string;
  path: string;
  body?: unknown;
  contentType?: string;
}

// A tenant stub: records each call and answers with `reply`, or 202 empty.
function tenant(reply: (c: Call) => Response | undefined = () => undefined) {
  const calls: Call[] = [];
  const sent: Array<Record<string, string>> = [];
  const tokens: boolean[] = [];
  const onChanged = vi.fn();
  const fetchApi = (async (url: string, init: RequestInit = {}) => {
    const headers = init.headers as Record<string, string>;
    const call: Call = {
      method: init.method ?? "GET",
      path: new URL(url).pathname,
      ...(init.body ? { body: JSON.parse(String(init.body)), contentType: headers["Content-Type"] } : {}),
    };
    calls.push(call);
    sent.push(headers); // kept beside `calls`, whose shape the tests compare whole
    return reply(call) ?? new Response(null, { status: 202 });
  }) as typeof fetch;
  const run = createActionRunner({
    apiBase: "https://acme.api.example.com/",
    token: async (refresh) => (tokens.push(!!refresh), refresh ? "fresh" : "stale"),
    fetchApi,
    onChanged,
  });
  return { run, calls, sent, tokens, onChanged };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// A drawer that is sliding out still sits in the DOM; it is not the dialog.
const dialog = () =>
  vi.waitFor(() => {
    const form = document.querySelector<HTMLFormElement>(".wd-dialog-backdrop:not(.wd-closing) .wd-dialog");
    if (!form) throw new Error("no dialog yet");
    return form;
  });
const confirmDialog = async () => (await dialog()).querySelector<HTMLButtonElement>("[data-confirm]")!.click();
const cancelDialog = async () => (await dialog()).querySelector<HTMLButtonElement>("[data-cancel]")!.click();
const banner = () => document.querySelector(".wd-note-text")?.textContent ?? "";
const failed = () => document.querySelector(".wd-note-error");

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Related Actions", () => {
  // ISC refreshes an identity straight from its menu and reports it in these
  // words; nothing is asked, because nothing is changed by the refresh itself.
  it("queues an attribute sync without asking", async () => {
    const t = tenant();
    await t.run("sync", mira);

    expect(document.querySelector(".wd-dialog")).toBeNull();
    expect(banner()).toBe("Success! Attribute sync has been queued.");
    expect(t.calls).toEqual([
      { method: "POST", path: "/identities/v1/id-mira/synchronize-attributes" },
    ]);
  });

  it("processes the identity without asking", async () => {
    const t = tenant();
    await t.run("process", mira);

    expect(document.querySelector(".wd-dialog")).toBeNull();
    expect(banner()).toBe("Success! Your identity is now processing.");
    expect(t.calls).toEqual([
      { method: "POST", path: "/identities/v1/process", body: { identityIds: ["id-mira"] }, contentType: "application/json" },
    ]);
  });

  // The plugin is embedded in a sandbox without `allow-forms`: a submit button
  // is blocked by the browser before any handler runs, which left every confirm
  // dead in the real embed. Nothing in a dialog may submit.
  it("confirms by click, with nothing in the dialog able to submit", async () => {
    const t = tenant();
    const done = t.run("disable", mira);
    const form = await dialog();

    expect(form.querySelectorAll("[type=submit]")).toHaveLength(0);
    expect(form.querySelector<HTMLButtonElement>("[data-confirm]")!.type).toBe("button");
    // A submission that somehow happened anyway is stopped rather than left to
    // the sandbox, and must not be mistaken for confirming.
    const submitted = form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    expect(submitted).toBe(false);
    expect(t.calls).toHaveLength(0);

    form.querySelector<HTMLButtonElement>("[data-confirm]")!.click();
    await done;
    expect(t.calls).toHaveLength(1);
  });

  it("backs out from the header's dismiss, like Cancel", async () => {
    const t = tenant();
    const done = t.run("delete", mira);
    (await dialog()).querySelector<HTMLButtonElement>("[data-close]")!.click();
    await done;

    expect(t.calls).toHaveLength(0);
    expect(document.querySelector(".wd-dialog")).toBeNull();
  });

  // Reset, Delete and Disable carry ISC's warning header and Reset Password its
  // info one; Set User Levels is the plain dialog left.
  it("marks an everyday action's header plainly, with no band and no mark", async () => {
    const t = tenant((c) => (c.method === "GET" ? json({ capabilities: [] }) : undefined));
    const done = t.run("levels", mira);
    const form = await dialog();

    expect(form.classList.contains("wd-dialog-danger")).toBe(false);
    expect(form.classList.contains("wd-dialog-info")).toBe(false);
    expect(form.querySelector(".wd-dialog-head .wd-note-mark")).toBeNull();
    expect(form.querySelector(".wd-dialog-close")).not.toBeNull();

    await cancelDialog();
    await done;
  });

  // ISC's Reset Password is its `info` type — a cyan band and an `i`, not the
  // warning header its destructive actions carry.
  it("asks about a password reset on the platform's info dialog", async () => {
    const t = tenant();
    const done = t.run("password", mira);
    const form = await dialog();

    expect(form.classList.contains("wd-dialog-info")).toBe(true);
    expect(form.classList.contains("wd-dialog-danger")).toBe(false);
    expect(form.querySelector(".wd-dialog-head .wd-note-mark")).not.toBeNull();
    expect(form.querySelector("h2")!.textContent).toBe("Reset password for Mira Santos");
    expect(form.textContent).toContain("Source Name");

    await cancelDialog();
    await done;
  });

  it("does nothing when the viewer cancels", async () => {
    const t = tenant();
    const done = t.run("reset", mira);
    await cancelDialog();
    await done;
    expect(t.calls).toEqual([]);
    expect(document.querySelector(".wd-dialog")).toBeNull();
  });

  it("maps the simple actions onto their tenant calls", async () => {
    const cases: Array<[Parameters<ReturnType<typeof tenant>["run"]>[0], string, string, unknown?]> = [
      ["reset", "POST", "/identities/v1/id-mira/reset"],
      ["disable", "POST", "/identities-accounts/v1/id-mira/disable"],
    ];
    for (const [action, method, path, body] of cases) {
      const t = tenant();
      const done = t.run(action, mira);
      await confirmDialog();
      await done;
      expect(t.calls.map(({ method: m, path: p, body: b }) => ({ m, p, b }))).toEqual([{ m: method, p: path, b: body }]);
    }
  });

  // Which band a dialog carries is ISC's own choice per action, not a rule:
  // `identities.modal.ts` marks Delete `info` and Disable `error`. The confirm
  // button stays primary blue either way, and Cancel keeps focus on both.
  // ISC's reset modal is `icon: 'error'` — the same warning header its Delete
  // and Disable modals carry, though resetting is not itself destructive.
  it("warns on Reset the way the platform does", async () => {
    const t = tenant();
    const done = t.run("reset", mira);
    const form = await dialog();

    expect(form.classList.contains("wd-dialog-danger")).toBe(true);
    expect(form.querySelector(".wd-dialog-head .wd-note-mark")).not.toBeNull();
    expect(form.querySelector(".wd-btn-primary")!.textContent).toBe("Reset Identity");
    expect(form.textContent).toContain("must be reinvited to use IdentityNow");

    await confirmDialog();
    await done;
    expect(banner()).toBe("Success! The identity has been reset.");
  });

  it("enables a disabled identity, and stops offering Enable afterwards", async () => {
    const t = tenant();
    const disabled = { ...mira, cloudStatus: "DISABLED" };
    await t.run("enable", disabled);

    expect(document.querySelector(".wd-dialog")).toBeNull(); // nothing to confirm
    expect(t.calls).toEqual([{ method: "POST", path: "/identities-accounts/v1/id-mira/enable" }]);
    expect(banner()).toBe("Success! The identity has been enabled.");
    // The card the tree holds carries the new status, so the menu flips back
    // without waiting for a reload.
    expect(disabled.cloudStatus).toBe("ACTIVE");
  });

  it("records the identity as disabled once Disable succeeds", async () => {
    const t = tenant();
    const person = { ...mira };
    const done = t.run("disable", person);
    // Disable is the `error` one, unlike Delete beside it.
    expect((await dialog()).classList.contains("wd-dialog-danger")).toBe(true);
    await confirmDialog();
    await done;

    expect(banner()).toBe("Success! The identity has been disabled.");
    expect(person.cloudStatus).toBe("DISABLED");
  });

  it("confirms Delete on the info header, still with Cancel focused", async () => {
    const t = tenant();
    const done = t.run("delete", mira);
    const form = await dialog();
    expect(form.classList.contains("wd-dialog-info")).toBe(true);
    expect(form.classList.contains("wd-dialog-danger")).toBe(false);
    expect(form.querySelector(".wd-dialog-head .wd-note-mark")).not.toBeNull();
    expect(form.querySelector(".wd-btn-primary")!.textContent).toBe("Delete Identity");
    // Focus lands on Cancel, not the header's ×, so Enter cannot confirm.
    expect(document.activeElement).toBe(form.querySelector("[data-cancel]"));
    await confirmDialog();
    await done;
    expect(t.calls).toEqual([{ method: "DELETE", path: "/identities/v1/id-mira" }]);
    expect(t.onChanged).toHaveBeenCalledOnce(); // the tree reloads without them
  });

  it("offers the profile's lifecycle states, the current one selected", async () => {
    const t = tenant((c) =>
      c.method === "GET"
        ? json([
            { id: "s-active", name: "Active", technicalName: "active", enabled: true },
            { id: "s-term", name: "Terminated", technicalName: "terminated", enabled: true },
          ])
        : undefined,
    );
    // A copy: confirming records the new state on the identity it was handed,
    // and `mira` is shared with every other test in this file.
    const done = t.run("lifecycle", { ...mira });
    const form = await dialog();
    const radios = [...form.querySelectorAll<HTMLInputElement>("input[name=state]")];
    expect(radios.find((r) => r.checked)!.value).toBe("s-active");
    radios[1].checked = true;
    radios[1].dispatchEvent(new Event("change", { bubbles: true })); // as a click would
    await confirmDialog();
    await done;
    expect(t.calls).toEqual([
      { method: "GET", path: "/identity-profiles/v1/prof-1/lifecycle-states" },
      {
        method: "POST",
        path: "/identities/v1/id-mira/set-lifecycle-state",
        body: { lifecycleStateId: "s-term" },
        contentType: "application/json",
      },
    ]);
    expect(banner()).toContain("is now Terminated");
  });

  // ISC opens this one as a right-hand drawer, with the person named in the
  // title and Save held back until a different state is picked.
  it("opens lifecycle state as a drawer, naming the person, with Save waiting", async () => {
    const t = tenant((c) =>
      c.method === "GET"
        ? json([
            { id: "s-active", name: "Active", priority: 20, enabled: true },
            { id: "s-term", name: "Terminated", priority: 40, enabled: true },
          ])
        : undefined,
    );
    const done = t.run("lifecycle", mira);
    const form = await dialog();
    const save = form.querySelector<HTMLButtonElement>("[data-confirm]")!;

    expect(form.closest(".wd-drawer")).not.toBeNull();
    expect(form.querySelector("h2")!.textContent).toBe("Set Lifecycle State for Mira Santos");
    expect(save.textContent).toBe("Save");
    // Ana is already Active, so there is nothing to save until that changes.
    expect(save.disabled).toBe(true);

    const terminated = form.querySelector<HTMLInputElement>('input[value="s-term"]')!;
    terminated.checked = true;
    terminated.dispatchEvent(new Event("change", { bubbles: true }));
    expect(save.disabled).toBe(false);

    // Back to where it opened, and there is nothing to save again.
    form.querySelector<HTMLInputElement>('input[value="s-active"]')!.checked = true;
    terminated.dispatchEvent(new Event("change", { bubbles: true }));
    expect(save.disabled).toBe(true);

    await cancelDialog();
    await done;
  });

  // The tree holds one copy of each identity, loaded once; without this, setting
  // a state then reopening the dialog preselected the state it started with.
  it("remembers the new state, so reopening preselects it", async () => {
    const states = [
      { id: "s-active", name: "Active", technicalName: "active", priority: 20, enabled: true },
      { id: "s-term", name: "Terminated", technicalName: "terminated", priority: 40, enabled: true },
    ];
    const person = { ...mira, lifecycleState: "active" };
    const t = tenant((c) => (c.method === "GET" ? json(states) : undefined));

    const first = t.run("lifecycle", person);
    const form = await dialog();
    expect(form.querySelector<HTMLInputElement>("input:checked")!.value).toBe("s-active");
    const terminated = form.querySelector<HTMLInputElement>('input[value="s-term"]')!;
    terminated.checked = true;
    terminated.dispatchEvent(new Event("change", { bubbles: true })); // wakes Save
    await confirmDialog();
    await first;

    expect(person.lifecycleState).toBe("terminated");

    const second = t.run("lifecycle", person);
    const again = await dialog();
    expect(again.querySelector<HTMLInputElement>("input:checked")!.value).toBe("s-term");
    await cancelDialog();
    await second;
  });

  // Setting a state the profile has switched off fails on the tenant with "The
  // system is currently not in a state in which it can fulfill the request", so
  // ISC's own overlay filters them out before building the list.
  it("offers only the states the profile has enabled", async () => {
    const t = tenant((c) =>
      c.method === "GET"
        ? json([
            { id: "s-pre", name: "Pre Hire", priority: 10, enabled: false },
            { id: "s-active", name: "Active", priority: 20, enabled: true },
            { id: "s-arch", name: "Archived", priority: 50 }, // absent reads as off
          ])
        : undefined,
    );
    const done = t.run("lifecycle", mira);
    const form = await dialog();

    expect([...form.querySelectorAll<HTMLInputElement>("input[name=state]")].map((r) => r.value)).toEqual([
      "s-active",
    ]);

    await cancelDialog();
    await done;
  });

  it("says so plainly when the profile has none enabled, rather than offering dead choices", async () => {
    const t = tenant((c) =>
      c.method === "GET" ? json([{ id: "s-pre", name: "Pre Hire", enabled: false }]) : undefined,
    );
    await t.run("lifecycle", mira);

    expect(document.querySelector(".wd-dialog")).toBeNull();
    expect(banner()).toContain("no lifecycle states enabled");
    expect(failed()).not.toBeNull();
  });

  it("lists the states in ISC's order, not the order the API hands them back", async () => {
    // The shape a real profile returns: priorities in tens, shuffled.
    const t = tenant((c) =>
      c.method === "GET"
        ? json([
            { id: "s-pre", name: "Pre Hire", priority: 10, enabled: true },
            { id: "s-arch", name: "Archived", priority: 50, enabled: true },
            { id: "s-loa", name: "Leave of Absence", priority: 30, enabled: true },
            { id: "s-term", name: "Terminated", priority: 40, enabled: true },
            { id: "s-active", name: "Active", priority: 20, enabled: true },
          ])
        : undefined,
    );
    const done = t.run("lifecycle", mira);
    const form = await dialog();

    expect([...form.querySelectorAll<HTMLInputElement>("input[name=state]")].map((r) => r.value)).toEqual(
      ["s-pre", "s-active", "s-loa", "s-term", "s-arch"],
    );

    await cancelDialog();
    await done;
  });

  it("falls back to the name when a profile leaves priorities unset", async () => {
    const t = tenant((c) =>
      c.method === "GET"
        ? json([
            { id: "s-term", name: "Terminated", enabled: true },
            { id: "s-active", name: "Active", enabled: true },
          ])
        : undefined,
    );
    const done = t.run("lifecycle", mira);
    const form = await dialog();

    expect([...form.querySelectorAll<HTMLInputElement>("input[name=state]")].map((r) => r.value)).toEqual(
      ["s-active", "s-term"],
    );

    await cancelDialog();
    await done;
  });

  // A level belonging to a product the tenant has not bought is not offered, as
  // ISC's own `buildProductFilter` does — which is the whole of the difference
  // between the raw list and what ISC shows.
  it("hides levels for products the tenant has no licence for", async () => {
    const asked: string[] = [];
    const held = new Set(["idn:certification", "idn:cloud-access-management"]);
    const run = createActionRunner({
      apiBase: "https://acme.api.example.com/",
      token: async () => "token",
      fetchApi: (async (url: string) => {
        asked.push(decodeURIComponent(String(url)));
        const levels = !String(url).includes("auth-users");
        return new Response(JSON.stringify(levels ? [] : { capabilities: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as unknown as typeof fetch,
      onChanged: () => undefined,
      hasLicense: (id) => held.has(id),
    });
    const done = run("levels", mira);
    await dialog();
    const listed = asked.find((u) => u.includes("authorization-capabilities"))!;

    // Licensed, so their levels stay on offer.
    expect(listed).not.toContain('not id eq "idn:cert-admin"');
    expect(listed).not.toContain('not id eq "cam:cloud-gov-admin"');
    // Not licensed, so these are filtered out at the source.
    expect(listed).toContain('not id co "das:"');
    expect(listed).toContain('not id co "sp:aic"');
    expect(listed).toContain('not id co "idg:"');
    expect(listed).toContain('not id eq "idn:saas-management-admin"');
    expect(listed).toContain('not id eq "idn:dashboard"'); // always
    expect(listed).toContain("adminAssignable eq true");

    await cancelDialog();
    await done;
  });

  // Only capabilities an admin can actually grant, under the names ISC shows —
  // the unfiltered list is half again as long and carries the older names.
  it("asks for admin-assignable levels and shows their translated names", async () => {
    const t = tenant((c) => {
      if (c.path.startsWith("/auth-users")) return json({ capabilities: [] });
      return json([
        {
          legacyId: "ORG_ADMIN",
          name: "Access request administration",
          description: "old",
          translatedName: "Access Request Administrator",
          translatedDescription: "Manage access requests individually or in bulk.",
        },
      ]);
    });
    const done = t.run("levels", mira);
    const form = await dialog();

    const listed = t.calls.find((c) => c.path.includes("authorization-capabilities"))!;
    expect(listed.path).toContain("authorization-capabilities");
    expect(form.querySelector(".wd-level-name")!.textContent).toBe("Access Request Administrator");
    expect(form.querySelector(".wd-level-desc")!.textContent).toBe(
      "Manage access requests individually or in bulk.",
    );

    await cancelDialog();
    await done;
  });

  // Backing out of a drawer with work in it asks first, as ISC's overlays do.
  it("asks before discarding an unsaved selection, and stays open on Cancel", async () => {
    const t = tenant((c) =>
      c.path.startsWith("/auth-users")
        ? json({ capabilities: [] })
        : json([{ legacyId: "ORG_ADMIN", name: "Admin", description: "" }]),
    );
    const done = t.run("levels", mira);
    const drawer = await dialog();
    const box = drawer.querySelector<HTMLInputElement>('input[value="ORG_ADMIN"]')!;
    box.checked = true;
    box.dispatchEvent(new Event("change", { bubbles: true }));

    // Backing out now opens the confirmation over the drawer.
    drawer.querySelector<HTMLButtonElement>("[data-cancel]")!.click();
    const ask = await vi.waitFor(() => {
      const found = [...document.querySelectorAll<HTMLFormElement>(".wd-dialog")].at(-1)!;
      if (!found.textContent?.includes("discard your work")) throw new Error("not yet");
      return found;
    });
    expect(ask.querySelector("h2")!.textContent).toBe("Unsaved changes");
    expect(ask.querySelector("[data-confirm]")!.textContent).toBe("Yes");
    expect(ask.classList.contains("wd-dialog-info")).toBe(true);
    expect(ask.classList.contains("wd-dialog-sm")).toBe(true);

    // Cancel keeps the drawer, with the selection intact.
    ask.querySelector<HTMLButtonElement>("[data-cancel]")!.click();
    await vi.waitFor(() => {
      if (document.body.textContent?.includes("discard your work")) throw new Error("still there");
    });
    expect(drawer.isConnected).toBe(true);
    expect(drawer.querySelector<HTMLInputElement>('input[value="ORG_ADMIN"]')!.checked).toBe(true);

    // Yes lets it go, and the action returns without saving.
    drawer.querySelector<HTMLButtonElement>("[data-cancel]")!.click();
    const again = await vi.waitFor(() => {
      const found = [...document.querySelectorAll<HTMLFormElement>(".wd-dialog")].at(-1)!;
      if (!found.textContent?.includes("discard your work")) throw new Error("not yet");
      return found;
    });
    again.querySelector<HTMLButtonElement>("[data-confirm]")!.click();
    await done;

    expect(t.calls.some((c) => c.method === "PATCH")).toBe(false);
  });

  it("closes a drawer with nothing changed without asking", async () => {
    const t = tenant((c) =>
      c.path.startsWith("/auth-users")
        ? json({ capabilities: [] })
        : json([{ legacyId: "ORG_ADMIN", name: "Admin", description: "" }]),
    );
    const done = t.run("levels", mira);
    const drawer = await dialog();
    drawer.querySelector<HTMLButtonElement>("[data-cancel]")!.click();
    await done;

    expect(document.body.textContent).not.toContain("discard your work");
  });

  it("closes the sort popover on a click away, and on Escape", async () => {
    const t = tenant((c) =>
      c.path.startsWith("/auth-users") ? json({ capabilities: [] }) : json([{ legacyId: "A", name: "A" }]),
    );
    const done = t.run("levels", mira);
    const form = await dialog();
    const menu = form.querySelector<HTMLElement>(".wd-sort-menu")!;
    const trigger = form.querySelector<HTMLButtonElement>("[data-sort-open]")!;

    trigger.click();
    expect(menu.hidden).toBe(false);
    // A click inside it leaves it open.
    menu.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(menu.hidden).toBe(false);
    // One outside does not.
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(menu.hidden).toBe(true);

    trigger.click();
    expect(menu.hidden).toBe(false);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(menu.hidden).toBe(true);
    // Escape closed the popover, not the drawer.
    expect(document.querySelector(".wd-dialog-backdrop:not(.wd-closing) .wd-dialog")).not.toBeNull();

    await cancelDialog();
    await done;
  });

  // The service orders by codepoint, so an uppercase letter comes before a
  // lowercase one. `localeCompare` folds case and would put "AR Policy Admin"
  // after "Admin" instead of straight after "AAA Policy Admin".
  it("orders the levels as the service does, not by locale", async () => {
    const names = [
      "Admin",
      "Access Revoker",
      "AR Policy Admin",
      "AAA Policy Admin",
      "Access Request Administrator",
    ];
    const t = tenant((c) =>
      c.path.startsWith("/auth-users")
        ? json({ capabilities: [] })
        : json(names.map((n) => ({ legacyId: n, name: n, description: "" }))),
    );
    const done = t.run("levels", mira);
    const form = await dialog();

    expect([...form.querySelectorAll(".wd-level-name")].map((e) => e.textContent)).toEqual([
      "AAA Policy Admin",
      "AR Policy Admin",
      "Access Request Administrator",
      "Access Revoker",
      "Admin",
    ]);

    await cancelDialog();
    await done;
  });

  it("sorts the levels the other way when the sort popover is applied", async () => {
    const t = tenant((c) => {
      if (c.path.startsWith("/auth-users")) return json({ capabilities: [] });
      return json(
        ["Alpha", "Beta", "Gamma"].map((n) => ({ legacyId: n, name: n, description: "" })),
      );
    });
    const done = t.run("levels", mira);
    const form = await dialog();
    const names = () => [...form.querySelectorAll(".wd-level-name")].map((e) => e.textContent);
    expect(names()).toEqual(["Alpha", "Beta", "Gamma"]);

    form.querySelector<HTMLButtonElement>("[data-sort-open]")!.click();
    form.querySelector<HTMLButtonElement>('[data-order="desc"]')!.click();
    // The order applies on Sort, not as the toggle is clicked.
    expect(names()).toEqual(["Alpha", "Beta", "Gamma"]);
    form.querySelector<HTMLButtonElement>("[data-sort-apply]")!.click();
    expect(names()).toEqual(["Gamma", "Beta", "Alpha"]);

    await cancelDialog();
    await done;
  });

  // The counts must not climb as pages land behind the drawer: the total comes
  // from the tenant's own `x-total-count`, which is known before the levels are.
  it("shows the real total while the rest of the levels are still arriving", async () => {
    // Counted by call rather than by offset: the stub records the path without
    // its query, so the pages are served in the order they are asked for.
    const level = (n: number) => ({ legacyId: `L${n}`, name: `Level ${n}`, description: "d" });
    let served = 0;
    const t = tenant((c) => {
      if (c.path.startsWith("/auth-users")) return json({ capabilities: [] });
      served += 1;
      const page = served <= 3 ? Array.from({ length: 10 }, (_, i) => level(served * 10 + i)) : [];
      return new Response(JSON.stringify(page), {
        status: 200,
        headers: { "content-type": "application/json", "x-total-count": "33" },
      });
    });
    const done = t.run("levels", mira);
    const form = await dialog();

    // Two pages are in hand, but the bar and pager already speak for all 33.
    expect(form.querySelectorAll(".wd-level")).toHaveLength(10);
    expect(form.querySelector(".wd-levels-count")!.textContent).toBe("33 Results");
    expect(form.querySelector(".wd-levels-of")!.textContent).toBe("of 4");

    await cancelDialog();
    await done;
  });

  // The drawer holds its selection itself, so a level on another page still
  // counts; the checkboxes are only what is on screen.
  it("saves user levels with a JSON patch, keeping levels the drawer doesn't offer", async () => {
    const t = tenant((c) =>
      c.path.startsWith("/auth-users") && c.method === "GET"
        ? json({ capabilities: ["HELPDESK", "das:ui-auditor"] })
        : undefined,
    );
    const done = t.run("levels", mira);
    const form = await dialog();
    const tick = (cap: string, on: boolean) => {
      const box = form.querySelector<HTMLInputElement>(`input[value="${cap}"]`)!;
      box.checked = on;
      box.dispatchEvent(new Event("change", { bubbles: true }));
    };
    expect(form.querySelector<HTMLInputElement>('input[value="HELPDESK"]')!.checked).toBe(true);
    tick("HELPDESK", false);
    tick("ORG_ADMIN", true);
    await confirmDialog();
    await done;
    // Found by role: the drawer also fetches the level list, so the write is no
    // longer simply the second call.
    expect(t.calls.find((c) => c.method === "PATCH")).toEqual({
      method: "PATCH",
      path: "/auth-users/v1/id-mira",
      body: [{ op: "replace", path: "/capabilities", value: ["ORG_ADMIN", "das:ui-auditor"] }],
      contentType: "application/json-patch+json",
    });
  });

  // The level list names the id `/auth-users` accepts `legacyGroup`, and sends
  // `""` where there is none — only `capabilityDetails` on the identity calls it
  // `legacyId`. Saving the service id instead is refused with `Illegal attempt
  // to modify "capabilities:[idn:admin]"`, and it also left a level the identity
  // already held opening unticked.
  it("saves a level under its legacyGroup, not its service id", async () => {
    const t = tenant((c) =>
      c.path.startsWith("/auth-users")
        ? c.method === "GET"
          ? json({ capabilities: ["ORG_ADMIN"] })
          : undefined
        : json([
            { id: "idn:admin", legacyGroup: "ORG_ADMIN", name: "IdentityNow Administrator", translatedName: "Admin" },
            { id: "sp:aic-admin", legacyGroup: "", name: "Access Insights Admin" },
          ]),
    );
    const done = t.run("levels", mira);
    const form = await dialog();

    expect([...form.querySelectorAll<HTMLInputElement>(".wd-level input")].map((b) => b.value)).toEqual([
      "sp:aic-admin",
      "ORG_ADMIN",
    ]);
    // Held, so it opens ticked — which only lines up once the ids agree.
    expect(form.querySelector<HTMLInputElement>('input[value="ORG_ADMIN"]')!.checked).toBe(true);

    const box = form.querySelector<HTMLInputElement>('input[value="sp:aic-admin"]')!;
    box.checked = true;
    box.dispatchEvent(new Event("change", { bubbles: true }));
    await confirmDialog();
    await done;

    expect(t.calls.find((c) => c.method === "PATCH")!.body).toEqual([
      { op: "replace", path: "/capabilities", value: ["ORG_ADMIN", "sp:aic-admin"] },
    ]);
  });

  // ISC emails a reset link; the plugin asks the same way and sends the same
  // `via`, on the route its own UI uses.
  it("emails the reset link, as the platform does", async () => {
    const t = tenant();
    const done = t.run("password", { ...mira, email: "mira@acme.com" });
    const form = await dialog();

    expect(form.textContent).toContain("Send to work email: mira@acme.com");
    expect(form.querySelector<HTMLElement>("[data-confirm]")!.textContent).toBe("Send");
    await confirmDialog();
    await done;

    expect(t.calls).toEqual([
      {
        method: "POST",
        path: "/pigs/password-v3/identities/id-mira/verification/account/send",
        body: { via: "LINK_WORK" },
        contentType: "application/json",
      },
    ]);
    expect(banner()).toBe("Success! Mira Santos will receive an email to reset their password.");
  });

  it("offers the personal address too, where the identity has one", async () => {
    const t = tenant();
    const person = { ...mira, email: "mira@acme.com", personalEmail: "mira@home.com" };
    const done = t.run("password", person);
    const form = await dialog();

    expect([...form.querySelectorAll<HTMLInputElement>("input[name=via]")].map((r) => r.value)).toEqual([
      "LINK_WORK",
      "LINK_PERSONAL",
    ]);
    expect(form.textContent).toContain("Send to personal email: mira@home.com");
    form.querySelector<HTMLInputElement>('input[value="LINK_PERSONAL"]')!.checked = true;
    await confirmDialog();
    await done;

    expect(t.calls[0].body).toEqual({ via: "LINK_PERSONAL" });
  });

  // The email route refuses an external token, and whether the App Shell's
  // counts as one is only knowable in the real embed — so a refusal has to keep
  // the action working rather than dead-end.
  it("falls back to a one-time code when the tenant will not send the email", async () => {
    const t = tenant((c) =>
      c.path.endsWith("/digit")
        ? json({ digitToken: "48213957" })
        : json({ messages: [{ text: "private route" }] }, 401),
    );
    const done = t.run("password", { ...mira, email: "mira@acme.com" });
    await confirmDialog();

    await vi.waitFor(() => {
      if (!document.querySelector(".wd-code")) throw new Error("no code yet");
    });
    expect(document.querySelector(".wd-code")!.textContent).toBe("48213957");
    expect(document.querySelector(".wd-dialog")!.textContent).toContain("could not be sent");
    await confirmDialog(); // Done
    await done;

    expect(t.calls.at(-1)!.body).toEqual({ userId: "Mira.Santos", length: 8, durationMinutes: CODE_MINUTES });
    expect(banner()).toBe(""); // the code is the outcome, not a success banner
  });

  it("reports the API's own message when an action is refused", async () => {
    const t = tenant(() => json({ messages: [{ text: "Identity still owns accounts" }] }, 400));
    const done = t.run("delete", mira);
    await confirmDialog();
    await done;
    expect(banner()).toBe("Delete Identity failed for Mira Santos — Identity still owns accounts");
    expect(failed()).not.toBeNull();
    expect(t.onChanged).not.toHaveBeenCalled();
  });

  // Without this the tenant answers 400 "Experimental Header
  // 'X-SailPoint-Experimental' is missing or invalid" and the action never
  // runs — Invite, Process, Synchronize and the password code all sit behind
  // that flag.
  it("marks every call as experimental, whatever the action", async () => {
    // One that reads before it writes, so both the GET and the PATCH are seen.
    const t = tenant((c) =>
      c.path.startsWith("/auth-users") && c.method === "GET" ? json({ capabilities: [] }) : undefined,
    );
    const done = t.run("levels", mira);
    const form = await dialog();
    const box = form.querySelector<HTMLInputElement>('input[value="ORG_ADMIN"]')!;
    box.checked = true;
    box.dispatchEvent(new Event("change", { bubbles: true })); // wakes Save
    await confirmDialog();
    await done;

    expect(t.calls.filter((c) => c.path.startsWith("/auth-users")).map((c) => c.method)).toEqual([
      "GET",
      "PATCH",
    ]);
    for (const headers of t.sent) {
      expect(headers["X-SailPoint-Experimental"]).toBe("true");
      expect(headers.Authorization).toBe("Bearer stale");
    }
  });

  it("keeps the experimental header on the retry after a 401", async () => {
    let first = true;
    const t = tenant(() => (first ? ((first = false), new Response(null, { status: 401 })) : undefined));
    const done = t.run("invite", mira);
    await done;

    expect(t.sent.map((h) => h["X-SailPoint-Experimental"])).toEqual(["true", "true"]);
    expect(t.sent.map((h) => h.Authorization)).toEqual(["Bearer stale", "Bearer fresh"]);
  });

  // ISC invites straight from its own menu, with no question in the way.
  describe("inviting", () => {
    const notice = () => document.querySelector<HTMLElement>(".wd-note");

    it("invites without asking, then reports it the way the platform does", async () => {
      const t = tenant();
      const done = t.run("invite", mira);

      // Nothing to confirm: the call is already on its way, and while it is the
      // banner carries the platform's loader.
      expect(document.querySelector(".wd-dialog")).toBeNull();
      expect(banner()).toBe("Sending invitations.");
      expect(notice()!.querySelector(".wd-loader")).not.toBeNull();

      await done;

      expect(t.calls.map(({ method, path, body }) => ({ method, path, body }))).toEqual([
        { method: "POST", path: "/identities/v1/invite", body: { ids: ["id-mira"], uninvited: false } },
      ]);
      // One banner, not two: the progress one gives way to the outcome.
      expect(document.querySelectorAll(".wd-note")).toHaveLength(1);
      expect(banner()).toBe("Complete! 1 invitation was sent successfully.");
      expect(notice()!.classList.contains("wd-note-success")).toBe(true);
    });

    it("can be dismissed", async () => {
      const t = tenant();
      await t.run("invite", mira);

      notice()!.querySelector<HTMLButtonElement>(".wd-note-close")!.click();
      expect(notice()).toBeNull();
    });

    it("says what went wrong when the tenant refuses", async () => {
      const t = tenant(() => json({ messages: [{ text: "not licensed" }] }, 400));
      await t.run("invite", mira);

      expect(document.querySelectorAll(".wd-note")).toHaveLength(1);
      expect(banner()).toContain("not licensed");
      expect(failed()).not.toBeNull();
    });
  });

  it("retries once with a fresh token after a 401", async () => {
    let first = true;
    const t = tenant(() => (first ? ((first = false), new Response(null, { status: 401 })) : undefined));
    await t.run("process", mira);
    expect(t.tokens).toEqual([false, true]);
    expect(t.calls).toHaveLength(2);
    expect(banner()).toContain("now processing");
  });
});
