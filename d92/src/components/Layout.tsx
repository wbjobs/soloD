import { Link, Outlet, useLocation } from 'react-router-dom';
import { Upload, Globe, List, Database } from 'lucide-react';
import { cn } from '@/lib/utils';

const Layout = () => {
  const location = useLocation();
  
  const navItems = [
    { path: '/', label: '首页', icon: Database },
    { path: '/upload', label: '数据上传', icon: Upload },
    { path: '/sky-map', label: '天球检索', icon: Globe },
    { path: '/data', label: '数据列表', icon: List },
  ];

  return (
    <div className="min-h-screen bg-space-950 text-nebula-200">
      <nav className="glass-card border-b border-cosmic-500/20 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-cosmic-500 to-space-800 rounded-lg flex items-center justify-center">
              <Database className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-cosmic-500">射电望远镜数据归档</h1>
              <p className="text-xs text-nebula-400">Radio Telescope Data Archive</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    'flex items-center space-x-2 px-4 py-2 rounded-lg transition-all duration-200',
                    isActive
                      ? 'bg-cosmic-500/20 text-cosmic-500 border border-cosmic-500/30'
                      : 'hover:bg-space-800 text-nebula-300 hover:text-nebula-100'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-sm font-medium">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
      
      <main className="max-w-7xl mx-auto px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
