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