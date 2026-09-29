// Navigation model for a focused org navigator: one person is "focused",
// and we look up their manager, ancestor chain, and direct reports. Pure logic,
// no DOM — unit-tested on its own. Mirrors the ISC identity search doc shape.

export interface OrgIdentity {
  id: string;
  name: string;
  title: string;
  location: string;
  orgUnit: string;
  manager: { id: string; name: string } | null;
  /** Optional avatar URL (e.g. AD thumbnailPhoto as a data URI); falls back to initials. */
  photo?: string;
  /** Login name (the identity's uid), which the password APIs key on. */
  uid?: string;
  /** Identity profile, whose lifecycle states apply to this person. */
  profileId?: string;
  /** Current lifecycle state, e.g. "active". */
  lifecycleState?: string;
  /** Registration status: `DISABLED` here is what turns Disable into Enable. */
  cloudStatus?: string;
  /** Read with `cloudStatus` when that reports `ERROR` (see actionsFor). */
  internalCloudStatus?: string;
  /** Work email, where a password reset link is sent. */
  email?: string;
  /** Personal email; when present, the reset dialog offers a choice of the two. */
  personalEmail?: string;
}

export interface OrgIndex {
  byId: Map<string, OrgIdentity>;
  reportsOf(id: string): OrgIdentity[];
  managerOf(id: string): OrgIdentity | null;
  /** Root → … → parent (excludes the person themselves). */
  ancestorsOf(id: string): OrgIdentity[];
  /**
   * Every identity whose manager is absent from the set — one per disconnected
   * tree. A tenant that populates `manager` sparsely yields a forest, not a
   * single hierarchy, so this is usually longer than one. Ordered largest tree
   * first so the default focus lands on the most populated org.
   */
  rootIds(): string[];
  /** First of `rootIds()`. */
  rootId(): string;
  /** The root of the tree `id` belongs to — `id` itself when it is a root. */
  rootOf(id: string): string;
  /** How many people sit at or below `id`, including `id`. */
  subtreeSizeOf(id: string): number;
}

// Most identities in a tenant can have no manager populated, which turns the
// navigator into thousands of orphan roots. Keep only the people who have a
// manager, plus the managers they point at, so what is left is the part of the
// population that actually forms a hierarchy. Managers qualify on their own
// merit when they in turn have a manager, so chains survive intact.
export function withManagers(identities: OrgIdentity[]): OrgIdentity[] {
  const byId = new Map(identities.map((i) => [i.id, i]));
  const keep = new Map<string, OrgIdentity>();
  for (const identity of identities) {
    if (!identity.manager) continue;
    keep.set(identity.id, identity);
    const manager = byId.get(identity.manager.id);
    if (manager) keep.set(manager.id, manager);
  }
  return [...keep.values()];
}

// The person the tree opens on for the signed-in user: their manager, so the
// view shows the manager on top with the user and their colleagues below.
// Someone at the top of a tree opens on themselves; someone not in the chart
// gets undefined, and the caller opens on the largest tree's top.
export function levelOf(identities: OrgIdentity[], userId: string | undefined): string | undefined {
  const me = identities.find((i) => i.id === userId);
  if (!me) return undefined;
  const managerId = me.manager?.id;
  return managerId && identities.some((i) => i.id === managerId) ? managerId : me.id;
}

export function buildIndex(identities: OrgIdentity[]): OrgIndex {
  const byId = new Map(identities.map((i) => [i.id, i]));
  const children = new Map<string, OrgIdentity[]>();
  for (const identity of identities) {
    const managerId = identity.manager?.id;
    if (managerId && byId.has(managerId)) {
      const list = children.get(managerId) ?? [];
      list.push(identity);
      children.set(managerId, list);
    }
  }
  for (const list of children.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  const managerOf = (id: string): OrgIdentity | null => {
    const ref = byId.get(id)?.manager;
    return ref && byId.has(ref.id) ? byId.get(ref.id)! : null;
  };

  const ancestorsOf = (id: string): OrgIdentity[] => {
    const chain: OrgIdentity[] = [];
    const seen = new Set<string>([id]);
    let current = managerOf(id);
    while (current && !seen.has(current.id)) {
      chain.unshift(current);
      seen.add(current.id);
      current = managerOf(current.id);
    }
    return chain;
  };

  const isRoot = (i: OrgIdentity): boolean => !i.manager || !byId.has(i.manager.id);

  // Number of people at or below `id`. Guarded against a manager cycle, which a
  // tenant can produce and which would otherwise recurse forever.
  const subtreeSize = (id: string, seen = new Set<string>()): number => {
    if (seen.has(id)) return 0;
    seen.add(id);
    return 1 + (children.get(id) ?? []).reduce((n, c) => n + subtreeSize(c.id, seen), 0);
  };

  const rootIds = (): string[] => {
    const roots = identities.filter(isRoot);
    if (!roots.length) return identities.length ? [identities[0].id] : [];
    const size = new Map(roots.map((r) => [r.id, subtreeSize(r.id)]));
    return roots
      .sort((a, b) => size.get(b.id)! - size.get(a.id)! || a.name.localeCompare(b.name))
      .map((r) => r.id);
  };

  const rootOf = (id: string): string => ancestorsOf(id)[0]?.id ?? id;

  return {
    byId,
    reportsOf: (id) => children.get(id) ?? [],
    managerOf,
    ancestorsOf,
    rootIds,
    rootId: () => rootIds()[0] ?? "",
    rootOf,
    subtreeSizeOf: (id) => subtreeSize(id),
  };
}
