import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, getDocs, query, where, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, secondaryAuth } from './firebase';
import { useAuth } from './AuthContext';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { Plus, UserPlus, Shield, User as UserIcon, Trash2, AlertTriangle, Users, Check, X, Edit2, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { auth } from './firebase';

export const UserManagement = () => {
  const { role, user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'users' | 'pending'>('users'); // 'settings' অপশন বাদ দেওয়া হয়েছে
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [pendingUsers, setPendingUsers] = useState<any[]>([]);
  const [errorModal, setErrorModal] = useState<string | null>(null);
  const [successModal, setSuccessModal] = useState<string | null>(null);
  const [directors, setDirectors] = useState<any[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [newRole, setNewRole] = useState('');
  const [editSignatureUrl, setEditSignatureUrl] = useState('');
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    role: 'director',
    directorId: '',
    signatureUrl: ''
  });

  const [showDeleteUserConfirm, setShowDeleteUserConfirm] = useState<any>(null);

  useEffect(() => {
    const onBack = (e: Event) => {
      if (showAddModal) {
        e.preventDefault();
        setShowAddModal(false);
      } else if (editingUser) {
        e.preventDefault();
        setEditingUser(null);
      } else if (showDeleteUserConfirm) {
        e.preventDefault();
        setShowDeleteUserConfirm(null);
      } else if (successModal) {
        e.preventDefault();
        setSuccessModal(null);
      } else if (errorModal) {
        e.preventDefault();
        setErrorModal(null);
      }
    };
    window.addEventListener('app:back', onBack);
    return () => window.removeEventListener('app:back', onBack);
  }, [showAddModal, editingUser, showDeleteUserConfirm, successModal, errorModal]);

  useEffect(() => {
    console.log("UserManagement: Role is", role);
    if (role !== 'super_admin' && role !== 'admin') {
      console.warn("UserManagement: Access denied for role", role);
      return;
    }

    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      console.log("UserManagement: Fetched", snap.size, "users");
      setUsers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.error("UserManagement: Firestore error fetching users:", error);
      handleFirestoreError(error, OperationType.LIST, 'users');
    });
    
    const unsubPending = onSnapshot(collection(db, 'pending_users'), (snap) => {
      setPendingUsers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'pending_users');
    });

    const unsubDirectors = onSnapshot(collection(db, 'directors'), (snap) => {
      setDirectors(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'directors');
    });

    return () => { unsubUsers(); unsubPending(); unsubDirectors(); };
  }, [role]);

  const handleAcceptRequest = async (pendingUser: any) => {
    setLoading(true);
    try {
      let firebaseUser;
      try {
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, pendingUser.email.trim(), pendingUser.password);
        firebaseUser = userCredential.user;
      } catch (authError: any) {
        if (authError.code === 'auth/email-already-in-use') {
          try {
            const userCredential = await signInWithEmailAndPassword(secondaryAuth, pendingUser.email.trim(), pendingUser.password);
            firebaseUser = userCredential.user;
          } catch (signInError: any) {
            throw authError;
          }
        } else {
          throw authError;
        }
      }

      const userRef = doc(db, 'users', firebaseUser.uid);
      await setDoc(userRef, {
        ...pendingUser,
        id: firebaseUser.uid,
        status: 'active',
        createdAt: new Date().toISOString()
      });
      await deleteDoc(doc(db, 'pending_users', pendingUser.id));
      setSuccessModal('ইউজার রিকোয়েস্ট সফলভাবে গ্রহণ করা হয়েছে।');
    } catch (err: any) {
      setErrorModal(err.code === 'auth/email-already-in-use' ? 'এই ইমেইলটি ইতিমধ্যে ব্যবহার করা হয়েছে।' : 'রিকোয়েস্ট গ্রহণ করতে সমস্যা হয়েছে');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    setLoading(true);
    try {
      const updateData: any = { role: newRole };
      if (newRole === 'admin' || newRole === 'super_admin') {
        updateData.signatureUrl = editSignatureUrl;
      }
      await updateDoc(doc(db, 'users', editingUser.id), updateData);
      setEditingUser(null);
      setNewRole('');
      setEditSignatureUrl('');
      setSuccessModal('ইউজার তথ্য সফলভাবে আপডেট করা হয়েছে।');
    } catch (err) {
      setErrorModal('তথ্য আপডেট করতে সমস্যা হয়েছে');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userToDelete: any) => {
    if (role !== 'super_admin' || userToDelete.id === currentUser?.id) {
      setErrorModal(userToDelete.id === currentUser?.id ? "আপনি নিজেকে ডিলিট করতে পারবেন না।" : "আপনার পারমিশন নেই।");
      return;
    }
    
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'users', userToDelete.id));
      setSuccessModal('ইউজার সফলভাবে ডিলিট করা হয়েছে।');
      setShowDeleteUserConfirm(null);
    } catch (error) {
      setErrorModal("ইউজার ডিলিট করতে সমস্যা হয়েছে");
    } finally {
      setLoading(false);
      setShowDeleteUserConfirm(null); // মোডাল বন্ধ নিশ্চিত করা
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, formData.email.trim(), formData.password);
      const firebaseUser = userCredential.user;

      await setDoc(doc(db, 'users', firebaseUser.uid), {
        id: firebaseUser.uid,
        email: formData.email.trim(),
        role: formData.role,
        directorId: formData.directorId,
        signatureUrl: formData.signatureUrl,
        createdAt: new Date().toISOString()
      });

      setShowAddModal(false);
      setFormData({ email: '', password: '', role: 'director', directorId: '', signatureUrl: '' });
      setSuccessModal('ইউজার সফলভাবে তৈরি করা হয়েছে।');
    } catch (error: any) {
      setErrorModal(error.code === 'auth/email-already-in-use' ? 'এই ইমেইলটি ইতিমধ্যে ব্যবহার করা হয়েছে।' : "ইউজার তৈরি করতে সমস্যা হয়েছে");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-slate-800 tracking-tight">এডমিন প্যানেল</h2>
        <button 
          onClick={() => setShowAddModal(true)}
          className="bg-slate-900 text-white p-3 rounded-2xl shadow-lg hover:bg-slate-800 transition-all active:scale-95"
        >
          <UserPlus size={20} />
        </button>
      </div>

      {/* Tabs - Settings removed */}
      <div className="flex bg-white p-1.5 rounded-2xl border border-slate-100 shadow-sm">
        <button 
          onClick={() => setActiveTab('users')}
          className={cn(
            "flex-1 py-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2",
            activeTab === 'users' ? "bg-slate-900 text-white shadow-md" : "text-slate-400 hover:text-slate-600"
          )}
        >
          <Users size={16} />
          সকল ইউজার
        </button>
        <button 
          onClick={() => setActiveTab('pending')}
          className={cn(
            "flex-1 py-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 relative",
            activeTab === 'pending' ? "bg-slate-900 text-white shadow-md" : "text-slate-400 hover:text-slate-600"
          )}
        >
          <UserPlus size={16} />
          পেন্ডিং রিকোয়েস্ট
          {pendingUsers.length > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center border-2 border-white">
              {pendingUsers.length}
            </span>
          )}
        </button>
      </div>

      {/* Debug Info - Only for Super Admin */}
      {role === 'super_admin' && (
        <div className="bg-slate-900 text-[10px] text-slate-400 p-4 rounded-2xl font-mono">
          <p>DEBUG INFO:</p>
          <p>Users in DB: {users.length}</p>
          <p>Pending in DB: {pendingUsers.length}</p>
          <p>Directors in DB: {directors.length}</p>
          <p>Current Role: {role}</p>
        </div>
      )}

      <div className="space-y-3">
        {activeTab === 'users' ? (
          users.length > 0 ? (
            users.map(u => (
              <div key={u.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "p-2.5 rounded-xl",
                    u.role === 'super_admin' ? "bg-purple-50 text-purple-600" :
                    u.role === 'admin' ? "bg-blue-50 text-blue-600" : "bg-slate-50 text-slate-600"
                  )}>
                    {u.role === 'super_admin' ? <Shield size={18} /> : <UserIcon size={18} />}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800 text-sm">{u.email}</h4>
                    <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">
                      {u.role === 'super_admin' ? 'সুপার এডমিন' : u.role === 'admin' ? 'এডমিন' : 'পরিচালক'}
                    </p>
                  </div>
                </div>
                {role === 'super_admin' && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => { 
                      setEditingUser(u); 
                      setNewRole(u.role || 'director'); 
                      setEditSignatureUrl(u.signatureUrl || '');
                    }} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all">
                      <Edit2 size={16} />
                    </button>
                    <button onClick={() => setShowDeleteUserConfirm(u)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all">
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="bg-white rounded-3xl border border-dashed border-slate-200 p-12 text-center">
              <p className="text-slate-400 font-bold text-sm">কোন ইউজার পাওয়া যায়নি</p>
            </div>
          )
        ) : (
          pendingUsers.length > 0 ? (
            pendingUsers.map(u => (
              <div key={u.id} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
                    <UserIcon size={18} />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800 text-sm">{u.email}</h4>
                    <p className="text-[10px] text-slate-400 font-bold">{u.name || 'প্রযোজ্য নয়'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleAcceptRequest(u)} className="p-2 text-emerald-500 hover:bg-emerald-50 rounded-xl transition-colors">
                    <Check size={20} />
                  </button>
                  <button onClick={() => deleteDoc(doc(db, 'pending_users', u.id))} className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-colors">
                    <X size={20} />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="bg-white rounded-3xl border border-dashed border-slate-200 p-12 text-center">
              <p className="text-slate-400 font-bold text-sm">কোন পেন্ডিং রিকোয়েস্ট নেই</p>
            </div>
          )
        )}
      </div>

      {/* Delete Confirmation */}
      <AnimatePresence>
        {showDeleteUserConfirm && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 text-center space-y-6">
              <div className="w-20 h-20 bg-rose-50 text-rose-600 rounded-3xl flex items-center justify-center mx-auto rotate-12">
                <Trash2 size={40} />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-black text-slate-800">ইউজার ডিলিট করুন</h3>
                <p className="text-slate-500 text-sm font-bold">আপনি কি নিশ্চিত যে <span className="text-slate-800">{showDeleteUserConfirm.email}</span> কে ডিলিট করতে চান?</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowDeleteUserConfirm(null)} className="flex-1 py-4 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200">বাতিল</button>
                <button onClick={() => handleDeleteUser(showDeleteUserConfirm)} disabled={loading} className="flex-1 py-4 bg-rose-600 text-white font-bold rounded-2xl shadow-lg shadow-rose-200">
                  {loading ? 'মুছে ফেলা হচ্ছে...' : 'ডিলিট'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Success Modal */}
      <AnimatePresence>
        {successModal && (
          <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 text-center space-y-6">
              <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto">
                <CheckCircle2 size={40} />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-black text-slate-800">সফল হয়েছে</h3>
                <p className="text-slate-500 text-sm font-bold">{successModal}</p>
              </div>
              <button onClick={() => setSuccessModal(null)} className="w-full py-4 bg-emerald-600 text-white font-black rounded-2xl shadow-lg shadow-emerald-200">ঠিক আছে</button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Error Modal - UI Same as Success */}
      <AnimatePresence>
        {errorModal && (
          <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 text-center space-y-6">
              <div className="w-20 h-20 bg-rose-50 text-rose-600 rounded-3xl flex items-center justify-center mx-auto">
                <AlertTriangle size={40} />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-black text-slate-800">সতর্কবার্তা</h3>
                <p className="text-slate-500 text-sm font-bold">{errorModal}</p>
              </div>
              <button onClick={() => setErrorModal(null)} className="w-full py-4 bg-slate-900 text-white font-black rounded-2xl">ঠিক আছে</button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* User Add/Edit Modals (Simplified) */}
      <AnimatePresence>
        {editingUser && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="bg-white w-full max-w-md rounded-[2.5rem] p-8">
              <h3 className="text-xl font-black text-slate-800 mb-6 tracking-tight">ইউজার তথ্য এডিট করুন</h3>
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">ইমেইল (পরিবর্তনযোগ্য নয়)</label>
                  <input type="email" disabled className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold opacity-60" value={editingUser.email} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">ইউজার রোল</label>
                  <select className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-emerald-500 focus:outline-none font-bold" value={newRole} onChange={e => setNewRole(e.target.value)}>
                    <option value="director">পরিচালক</option>
                    <option value="admin">এডমিন</option>
                    <option value="super_admin">সুপার এডমিন</option>
                  </select>
                </div>
                {(newRole === 'admin' || newRole === 'super_admin') && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">স্বাক্ষর URL (Signature URL)</label>
                    <input type="url" className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-emerald-500 focus:outline-none font-bold" placeholder="https://example.com/signature.png" value={editSignatureUrl} onChange={e => setEditSignatureUrl(e.target.value)} />
                  </div>
                )}
                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setEditingUser(null)} className="flex-1 py-4 text-slate-400 font-bold">বাতিল</button>
                  <button type="button" onClick={handleUpdateUser} disabled={loading} className="flex-1 py-4 bg-slate-900 text-white font-black rounded-2xl shadow-xl">আপডেট করুন</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {showAddModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="bg-white w-full max-w-md rounded-[2.5rem] p-8">
              <h3 className="text-xl font-black text-slate-800 mb-6 tracking-tight">নতুন ইউজার তৈরি করুন</h3>
              <form onSubmit={handleAddUser} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">ইমেইল এড্রেস</label>
                  <input type="email" required className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-emerald-500 focus:outline-none font-bold" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">পাসওয়ার্ড</label>
                  <input type="text" required className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-emerald-500 focus:outline-none font-bold" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">ইউজার রোল</label>
                  <select className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-emerald-500 focus:outline-none font-bold" value={formData.role} onChange={e => setFormData({...formData, role: e.target.value as any})}>
                    <option value="director">পরিচালক</option>
                    <option value="admin">এডমিন</option>
                    <option value="super_admin">সুপার এডমিন</option>
                  </select>
                </div>
                {(formData.role === 'admin' || formData.role === 'super_admin') && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">স্বাক্ষর URL (Signature URL)</label>
                    <input type="url" className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-emerald-500 focus:outline-none font-bold" placeholder="https://example.com/signature.png" value={formData.signatureUrl} onChange={e => setFormData({...formData, signatureUrl: e.target.value})} />
                  </div>
                )}
                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 py-4 text-slate-400 font-bold">বাতিল</button>
                  <button type="submit" disabled={loading} className="flex-1 py-4 bg-slate-900 text-white font-black rounded-2xl shadow-xl">তৈরি করুন</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
