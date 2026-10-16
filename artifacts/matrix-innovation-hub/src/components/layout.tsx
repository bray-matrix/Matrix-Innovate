import { useEffect, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { NAV_SECTIONS, resolveActiveNav, defaultExpanded, headerTitle } from "@/lib/nav-model";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenuAction,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";
import { useGetSettings } from "@workspace/api-client-react";
import { useMatrixAuth } from "@/components/matrix-gate";
import { withBase } from "@/lib/base-path";
import { 
  LayoutDashboard, 
  PlusCircle, 

  KanbanSquare, 
  FileText, 
  Settings, 
  Sparkles, 
  ClipboardCheck, 
  ListTodo, 
  LogOut,
  Briefcase,
  FolderKanban,
  Users,
  Building2,
  PieChart,
  CheckSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  FilePlus2,
  UserCog,
  HelpCircle,
  PauseCircle,
  Lightbulb,
  ChevronDown,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  home: LayoutDashboard, ideas: Lightbulb, develop: Sparkles, submit: PlusCircle, board: KanbanSquare,
  projects: Briefcase, create: FilePlus2, clients: Users, people: UserCog, approvals: CheckSquare,
  portfolio: PieChart, programs: FolderKanban, reports: FileText, help: HelpCircle, admin: Settings,
  settings: Settings, organizations: Building2, backlog: ListTodo, deferred: PauseCircle, validation: ClipboardCheck,
};

const navTestId = (href: string) => `link-nav-${href.replace(/[/?=]/g, "") || "dashboard"}`;

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const search = useSearch();
  const { data: settings } = useGetSettings();
  const { user, logout } = useMatrixAuth();

  const displayName = user.name ?? user.email ?? user.sub ?? "";
  const currentLabel = headerTitle(location, search);

  return (
    <SidebarProvider>
      <div className="min-h-[100dvh] flex w-full bg-muted/20">
        <Sidebar variant="sidebar" collapsible="icon" className="border-r">
          <SidebarHeader className="min-h-28 flex-row items-start justify-between gap-1 px-5 pt-7 pb-3 border-b border-sidebar-border group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <Link href="/" data-testid="link-brand" aria-label="Innovation Hub home" className="flex flex-col items-start gap-2 min-w-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
                <img src={withBase("/matrix-wordmark.png")} alt="Matrix" width={98} height={24} className="h-6 w-auto" />
                <span className="text-[10px] font-semibold tracking-[0.28em] uppercase text-sidebar-foreground/90 whitespace-nowrap">Innovation Hub</span>
              </Link>
              <span className="mt-1 inline-block rounded-sm bg-sidebar-accent px-1 py-px font-mono text-[9px] leading-none text-sidebar-foreground/70" data-testid="text-app-version">{settings?.applicationVersion ?? ""}</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <SidebarCollapseButton />
              <span className="hidden group-data-[collapsible=icon]:block font-mono text-[9px] text-sidebar-foreground/70" data-testid="text-app-version-collapsed">{settings?.applicationVersion ?? ""}</span>
            </div>
          </SidebarHeader>
          <SidebarContent className="p-2 gap-0">
            <NavSections location={location} search={search} />
          </SidebarContent>
          <SidebarFooter className="border-t border-sidebar-border p-2 gap-1">
            <div className="flex items-center gap-2 px-2 py-1.5 min-w-0 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center" title={displayName}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-[11px] font-semibold">
                {displayName.slice(0, 1).toUpperCase()}
              </span>
              <span className="text-sm font-medium truncate group-data-[collapsible=icon]:sr-only" data-testid="text-user-name">{displayName}</span>
            </div>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Log out" onClick={() => void logout()} data-testid="button-logout" className="text-sidebar-foreground/80">
                  <LogOut />
                  <span>Log out</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 flex flex-col min-w-0">
          <header className="h-16 flex items-center px-4 border-b bg-card shrink-0 gap-4">
            <MobileMenuButton />
            <h1 className="font-semibold text-lg text-foreground">
              {currentLabel}
            </h1>
          </header>
          <div className="flex-1 overflow-auto px-4 py-5 md:px-6 md:py-8 xl:px-[5%]">
            <div className="app-content mx-auto w-full max-w-[1680px]" data-app-content>
              {children}
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}

function SidebarCollapseButton() {
  const { state, isMobile, toggleSidebar } = useSidebar();
  const expanded = isMobile || state === "expanded";
  const Icon = isMobile || expanded ? PanelLeftClose : PanelLeftOpen;
  const label = isMobile ? "Close navigation" : expanded ? "Collapse navigation" : "Expand navigation";
  return (
    <button
      type="button"
      onClick={toggleSidebar}
      aria-label={label}
      title={label}
      aria-expanded={expanded}
      data-testid="button-toggle-sidebar"
      className="flex h-7 w-7 -mt-1 shrink-0 items-center justify-center rounded-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function MobileMenuButton() {
  const { isMobile, openMobile, setOpenMobile } = useSidebar();
  if (!isMobile) return null;
  return (
    <button
      type="button"
      onClick={() => setOpenMobile(true)}
      aria-label="Open navigation"
      aria-expanded={openMobile}
      data-testid="button-open-mobile-nav"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-sidebar text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}

function NavSections({ location, search }: { location: string; search: string }) {
  const { isMobile, setOpenMobile } = useSidebar();
  const active = resolveActiveNav(location, search);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => defaultExpanded(active));

  // When navigation lands on a child destination, make sure its section is open.
  useEffect(() => {
    if (active.sectionId && active.isChild) {
      const id = active.sectionId;
      setExpanded(e => (e[id] ? e : { ...e, [id]: true }));
    }
  }, [active.sectionId, active.isChild]);

  const onNavigate = () => { if (isMobile) setOpenMobile(false); };

  const renderSection = (sectionId: string) => {
    const s = NAV_SECTIONS.find(x => x.id === sectionId)!;
    const Icon = ICONS[s.primary.iconKey];
    const isOpen = !!expanded[s.id];
    const primaryActive = active.href === s.primary.href && !active.isChild;
    const childActive = active.sectionId === s.id && active.isChild;
    const subId = `nav-sub-${s.id}`;
    return (
      <SidebarMenuItem key={s.id}>
        <SidebarMenuButton asChild tooltip={s.primary.label} isActive={primaryActive}
          className={`text-[15px] ${childActive ? "font-semibold" : ""}`}>
          <Link href={s.primary.href} onClick={onNavigate} aria-current={primaryActive ? "page" : undefined} data-testid={navTestId(s.primary.href)}>
            <Icon />
            <span>{s.primary.label}</span>
          </Link>
        </SidebarMenuButton>
        {s.children.length > 0 && (
          <>
            <SidebarMenuAction
              onClick={() => setExpanded(e => ({ ...e, [s.id]: !isOpen }))}
              aria-expanded={isOpen}
              aria-controls={subId}
              aria-label={`${isOpen ? "Hide" : "Show"} ${s.label} options`}
              title={`${isOpen ? "Hide" : "Show"} ${s.label} options`}
              data-testid={`button-toggle-nav-${s.id}`}
              className="top-1.5 h-6 w-6 rounded-md"
            >
              <ChevronDown className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
            </SidebarMenuAction>
            {isOpen && (
              <SidebarMenuSub id={subId} aria-label={`${s.label} options`}>
                {s.children.map(c => {
                  const CIcon = ICONS[c.iconKey];
                  const isActive = active.href === c.href && active.isChild;
                  return (
                    <SidebarMenuSubItem key={c.href}>
                      <SidebarMenuSubButton asChild isActive={isActive} className="text-sm h-8">
                        <Link href={c.href} onClick={onNavigate} aria-current={isActive ? "page" : undefined} data-testid={navTestId(c.href) + (c.href === s.primary.href ? "-child" : "")}>
                          <CIcon />
                          <span>{c.label}</span>
                        </Link>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  );
                })}
              </SidebarMenuSub>
            )}
          </>
        )}
      </SidebarMenuItem>
    );
  };

  const primary = NAV_SECTIONS.filter(s => !s.secondary);
  const secondary = NAV_SECTIONS.filter(s => s.secondary);
  return (
    <nav aria-label="Main navigation" className="flex flex-col gap-0">
      <SidebarGroup className="py-2">
        <SidebarGroupContent>
          <SidebarMenu className="gap-1">{primary.map(s => renderSection(s.id))}</SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <div className="mx-3 my-1 border-t border-sidebar-border" aria-hidden="true" />
      <SidebarGroup className="py-2">
        <SidebarGroupContent>
          <SidebarMenu className="gap-1">{secondary.map(s => renderSection(s.id))}</SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </nav>
  );
}
