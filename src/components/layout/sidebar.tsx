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
  { key: 'productionRequired', href: '/production-required', icon: BarChart3 },
  { key: 'kanbanParts', href: '/kanban-parts', icon: BarChart3 },
  { key: 'openPoVendor3060', href: '/openpo-vendor-3060', icon: FileText },
  { key: 'openPoAll', href: '/openpo-all', icon: FileText },
  { key: 'partsRequestsApi', href: '/parts-requests-api', icon: FileText },
  { key: 'partsDelivery', href: '/parts-delivery', icon: FileText },
  { key: 'appAdmin', href: '/app-admin', icon: Settings },
  { key: 'adminPanel', href: '/admin', icon: Settings },
] as const;

// Shows the language you will SWITCH TO (not the current one)
const LANG_TARGET = {
  en: { flag: '🇨🇳', label: '中文', sublabel: 'Switch to Chinese' },
  zh: { flag: '🇦🇺', label: 'English', sublabel: 'Switch to English' },
} as const;

export function Sidebar() {
  const location = useLocation();
  const [lang, setLangState] = useState(getLang());

  useEffect(() => {
    const fn = () => setLangState(getLang());
    window.addEventListener('language-change', fn);
    return () => window.removeEventListener('language-change', fn);
  }, []);

  const target = LANG_TARGET[lang as keyof typeof LANG_TARGET];
  const nextLang = lang === 'zh' ? 'en' : 'zh';

  return (
    <div className="flex h-screen w-64 flex-col bg-gray-900">
      {/* Logo */}
      <div className="flex h-16 shrink-0 items-center px-6">
        <Link to="/" className="flex items-center space-x-3">
          <Package className="h-8 w-8 text-blue-400" />
          <span className="text-xl font-bold text-white">Parts System / 零件系统</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
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

      {/* Footer */}
      <div className="shrink-0 border-t border-gray-700 p-4 space-y-3">
        {/* Language switcher — shows TARGET language with flag */}
        <button
          onClick={() => setLang(nextLang)}
          className={cn(
            'w-full flex items-center gap-3 rounded-lg px-3 py-2.5',
            'bg-gray-800 hover:bg-gray-700 active:bg-gray-600',
            'border border-gray-600 hover:border-gray-500',
            'transition-all duration-150 group'
          )}
          title={target.sublabel}
        >
          {/* Flag */}
          <span className="text-2xl leading-none select-none">{target.flag}</span>

          {/* Labels */}
          <div className="flex flex-col items-start leading-tight">
            <span className="text-sm font-semibold text-white group-hover:text-blue-300 transition-colors">
              {target.label}
            </span>
            <span className="text-xs text-gray-400">{target.sublabel}</span>
          </div>

          {/* Arrow indicator */}
          <svg
            className="ml-auto h-4 w-4 text-gray-500 group-hover:text-gray-300 transition-colors"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
        </button>

        <div className="text-xs text-gray-500 text-center">
          Parts Catalogue System v1.0
        </div>
      </div>
    </div>
  );
}
