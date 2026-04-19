import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { db, auth } from './firebase';
import { collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { UserPlus, User as UserIcon, Mail, Phone, Key, TrendingUp, CheckCircle2 } from 'lucide-react';

export const Register = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    mobile: '',
    email: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Check if email already exists in users or pending_users
      const usersRef = collection(db, 'users');
      const pendingRef = collection(db, 'pending_users');
      
      const [userSnap, pendingSnap] = await Promise.all([
        getDocs(query(usersRef, where('email', '==', formData.email.trim()))),
        getDocs(query(pendingRef, where('email', '==', formData.email.trim())))
      ]);

      if (!userSnap.empty) {
        setError('এই ইমেইলটি ইতিমধ্যে নিবন্ধিত আছে। অনুগ্রহ করে লগইন করুন।');
        setLoading(false);
        return;
      }

      if (!pendingSnap.empty) {
        setError('আপনার আবেদনটি ইতিমধ্যে পেন্ডিং আছে। অনুগ্রহ করে এডমিনের অনুমোদনের জন্য অপেক্ষা করুন।');
        setLoading(false);
        return;
      }
      
      // Add to pending_users
      await addDoc(pendingRef, {
        ...formData,
        role: 'director',
        status: 'pending',
        createdAt: serverTimestamp()
      });

      setSuccess(true);
    } catch (err: any) {
      console.error("Registration error:", err);
      setError('রেজিষ্ট্রেশন ব্যর্থ হয়েছে। আবার চেষ্টা করুন।');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl p-10 text-center border border-slate-200">
          <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={48} />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-4">রেজিষ্ট্রেশন সফল!</h2>
          <p className="text-slate-500 mb-10 leading-relaxed font-medium">
            আপনার আবেদনটি এডমিনের কাছে পাঠানো হয়েছে। সুপার এডমিন অনুমোদন করার পর আপনি লগইন করতে পারবেন।
          </p>
          <button 
            onClick={() => navigate('/login')}
            className="w-full bg-slate-900 text-white py-5 rounded-2xl font-bold text-lg hover:bg-slate-800 transition-all shadow-xl shadow-slate-200"
          >
            লগইন পেজে ফিরে যান
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-200">
        <div className="p-10">
          <div className="flex justify-center mb-8">
            <div className="w-20 h-20 bg-emerald-600 rounded-3xl flex items-center justify-center shadow-xl shadow-emerald-200 rotate-3">
              <TrendingUp size={40} className="text-white -rotate-3" />
            </div>
          </div>
          
          <h2 className="text-2xl font-bold text-slate-800 text-center mb-2">রেজিষ্ট্রেশন করুন</h2>
          <p className="text-center text-slate-400 text-sm mb-8 font-medium">পরিচালক হিসেবে যোগ দিতে আপনার তথ্য দিন</p>

          <form onSubmit={handleRegister} className="space-y-5">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-2">পুরো নাম</label>
              <div className="relative">
                <UserIcon className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                <input 
                  type="text"
                  name="name"
                  placeholder="আপনার নাম"
                  required
                  className="w-full pl-12 pr-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all font-medium"
                  value={formData.name}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-2">মোবাইল নাম্বার</label>
              <div className="relative">
                <Phone className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                <input 
                  type="tel"
                  name="mobile"
                  placeholder="মোবাইল নাম্বার"
                  required
                  className="w-full pl-12 pr-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all font-medium"
                  value={formData.mobile}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-2">ইমেইল</label>
              <div className="relative">
                <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                <input 
                  type="email"
                  name="email"
                  placeholder="ইমেইল এড্রেস"
                  required
                  className="w-full pl-12 pr-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all font-medium"
                  value={formData.email}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-2">পাসওয়ার্ড</label>
              <div className="relative">
                <Key className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                <input 
                  type="password"
                  name="password"
                  placeholder="পাসওয়ার্ড দিন"
                  required
                  className="w-full pl-12 pr-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all font-medium"
                  value={formData.password}
                  onChange={handleChange}
                />
              </div>
            </div>

            {error && (
              <div className="bg-rose-50 text-rose-600 text-xs font-bold p-4 rounded-2xl border-2 border-rose-100">
                {error}
              </div>
            )}

            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold text-lg hover:bg-slate-800 transition-all active:scale-[0.97] shadow-xl shadow-slate-200 disabled:opacity-50"
            >
              {loading ? 'প্রসেসিং...' : 'রেজিষ্ট্রেশন সম্পন্ন করুন'}
            </button>
          </form>

          <div className="mt-8 text-center">
            <p className="text-slate-500 text-sm font-medium">
              ইতিমধ্যে অ্যাকাউন্ট আছে? <Link to="/login" className="text-emerald-600 font-bold hover:underline">লগইন করুন</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
