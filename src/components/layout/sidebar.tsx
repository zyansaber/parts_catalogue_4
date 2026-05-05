import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Package, FileText, PlusCircle, Settings, BarChart3, Camera } from 'lucide-react';
import { getLang, setLang, t } from '@/lib/i18n';
import { useEffect, useState } from 'react';

const navigation = [
  { key: 'partsCatalogue', href: '/', icon: Package },
  { key: 'partsSummary', href: '/summary', icon: BarChart3 },
  { key: 'bomReference', href: '/bom', icon: FileText },
  { key: 'partApplication', href: '/application', icon: PlusCircle },
  { key: 'takePhoto', href: '/take-photo', icon: Camera },
  { key: 'adminPanel', href: '/admin', icon: Settings },
  { key: 'productionRequired', href: '/production-required', icon: BarChart3 },
  { key: 'openPoVendor3060', href: '/openpo-vendor-3060', icon: FileText },
  { key: 'openPoAll', href: '/openpo-all', icon: FileText },
] as const;

export function Sidebar() {
  const location = useLocation();
  const [lang, setLangState] = useState(getLang());

  useEffect(() => {
    const fn = () => setLangState(getLang());
    window.addEventListener('language-change', fn);
    return () => window.removeEventListener('language-change', fn);
  }, []);

  return (
    <div className="flex h-screen w-64 flex-col bg-gray-900">
      <div className="flex h-16 shrink-0 items-center px-6">
        <Link to="/" className="flex items-center space-x-3">
          <Package className="h-8 w-8 text-blue-400" />
          <span className="text-xl font-bold text-white">Parts System / 零件系统</span>
        </Link>
      </div>
      
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.href;
          
          return (
            <Link
              key={item.key}
              to={item.href}
              className={cn(
                'group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
              )}
            >
              <Icon className="mr-3 h-5 w-5 shrink-0" />
              {t(lang, item.key)}
            </Link>
          );
        })}
      </nav>
      
      <div className="shrink-0 border-t border-gray-700 p-4 space-y-3">
        <div className="flex items-center justify-between text-xs text-gray-300">
          <span>{t(lang, 'language')}</span>
          <button className="rounded bg-gray-800 px-2 py-1" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>{lang.toUpperCase()}</button>
        </div>
        <div className="text-xs text-gray-400">
          Parts Catalogue System v1.0
        </div>
      </div>
    </div>
  );
}