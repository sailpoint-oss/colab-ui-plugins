import { describe, it, expect } from "vitest";
import { buildIndex, levelOf, withManagers, type OrgIdentity } from "../src/org-nav";

const person = (id: string, manager: string | null, name = `n${id}`): OrgIdentity => ({
  id,
  name,
  title: "t",
  location: "loc",
  orgUnit: "org",
  manager: manager ? { id: manager, name: manager } : null,
});

// 1 → 2 → 4, and 1 → 3
const people = [person("1", null), person("2", "1"), person("3", "1"), person("4", "2")];

describe("org-nav", () => {
  it("finds direct reports, sorted by name", () => {
    const index = buildIndex([
      person("1", null),
      person("2", "1", "Zoe"),
      person("3", "1", "Ana"),
    ]);
    expect(index.reportsOf("1").map((r) => r.name)).toEqual(["Ana", "Zoe"]);
  });

  it("resolves the manager, or null at the top", () => {
    const index = buildIndex(people);
    expect(index.managerOf("4")!.id).toBe("2");
    expect(index.managerOf("1")).toBeNull();
  });

  it("builds the ancestor chain root→parent (excluding self)", () => {
    const index = buildIndex(people);
    expect(index.ancestorsOf("4").map((a) => a.id)).toEqual(["1", "2"]);
  });

  it("picks the manager-less identity as root", () => {
    expect(buildIndex(people).rootId()).toBe("1");
  });

  it("treats a manager absent from the set as top (filtered query)", () => {
    const index = buildIndex([person("2", "99"), person("3", "2")]);
    expect(index.managerOf("2")).toBeNull();
    expect(index.rootId()).toBe("2");
    expect(index.reportsOf("2").map((r) => r.id)).toEqual(["3"]);
  });

  it("returns one root per disconnected tree, largest first", () => {
    // Two trees: 1 → {2, 4}, and 3 alone with one report.
    const index = buildIndex([
      person("1", null, "Ana"),
      person("2", "1"),
      person("4", "1"),
      person("3", null, "Zoe"),
      person("5", "3"),
    ]);
    expect(index.rootIds()).toEqual(["1", "3"]);
    expect(index.rootId()).toBe("1");
  });

  it("breaks a tie between equal-sized trees by name", () => {
    const index = buildIndex([person("1", null, "Zoe"), person("2", null, "Ana")]);
    expect(index.rootIds()).toEqual(["2", "1"]);
  });

  it("maps any identity back to the root of its own tree", () => {
    const index = buildIndex([...people, person("9", null), person("10", "9")]);
    expect(index.rootOf("4")).toBe("1");
    expect(index.rootOf("10")).toBe("9");
    expect(index.rootOf("9")).toBe("9");
  });

  it("counts a subtree including the person themselves", () => {
    const index = buildIndex(people);
    expect(index.subtreeSizeOf("1")).toBe(4);
    expect(index.subtreeSizeOf("2")).toBe(2);
    expect(index.subtreeSizeOf("3")).toBe(1);
  });

  it("does not loop on a manager cycle", () => {
    const index = buildIndex([person("a", "b"), person("b", "a")]);
    expect(index.ancestorsOf("a").length).toBeLessThanOrEqual(2);
    // Every identity in a pure cycle has a manager in the set, so no identity
    // qualifies as a root; fall back to one rather than rendering nothing.
    expect(index.rootIds()).toEqual(["a"]);
    expect(index.subtreeSizeOf("a")).toBe(2);
  });
});

describe("levelOf", () => {
  const people: OrgIdentity[] = [
    { id: "1", name: "Jerry", title: "", location: "", orgUnit: "", manager: null },
    { id: "2", name: "Jane", title: "", location: "", orgUnit: "", manager: { id: "1", name: "Jerry" } },
    { id: "3", name: "Howard", title: "", location: "", orgUnit: "", manager: { id: "2", name: "Jane" } },
    { id: "4", name: "Nora", title: "", location: "", orgUnit: "", manager: { id: "x", name: "Outside" } },
  ];

  it("opens on the user's manager, so they and their colleagues show below", () => {
    expect(levelOf(people, "3")).toBe("2"); // Howard → Jane on top
  });

  it("opens on the user themselves at the top of a tree", () => {
    expect(levelOf(people, "1")).toBe("1");
  });

  it("opens on the user when their manager isn't in the chart", () => {
    expect(levelOf(people, "4")).toBe("4");
  });

  it("has nothing to open on for someone not in the chart", () => {
    expect(levelOf(people, "support")).toBeUndefined();
    expect(levelOf(people, undefined)).toBeUndefined();
  });
});

describe("withManagers", () => {
  const ceo = person("1", null, "CEO");
  const vp = person("2", "1", "VP");
  const ic = person("3", "2", "IC");
  const orphan = person("4", null, "Orphan");

  it("drops identities with no manager", () => {
    const kept = withManagers([ceo, vp, ic, orphan]).map((p) => p.id);
    expect(kept).not.toContain("4");
  });

  it("keeps a managerless identity when someone reports to them", () => {
    const kept = withManagers([ceo, vp, ic, orphan]).map((p) => p.id).sort();
    expect(kept).toEqual(["1", "2", "3"]);
  });

  it("preserves the whole chain so ancestors still resolve", () => {
    const index = buildIndex(withManagers([ceo, vp, ic, orphan]));
    expect(index.ancestorsOf("3").map((p) => p.id)).toEqual(["1", "2"]);
    expect(index.rootId()).toBe("1");
  });

  it("returns each identity once when a manager has several reports", () => {
    const ic2 = person("5", "2", "IC2");
    expect(withManagers([vp, ic, ic2]).filter((p) => p.id === "2")).toHaveLength(1);
  });

  it("keeps an identity whose manager is missing from the set", () => {
    expect(withManagers([ic]).map((p) => p.id)).toEqual(["3"]);
  });

  it("returns nothing when no one has a manager", () => {
    expect(withManagers([ceo, orphan])).toEqual([]);
  });
});
