import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useGetSettings } from "@workspace/api-client-react";
import { getMatrixLaunchUser, isMatrixLaunch } from "@/lib/matrix-platform";
import { LayoutDashboard, PlusCircle, List, KanbanSquare, FileText, Settings, Rocket, Sparkles, ClipboardCheck, ListTodo } from "lucide-react";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: settings } = useGetSettings();

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/interview", label: "AI Innovation Interview", icon: Sparkles },
    { href: "/submit", label: "Submit Initiative", icon: PlusCircle },
    { href: "/initiatives", label: "Initiatives", icon: List },
    { href: "/kanban", label: "Kanban", icon: KanbanSquare },
    { href: "/documents", label: "Documents", icon: FileText },
    { href: "/validation", label: "Validation", icon: ClipboardCheck },
    { href: "/backlog", label: "Product Backlog", icon: ListTodo },
    { href: "/admin", label: "Admin", icon: Settings },
  ];

  return (
    <SidebarProvider>
      <div className="min-h-[100dvh] flex w-full bg-muted/20">
        <Sidebar variant="sidebar" className="border-r">
          <SidebarHeader className="h-16 flex items-center px-4 border-b">
            <div className="flex items-center gap-2 font-bold text-primary">
              <Rocket className="h-5 w-5" />
              <span>Matrix Hub</span>
            </div>
          </SidebarHeader>
          <SidebarContent className="p-2">
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={location === item.href}>
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter className="border-t px-4 py-3">
            <div className="text-xs text-sidebar-foreground/70">
              <div className="font-medium">Matrix Innovation Hub</div>
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
              {navItems.find((i) => i.href === location)?.label || "Innovation Hub"}
            </h1>
            {isMatrixLaunch() && (
              <div className="ml-auto text-xs text-muted-foreground">
                Matrix Platform
                {getMatrixLaunchUser() ? ` — ${getMatrixLaunchUser()}` : ""}
              </div>
            )}
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
