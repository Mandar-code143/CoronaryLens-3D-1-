import { Route, Router as WouterRouter, Switch } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Shell } from '@/components/Shell';
import { SessionProvider } from '@/state/session';
import Overview from '@/pages/Overview';
import Inputs from '@/pages/Inputs';
import Workspace from '@/pages/Workspace';
import Evidence from '@/pages/Evidence';
import Methods from '@/pages/Methods';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } });

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Shell>
            <Switch>
              <Route path="/" component={Overview} />
              <Route path="/inputs" component={Inputs} />
              <Route path="/workspace" component={Workspace} />
              <Route path="/evidence" component={Evidence} />
              <Route path="/methods" component={Methods} />
              <Route component={NotFound} />
            </Switch>
          </Shell>
        </WouterRouter>
      </SessionProvider>
    </QueryClientProvider>
  );
}
