import React, { useState } from 'react';
import { useAuth } from './AuthContext';
import { db } from './firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { updateEmail, updatePassword } from 'firebase/auth';
import { User, Mail, Lock, Shield, CheckCircle2, AlertCircle, Camera, Key } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { auth } from './firebase';

export const Profile = () => {
  const { user, role } = useAuth();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    password: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid || !auth.currentUser) return;
    setLoading(true);
    setError('');

    try {
      // 1. Update Email in Auth if changed
      if (formData.email !== auth.currentUser.email) {
        try {
          await updateEmail(auth.currentUser, formData.email);
        } catch (err: any) {
          if (err.code === 'auth/requires-recent-login') {
            throw new Error('ইমেইল পরিবর্তনের জন্য আপনাকে পুনরায় লগইন করতে হবে।');
          }
          throw err;
        }
      }

      // 2. Update Password in Auth if provided
      if (formData.password) {
        try {
          await updatePassword(auth.currentUser, formData.password);
        } catch (err: any) {
          if (err.code === 'auth/requires-recent-login') {
            throw new Error('পাসওয়ার্ড পরিবর্তনের জন্য আপনাকে পুনরায় লগইন করতে হবে।');
          }
          throw err;
        }
      }

      // 3. Update Firestore
      const userRef = doc(db, 'users', user.id || user.uid);
      await updateDoc(userRef, {
        name: formData.name,
        email: formData.email,
        updatedAt: serverTimestamp()
      });

      setSuccess(true);
      setFormData(prev => ({ ...prev, password: '' }));
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'তথ্য আপডেট করতে ব্যর্থ হয়েছে');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">প্রোফাইল</h2>
          <p className="text-sm font-medium text-slate-500">আপনার ব্যক্তিগত তথ্য পরিবর্তন করুন</p>
        </div>
        <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center shadow-sm">
          <User size={24} />
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
        <div className="bg-emerald-600 p-8 flex flex-col items-center text-white space-y-4">
          <div className="relative">
            <div className="w-24 h-24 rounded-3xl bg-white/20 backdrop-blur-md border-2 border-white/30 flex items-center justify-center overflow-hidden shadow-inner">
              <User size={48} className="text-white" />
            </div>
            <button className="absolute -bottom-2 -right-2 w-10 h-10 bg-white text-emerald-600 rounded-xl flex items-center justify-center shadow-lg hover:scale-110 transition-transform border-4 border-emerald-600">
              <Camera size={18} />
            </button>
          </div>
          <div className="text-center">
            <h3 className="text-2xl font-bold">{user?.name || 'ব্যবহারকারী'}</h3>
            <div className="mt-1 px-3 py-1 bg-white/20 rounded-full text-[10px] font-black uppercase tracking-widest backdrop-blur-sm">
              {role === 'super_admin' ? 'সুপার এডমিন' : role === 'admin' ? 'এডমিন' : 'পরিচালক'}
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-wider">আপনার নাম</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text"
                  required
                  className="w-full pl-12 pr-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-emerald-500 focus:bg-white focus:outline-none transition-all font-bold text-slate-700"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-wider">ইমেইল এড্রেস</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="email"
                  required
                  className="w-full pl-12 pr-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-emerald-500 focus:bg-white focus:outline-none transition-all font-bold text-slate-700"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-1 tracking-wider">নতুন পাসওয়ার্ড (ঐচ্ছিক)</label>
              <div className="relative">
                <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="password"
                  placeholder="পরিবর্তন করতে চাইলে নতুন পাসওয়ার্ড দিন"
                  className="w-full pl-12 pr-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-emerald-500 focus:bg-white focus:outline-none transition-all font-bold text-slate-700"
                  value={formData.password}
                  onChange={e => setFormData({ ...formData, password: e.target.value })}
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="p-4 bg-rose-50 text-rose-600 rounded-2xl border border-rose-100 text-xs font-bold flex items-center gap-2 animate-in slide-in-from-top-2">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <button 
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold text-lg hover:bg-slate-800 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3 shadow-xl shadow-slate-200"
          >
            {loading ? (
              <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : 'তথ্য আপডেট করুন'}
          </button>
        </form>
      </div>

      <AnimatePresence>
        {success && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-8 py-4 rounded-2xl font-black shadow-2xl flex items-center gap-3 z-[100]"
          >
            <CheckCircle2 size={24} />
            সফলভাবে আপডেট করা হয়েছে!
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
