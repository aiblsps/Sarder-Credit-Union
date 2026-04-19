import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  UserCircle, 
  Receipt, 
  LogOut, 
  Menu, 
  X, 
  Wallet, 
  Landmark, 
  FileText, 
  UserCog, 
  User,
  PieChart,
  ChevronRight,
  ChevronDown,
  Shield,
  ArrowLeft
} from 'lucide-react';
import { cn, getDirectDriveUrl } from './lib/utils';
import { useAuth } from './AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import myLogo from './assets/logo.png';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAccountSubMenuOpen, setIsAccountSubMenuOpen] = useState(false);
  const { user, role, logout, appSettings } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const onBack = (e: Event) => {
      if (isMenuOpen) {
        e.preventDefault();
        setIsMenuOpen(false);
      }
    };
    window.addEventListener('app:back', onBack);
    return () => window.removeEventListener('app:back', onBack);
  }, [isMenuOpen]);

  const isDashboard = location.pathname === '/' || location.pathname === '/dashboard';

  const menuItems = [
    { icon: LayoutDashboard, label: 'ড্যাশবোর্ড', path: '/', roles: ['director', 'admin', 'super_admin'] },
    { icon: Receipt, label: 'লেনদেন', path: '/transactions', roles: ['admin', 'super_admin'] },
    { icon: Landmark, label: 'ব্যাংকসমূহ', path: '/banks', roles: ['director', 'admin', 'super_admin'] },
    { icon: UserCircle, label: 'পরিচালক', path: '/directors', roles: ['director', 'admin', 'super_admin'] },
    { icon: PieChart, label: 'রিপোর্ট', path: '/reports', roles: ['director', 'admin', 'super_admin'] },
    { icon: Wallet, label: 'বিনিয়োগ', path: '/investments', roles: ['director', 'admin', 'super_admin'] },
    { icon: Shield, label: 'ইউজার ম্যানেজমেন্ট', path: '/users', roles: ['admin', 'super_admin'] },
  ];

  const filteredMenuItems = menuItems.filter(item => 
    item.roles.includes(role || 'director') || role === 'super_admin'
  );

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 bg-white border-b border-slate-200 pt-[env(safe-area-inset-top)] z-50">
        <div className="px-4 min-h-16 flex items-center justify-between py-2">
          <div className="flex items-center gap-2 min-w-0">
            {!isDashboard && (
              <button
                onClick={() => {
                  const event = new CustomEvent('app:back', { cancelable: true });
                  const wasCancelled = !window.dispatchEvent(event);
                  if (!wasCancelled) {
                    const mainRoutes = [
                      '/directors', '/banks', '/reports', '/transactions', 
                      '/investments', '/users', '/customers', '/profile', 
                      '/transaction-menu', '/transaction-report'
                    ];
                    if (mainRoutes.includes(location.pathname)) {
                      navigate('/', { replace: true });
                    } else {
                      navigate(-1);
                    }
                  }
                }}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-600 shrink-0"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
            )}
            <div className="flex items-center gap-2 min-w-0">
              <img src={myLogo} alt="Logo" className="w-8 h-8 rounded-lg object-cover shrink-0" />
              <h1 className="font-bold text-base md:text-lg text-emerald-800 truncate">
                {appSettings?.appName || 'Sarder Credit Union'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMenuOpen(true)}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
            >
              <Menu className="w-6 h-6 text-slate-600" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto relative pt-[calc(env(safe-area-inset-top)+64px)] pb-[calc(env(safe-area-inset-bottom)+64px)]">
        <div className="p-4 max-w-7xl mx-auto w-full">
          {children}
        </div>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-[#0D47A1] border-t border-[#0D47A1]/20 pb-[env(safe-area-inset-bottom)] z-50">
        <div className="flex justify-around items-center h-16 px-2">
          {filteredMenuItems.slice(0, 4).map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={cn(
                  "flex flex-col items-center justify-center flex-1 py-1 transition-colors",
                  isActive ? "text-white" : "text-white/60 hover:text-white"
                )}
              >
                <Icon className={cn("w-5 h-5 mb-1", isActive && "animate-in fade-in zoom-in duration-300")} />
                <span className="text-[10px] font-bold truncate w-full text-center px-1">
                  {item.label}
                </span>
              </button>
            );
          })}
          <button
            onClick={() => navigate('/profile')}
            className={cn(
              "flex flex-col items-center justify-center flex-1 py-1 transition-colors",
              location.pathname === '/profile' ? "text-white" : "text-white/60 hover:text-white"
            )}
          >
            <UserCircle className="w-5 h-5 mb-1" />
            <span className="text-[10px] font-bold">প্রোফাইল</span>
          </button>
        </div>
      </nav>

      {/* Side Menu Overlay */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMenuOpen(false)}
              className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 right-0 w-72 bg-white shadow-2xl z-50 flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 bg-emerald-600 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img src={myLogo} alt="Logo" className="w-10 h-10 rounded-xl object-cover bg-white/20 shadow-sm" />
                    <div>
                      <h2 className="font-bold text-white leading-tight">{appSettings?.appName || 'Sarder Credit Union'}</h2>
                    </div>
                  </div>
                  <button onClick={() => setIsMenuOpen(false)} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                    <X className="w-6 h-6 text-white" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto py-4">
                <div className="px-4 space-y-1">
                  {/* Account Submenu - Visible to all roles */}
                  {(role === 'super_admin' || role === 'admin' || role === 'director') && (
                    <div className="space-y-1">
                      <button 
                        onClick={() => setIsAccountSubMenuOpen(!isAccountSubMenuOpen)}
                        className={cn(
                          "w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200",
                          isAccountSubMenuOpen ? "bg-emerald-50 text-emerald-600 font-semibold" : "text-slate-600 hover:bg-slate-50"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <Wallet className="w-5 h-5" />
                          <span>একাউন্ট</span>
                        </div>
                        {isAccountSubMenuOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                      
                      <AnimatePresence>
                        {isAccountSubMenuOpen && (
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="ml-8 space-y-1 overflow-hidden"
                          >
                            <Link 
                              to="/customers" 
                              onClick={() => setIsMenuOpen(false)}
                              className={cn(
                                "block px-4 py-2 rounded-lg text-sm transition-colors",
                                location.pathname === '/customers' ? "text-emerald-600 bg-emerald-50" : "text-slate-500 hover:bg-slate-50"
                              )}
                            >
                              সকল গ্রাহক
                            </Link>
                            <Link 
                              to="/investments" 
                              onClick={() => setIsMenuOpen(false)}
                              className={cn(
                                "block px-4 py-2 rounded-lg text-sm transition-colors",
                                location.pathname === '/investments' ? "text-emerald-600 bg-emerald-50" : "text-slate-500 hover:bg-slate-50"
                              )}
                            >
                              সকল বিনিয়োগ
                            </Link>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                  {/* অন্যান্য মেনু আইটেম */}
                  {filteredMenuItems.filter(item => !['/customers', '/investments'].includes(item.path)).map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname === item.path;
                    return (
                      <button
                        key={item.path}
                        onClick={() => {
                          navigate(item.path);
                          setIsMenuOpen(false);
                        }}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
                          isActive ? "bg-emerald-50 text-emerald-600 font-semibold" : "text-slate-600 hover:bg-slate-50"
                        )}
                      >
                        <Icon className={cn("w-5 h-5", isActive ? "text-emerald-600" : "text-slate-400")} />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50/50">
                <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 px-4 py-3 text-red-600 font-semibold hover:bg-red-50 rounded-xl transition-colors">
                  <LogOut className="w-5 h-5" />
                  <span>লগআউট</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};