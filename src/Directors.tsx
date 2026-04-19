import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, query, where, orderBy, serverTimestamp, getDocs, writeBatch, increment } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { useAuth } from './AuthContext';
import { formatCurrency, toBengaliNumber, getDirectDriveUrl } from './lib/utils';
import { Plus, Search, UserPlus, Phone, Mail, MapPin, Briefcase, Trash2, Edit, ChevronRight, X, ArrowLeft, Wallet, History, User, Camera, MoreVertical, List, ChevronDown, Info, FileText, Award, Eye, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { DataTable } from './components/DataTable';

export const Directors = () => {
  const { role, user } = useAuth();
  const [directors, setDirectors] = useState<any[]>(() => {
    const saved = localStorage.getItem('cache_directors');
    return saved ? JSON.parse(saved) : [];
  });
  const [errorModal, setErrorModal] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingDirector, setEditingDirector] = useState<any>(null);
  const [selectedDirector, setSelectedDirector] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'info' | 'transactions' | 'list'>('list');
  const [transactions, setTransactions] = useState<any[]>(() => {
    // We don't cache all transactions globally, but we can cache the last viewed director's transactions
    const saved = localStorage.getItem('cache_director_transactions_last');
    return saved ? JSON.parse(saved) : [];
  });
  const [success, setSuccess] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [activeMenuDirector, setActiveMenuDirector] = useState<any>(null);
  const [appUsers, setAppUsers] = useState<any[]>([]);
  const [menuPosition, setMenuPosition] = useState<{ top: number, left: number } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    fatherName: '',
    mobile: '',
    profession: '',
    address: '',
    email: '',
    photoUrl: ''
  });

  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  useEffect(() => {
    const handleEnter = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        if (showConfirmModal) {
          e.preventDefault();
          const confirmBtn = document.getElementById('director-confirm-btn');
          if (confirmBtn) confirmBtn.click();
        } else if (showAddModal) {
          e.preventDefault();
          const submitBtn = document.getElementById('director-submit-btn');
          if (submitBtn) submitBtn.click();
        }
      }
    };
    window.addEventListener('keydown', handleEnter);
    return () => window.removeEventListener('keydown', handleEnter);
  }, [showConfirmModal, showAddModal]);

  const [transactionType, setTransactionType] = useState<'deposit' | 'withdrawal' | 'profit_distribution' | 'profit_withdraw'>('deposit');
  const [transactionData, setTransactionData] = useState({
    amount: '',
    date: new Date().toISOString().split('T')[0],
    note: ''
  });

  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{ id: string, type: 'director' | 'transaction', data?: any } | null>(null);

  useEffect(() => {
    const onBack = (e: Event) => {
      if (selectedDirector) {
        e.preventDefault();
        setSelectedDirector(null);
        setActiveTab('list');
      } else if (showAddModal) {
        e.preventDefault();
        setShowAddModal(false);
      } else if (showTransactionModal) {
        e.preventDefault();
        setShowTransactionModal(false);
      }
    };
    window.addEventListener('app:back', onBack);
    return () => window.removeEventListener('app:back', onBack);
  }, [selectedDirector, showAddModal, showTransactionModal]);

  const directorColumns = [
    { header: 'ক্রমিক', render: (_: any, idx: number) => toBengaliNumber(idx + 1), className: "text-center font-bold text-slate-400" },
    { 
      header: 'ছবি', 
      render: (director: any) => (
        <div className="w-8 h-8 rounded-lg bg-slate-100 overflow-hidden border border-slate-200">
          {director.photoUrl ? (
            <img 
              src={getDirectDriveUrl(director.photoUrl)} 
              alt="" 
              className="w-full h-full object-cover" 
              referrerPolicy="no-referrer"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400">
              <User size={16} />
            </div>
          )}
        </div>
      )
    },
    { header: 'নাম', accessor: 'name', className: "font-bold text-slate-800" },
    { 
      header: 'মোবাইল', 
      render: (director: any) => (
        <a 
          href={`tel:${director.mobile}`}
          className="font-mono text-emerald-600 hover:text-emerald-700 hover:underline transition-colors"
        >
          {director.mobile}
        </a>
      )
    },
    { header: 'পেশা', accessor: 'profession' },
    { header: 'ব্যালেন্স', render: (director: any) => formatCurrency(director.balance), className: "text-right font-bold text-emerald-600" },
    { header: 'মুনাফা ব্যালেন্স', render: (director: any) => formatCurrency(director.profitBalance || 0), className: "text-center font-bold text-blue-600" },
    { 
      header: 'একশন', 
      render: (director: any) => (
        <div className="flex justify-center gap-3 py-1 scale-90 md:scale-100">
          <button 
            onClick={(e) => handleMenuToggle(e, director)}
            className="flex items-center gap-2 px-4 h-12 bg-[#f0f9ff] border border-blue-100 rounded-2xl text-blue-600 transition-all active:scale-95 shadow-sm hover:bg-blue-50"
          >
            <List size={22} strokeWidth={2.5} />
            <ChevronDown size={20} strokeWidth={2.5} />
          </button>
        </div>
      ),
      className: 'text-center min-w-[120px]',
      headerClassName: "text-center"
    }
  ];

  const transactionColumns = [
    { header: 'ক্রমিক', render: (_: any, idx: number) => toBengaliNumber(idx + 1), className: "text-center font-bold text-slate-400" },
    { 
      header: 'তারিখ', 
      accessor: 'date', 
      className: "font-['SolaimanLipi']",
      render: (tr: any) => toBengaliNumber(tr.date.split('-').reverse().join('-'))
    },
    { header: 'বিবরণ', accessor: 'note', className: "text-slate-500 italic" },
    { 
      header: 'জমা', 
      render: (tr: any) => tr.type === 'deposit' ? formatCurrency(tr.amount) : toBengaliNumber(0),
      className: "text-right text-emerald-600 font-bold"
    },
    { 
      header: 'উত্তোলন', 
      render: (tr: any) => tr.type === 'withdrawal' ? formatCurrency(tr.amount) : toBengaliNumber(0),
      className: "text-right text-rose-600 font-bold"
    },
    { 
      header: 'মুনাফা গ্রহণ', 
      render: (tr: any) => tr.type === 'profit_distribution' ? formatCurrency(tr.amount) : toBengaliNumber(0),
      className: "text-right text-blue-600 font-bold"
    },
    { 
      header: 'মুনাফা উত্তোলন', 
      render: (tr: any) => tr.type === 'profit_withdraw' ? formatCurrency(tr.amount) : toBengaliNumber(0),
      className: "text-right text-amber-600 font-bold"
    },
    { 
      header: 'প্রক্রিয়াকারী', 
      render: (tr: any) => {
        const procUser = appUsers.find(u => u.email === tr.processedBy);
        return procUser?.name || tr.processedBy || '---';
      },
      className: "text-[10px] font-bold text-slate-500"
    },
    { 
      header: 'একশন', 
      render: (tr: any) => (
        <div className="flex justify-center">
          {role === 'super_admin' && (
            <button 
              onClick={() => setShowDeleteConfirm({ id: tr.id, type: 'transaction', data: tr })}
              className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      ),
      headerClassName: "text-center"
    }
  ];

  const handleTransactionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDirector) return;

    const amount = parseFloat(transactionData.amount);
    if (isNaN(amount) || amount <= 0) return;

    try {
      const batch = writeBatch(db);
      const trRef = doc(collection(db, 'director_transactions'));
      batch.set(trRef, {
        directorId: selectedDirector.id,
        amount,
        type: transactionType,
        date: transactionData.date,
        note: transactionData.note,
        processedBy: user?.name || user?.displayName || user?.email || 'Admin',
        createdAt: serverTimestamp()
      });

      const directorRef = doc(db, 'directors', selectedDirector.id);
      const updateData: any = {};

      if (transactionType === 'deposit') {
        updateData.totalDeposit = increment(amount);
        updateData.balance = increment(amount);
      } else if (transactionType === 'withdrawal') {
        updateData.totalWithdrawal = increment(amount);
        updateData.balance = increment(-amount);
      } else if (transactionType === 'profit_distribution') {
        updateData.totalProfitReceived = increment(amount);
        updateData.profitBalance = increment(amount);
      } else if (transactionType === 'profit_withdraw') {
        updateData.totalProfitWithdrawn = increment(amount);
        updateData.profitBalance = increment(-amount);
      }

      batch.update(directorRef, updateData);
      await batch.commit();
      
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
      setShowTransactionModal(false);
      setTransactionData({ amount: '', date: new Date().toISOString().split('T')[0], note: '' });
    } catch (error) {
      console.error("Error saving transaction:", error);
    }
  };

  useEffect(() => {
    if (!role) return;
    const unsub = onSnapshot(collection(db, 'directors'), (snap) => {
      const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setDirectors(docs);
      localStorage.setItem('cache_directors', JSON.stringify(docs));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'directors');
    });
    return unsub;
  }, [role]);

  useEffect(() => {
    if (!role) return;
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      setAppUsers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });
    return unsub;
  }, [role]);

  useEffect(() => {
    if (!role) return;
    if (selectedDirector) {
      // Try to load from specific cache for this director
      const saved = localStorage.getItem(`cache_director_transactions_${selectedDirector.id}`);
      if (saved) {
        setTransactions(JSON.parse(saved));
      }

      const q = query(
        collection(db, 'director_transactions'),
        where('directorId', '==', selectedDirector.id)
      );
      const unsub = onSnapshot(q, (snap) => {
        const trs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        trs.sort((a: any, b: any) => {
          const dateA = a.createdAt?.seconds || 0;
          const dateB = b.createdAt?.seconds || 0;
          return dateB - dateA;
        });
        setTransactions(trs);
        localStorage.setItem(`cache_director_transactions_${selectedDirector.id}`, JSON.stringify(trs));
        localStorage.setItem('cache_director_transactions_last', JSON.stringify(trs));
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'director_transactions');
      });
      return unsub;
    }
  }, [selectedDirector, role]);

  useEffect(() => {
    // Removed scroll listener that closed the menu
  }, []);

  const stats = selectedDirector ? transactions.reduce((acc, tr) => {
    if (tr.type === 'deposit') acc.totalDeposit += tr.amount;
    if (tr.type === 'withdrawal') acc.totalWithdrawal += tr.amount;
    if (tr.type === 'profit_distribution') acc.totalProfitReceived += tr.amount;
    if (tr.type === 'profit_withdraw') acc.totalProfitWithdrawn += tr.amount;
    return acc;
  }, { totalDeposit: 0, totalWithdrawal: 0, totalProfitReceived: 0, totalProfitWithdrawn: 0 }) : { totalDeposit: 0, totalWithdrawal: 0, totalProfitReceived: 0, totalProfitWithdrawn: 0 };

  const currentBalance = stats.totalDeposit - stats.totalWithdrawal;
  const currentProfitBalance = stats.totalProfitReceived - stats.totalProfitWithdrawn;

  const handleMenuToggle = (e: React.MouseEvent, director: any) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuPosition({ 
      top: rect.bottom + window.scrollY + 8, 
      left: rect.right + window.scrollX - 192
    });
    if (openMenuId === director.id) {
      setOpenMenuId(null);
      setActiveMenuDirector(null);
    } else {
      setOpenMenuId(director.id);
      setActiveMenuDirector(director);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (role !== 'super_admin' && editingDirector) return;

    if (!showConfirmModal) {
      setShowConfirmModal(true);
      return;
    }

    setShowConfirmModal(false);
    setIsSubmitting(true);

    try {
      const processedData = {
        ...formData,
        photoUrl: getDirectDriveUrl(formData.photoUrl)
      };

      if (editingDirector) {
        await updateDoc(doc(db, 'directors', editingDirector.id), {
          ...processedData,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'directors'), {
          ...processedData,
          totalDeposit: 0,
          totalWithdrawal: 0,
          balance: 0,
          totalProfitReceived: 0,
          totalProfitWithdrawn: 0,
          profitBalance: 0,
          createdAt: serverTimestamp()
        });
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
      setShowAddModal(false);
      setEditingDirector(null);
      setFormData({ 
        name: '', 
        fatherName: '',
        mobile: '', 
        profession: '', 
        address: '', 
        email: '', 
        photoUrl: '' 
      });
    } catch (error) {
      console.error("Error saving director:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteDirector = async (id: string) => {
    const director = directors.find(d => d.id === id);
    if (director && director.balance !== 0) {
      setErrorModal('পরিচালকের ব্যালেন্স জিরো না হওয়া পর্যন্ত ডিলিট করা যাবে না। দয়া করে আগে ব্যালেন্স উত্তোলন করুন।');
      setShowDeleteConfirm(null);
      return;
    }
    try {
      await deleteDoc(doc(db, 'directors', id));
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
      setShowDeleteConfirm(null);
    } catch (error) {
      console.error('Error deleting director:', error);
      setErrorModal("পরিচালক ডিলিট করতে সমস্যা হয়েছে");
    }
  };

  const handleDeleteTransaction = async (tr: any) => {
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'director_transactions', tr.id));
      
      const directorRef = doc(db, 'directors', tr.directorId);
      if (tr.type === 'deposit') {
        batch.update(directorRef, {
          totalDeposit: increment(-tr.amount),
          balance: increment(-tr.amount)
        });
      } else if (tr.type === 'withdrawal') {
        batch.update(directorRef, {
          totalWithdrawal: increment(-tr.amount),
          balance: increment(tr.amount)
        });
      } else if (tr.type === 'profit_distribution') {
        batch.update(directorRef, {
          totalProfitReceived: increment(-tr.amount),
          profitBalance: increment(-tr.amount)
        });
      } else if (tr.type === 'profit_withdraw') {
        batch.update(directorRef, {
          totalProfitWithdrawn: increment(-tr.amount),
          profitBalance: increment(tr.amount)
        });
      }
      
      await batch.commit();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
      setShowDeleteConfirm(null);
    } catch (error) {
      console.error("Error deleting transaction:", error);
      setErrorModal("লেনদেন ডিলিট করতে সমস্যা হয়েছে");
    }
  };

  const filtered = directors.filter(d => 
    d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.mobile.includes(searchTerm)
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {selectedDirector && activeTab !== 'list' ? (
        <div className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+64px)] bottom-[calc(env(safe-area-inset-bottom)+64px)] z-40 bg-white flex flex-col animate-in slide-in-from-right duration-300">
          {/* Header - Navy Blue style like Investments */}
          <div className="bg-[#003366] px-6 py-4 flex justify-between items-center text-white shrink-0 shadow-lg">
            <h3 className="text-xl font-bold flex items-center gap-3">
              <FileText size={24} className="text-emerald-400" />
              {activeTab === 'info' ? 'পরিচালক প্রোফাইল' : 'লেনদেন বিবরণী'} - {selectedDirector.name}
            </h3>
            <button onClick={() => { setSelectedDirector(null); setActiveTab('list'); }} className="p-2 hover:bg-white/10 rounded-full transition-colors text-white">
              <X size={24} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto bg-slate-50">
            {activeTab === 'info' ? (
              <div className="p-6 space-y-12 bg-white min-h-full">
                {/* ... existing profile design ... */}
                <div className="flex flex-col md:flex-row items-center md:items-start gap-8 border-b-2 border-slate-100 pb-8">
                  <div className="w-40 h-40 rounded-3xl bg-white border-4 border-slate-100 overflow-hidden flex-shrink-0 shadow-xl">
                    {selectedDirector.photoUrl ? (
                      <img 
                        src={getDirectDriveUrl(selectedDirector.photoUrl)} 
                        alt="" 
                        className="w-full h-full object-cover" 
                        referrerPolicy="no-referrer" 
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-200 bg-slate-50">
                        <User size={80} />
                      </div>
                    )}
                  </div>
                  <div className="text-center md:text-left space-y-2">
                    <h3 className="text-4xl font-black text-slate-900">{selectedDirector.name}</h3>
                    <p className="text-sm font-bold text-slate-500 uppercase tracking-widest bg-slate-100 px-3 py-1 rounded-full inline-block">পিতা: {selectedDirector.fatherName || 'N/A'}</p>
                    <p className="text-xl font-black text-emerald-600">{selectedDirector.profession}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
                    <h4 className="text-sm font-black text-slate-400 border-b border-slate-100 pb-2 uppercase tracking-widest flex items-center gap-2">
                      <MapPin size={16} /> যোগাযোগ
                    </h4>
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                          <Phone size={18} />
                        </div>
                        <a href={`tel:${selectedDirector.mobile}`} className="text-lg font-bold text-slate-700 hover:text-emerald-600 transition-colors">{selectedDirector.mobile}</a>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                          <Mail size={18} />
                        </div>
                        <span className="text-lg font-bold text-slate-700">{selectedDirector.email || 'N/A'}</span>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center shrink-0">
                          <MapPin size={18} />
                        </div>
                        <span className="text-lg font-bold text-slate-700">{selectedDirector.address || 'N/A'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
                    <h4 className="text-sm font-black text-slate-400 border-b border-slate-100 pb-2 uppercase tracking-widest flex items-center gap-2">
                      <Wallet size={16} /> মূল হিসাব
                    </h4>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center bg-slate-50 p-3 rounded-2xl">
                        <span className="text-[10px] font-black text-slate-400 uppercase">মোট জমা</span>
                        <span className="text-lg font-black text-emerald-600">{formatCurrency(stats.totalDeposit)}</span>
                      </div>
                      <div className="flex justify-between items-center bg-slate-50 p-3 rounded-2xl">
                        <span className="text-[10px] font-black text-slate-400 uppercase">মোট উত্তোলন</span>
                        <span className="text-lg font-black text-rose-600">{formatCurrency(stats.totalWithdrawal)}</span>
                      </div>
                      <div className="flex justify-between items-center bg-emerald-600 p-3 rounded-2xl text-white shadow-lg shadow-emerald-100">
                        <span className="text-[10px] font-black uppercase text-emerald-100">নিট ব্যালেন্স</span>
                        <span className="text-xl font-black">{formatCurrency(currentBalance)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
                    <h4 className="text-sm font-black text-slate-400 border-b border-slate-100 pb-2 uppercase tracking-widest flex items-center gap-2">
                      <Award size={16} /> মুনাফা হিসাব
                    </h4>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center bg-slate-50 p-3 rounded-2xl">
                        <span className="text-[10px] font-black text-slate-400 uppercase">মোট মুনাফা গ্রহণ</span>
                        <span className="text-lg font-black text-blue-600">{formatCurrency(stats.totalProfitReceived)}</span>
                      </div>
                      <div className="flex justify-between items-center bg-slate-50 p-3 rounded-2xl">
                        <span className="text-[10px] font-black text-slate-400 uppercase">মোট মুনাফা উত্তোলন</span>
                        <span className="text-lg font-black text-amber-600">{formatCurrency(stats.totalProfitWithdrawn)}</span>
                      </div>
                      <div className="flex justify-between items-center bg-blue-600 p-3 rounded-2xl text-white shadow-lg shadow-blue-100">
                        <span className="text-[10px] font-black uppercase text-blue-100">মুনাফা ব্যালেন্স</span>
                        <span className="text-xl font-black">{formatCurrency(currentProfitBalance)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col h-full bg-slate-50">
                <div className="px-4 py-8 shrink-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse border border-black min-w-max">
                      <thead>
                        <tr className="bg-[#003366] text-white">
                          <th className="py-2 px-4 text-sm font-bold border border-black">পরিচালকের নাম</th>
                          <th className="py-2 px-4 text-sm font-bold border border-black">মোবাইল নাম্বার</th>
                          <th className="py-2 px-4 text-sm font-bold border border-black">পেশা</th>
                          <th className="py-2 px-4 text-sm font-bold border border-black text-right">ব্যালেন্স</th>
                          <th className="py-2 px-4 text-sm font-bold border border-black text-right">মুনাফা ব্যালেন্স</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="bg-white">
                          <td className="py-2 px-4 text-sm font-bold border border-black leading-none">{selectedDirector.name}</td>
                          <td className="py-2 px-4 text-sm font-bold border border-black leading-none">{toBengaliNumber(selectedDirector.mobile)}</td>
                          <td className="py-2 px-4 text-sm font-bold border border-black leading-none">{selectedDirector.profession}</td>
                          <td className="py-2 px-4 text-sm font-black border border-black text-right leading-none text-emerald-600">{formatCurrency(currentBalance)}</td>
                          <td className="py-2 px-4 text-sm font-black border border-black text-right leading-none text-blue-600">{formatCurrency(currentProfitBalance)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex-1 px-4 overflow-y-auto pb-10">
                  <DataTable
                    columns={transactionColumns}
                    data={(() => {
                      let balance = 0;
                      return transactions
                        .sort((a, b) => {
                          const dateCompare = a.date.localeCompare(b.date);
                          if (dateCompare !== 0) return dateCompare;
                          return (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);
                        })
                        .map(tr => {
                          if (tr.type === 'deposit') balance += tr.amount;
                          else balance -= tr.amount;
                          return { ...tr, runningBalance: balance };
                        })
                        .reverse();
                    })()}
                    keyExtractor={(tr) => tr.id}
                    emptyMessage="এই পরিচালকের কোন লেনদেন ইতিহাস পাওয়া যায়নি"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center border-b-2 border-black pb-4">
            <div>
              <h2 className="text-3xl font-black text-black uppercase tracking-tight">পরিচালক তালিকা</h2>
              <p className="text-sm font-bold text-slate-500">মোট পরিচালক: {toBengaliNumber(directors.length)}</p>
            </div>
            {(role === 'super_admin') && (
              <button 
                onClick={() => {
                  setEditingDirector(null);
                  setFormData({ 
                    name: '', 
                    fatherName: '',
                    mobile: '', 
                    profession: '', 
                    address: '', 
                    email: '', 
                    photoUrl: '' 
                  });
                  setShowAddModal(true);
                }}
                className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl hover:bg-indigo-700 hover:shadow-lg transition-all flex items-center gap-2 font-bold text-sm active:scale-95 shadow-md shadow-indigo-100"
              >
                <Plus size={18} /> নতুন পরিচালক
              </button>
            )}
          </div>

          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={20} />
            <input 
              type="text" 
              placeholder="পরিচালকের নাম অথবা মোবাইল দিয়ে খুঁজুন..."
              className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-300 transition-all shadow-sm text-sm font-medium"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="bg-white">
            <DataTable
              columns={directorColumns}
              data={directors.filter(d => 
                d.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                d.mobile.includes(searchTerm)
              )}
              keyExtractor={(d) => d.id}
              emptyMessage="কোন পরিচালক পাওয়া যায়নি"
            />
          </div>
        </>
      )}

      {/* Error Modal */}
      <AnimatePresence>
        {errorModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-3xl p-8 text-center space-y-6"
            >
              <div className="w-20 h-20 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto">
                <Info size={40} />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-slate-800">সতর্কবার্তা</h3>
                <p className="text-slate-500">{errorModal}</p>
              </div>
              <button 
                onClick={() => setErrorModal(null)}
                className="w-full py-3 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-900 transition-colors"
              >
                ঠিক আছে
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {success && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-8 py-4 rounded-2xl font-black shadow-2xl flex items-center gap-3 z-[100]"
          >
            <History size={24} />
            সফলভাবে সম্পন্ন হয়েছে!
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action Menu Portal */}
      <AnimatePresence>
        {openMenuId && activeMenuDirector && menuPosition && (
          <>
            <div 
              className="fixed inset-0 z-[1000]" 
              onClick={() => setOpenMenuId(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              style={{ 
                position: 'absolute',
                top: menuPosition.top,
                left: menuPosition.left,
              }}
              className="z-[1001] w-64 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden"
            >
              <div className="p-1 space-y-0.5">
                <button
                  onClick={() => {
                    setSelectedDirector(activeMenuDirector);
                    setActiveTab('info');
                    setOpenMenuId(null);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-emerald-50 hover:text-emerald-600 rounded-lg transition-colors"
                >
                  <User size={14} /> প্রোফাইল দেখুন
                </button>
                <button
                  onClick={() => {
                    setSelectedDirector(activeMenuDirector);
                    setActiveTab('transactions');
                    setOpenMenuId(null);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-colors"
                >
                  <History size={14} /> লেনদেন দেখুন
                </button>
                {(role === 'super_admin') && (
                  <button
                    onClick={() => {
                      setEditingDirector(activeMenuDirector);
                      setFormData({
                        name: activeMenuDirector.name,
                        fatherName: activeMenuDirector.fatherName || '',
                        mobile: activeMenuDirector.mobile,
                        profession: activeMenuDirector.profession,
                        address: activeMenuDirector.address,
                        email: activeMenuDirector.email,
                        photoUrl: activeMenuDirector.photoUrl
                      });
                      setShowAddModal(true);
                      setOpenMenuId(null);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-amber-50 hover:text-amber-600 rounded-lg transition-colors"
                  >
                    <Edit size={14} /> তথ্য পরিবর্তন
                  </button>
                )}
                {role === 'super_admin' && (
                  <button
                    onClick={() => {
                      setShowDeleteConfirm({ id: activeMenuDirector.id, type: 'director' });
                      setOpenMenuId(null);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                  >
                    <Trash2 size={14} /> ডিলিট করুন
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[32px] w-full max-w-sm overflow-hidden shadow-2xl p-8 text-center"
            >
              <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 size={40} />
              </div>
              <h3 className="text-xl font-black text-slate-800 mb-2">আপনি কি নিশ্চিত?</h3>
              <p className="text-slate-500 font-bold mb-8">
                {showDeleteConfirm.type === 'director' 
                  ? 'এই হিসাবটি ডিলিট করতে চান?' 
                  : 'এই লেনদেনটি ডিলিট করতে চান?'}
              </p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setShowDeleteConfirm(null)}
                  className="flex-1 py-4 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 transition-colors"
                >
                  বাতিল
                </button>
                <button 
                  onClick={() => {
                    if (showDeleteConfirm.type === 'director') {
                      handleDeleteDirector(showDeleteConfirm.id);
                    } else {
                      handleDeleteTransaction(showDeleteConfirm.data);
                    }
                  }}
                  className="flex-1 py-4 bg-rose-600 text-white font-bold rounded-2xl shadow-lg shadow-rose-200 hover:bg-rose-700 transition-all active:scale-95"
                >
                  ডিলিট করুন
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+64px)] bottom-[calc(env(safe-area-inset-bottom)+64px)] z-40 bg-white overflow-y-auto pb-20 px-0">
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="w-full flex flex-col"
            >
              {/* Header */}
              <div className="bg-white px-6 py-4 flex justify-between items-center border-b border-slate-100">
                <h3 className="text-xl font-bold text-slate-900">
                  {editingDirector ? 'পরিচালক তথ্য পরিবর্তন' : 'নতুন পরিচালক যোগ করুন'}
                </h3>
                <button 
                  onClick={() => setShowAddModal(false)} 
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"
                >
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-8">
                {/* Primary Info */}
                <section className="space-y-6">
                  <h4 className="text-xl font-bold text-slate-900">প্রাথমিক তথ্য</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">পরিচালকের নাম</label>
                      <input 
                        required 
                        placeholder="পরিচালকের নাম লিখুন" 
                        className="w-full h-12 px-4 border border-slate-900 rounded-lg focus:outline-none" 
                        value={formData.name} 
                        onChange={e => setFormData({...formData, name: e.target.value})} 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">পিতার নাম</label>
                      <input 
                        placeholder="পিতার নাম লিখুন" 
                        className="w-full h-12 px-4 border border-slate-900 rounded-lg focus:outline-none" 
                        value={formData.fatherName} 
                        onChange={e => setFormData({...formData, fatherName: e.target.value})} 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">মোবাইল নম্বর</label>
                      <input 
                        required 
                        placeholder="১১ ডিজিটের মোবাইল নম্বর" 
                        className="w-full h-12 px-4 border border-slate-900 rounded-lg focus:outline-none" 
                        value={formData.mobile} 
                        onChange={e => setFormData({...formData, mobile: e.target.value})} 
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">পেশা</label>
                      <input 
                        placeholder="পেশার নাম লিখুন" 
                        className="w-full h-12 px-4 border border-slate-900 rounded-lg focus:outline-none" 
                        value={formData.profession} 
                        onChange={e => setFormData({...formData, profession: e.target.value})} 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">ইমেল আইডি</label>
                      <input 
                        type="email" 
                        placeholder="ইমেল আইডি লিখুন" 
                        className="w-full h-12 px-4 border border-slate-900 rounded-lg focus:outline-none" 
                        value={formData.email} 
                        onChange={e => setFormData({...formData, email: e.target.value})} 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">ঠিকানা</label>
                      <input 
                        placeholder="ঠিকানা লিখুন" 
                        className="w-full h-12 px-4 border border-slate-900 rounded-lg focus:outline-none" 
                        value={formData.address} 
                        onChange={e => setFormData({...formData, address: e.target.value})} 
                      />
                    </div>
                  </div>
                </section>

                {/* Photo URL */}
                <section className="space-y-4 pb-10">
                  <h4 className="text-xl font-bold text-slate-900">ছবি (Google Drive Link)</h4>
                  <input 
                    placeholder="গুগল ড্রাইভ লিংক দিন" 
                    className="w-full md:w-1/2 h-12 px-4 border border-slate-900 rounded-lg focus:outline-none" 
                    value={formData.photoUrl} 
                    onChange={e => setFormData({...formData, photoUrl: e.target.value})} 
                  />
                </section>
              </form>

              {/* Footer with Submit Button */}
              <div className="bg-white p-6 pb-24 border-t border-slate-100 mt-auto">
                <button 
                  type="submit"
                  id="director-submit-btn"
                  onClick={(e) => {
                    e.preventDefault();
                    handleSubmit(e as any);
                  }}
                  disabled={isSubmitting}
                  className="w-full py-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors disabled:opacity-50 shadow-lg"
                >
                  {isSubmitting ? 'সংরক্ষণ হচ্ছে...' : (editingDirector ? 'তথ্য আপডেট করুন' : 'পরিচালক যোগ করুন')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showTransactionModal && (
          <div className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+64px)] bottom-[calc(env(safe-area-inset-bottom)+64px)] z-40 flex items-center justify-center p-0 md:p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="bg-white w-full max-w-md h-full md:h-auto overflow-hidden"
            >
              <div className="bg-black p-6 text-white flex justify-between items-center">
                <h3 className="text-2xl font-black uppercase tracking-widest">লেনদেন করুন</h3>
                <button onClick={() => setShowTransactionModal(false)} className="p-2 hover:bg-white/10 transition-colors">
                  <X size={32} />
                </button>
              </div>
              <form onSubmit={handleTransactionSubmit} className="p-6 md:p-8 space-y-8">
                <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 border border-black">
                  <button
                    type="button"
                    onClick={() => setTransactionType('deposit')}
                    className={cn(
                      "py-3 text-[10px] font-black transition-all uppercase tracking-widest",
                      transactionType === 'deposit' ? "bg-black text-white" : "text-slate-500"
                    )}
                  >
                    জমা
                  </button>
                  <button
                    type="button"
                    onClick={() => setTransactionType('withdrawal')}
                    className={cn(
                      "py-3 text-[10px] font-black transition-all uppercase tracking-widest",
                      transactionType === 'withdrawal' ? "bg-black text-white" : "text-slate-500"
                    )}
                  >
                    উত্তোলন
                  </button>
                  <button
                    type="button"
                    onClick={() => setTransactionType('profit_distribution')}
                    className={cn(
                      "py-3 text-[10px] font-black transition-all uppercase tracking-widest",
                      transactionType === 'profit_distribution' ? "bg-black text-white" : "text-slate-500"
                    )}
                  >
                    মুনাফা গ্রহণ
                  </button>
                  <button
                    type="button"
                    onClick={() => setTransactionType('profit_withdraw')}
                    className={cn(
                      "py-3 text-[10px] font-black transition-all uppercase tracking-widest",
                      transactionType === 'profit_withdraw' ? "bg-black text-white" : "text-slate-500"
                    )}
                  >
                    মুনাফা উত্তোলন
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="space-y-1">
                    <label className="flat-label">পরিমাণ</label>
                    <input 
                      type="number"
                      required
                      className="flat-input text-2xl text-center"
                      value={transactionData.amount}
                      onChange={e => setTransactionData({...transactionData, amount: e.target.value})}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="flat-label">তারিখ</label>
                    <input 
                      type="date"
                      required
                      className="flat-input"
                      value={transactionData.date}
                      onChange={e => setTransactionData({...transactionData, date: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="flat-label">নোট (ঐচ্ছিক)</label>
                    <textarea 
                      className="flat-input min-h-[100px]"
                      value={transactionData.note}
                      onChange={e => setTransactionData({...transactionData, note: e.target.value})}
                      placeholder="লেনদেন সম্পর্কে কিছু লিখুন..."
                    />
                  </div>
                </div>

                <div className="pt-4">
                  <button 
                    type="submit"
                    className="w-full py-5 bg-black text-white font-black text-xl uppercase tracking-widest hover:bg-slate-900 transition-all active:scale-[0.98]"
                  >
                    নিশ্চিত করুন
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirmModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 text-center space-y-6 shadow-2xl"
            >
              <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto">
                <AlertCircle size={40} />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-slate-800 tracking-tight">পরিচালক তথ্য নিশ্চিত করুন</h3>
                <p className="text-slate-500">আপনি কি নিশ্চিত যে এই পরিচালক তথ্যটি সংরক্ষণ করতে চান?</p>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowConfirmModal(false)}
                  className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-50 rounded-xl transition-colors"
                >
                  বাতিল
                </button>
                <button 
                  id="director-confirm-btn"
                  onClick={(e) => handleSubmit(e as any)}
                  className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all active:scale-95"
                >
                  হ্যাঁ, সংরক্ষণ করুন
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
