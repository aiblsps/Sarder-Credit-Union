import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, query, where, orderBy, serverTimestamp, increment, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { useAuth } from './AuthContext';
import { Plus, Search, Landmark, MoreVertical, Edit, Trash2, History, X, ChevronRight, ArrowLeft, Wallet, Calendar, User, Eye, List, ChevronDown, AlertCircle } from 'lucide-react';
import { formatCurrency, toBengaliNumber, cn } from './lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { DataTable } from './components/DataTable';

export const Banks = () => {
  const { role, user } = useAuth();
  const [banks, setBanks] = useState<any[]>(() => {
    const saved = localStorage.getItem('cache_banks');
    return saved ? JSON.parse(saved) : [];
  });
  const [errorModal, setErrorModal] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingBank, setEditingBank] = useState<any>(null);
  const [selectedBank, setSelectedBank] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>(() => {
    const saved = localStorage.getItem('cache_bank_transactions_last');
    return saved ? JSON.parse(saved) : [];
  });
  const [success, setSuccess] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [activeMenuBank, setActiveMenuBank] = useState<any>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number, left: number } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{ id: string, type: 'bank' | 'transaction', data?: any } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    accountNumber: '',
    accountName: '',
    bankName: '',
    branch: '',
    routingNumber: ''
  });

  useEffect(() => {
    const onBack = (e: Event) => {
      if (selectedBank) {
        e.preventDefault();
        setSelectedBank(null);
      } else if (showAddModal) {
        e.preventDefault();
        setShowAddModal(false);
      }
    };
    window.addEventListener('app:back', onBack);
    return () => window.removeEventListener('app:back', onBack);
  }, [selectedBank, showAddModal, showDeleteConfirm]);

  useEffect(() => {
    if (!role) return;
    const unsub = onSnapshot(collection(db, 'banks'), (snap) => {
      const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setBanks(docs);
      localStorage.setItem('cache_banks', JSON.stringify(docs));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'banks');
    });
    return unsub;
  }, [role]);

  useEffect(() => {
    if (!role || !selectedBank) return;
    
    // Try to load from specific cache for this bank
    const saved = localStorage.getItem(`cache_bank_transactions_${selectedBank.id}`);
    if (saved) {
      setTransactions(JSON.parse(saved));
    }

    const q = query(
      collection(db, 'bank_transactions'),
      where('bankId', '==', selectedBank.id)
    );
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort client-side to avoid composite index requirement
      docs.sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''));
      setTransactions(docs);
      localStorage.setItem(`cache_bank_transactions_${selectedBank.id}`, JSON.stringify(docs));
      localStorage.setItem('cache_bank_transactions_last', JSON.stringify(docs));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'bank_transactions');
    });
    return unsub;
  }, [selectedBank, role]);

  const handleMenuToggle = (e: React.MouseEvent, bank: any) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuPosition({ 
      top: rect.bottom + window.scrollY + 8, 
      left: rect.right + window.scrollX - 160
    });
    setActiveMenuBank(bank);
    setOpenMenuId(openMenuId === bank.id ? null : bank.id);
  };

  const [showConfirmModal, setShowConfirmModal] = useState(false);

  useEffect(() => {
    const handleEnter = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        if (showConfirmModal) {
          e.preventDefault();
          const confirmBtn = document.getElementById('bank-confirm-btn');
          if (confirmBtn) confirmBtn.click();
        } else if (showAddModal) {
          e.preventDefault();
          const submitBtn = document.getElementById('bank-submit-btn');
          if (submitBtn) submitBtn.click();
        }
      }
    };
    window.addEventListener('keydown', handleEnter);
    return () => window.removeEventListener('keydown', handleEnter);
  }, [showConfirmModal, showAddModal]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!showConfirmModal) {
      setShowConfirmModal(true);
      return;
    }

    setShowConfirmModal(false);
    setIsSubmitting(true);
    try {
      if (editingBank) {
        await updateDoc(doc(db, 'banks', editingBank.id), formData);
      } else {
        await addDoc(collection(db, 'banks'), {
          ...formData,
          balance: 0,
          createdAt: serverTimestamp()
        });
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
      setShowAddModal(false);
      setEditingBank(null);
      setFormData({ accountNumber: '', accountName: '', bankName: '', branch: '', routingNumber: '' });
    } catch (err) {
      console.error(err);
      setErrorModal("ব্যাংক তথ্য সংরক্ষণ করতে সমস্যা হয়েছে");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteBank = async (id: string) => {
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'banks', id));
      setShowDeleteConfirm(null);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err) {
      console.error(err);
      setErrorModal("ব্যাংক ডিলিট করতে সমস্যা হয়েছে");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteTransaction = async (tr: any) => {
    setIsDeleting(true);
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'bank_transactions', tr.id));
      batch.update(doc(db, 'banks', tr.bankId), {
        balance: increment(tr.type === 'deposit' ? -tr.amount : tr.amount)
      });
      await batch.commit();
      setShowDeleteConfirm(null);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err) {
      console.error(err);
      setErrorModal("লেনদেন ডিলিট করতে সমস্যা হয়েছে");
    } finally {
      setIsDeleting(false);
    }
  };

  const filtered = banks.filter(b => 
    b.accountName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.accountNumber.includes(searchTerm) ||
    b.bankName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const bankColumns = [
    {
      header: 'ক্রমিক',
      render: (_: any, idx: number) => <span className="text-slate-400 font-bold">{toBengaliNumber(idx + 1)}</span>,
      className: 'text-center',
      headerClassName: 'text-center'
    },
    {
      header: 'একাউন্ট নাম',
      render: (bank: any) => (
        <p className="text-sm font-black text-slate-700">{bank.accountName}</p>
      ),
      headerClassName: 'text-center'
    },
    {
      header: 'একাউন্ট নাম্বার',
      accessor: 'accountNumber',
      className: 'text-xs font-black text-slate-600 text-center',
      headerClassName: 'text-center'
    },
    {
      header: 'ব্যাংকের নাম',
      accessor: 'bankName',
      className: 'text-xs font-bold text-slate-500 text-center',
      headerClassName: 'text-center'
    },
    {
      header: 'শাখা',
      accessor: 'branch',
      className: 'text-xs font-bold text-slate-500 text-center',
      headerClassName: 'text-center'
    },
    {
      header: 'রাউটিং নাম্বার',
      accessor: 'routingNumber',
      render: (bank: any) => <span className="font-mono">{bank.routingNumber || '---'}</span>,
      className: 'text-xs font-bold text-slate-500 text-center',
      headerClassName: 'text-center'
    },
    {
      header: 'ব্যালেন্স',
      render: (bank: any) => (
        <p className="text-sm font-black text-emerald-600">{formatCurrency(bank.balance)}</p>
      ),
      className: 'text-center',
      headerClassName: 'text-center'
    },
    {
      header: 'একশন',
      render: (bank: any) => (
        <div className="flex justify-center gap-3 py-1 scale-90 md:scale-100">
          <button 
            onClick={(e) => handleMenuToggle(e, bank)}
            className="flex items-center gap-2 px-4 h-12 bg-[#f0f9ff] border border-blue-100 rounded-2xl text-blue-600 transition-all active:scale-95 shadow-sm hover:bg-blue-50"
          >
            <List size={22} strokeWidth={2.5} />
            <ChevronDown size={20} strokeWidth={2.5} />
          </button>
        </div>
      ),
      className: 'text-center min-w-[120px]',
      headerClassName: 'text-center'
    }
  ];

  const transactionColumns = [
    {
      header: 'তারিখ',
      accessor: 'date',
      className: 'text-xs font-black text-slate-700',
      render: (tr: any) => toBengaliNumber(tr.date.split('-').reverse().join('-'))
    },
    {
      header: 'জমা',
      render: (tr: any) => (
        <span className="text-emerald-600">
          {tr.type === 'deposit' ? formatCurrency(tr.amount) : '০'}
        </span>
      ),
      className: 'text-right font-black text-xs'
    },
    {
      header: 'উত্তোলন',
      render: (tr: any) => (
        <span className="text-rose-600">
          {tr.type === 'withdrawal' ? formatCurrency(tr.amount) : '০'}
        </span>
      ),
      className: 'text-right font-black text-xs'
    },
    {
      header: 'ব্যালেন্স',
      render: (tr: any) => (
        <span className="text-slate-800">
          {formatCurrency(tr.runningBalance)}
        </span>
      ),
      className: 'text-right font-black text-xs'
    },
    {
      header: 'প্রক্রিয়াকারী',
      accessor: 'processedBy',
      className: 'text-xs font-bold text-slate-500'
    },
    {
      header: 'একশন',
      render: (tr: any) => (
        <div className="flex justify-center">
          {role === 'super_admin' && (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setShowDeleteConfirm({ id: tr.id, type: 'transaction', data: tr });
              }}
              className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-colors"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      ),
      className: 'text-center'
    }
  ];

  if (selectedBank) {
    return (
      <div className="fixed inset-0 top-[calc(env(safe-area-inset-top)+64px)] bottom-[calc(env(safe-area-inset-bottom)+64px)] z-20 bg-white flex flex-col animate-in slide-in-from-right duration-300">
        <div className="flex-1 overflow-y-auto bg-slate-50/50 pb-8 px-4 md:px-8">
          <div className="flex items-center justify-between bg-white px-4 py-2 border-b border-black mb-6 -mx-4 md:-mx-8">
            <h3 className="text-lg font-black text-slate-800">লেনদেন বিবরণী</h3>
            <button 
              onClick={() => setSelectedBank(null)}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"
            >
              <X size={24} />
            </button>
          </div>

          <div className="max-w-7xl mx-auto space-y-8">
            {/* Profile Table Style Header */}
            <div className="overflow-x-auto border border-black shadow-sm bg-white">
              <table className="w-full text-center border-collapse">
                <thead>
                  <tr className="bg-[#003366] text-white">
                    <th className="py-3 px-4 border border-black text-xs font-bold uppercase tracking-wider whitespace-nowrap">একাউন্ট নাম</th>
                    <th className="py-3 px-4 border border-black text-xs font-bold uppercase tracking-wider whitespace-nowrap">একাউন্ট নাম্বার</th>
                    <th className="py-3 px-4 border border-black text-xs font-bold uppercase tracking-wider whitespace-nowrap">ব্যাংকের নাম</th>
                    <th className="py-3 px-4 border border-black text-xs font-bold uppercase tracking-wider whitespace-nowrap">শাখা</th>
                    <th className="py-3 px-4 border border-black text-xs font-bold uppercase tracking-wider whitespace-nowrap">রাউটিং নাম্বার</th>
                    <th className="py-3 px-4 border border-black text-xs font-bold uppercase tracking-wider whitespace-nowrap">ব্যালেন্স</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="font-bold text-slate-800">
                    <td className="py-3 px-4 border border-black text-sm whitespace-nowrap">{selectedBank.accountName}</td>
                    <td className="py-3 px-4 border border-black text-sm whitespace-nowrap">{selectedBank.accountNumber}</td>
                    <td className="py-3 px-4 border border-black text-sm whitespace-nowrap">{selectedBank.bankName}</td>
                    <td className="py-3 px-4 border border-black text-sm whitespace-nowrap">{selectedBank.branch}</td>
                    <td className="py-3 px-4 border border-black text-sm whitespace-nowrap">{selectedBank.routingNumber || '---'}</td>
                    <td className="py-3 px-4 border border-black text-sm text-emerald-600 font-black whitespace-nowrap">{formatCurrency(selectedBank.balance)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Transactions DataTable */}
            <div className="bg-white border border-black shadow-sm overflow-hidden">
              <DataTable 
                columns={transactionColumns}
                data={(() => {
                  let runningBalance = 0;
                  const sorted = [...transactions].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
                  const withBalance = sorted.map(tr => {
                    if (tr.type === 'deposit') runningBalance += tr.amount;
                    else runningBalance -= tr.amount;
                    return { ...tr, runningBalance };
                  });
                  return withBalance.reverse();
                })()}
                keyExtractor={(tr) => tr.id}
                emptyMessage="কোনো লেনদেন পাওয়া যায়নি"
                className="mb-0 border-none"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
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
                <h3 className="text-xl font-bold text-slate-800 tracking-tight">ব্যাংক তথ্য নিশ্চিত করুন</h3>
                <p className="text-slate-500">আপনি কি নিশ্চিত যে এই ব্যাংক তথ্যটি সংরক্ষণ করতে চান?</p>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowConfirmModal(false)}
                  className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-50 rounded-xl transition-colors"
                >
                  বাতিল
                </button>
                <button 
                  id="bank-confirm-btn"
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
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-black text-slate-800">সকল ব্যাংক</h2>
          <p className="text-xs font-bold text-slate-400">মোট একাউন্ট: {toBengaliNumber(banks.length)}</p>
        </div>
        {role === 'super_admin' && (
          <button 
            onClick={() => {
              setEditingBank(null);
              setFormData({ accountNumber: '', accountName: '', bankName: '', branch: '', routingNumber: '' });
              setShowAddModal(true);
            }}
            className="bg-emerald-600 text-white px-5 py-3 rounded-2xl font-bold text-sm shadow-lg shadow-emerald-100 flex items-center gap-2 hover:bg-emerald-700 transition-all active:scale-95"
          >
            <Plus size={18} />
            একাউন্ট নাম্বার
          </button>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
        <input 
          type="text" 
          placeholder="নাম অথবা একাউন্ট নাম্বার দিয়ে খুঁজুন..."
          className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-[1.5rem] shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-bold text-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="bg-white overflow-hidden">
        <DataTable 
          columns={bankColumns}
          data={filtered}
          keyExtractor={(bank) => bank.id}
          emptyMessage="কোনো ব্যাংক একাউন্ট পাওয়া যায়নি"
        />
      </div>

      {/* Action Menu Portal */}
      <AnimatePresence>
        {openMenuId && activeMenuBank && menuPosition && (
          <>
            <div 
              className="fixed inset-0 z-[1000]" 
              onClick={() => {
                setOpenMenuId(null);
                setActiveMenuBank(null);
              }}
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
              className="z-[1001] w-48 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden"
            >
              <div className="p-1 space-y-0.5">
                <button
                  onClick={() => {
                    setSelectedBank(activeMenuBank);
                    setOpenMenuId(null);
                    setActiveMenuBank(null);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-emerald-50 hover:text-emerald-600 rounded-lg transition-colors"
                >
                  <History size={14} /> বিস্তারিত লেনদেন
                </button>
                {role === 'super_admin' && (
                  <button
                    onClick={() => {
                      setEditingBank(activeMenuBank);
                      setFormData({
                        accountNumber: activeMenuBank.accountNumber,
                        accountName: activeMenuBank.accountName,
                        bankName: activeMenuBank.bankName,
                        branch: activeMenuBank.branch,
                        routingNumber: activeMenuBank.routingNumber || ''
                      });
                      setShowAddModal(true);
                      setOpenMenuId(null);
                      setActiveMenuBank(null);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-colors"
                  >
                    <Edit size={14} /> তথ্য পরিবর্তন
                  </button>
                )}
                {role === 'super_admin' && (
                  <button
                    onClick={() => {
                      setShowDeleteConfirm({ id: activeMenuBank.id, type: 'bank' });
                      setOpenMenuId(null);
                      setActiveMenuBank(null);
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
                <User size={40} />
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
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-none md:rounded-[2.5rem] w-full max-w-md md:max-w-3xl h-full md:h-auto overflow-hidden shadow-2xl flex flex-col"
            >
              <div className="bg-[#003366] px-6 py-4 flex justify-between items-center text-white shrink-0 shadow-lg">
                <h3 className="text-xl font-bold flex items-center gap-3">
                  <Landmark size={24} className="text-emerald-400" />
                  {editingBank ? 'ব্যাংক তথ্য পরিবর্তন' : 'নতুন ব্যাংক একাউন্ট'}
                </h3>
                <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors text-white">
                  <X size={24} />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-8 overflow-y-auto">
                <section className="space-y-6">
                  <h4 className="text-xl font-bold text-slate-900 border-b border-slate-100 pb-2">একাউন্ট তথ্য</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">একাউন্ট নম্বর</label>
                      <input 
                        type="number"
                        required 
                        placeholder="একাউন্ট নম্বর লিখুন" 
                        className="w-full h-12 px-4 border border-slate-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/10 transition-all font-bold" 
                        value={formData.accountNumber} 
                        onChange={e => setFormData({...formData, accountNumber: e.target.value})} 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">একাউন্ট নাম</label>
                      <input 
                        required 
                        placeholder="একাউন্ট নাম লিখুন" 
                        className="w-full h-12 px-4 border border-slate-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/10 transition-all font-bold" 
                        value={formData.accountName} 
                        onChange={e => setFormData({...formData, accountName: e.target.value})} 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">ব্যাংকের নাম</label>
                      <input 
                        required 
                        placeholder="ব্যাংকের নাম লিখুন" 
                        className="w-full h-12 px-4 border border-slate-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/10 transition-all font-bold" 
                        value={formData.bankName} 
                        onChange={e => setFormData({...formData, bankName: e.target.value})} 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">শাখা</label>
                      <input 
                        required 
                        placeholder="শাখা লিখুন" 
                        className="w-full h-12 px-4 border border-slate-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/10 transition-all font-bold" 
                        value={formData.branch} 
                        onChange={e => setFormData({...formData, branch: e.target.value})} 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">রাউটিং নাম্বার</label>
                      <input 
                        type="number"
                        placeholder="রাউটিং নাম্বার লিখুন" 
                        className="w-full h-12 px-4 border border-slate-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/10 transition-all font-bold" 
                        value={formData.routingNumber} 
                        onChange={e => setFormData({...formData, routingNumber: e.target.value})} 
                      />
                    </div>
                  </div>
                </section>

                <div className="pt-8 space-y-4">
                  <button 
                    type="submit"
                    id="bank-submit-btn"
                    className="w-full py-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors shadow-lg active:scale-[0.98]"
                  >
                    {editingBank ? 'তথ্য আপডেট করুন' : 'ব্যাংক একাউন্ট যোগ করুন'}
                  </button>
                  <button 
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="w-full py-4 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors"
                  >
                    বাতিল
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 text-center space-y-6"
            >
              <div className="w-20 h-20 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto">
                <Trash2 size={40} />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-slate-800">আপনি কি নিশ্চিত?</h3>
                <p className="text-slate-500">
                  {showDeleteConfirm.type === 'bank' 
                    ? 'এই হিসাবটি ডিলিট করতে চান?' 
                    : 'এই লেনদেনটি ডিলিট করতে চান?'}
                </p>
              </div>
              <div className="flex gap-3">
                <button 
                  disabled={isDeleting}
                  onClick={() => setShowDeleteConfirm(null)}
                  className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-50 rounded-xl transition-colors disabled:opacity-50"
                >
                  বাতিল
                </button>
                <button 
                  disabled={isDeleting}
                  onClick={() => {
                    if (showDeleteConfirm.type === 'bank') {
                      handleDeleteBank(showDeleteConfirm.id);
                    } else {
                      handleDeleteTransaction(showDeleteConfirm.data);
                    }
                  }}
                  className="flex-1 py-3 bg-rose-600 text-white font-bold rounded-xl shadow-lg shadow-rose-200 hover:bg-rose-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isDeleting ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    'হ্যাঁ, ডিলিট'
                  )}
                </button>
              </div>
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
            <Landmark size={24} />
            সফলভাবে সম্পন্ন হয়েছে!
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
