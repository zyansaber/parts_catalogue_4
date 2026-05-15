import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { Sidebar } from '@/components/layout/sidebar';
import PartsCataloguePage from './pages/parts-catalogue';
import PartsSummaryPage from './pages/parts-summary';
import BoMReferencePage from './pages/bom-reference';
import PartApplicationPage from './pages/part-application';
import TakePhotoPage from './pages/take-photo';
import AdminPage from './pages/admin';
import NotFound from './pages/NotFound';
import ProductionRequiredAnalysisPage from './pages/production-required-analysis';
import KanbanPartsPage from './pages/kanban-parts';
import OpenPoVendor3060Page from './pages/openpo-vendor-3060';
import OpenPoAllPage from './pages/openpo-all';
import AppAdminPage from './pages/app-admin';
import PartsRequestsApiPage from './pages/parts-requests-api';
import PartsDeliveryPage from './pages/parts-delivery';
import PartsCatalogueStandalonePage from './pages/parts-catalogue-standalone';
import LongtreeOrderReportPage from './pages/longtree-order-report';

const queryClient = new QueryClient();

const AppLayout = () => {
  const location = useLocation();
  const isStandalonePage = location.pathname === '/parts-catalogue-standalone';

  if (isStandalonePage) {
    return (
      <main className="min-h-screen bg-gray-50 overflow-auto">
        <div className="p-8">
          <Routes>
            <Route path="/parts-catalogue-standalone" element={<PartsCatalogueStandalonePage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </main>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-8">
          <Routes>
            <Route path="/" element={<PartsCataloguePage />} />
            <Route path="/summary" element={<PartsSummaryPage />} />
            <Route path="/bom" element={<BoMReferencePage />} />
            <Route path="/application" element={<PartApplicationPage />} />
            <Route path="/take-photo" element={<TakePhotoPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/production-required" element={<ProductionRequiredAnalysisPage />} />
            <Route path="/kanban-parts" element={<KanbanPartsPage />} />
            <Route path="/openpo-vendor-3060" element={<OpenPoVendor3060Page />} />
            <Route path="/openpo-all" element={<OpenPoAllPage />} />
            <Route path="/app-admin" element={<AppAdminPage />} />
            <Route path="/parts-requests-api" element={<PartsRequestsApiPage />} />
            <Route path="/parts-delivery" element={<PartsDeliveryPage />} />
            <Route path="/longtree-order-report" element={<LongtreeOrderReportPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </main>
    </div>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <BrowserRouter>
        <AppLayout />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
