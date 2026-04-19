import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { LogOut, X, AlertCircle } from 'lucide-react';
import { App as CapApp } from '@capacitor/app';

export const BackButtonHandler = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const isDashboard = location.pathname === '/' || location.pathname === '/dashboard';

  // List of main navigation routes that should go to dashboard when back is pressed
  const mainRoutes = [
    '/directors',
    '/banks',
    '/reports',
    '/transactions',
    '/investments',
    '/users',
    '/customers',
    '/profile',
    '/transaction-menu',
    '/transaction-report'
  ];

  const isMainPage = mainRoutes.includes(location.pathname);

  useEffect(() => {
    // Handle Capacitor Back Button (for APK/Mobile)
    const setupCapacitor = async () => {
      try {
        const listener = await CapApp.addListener('backButton', ({ canGoBack }) => {
          // Dispatch custom back event for components to handle (e.g., closing modals)
          const event = new CustomEvent('app:back', { cancelable: true });
          const wasCancelled = !window.dispatchEvent(event);

          if (wasCancelled) {
            return;
          }

          if (isDashboard) {
            setShowExitConfirm(true);
          } else if (isMainPage) {
            navigate('/', { replace: true });
          } else if (canGoBack) {
            navigate(-1);
          } else {
            navigate('/', { replace: true });
          }
        });
        return listener;
      } catch (e) {
        // Not a capacitor environment
        return null;
      }
    };

    // Handle Browser Back Button (for Web)
    const handlePopState = (e: PopStateEvent) => {
      // Prevent browser from navigating immediately to maintain control
      window.history.pushState(null, '', window.location.pathname);

      const event = new CustomEvent('app:back', { cancelable: true });
      const wasCancelled = !window.dispatchEvent(event);

      if (wasCancelled) {
        return;
      }

      if (isDashboard) {
        setShowExitConfirm(true);
      } else if (isMainPage) {
        navigate('/', { replace: true });
      } else {
        // For sub-pages, attempt to go back
        navigate(-1);
      }
    };

    let capListener: any = null;
    setupCapacitor().then(l => capListener = l);

    window.history.pushState(null, '', window.location.pathname);
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (capListener) capListener.remove();
    };
  }, [isDashboard, navigate]);

  const handleExit = async () => {
    setShowExitConfirm(false);
    try {
      await CapApp.exitApp();
    } catch (e) {
      // Fallback for web
      alert('অ্যাপ থেকে বের হতে ব্রাউজার ট্যাব বন্ধ করুন।');
    }
  };

  return (
    <AnimatePresence>
      {showExitConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="bg-white rounded-[2rem] p-8 max-w-sm w-full shadow-2xl space-y-6 border border-slate-100"
          >
            <div className="text-center space-y-4">
              <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-3xl flex items-center justify-center mx-auto shadow-inner rotate-3 hover:rotate-0 transition-transform duration-300">
                <AlertCircle size={40} />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black text-slate-800 tracking-tight">অ্যাপ থেকে বের হবেন?</h3>
                <p className="text-slate-500 font-medium leading-relaxed">
                  আপনি কি নিশ্চিত যে আপনি অ্যাপ্লিকেশন থেকে বের হয়ে যেতে চান?
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => setShowExitConfirm(false)}
                className="flex-1 py-4 px-6 bg-slate-100 text-slate-700 font-black rounded-2xl hover:bg-slate-200 active:scale-95 transition-all flex items-center justify-center gap-2 group"
              >
                <X size={18} className="group-hover:rotate-90 transition-transform" />
                না
              </button>
              <button
                onClick={handleExit}
                className="flex-1 py-4 px-6 bg-rose-600 text-white font-black rounded-2xl shadow-lg shadow-rose-200 hover:bg-rose-700 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <LogOut size={18} />
                হ্যাঁ, বের হন
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
