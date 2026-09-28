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
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useGetSettings } from "@workspace/api-client-react";
import { useMatrixAuth } from "@/components/matrix-gate";
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
  CheckSquare
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
        { href: "/programs", label: "Programs", icon: FolderKanban },
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
          <SidebarHeader className="h-16 justify-center px-3 border-b border-sidebar-border">
            <Link href="/" data-testid="link-brand" aria-label="Matrix Innovation Hub home" className="flex items-center gap-2.5 min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground font-black text-sm tracking-tight">M</span>
              <span className="flex flex-col leading-tight min-w-0 group-data-[collapsible=icon]:hidden">
                <span className="text-sm font-bold tracking-[0.14em] uppercase text-sidebar-foreground">Matrix</span>
                <span className="text-[11px] text-sidebar-foreground/70 truncate">Innovation Hub</span>
              </span>
            </Link>
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
            <div className="px-2 pt-1 text-[11px] text-sidebar-foreground/60 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:text-center group-data-[collapsible=icon]:text-[9px]">
              <span className="font-mono" data-testid="text-app-version">{settings?.applicationVersion ?? ""}</span>
            </div>
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 flex flex-col min-w-0">
          <header className="h-16 flex items-center px-4 border-b bg-card shrink-0 gap-4">
            <SidebarTrigger aria-label="Toggle navigation" data-testid="button-toggle-sidebar" />
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
