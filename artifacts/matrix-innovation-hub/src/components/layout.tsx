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
import { Button } from "@/components/ui/button";
import { 
  LayoutDashboard, 
  PlusCircle, 
  List, 
  KanbanSquare, 
  FileText, 
  Settings, 
  Compass, 
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
        { href: "/interview", label: "AI Innovation Interview", icon: Sparkles },
        { href: "/submit", label: "Submit Initiative", icon: PlusCircle },
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

  const currentLabel = navGroups.flatMap(g => g.items).find(i => i.href === location)?.label || "Compass";

  return (
    <SidebarProvider>
      <div className="min-h-[100dvh] flex w-full bg-muted/20">
        <Sidebar variant="sidebar" className="border-r">
          <SidebarHeader className="h-16 flex items-center px-4 border-b">
            <div className="flex items-center gap-2 font-bold text-primary">
              <Compass className="h-5 w-5" />
              <span>Compass</span>
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
                        <SidebarMenuButton asChild isActive={location === item.href || (item.href !== '/' && location.startsWith(item.href))}>
                          <Link href={item.href}>
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
          <SidebarFooter className="border-t px-4 py-3">
            <div className="text-xs text-sidebar-foreground/70">
              <div className="font-medium">Compass</div>
              <div className="font-mono mt-0.5">
                {settings?.applicationVersion ?? ""}
              </div>
            </div>
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 flex flex-col min-w-0">
          <header className="h-16 flex items-center px-4 border-b bg-card shrink-0 gap-4">
            <SidebarTrigger />
            <h1 className="font-semibold text-lg text-foreground">
              {currentLabel}
            </h1>
            <div className="ml-auto flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {user.name ?? user.email ?? user.sub}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void logout()}
                className="text-muted-foreground"
              >
                <LogOut className="h-4 w-4 mr-1" />
                Log out
              </Button>
            </div>
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
