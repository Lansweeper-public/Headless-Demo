import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd';
import { AppLayout } from './components/AppLayout';
import { OrganizationPage } from './features/organization/pages/OrganizationPage';
import { AssetsPage } from './features/assets/pages/AssetsPage';
import { AssetDetailPage } from './features/assets/pages/AssetDetailPage';
import { SourcesPage } from './features/assets/pages/SourcesPage';
import { TicketsPage } from './features/tickets/pages/TicketsPage';
import { TicketDetailPage } from './features/tickets/pages/TicketDetailPage';
import { TicketFormPage } from './features/tickets/pages/TicketFormPage';
import { useActiveSite } from './store/activeSite';
import type { ReactNode } from 'react';

const queryClient = new QueryClient();

/** Redirect to the organization page when no site is selected. */
function RequireSite({ children }: { children: ReactNode }) {
  const siteId = useActiveSite((s) => s.siteId);
  if (!siteId) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider theme={{ token: { colorPrimary: '#1677ff', borderRadius: 6, fontSize: 14 } }}>
        <BrowserRouter>
          <Routes>
            {/* Organization landing: pick a site */}
            <Route path="/" element={<OrganizationPage />} />

            {/* Site-scoped app (ITAM / Sources / ITSM) */}
            <Route element={<RequireSite><AppLayout /></RequireSite>}>
              <Route path="/assets" element={<AssetsPage />} />
              <Route path="/assets/:key" element={<AssetDetailPage />} />
              <Route path="/sources" element={<SourcesPage />} />
              <Route path="/tickets" element={<TicketsPage />} />
              <Route path="/tickets/new" element={<TicketFormPage />} />
              <Route path="/tickets/:id" element={<TicketDetailPage />} />
              <Route path="/tickets/:id/edit" element={<TicketFormPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ConfigProvider>
    </QueryClientProvider>
  );
}
