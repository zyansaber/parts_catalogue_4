import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Package, FileText, PlusCircle, Settings, BarChart3, Camera } from 'lucide-react';

const navigation = [
  { name: 'Parts Catalogue', href: '/', icon: Package },
  { name: 'Parts Summary', href: '/summary', icon: BarChart3 },
  { name: 'BoM Reference', href: '/bom', icon: FileText },
  { name: 'Part Application', href: '/application', icon: PlusCircle },
  { name: 'Take Photo', href: '/take-photo', icon: Camera },
  { name: 'Admin Panel', href: '/admin', icon: Settings },
];

export function Sidebar() {
  const location = useLocation();

  return (
    <div className="flex h-screen w-64 flex-col bg-gray-900">
      <div className="flex h-16 shrink-0 items-center px-6">
        <Link to="/" className="flex items-center space-x-3">
          <Package className="h-8 w-8 text-blue-400" />
          <span className="text-xl font-bold text-white">Parts System</span>
        </Link>
      </div>
      
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.href;
          
          return (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                'group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
              )}
            >
              <Icon className="mr-3 h-5 w-5 shrink-0" />
              {item.name}
            </Link>
          );
        })}
      </nav>
      
      <div className="shrink-0 border-t border-gray-700 p-4">
        <div className="text-xs text-gray-400">
          Parts Catalogue System v1.0
        </div>
      </div>
    </div>
  );
}