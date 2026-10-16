// Pure navigation model: groups, active-item resolution and default
// expansion. No React imports so it can be tested with node:test.

export interface NavLink { href: string; label: string; iconKey: string; tab?: string }
export interface NavSection {
  id: string;
  label: string;
  secondary?: boolean;
  /** The group's own destination (clicking the group label navigates here). */
  primary: NavLink;
  /** Additional destinations revealed by the group's expand toggle. */
  children: NavLink[];
}

export const NAV_SECTIONS: NavSection[] = [
  { id: "home", label: "Home", primary: { href: "/", label: "Home", iconKey: "home" }, children: [] },
  {
    id: "ideas", label: "Ideas & Initiatives",
    primary: { href: "/initiatives", label: "Ideas & Initiatives", iconKey: "ideas" },
    children: [
      { href: "/interview", label: "Develop an idea", iconKey: "develop" },
      { href: "/submit", label: "Enter a defined idea", iconKey: "submit" },
      { href: "/kanban", label: "Board view", iconKey: "board" },
    ],
  },
  {
    id: "projects", label: "Projects",
    primary: { href: "/projects", label: "Projects", iconKey: "projects" },
    children: [
      { href: "/projects/new", label: "Create project", iconKey: "create" },
      { href: "/clients", label: "Clients", iconKey: "clients" },
      { href: "/resources", label: "People & capacity", iconKey: "people" },
      { href: "/approvals", label: "Project approvals", iconKey: "approvals" },
    ],
  },
  {
    id: "portfolio", label: "Portfolio",
    primary: { href: "/portfolio", label: "Portfolio", iconKey: "portfolio" },
    children: [
      { href: "/programs", label: "Programs", iconKey: "programs" },
      { href: "/reports", label: "Reports", iconKey: "reports" },
    ],
  },
  { id: "help", label: "Help", secondary: true, primary: { href: "/documents", label: "Help & guides", iconKey: "help" }, children: [] },
  {
    id: "admin", label: "Administration", secondary: true,
    primary: { href: "/admin", label: "Administration", iconKey: "admin" },
    children: [
      { href: "/admin", label: "Admin settings", iconKey: "settings" },
      { href: "/organizations", label: "Organizations", iconKey: "organizations" },
      { href: "/backlog", label: "Hub improvements", iconKey: "backlog", tab: "" },
      { href: "/backlog?tab=deferred", label: "Deferred improvements", iconKey: "deferred", tab: "deferred" },
      { href: "/validation", label: "Release checks", iconKey: "validation" },
    ],
  },
];

const pathOf = (href: string) => href.split("?")[0];

export interface ActiveNav {
  sectionId: string | null;
  /** href of the most specific active link (primary or child). */
  href: string | null;
  /** true when the active link is a child (not the section primary). */
  isChild: boolean;
}

export function resolveActiveNav(location: string, search: string, sections: NavSection[] = NAV_SECTIONS): ActiveNav {
  const tab = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("tab") === "deferred" ? "deferred" : "";
  let best: { sectionId: string; href: string; isChild: boolean; len: number } | null = null;
  for (const s of sections) {
    const candidates: { link: NavLink; isChild: boolean }[] = [
      ...s.children.map(link => ({ link, isChild: true })),
      { link: s.primary, isChild: false },
    ];
    for (const { link, isChild } of candidates) {
      const p = pathOf(link.href);
      const match = p === "/" ? location === "/" : location === p || location.startsWith(p + "/");
      if (!match) continue;
      if (link.tab !== undefined && link.tab !== tab) continue;
      // Prefer longer paths; on ties prefer child (more specific label, e.g. Admin settings).
      const len = p.length + (isChild ? 0.5 : 0);
      if (!best || len > best.len) best = { sectionId: s.id, href: link.href, isChild, len };
    }
  }
  return best ? { sectionId: best.sectionId, href: best.href, isChild: best.isChild } : { sectionId: null, href: null, isChild: false };
}

/** Collapsed by default; only the section holding an active child opens. */
export function defaultExpanded(active: ActiveNav): Record<string, boolean> {
  return active.sectionId && active.isChild ? { [active.sectionId]: true } : {};
}

export function headerTitle(location: string, search: string): string {
  if (/^\/projects\/\d+/.test(location)) return "Project";
  if (/^\/initiatives\/\d+\/score/.test(location)) return "Score initiative";
  if (/^\/initiatives\/\d+/.test(location)) return "Initiative";
  const a = resolveActiveNav(location, search);
  if (!a.href) return "Innovation Hub";
  for (const s of NAV_SECTIONS) {
    const link = [s.primary, ...s.children].find(l => l.href === a.href);
    if (link) return link.label;
  }
  return "Innovation Hub";
}

export function countVisibleLinks(expanded: Record<string, boolean>, sections: NavSection[] = NAV_SECTIONS): number {
  return sections.reduce((n, s) => n + 1 + (expanded[s.id] ? s.children.length : 0), 0);
}
