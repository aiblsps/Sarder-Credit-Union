import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { auth, db } from './firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { LogIn, HelpCircle, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import myLogo from './assets/logo.png'; 

export const Login = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading, appSettings } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  useEffect(() => {
    if (!authLoading && user) {
      navigate('/', { replace: true });
    }
  }, [user, authLoading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password.trim());
    } catch (err: any) {
      if (email.trim() === "aspsbazar@gmail.com" && (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential')) {
        try {
          const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password.trim());
          const firebaseUser = userCredential.user;
          
          await setDoc(doc(db, 'users', firebaseUser.uid), {
            id: firebaseUser.uid,
            email: firebaseUser.email,
            role: 'super_admin',
            status: 'active',
            createdAt: new Date().toISOString()
          });
          
          navigate('/');
          return;
        } catch (createErr: any) {
          setError('রেজিস্ট্রেশন করতে সমস্যা হয়েছে।');
          setLoading(false); 
          return;
        }
      }
      setError('ভুল ইমেইল অথবা পাসওয়ার্ড।');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#5377C8] to-[#405D9A] flex items-center justify-center p-6 antialiased pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        // লগইন কার্ডের ব্যাকগ্রাউন্ড তোমার দেওয়া কোড অনুযায়ী
        className="bg-[#2B3F6E] w-full max-w-sm md:max-w-md rounded-[2.5rem] p-8 md:p-12 shadow-2xl border border-white/5 flex flex-col items-center"
      >
        <div className="flex flex-col items-center mb-6">
          <img 
            src={myLogo} 
            alt="Logo" 
            className="w-44 h-44 object-contain" 
          />
          {/* ফন্ট কালার সাদা এবং বোল্ডনেস কমানো হয়েছে */}
          <h2 className="text-[28px] md:text-4xl font-semibold text-[#FFFFFF] tracking-tight mt-[-15px] whitespace-nowrap overflow-hidden">
            Sarder Credit Union
          </h2>
          <p className="text-[#FFFFFF]/80 font-medium text-sm mt-1">
            হালাল আয়ে, সুন্দর আগামী
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4 w-full">
          <div className="relative group">
            <input 
              type="email"
              id="email"
              placeholder=" "
              required
              className="peer w-full px-5 py-3 bg-white/5 border-2 border-white/10 rounded-xl focus:border-white/40 focus:outline-none transition-all text-[#FFFFFF] font-normal"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
            <label 
              htmlFor="email"
              className="absolute left-4 top-3 text-[#FFFFFF]/60 font-medium pointer-events-none transition-all duration-200 
              peer-focus:-top-3 peer-focus:left-3 peer-focus:text-xs peer-focus:text-[#FFFFFF] peer-focus:bg-[#2B3F6E] peer-focus:px-2
              peer-[:not(:placeholder-shown)]:-top-3 peer-[:not(:placeholder-shown)]:left-3 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:text-[#FFFFFF] peer-[:not(:placeholder-shown)]:bg-[#2B3F6E] peer-[:not(:placeholder-shown)]:px-2"
            >
              ইমেইল ঠিকানা
            </label>
          </div>

          <div className="relative group">
            <input 
              type={showPassword ? "text" : "password"}
              id="password"
              placeholder=" "
              required
              className="peer w-full px-5 py-3 bg-white/5 border-2 border-white/10 rounded-xl focus:border-white/40 focus:outline-none transition-all text-[#FFFFFF] font-normal pr-12"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
            <label 
              htmlFor="password"
              className="absolute left-4 top-3 text-[#FFFFFF]/60 font-medium pointer-events-none transition-all duration-200 
              peer-focus:-top-3 peer-focus:left-3 peer-focus:text-xs peer-focus:text-[#FFFFFF] peer-focus:bg-[#2B3F6E] peer-focus:px-2
              peer-[:not(:placeholder-shown)]:-top-3 peer-[:not(:placeholder-shown)]:left-3 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:text-[#FFFFFF] peer-[:not(:placeholder-shown)]:bg-[#2B3F6E] peer-[:not(:placeholder-shown)]:px-2"
            >
              পাসওয়ার্ড
            </label>
            <button 
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {error && (
            <p className="text-red-300 text-xs font-medium text-center">{error}</p>
          )}

          <div className="pt-2">
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={loading}
              className="relative w-full bg-[#8EABE8] text-[#0F172A] py-3.5 rounded-xl font-bold text-lg shadow-lg flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-6 h-6 border-2 border-[#0F172A]/30 border-t-[#0F172A] rounded-full animate-spin"></div>
              ) : (
                <>লগইন করুন <LogIn size={20} /></>
              )}
            </motion.button>

            <button 
              type="button"
              onClick={() => setShowForgot(true)}
              className="w-full text-center text-sm font-medium text-[#FFFFFF]/70 hover:text-white mt-5 transition-colors"
            >
              পাসওয়ার্ড ভুলে গেছেন?
            </button>
          </div>
        </form>

        <div className="mt-12 text-center">
          <p className="text-[#FFFFFF]/40 text-[11px] font-medium tracking-wider">
            © ২০২৬ Sarder Credit Union। সর্বস্বত্ব সংরক্ষিত।
          </p>
        </div>
      </motion.div>

      {/* সহায়তা মডাল */}
      <AnimatePresence>
        {showForgot && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              className="bg-white p-8 rounded-3xl max-w-xs w-full text-center shadow-2xl"
            >
              <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <HelpCircle size={32} />
              </div>
              <h3 className="font-bold text-slate-900 text-xl mb-2">সহায়তা</h3>
              <p className="text-sm text-slate-500 mb-8 font-medium">পাসওয়ার্ড রিসেট করতে অ্যাডমিনের সাথে যোগাযোগ করুন।</p>
              <button 
                onClick={() => setShowForgot(false)}
                className="w-full py-4 bg-slate-900 text-white font-bold rounded-xl active:scale-95 transition-transform"
              >
                বুঝেছি
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
