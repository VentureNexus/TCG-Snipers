import { Switch, Route, Router as WouterRouter } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AppLayout } from "@/components/layout/AppLayout";
import { ThemeProvider } from "@/lib/theme";
import { LicenseGate } from "@/components/LicenseGate";
import { UpdateBanner } from "@/components/UpdateBanner";
import { WhatsNewDialog } from "@/components/WhatsNewDialog";
import { DbErrorBanner } from "@/components/DbErrorBanner";
import { UnsavedChangesProvider } from "@/lib/unsaved-changes";

import DashboardPage from "@/pages/dashboard";
import TasksPage from "@/pages/tasks";
import TaskGroupsPage from "@/pages/task-groups";
import ProfilesPage from "@/pages/profiles";
import ProxiesPage from "@/pages/proxies";
import AnalyticsPage from "@/pages/analytics";
import SettingsPage from "@/pages/settings";
import CustomizationPage from "@/pages/customization";

const queryClient = new QueryClient();

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={DashboardPage} />
        <Route path="/tasks" component={TasksPage} />
        <Route path="/task-groups" component={TaskGroupsPage} />
        <Route path="/profiles" component={ProfilesPage} />
        <Route path="/proxies" component={ProxiesPage} />
        <Route path="/analytics" component={AnalyticsPage} />
        <Route path="/customization" component={CustomizationPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <UnsavedChangesProvider>
            <DbErrorBanner />
            <UpdateBanner />
            <WhatsNewDialog />
            <LicenseGate>
              <WouterRouter
                base={import.meta.env.BASE_URL.replace(/\.?\/$/, "")}
                hook={window.location.protocol === "file:" ? useHashLocation : undefined}
              >
                <Router />
              </WouterRouter>
            </LicenseGate>
            <Toaster />
          </UnsavedChangesProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
