import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout";
import Dashboard from "@/pages/dashboard";
import AIInnovationInterview from "@/pages/interview";
import SubmitInitiative from "@/pages/submit";
import InitiativeList from "@/pages/initiatives";
import InitiativeDetail from "@/pages/initiative-detail";
import ScoreInitiative from "@/pages/score-initiative";
import KanbanBoard from "@/pages/kanban";
import Documents from "@/pages/documents";
import ValidationPage from "@/pages/validation";
import Admin from "@/pages/admin";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/interview" component={AIInnovationInterview} />
        <Route path="/submit" component={SubmitInitiative} />
        <Route path="/initiatives" component={InitiativeList} />
        <Route path="/initiatives/:id" component={InitiativeDetail} />
        <Route path="/initiatives/:id/score" component={ScoreInitiative} />
        <Route path="/kanban" component={KanbanBoard} />
        <Route path="/documents" component={Documents} />
        <Route path="/validation" component={ValidationPage} />
        <Route path="/admin" component={Admin} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
