import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
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

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <BrowserRouter>
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
                <Route path="*" element={<NotFound />} />
              </Routes>
            </div>
          </main>
        </div>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
