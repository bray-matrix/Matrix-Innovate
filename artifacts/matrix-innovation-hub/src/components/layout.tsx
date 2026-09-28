import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
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
  List, 
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
} from "lucide-react";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: settings } = useGetSettings();
  const { user, logout } = useMatrixAuth();

  const navGroups = [
    {
      label: "HOME",
      items: [
        { href: "/", label: "Dashboard", icon: LayoutDashboard },
        { href: "/portfolio", label: "Portfolio", icon: PieChart },
      ]
    },
    {
      label: "INNOVATION",
      items: [
        { href: "/interview", label: "Guided Idea Interview", icon: Sparkles },
        { href: "/submit", label: "Quick Submit", icon: PlusCircle },
        { href: "/initiatives", label: "Initiatives", icon: List },
        { href: "/kanban", label: "Kanban", icon: KanbanSquare },
      ]
    },
    {
      label: "EXECUTION",
      items: [
        { href: "/projects", label: "Projects", icon: Briefcase },
        { href: "/clients", label: "Clients", icon: Users },
        { href: "/organizations", label: "Organizations", icon: Building2 },
        { href: "/resources", label: "Resources", icon: Users },
        { href: "/approvals", label: "Approvals", icon: CheckSquare },
      ]
    },
    {
      label: "REPORTING",
      items: [
        { href: "/reports", label: "Reports", icon: FileText },
      ]
    },
    {
      label: "GOVERNANCE",
      items: [
        { href: "/validation", label: "Validation", icon: ClipboardCheck },
        { href: "/documents", label: "Documents", icon: FileText },
      ]
    },
    {
      label: "MANAGEMENT",
      items: [
        { href: "/programs", label: "Programs", icon: FolderKanban },
      ]
    },
    {
      label: "PRODUCT MANAGEMENT",
      items: [
        { href: "/backlog", label: "Product Backlog", icon: ListTodo },
      ]
    },
    {
      label: "ADMINISTRATION",
      items: [
        { href: "/admin", label: "Admin", icon: Settings },
      ]
    }
  ];

  const displayName = user.name ?? user.email ?? user.sub ?? "";
  const currentLabel = navGroups.flatMap(g => g.items).find(i => i.href === location)?.label || "Matrix Innovation Hub";

  return (
    <SidebarProvider>
      <div className="min-h-[100dvh] flex w-full bg-muted/20">
        <Sidebar variant="sidebar" collapsible="icon" className="border-r">
          <SidebarHeader className="min-h-28 flex-row items-start justify-between gap-1 px-5 pt-7 pb-3 border-b border-sidebar-border group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <Link href="/" data-testid="link-brand" aria-label="Matrix Innovation Hub home" className="flex flex-col items-start gap-2 min-w-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
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
            {navGroups.map((group) => (
              <SidebarGroup key={group.label} className="py-2">
                <SidebarGroupLabel className="text-xs font-semibold tracking-wider text-sidebar-foreground/50">
                  {group.label}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton asChild tooltip={item.label} isActive={location === item.href || (item.href !== '/' && location.startsWith(item.href))}>
                          <Link href={item.href} data-testid={`link-nav-${item.href.replace(/\//g, "") || "dashboard"}`}>
                            <item.icon />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </SidebarContent>
          <SidebarFooter className="border-t border-sidebar-border p-2 gap-1">
            <div className="flex items-center gap-2 px-2 py-1.5 min-w-0 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center" title={displayName}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-[11px] font-semibold">
                {displayName.slice(0, 1).toUpperCase()}
              </span>
              <span className="text-xs font-medium truncate group-data-[collapsible=icon]:sr-only" data-testid="text-user-name">{displayName}</span>
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
          <div className="flex-1 overflow-auto p-4 md:p-8">
            <div className="max-w-7xl mx-auto w-full">
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
