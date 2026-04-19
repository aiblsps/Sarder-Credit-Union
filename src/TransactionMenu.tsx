import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, getDocs, addDoc, doc, updateDoc, increment, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './AuthContext';
import { Search, Wallet, UserCircle, Landmark, Receipt, ArrowDownRight, ArrowUpRight, CheckCircle2, AlertCircle, ChevronRight, ArrowLeft, History, Printer, X, Download } from 'lucide-react';
import { formatCurrency, toBengaliNumber, cn, getDirectDriveUrl } from './lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';

type TransactionType = 'installment' | 'settlement' | 'director_deposit' | 'director_withdrawal' | 'bank_deposit' | 'bank_withdrawal' | 'expense' | 'profit_distribution' | 'profit_withdraw';

export const TransactionMenu = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeType, setActiveType] = useState<TransactionType | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // Form States
  const [searchId, setSearchId] = useState('');
  const [foundEntity, setFoundEntity] = useState<any>(null);
  const [foundCustomer, setFoundCustomer] = useState<any>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [fine, setFine] = useState('0');
  const [discount, setDiscount] = useState('0');
  const [lastTransaction, setLastTransaction] = useState<any>(null);

  // Lists for selection
  const [directors, setDirectors] = useState<any[]>([]);
  const [banks, setBanks] = useState<any[]>([]);
  const [allTransactions, setAllTransactions] = useState<any[]>([]);
  const [investments, setInvestments] = useState<any[]>([]);
  const [directorTransactions, setDirectorTransactions] = useState<any[]>([]);
  const [distributionType, setDistributionType] = useState<'select' | 'automatic' | 'manual'>('select');
  const [appUsers, setAppUsers] = useState<any[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      setAppUsers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.error("Error fetching users for signatures:", error);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const onBack = (e: Event) => {
      if (activeType) {
        e.preventDefault();
        setActiveType(null);
        resetForm();
      }
    };
    window.addEventListener('app:back', onBack);
    return () => window.removeEventListener('app:back', onBack);
  }, [activeType]);

  useEffect(() => {
    const unsubD = onSnapshot(collection(db, 'directors'), (snap) => {
      setDirectors(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubB = onSnapshot(collection(db, 'banks'), (snap) => {
      setBanks(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubT = onSnapshot(collection(db, 'transactions'), (snap) => {
      setAllTransactions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubI = onSnapshot(collection(db, 'investments'), (snap) => {
      setInvestments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubDT = onSnapshot(collection(db, 'director_transactions'), (snap) => {
      setDirectorTransactions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => { unsubD(); unsubB(); unsubT(); unsubI(); unsubDT(); };
  }, []);

  const calculateNetProfit = () => {
    let earnedProfit = 0;
    let distributedProfit = 0;

    allTransactions.forEach(t => {
      if (t.type === 'payment' || t.type === 'settlement') {
        earnedProfit += (t.fine || 0);
        const inv = investments.find(i => i.id === t.investmentId);
        if (inv && inv.totalAmount > 0) {
          const profitPortion = t.amount * (inv.profitAmount / inv.totalAmount);
          earnedProfit += profitPortion;
        }
      } else if (t.type === 'expense') {
        earnedProfit -= t.amount || 0;
      }
    });

    directorTransactions.forEach(t => {
      if (t.type === 'profit_distribution') {
        distributedProfit += t.amount || 0;
      }
    });

    const net = earnedProfit - distributedProfit;
    return Math.abs(net) < 0.01 ? 0 : net;
  };

  const handleSearch = async () => {
    if (!searchId) return;
    setLoading(true);
    setError('');
    setFoundEntity(null);
    setFoundCustomer(null);
    try {
      if (activeType === 'installment' || activeType === 'settlement') {
        let q = query(collection(db, 'investments'), where('investmentId', '==', searchId), where('status', '==', 'চলমান'));
        let snap = await getDocs(q);
        
        if (snap.empty) {
          q = query(collection(db, 'investments'), where('customerAccountNumber', '==', searchId), where('status', '==', 'চলমান'));
          snap = await getDocs(q);
          
          if (snap.empty && !isNaN(Number(searchId))) {
            const prefixedId = `100${searchId}`;
            q = query(collection(db, 'investments'), where('customerAccountNumber', '==', prefixedId), where('status', '==', 'চলমান'));
            snap = await getDocs(q);
          }
        }

        if (snap.empty) throw new Error('সক্রিয় বিনিয়োগ পাওয়া যায়নি।');
        
        const invData = { id: snap.docs[0].id, ...snap.docs[0].data() } as any;
        setFoundEntity(invData);

        const custQ = query(collection(db, 'customers'), where('accountNumber', '==', invData.customerAccountNumber));
        const custSnap = await getDocs(custQ);
        if (!custSnap.empty) {
          setFoundCustomer({ id: custSnap.docs[0].id, ...custSnap.docs[0].data() });
        }
        
        if (activeType === 'installment') {
          setAmount(invData.perInstallment?.toString() || '');
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || loading) return;

    const amt = parseFloat(amount);
    const f = parseFloat(fine) || 0;
    const d = parseFloat(discount) || 0;

    try {
      if (activeType === 'profit_distribution') {
        const netProfit = calculateNetProfit();
        if (amt > netProfit) throw new Error('বর্তমান নিট মুনাফার চেয়ে বেশি বন্টন করা সম্ভব নয়।');
        if (distributionType === 'select') throw new Error('বন্টন পদ্ধতি নির্বাচন করুন।');
      }

      if (activeType === 'profit_withdraw') {
        if (!foundEntity) throw new Error('পরিচালক নির্বাচন করুন।');
        if (amt > (foundEntity.profitBalance || 0)) throw new Error('মুনাফা ব্যালেন্সের চেয়ে বেশি উত্তোলন করা সম্ভব নয়।');
      }

      if (activeType === 'director_withdrawal') {
        if (!foundEntity) throw new Error('পরিচালক নির্বাচন করুন।');
        if (amt > (foundEntity.balance || 0)) throw new Error('বর্তমান ব্যালেন্সের চেয়ে বেশি উত্তোলন করা সম্ভব নয়।');
      }

      setLoading(true);
      setError('');
      
      const batch = writeBatch(db);
      const timestamp = serverTimestamp();
      const processedBy = user.name || user.displayName || user.email || 'Admin';

      if (activeType === 'installment') {
        const newPaidAmount = (foundEntity.paidAmount || 0) + amt;
        const newDueAmount = foundEntity.totalAmount - newPaidAmount;
        const totalInst = parseInt(foundEntity.installmentCount) || 0;
        const paidInst = (foundEntity.paidInstallmentCount || 0) + 1;
        const dueInst = Math.max(0, totalInst - paidInst);

        batch.update(doc(db, 'investments', foundEntity.id), {
          paidAmount: newPaidAmount,
          paidInstallmentCount: paidInst,
          dueAmount: Math.max(0, newDueAmount),
          status: newDueAmount <= 0 ? 'পরিশোধিত' : 'চলমান',
          lastPaymentDate: date
        });

        const trData = {
          type: 'payment',
          investmentId: foundEntity.id,
          customerId: foundEntity.customerId,
          customerName: foundEntity.customerName,
          customerAccountNumber: foundEntity.customerAccountNumber,
          amount: amt,
          fine: f,
          totalWithFine: amt + f,
          date,
          note,
          processedBy,
          createdAt: timestamp,
          code: `TRX-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
          investmentTotalAmount: foundEntity.totalAmount,
          investmentPaidAmount: newPaidAmount,
          investmentDueAmount: Math.max(0, newDueAmount),
          installmentNo: paidInst,
          totalInstallments: totalInst,
          dueInstallments: dueInst
        };
        batch.set(doc(collection(db, 'transactions')), trData);
        setLastTransaction(trData);
      }

      if (activeType === 'settlement') {
        const totalPayable = foundEntity.dueAmount + f - d;
        batch.update(doc(db, 'investments', foundEntity.id), {
          status: 'settled',
          settledAt: timestamp,
          settledAmount: totalPayable,
          fine: f,
          discount: d,
          dueAmount: 0,
          paidAmount: foundEntity.totalAmount,
          paidInstallmentCount: parseInt(foundEntity.installmentCount) || 0
        });

        const trData = {
          type: 'settlement',
          investmentId: foundEntity.id,
          customerId: foundEntity.customerId,
          customerName: foundEntity.customerName,
          customerAccountNumber: foundEntity.customerAccountNumber,
          amount: totalPayable,
          fine: f,
          discount: d,
          date,
          note,
          processedBy,
          createdAt: timestamp,
          code: `SET-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
          investmentTotalAmount: foundEntity.totalAmount,
          investmentPaidAmount: foundEntity.totalAmount,
          investmentDueAmount: 0,
          installmentNo: foundEntity.installmentCount,
          totalInstallments: foundEntity.installmentCount,
          dueInstallments: 0
        };
        batch.set(doc(collection(db, 'transactions')), trData);
        setLastTransaction(trData);
      }

      if (activeType === 'director_deposit' || activeType === 'director_withdrawal') {
        const type = activeType === 'director_deposit' ? 'deposit' : 'withdrawal';
        batch.set(doc(collection(db, 'director_transactions')), {
          directorId: foundEntity.id, date, type, amount: amt, note, processedBy, createdAt: timestamp
        });
        batch.update(doc(db, 'directors', foundEntity.id), {
          balance: increment(type === 'deposit' ? amt : -amt)
        });
      }

      if (activeType === 'bank_deposit' || activeType === 'bank_withdrawal') {
        const type = activeType === 'bank_deposit' ? 'deposit' : 'withdrawal';
        batch.set(doc(collection(db, 'bank_transactions')), {
          bankId: foundEntity.id, date, type, amount: amt, note, processedBy, createdAt: timestamp
        });
        batch.update(doc(db, 'banks', foundEntity.id), {
          balance: increment(type === 'deposit' ? amt : -amt)
        });
      }

      if (activeType === 'expense') {
        batch.set(doc(collection(db, 'transactions')), {
          type: 'expense', amount: amt, note, date, processedBy, createdAt: timestamp
        });
      }

      if (activeType === 'profit_distribution') {
        if (distributionType === 'automatic') {
          const perDirectorAmount = amt / directors.length;
          directors.forEach(d => {
            batch.set(doc(collection(db, 'director_transactions')), {
              directorId: d.id, amount: perDirectorAmount, type: 'profit_distribution', date, note: note || 'স্বয়ংক্রিয় মুনাফা বন্টন', processedBy, createdAt: timestamp
            });
            batch.update(doc(db, 'directors', d.id), {
              totalProfitReceived: increment(perDirectorAmount),
              profitBalance: increment(perDirectorAmount)
            });
          });
          batch.set(doc(collection(db, 'transactions')), {
            type: 'profit_distribution', amount: amt, date, note: note || 'স্বয়ংক্রিয় মুনাফা বন্টন', processedBy, createdAt: timestamp, code: `DIST-${Math.random().toString(36).substr(2, 9).toUpperCase()}`
          });
        } else if (distributionType === 'manual') {
          batch.set(doc(collection(db, 'director_transactions')), {
            directorId: foundEntity.id, amount: amt, type: 'profit_distribution', date, note, processedBy, createdAt: timestamp
          });
          batch.update(doc(db, 'directors', foundEntity.id), {
            totalProfitReceived: increment(amt), profitBalance: increment(amt)
          });
          batch.set(doc(collection(db, 'transactions')), {
            type: 'profit_distribution', relatedId: foundEntity.id, relatedName: foundEntity.name, amount: amt, date, note, processedBy, createdAt: timestamp, code: `DIST-${Math.random().toString(36).substr(2, 9).toUpperCase()}`
          });
        }
      }

      if (activeType === 'profit_withdraw') {
        batch.set(doc(collection(db, 'director_transactions')), {
          directorId: foundEntity.id, amount: amt, type: 'profit_withdraw', date, note, processedBy, createdAt: timestamp
        });
        batch.update(doc(db, 'directors', foundEntity.id), {
          totalProfitWithdrawn: increment(amt), profitBalance: increment(-amt)
        });
        batch.set(doc(collection(db, 'transactions')), {
          type: 'profit_withdraw', relatedId: foundEntity.id, relatedName: foundEntity.name, amount: amt, date, note, processedBy, createdAt: timestamp, code: `WD-${Math.random().toString(36).substr(2, 9).toUpperCase()}`
        });
      }

      await batch.commit();
      setSuccess(true);
      resetForm();
      setTimeout(() => {
        setSuccess(false);
        setActiveType(null);
      }, 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setSearchId('');
    setFoundEntity(null);
    setFoundCustomer(null);
    setAmount('');
    setNote('');
    setFine('0');
    setDiscount('0');
    setDistributionType('select');
    setError('');
    setDate(new Date().toISOString().split('T')[0]);
  };

  const handlePrint = (tr: any) => {
    // Shared print logic...
  };

  const menuItems = [
    { id: 'installment', label: 'কিস্তি আদায়', icon: Receipt, color: 'bg-emerald-500' },
    { id: 'settlement', label: 'বিনিয়োগ নিষ্পত্তি', icon: CheckCircle2, color: 'bg-blue-500' },
    { id: 'director_deposit', label: 'পরিচালকের জমা', icon: UserCircle, color: 'bg-indigo-500' },
    { id: 'director_withdrawal', label: 'পরিচালকের উত্তোলন', icon: ArrowUpRight, color: 'bg-rose-500' },
    { id: 'bank_deposit', label: 'ব্যাংক জমা', icon: Landmark, color: 'bg-amber-500' },
    { id: 'bank_withdrawal', label: 'ব্যাংক উত্তোলন', icon: ArrowDownRight, color: 'bg-orange-500' },
    { id: 'expense', label: 'অফিস খরচ', icon: Wallet, color: 'bg-slate-700' },
    { id: 'profit_distribution', label: 'মুনাফা বন্টন', icon: ArrowUpRight, color: 'bg-indigo-600' },
    { id: 'profit_withdraw', label: 'মুনাফা উত্তোলন', icon: ArrowDownRight, color: 'bg-rose-600' },
  ];

  return (
    <div className="space-y-2 animate-in fade-in duration-500 pb-20 relative min-h-[60vh]">
      {activeType ? (
        <div className="max-w-xl mx-auto space-y-4 animate-in slide-in-from-bottom-4 duration-500 relative">
          <AnimatePresence mode="wait">
            {!foundEntity && (activeType === 'installment' || activeType === 'settlement') ? (
              <motion.div 
                key="search"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="pt-4"
              >
                <div className="bg-white rounded-[1rem] shadow-sm border border-slate-100 p-8 space-y-6">
                  <div className="relative">
                    <input 
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      className="w-full h-16 px-10 bg-white border-[3px] border-[#1e90ff] rounded-full focus:outline-none transition-all font-black text-4xl text-center text-slate-800"
                      value={searchId}
                      onChange={e => setSearchId(e.target.value.replace(/[^0-9]/g, ''))}
                      onKeyDown={e => e.key === 'Enter' && handleSearch()}
                      autoFocus
                    />
                  </div>

                  <button 
                    onClick={handleSearch} 
                    disabled={loading} 
                    className="w-full h-16 bg-[#007bff] hover:bg-[#0069d9] text-white font-black rounded-xl text-3xl active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center shadow-lg"
                  >
                    {loading ? (
                      <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      "খোঁজ করুন"
                    )}
                  </button>

                  {error && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-rose-600 font-bold text-center">
                      {error}
                    </motion.div>
                  )}
                </div>
              </motion.div>
            ) : (foundEntity && (activeType === 'installment' || activeType === 'settlement')) ? (
              <motion.div 
                key="details"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden">
                  <div className="bg-slate-900 p-8 text-white flex items-center gap-6">
                    <div className="w-20 h-20 bg-white/10 rounded-3xl flex items-center justify-center shrink-0 border border-white/10">
                      <UserCircle size={40} />
                    </div>
                    <div>
                      <h4 className="text-2xl font-black tracking-tight">{foundEntity.customerName}</h4>
                      <p className="text-slate-400 font-bold text-sm flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-white/10 rounded-md">হিসাবঃ {toBengaliNumber(foundEntity.customerAccountNumber)}</span>
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                        <span>{foundEntity.status}</span>
                      </p>
                    </div>
                  </div>

                  <div className="p-8 grid grid-cols-2 gap-4">
                    <div className="p-5 bg-slate-50 rounded-3xl border border-slate-100 transition-hover hover:border-emerald-200 group">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 group-hover:text-emerald-500">বিনিয়োগ আইডি</p>
                      <p className="text-xl font-black text-slate-800">{foundEntity.investmentId}</p>
                    </div>
                    <div className="p-5 bg-rose-50 rounded-3xl border border-rose-100 text-rose-700">
                      <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-1">মোট বকেয়া</p>
                      <p className="text-xl font-black">{formatCurrency(foundEntity.dueAmount)}</p>
                    </div>
                    <div className="p-5 bg-emerald-50 rounded-3xl border border-emerald-100 text-emerald-700">
                      <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">মোট আদায়</p>
                      <p className="text-xl font-black">{formatCurrency(foundEntity.paidAmount || 0)}</p>
                    </div>
                    <div className="p-5 bg-blue-50 rounded-3xl border border-blue-100 text-blue-700">
                      <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">কিস্তির হার</p>
                      <p className="text-xl font-black">{toBengaliNumber(foundEntity.paidInstallmentCount || 0)} / {toBengaliNumber(foundEntity.installmentCount)}</p>
                    </div>
                  </div>
                  
                  <form onSubmit={handleSubmit} className="p-8 pt-0 space-y-6">
                    <div className="h-px bg-slate-100" />
                    
                    {activeType === 'installment' && (
                      <div className="space-y-2">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">আজকের কিস্তি আদায়</label>
                        <input 
                          type="number" 
                          required 
                          placeholder="0.00" 
                          className="w-full px-8 py-8 bg-slate-50 border-4 border-emerald-50 rounded-[2.5rem] focus:outline-none focus:border-emerald-500 focus:bg-white transition-all text-5xl font-black text-center text-emerald-600 shadow-inner" 
                          value={amount} 
                          onChange={e => setAmount(e.target.value)} 
                          autoFocus
                        />
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-1">জরিমানা</label>
                        <input type="number" className="w-full p-5 bg-slate-50 border-2 border-slate-50 rounded-2xl font-black text-center focus:border-slate-200 focus:bg-white outline-none" value={fine} onChange={e => setFine(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-1">তারিখ</label>
                        <div className="flex gap-1">
                          <input type="date" required className="flex-1 p-5 bg-slate-50 border-2 border-slate-50 rounded-2xl font-black text-xs text-center focus:border-slate-200 focus:bg-white outline-none" value={date} onChange={e => setDate(e.target.value)} />
                          <button
                            type="button"
                            onClick={() => setDate(new Date().toISOString().split('T')[0])}
                            className="px-3 bg-slate-900 text-white rounded-2xl text-[10px] font-bold active:scale-95 transition-transform"
                          >
                            Today
                          </button>
                        </div>
                      </div>
                    </div>

                    <textarea 
                      placeholder="অতিরিক্ত কোনো তথ্য বা মন্তব্য (ঐচ্ছিক)..." 
                      className="w-full p-6 bg-slate-50 border-2 border-slate-50 rounded-2xl font-bold min-h-[120px] focus:outline-none focus:border-slate-200 focus:bg-white transition-all outline-none" 
                      value={note} 
                      onChange={e => setNote(e.target.value)} 
                    />

                    {error && (
                      <div className="p-4 bg-rose-50 text-rose-600 rounded-2xl text-xs font-bold border border-rose-100 flex items-center gap-2 justify-center">
                        <AlertCircle size={14} />
                        {error}
                      </div>
                    )}

                    <button 
                      type="submit" 
                      disabled={loading} 
                      className="w-full py-8 bg-slate-900 hover:bg-black text-white rounded-[2.5rem] font-black text-2xl active:scale-[0.98] transition-all disabled:opacity-50 shadow-2xl shadow-slate-200 flex items-center justify-center h-[88px]"
                    >
                      {loading ? (
                        <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        activeType === 'installment' ? 'আদায় নিশ্চিত করুন' : 'বিনিয়োগ নিষ্পত্তি নিশ্চিত করুন'
                      )}
                    </button>
                  </form>
                </div>
              </motion.div>
            ) : (activeType !== 'installment' && activeType !== 'settlement') && (
              <motion.div 
                key="others"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden"
              >
                {activeType === 'profit_distribution' && (
                  <div className="p-6 bg-indigo-50 border-b border-indigo-100 flex justify-between items-center">
                    <span className="text-xs font-black text-indigo-400 uppercase tracking-widest">নিট মুনাফাঃ</span>
                    <span className="text-xl font-black text-indigo-700">{formatCurrency(calculateNetProfit())}</span>
                  </div>
                )}
                
                <form onSubmit={handleSubmit} className="p-8 space-y-6">
                  {activeType === 'profit_distribution' && (
                    <select required className="w-full p-4 bg-slate-50 border rounded-2xl font-bold" value={distributionType} onChange={e => setDistributionType(e.target.value as any)}>
                      <option value="select">বন্টন পদ্ধতি নির্বাচন করুন</option>
                      <option value="automatic">স্বয়ংক্রিয় বন্টন</option>
                      <option value="manual">ম্যানুয়াল বন্টন</option>
                    </select>
                  )}
                  
                  {(activeType === 'director_deposit' || activeType === 'director_withdrawal' || activeType === 'profit_withdraw' || (activeType === 'profit_distribution' && distributionType === 'manual')) && (
                    <select required className="w-full p-4 bg-slate-50 border rounded-2xl font-bold" onChange={e => setFoundEntity(directors.find(d => d.id === e.target.value))}>
                      <option value="">পরিচালক নির্বাচন করুন</option>
                      {directors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  )}

                  {(activeType === 'bank_deposit' || activeType === 'bank_withdrawal') && (
                    <select required className="w-full p-4 bg-slate-50 border rounded-2xl font-bold" onChange={e => setFoundEntity(banks.find(b => b.id === e.target.value))}>
                      <option value="">ব্যাংক একাউন্ট নির্বাচন করুন</option>
                      {banks.map(b => <option key={b.id} value={b.id}>{b.accountName}</option>)}
                    </select>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">টাকার পরিমাণ</label>
                      <input type="number" required className="w-full p-4 bg-slate-50 border rounded-2xl font-black text-xl" value={amount} onChange={e => setAmount(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">তারিখ</label>
                      <div className="flex gap-1">
                        <input type="date" required className="flex-1 p-4 bg-slate-50 border rounded-2xl font-bold text-xs text-center" value={date} onChange={e => setDate(e.target.value)} />
                        <button
                          type="button"
                          onClick={() => setDate(new Date().toISOString().split('T')[0])}
                          className="px-4 bg-slate-900 text-white rounded-2xl text-[10px] font-bold active:scale-95 transition-transform"
                        >
                          Today
                        </button>
                      </div>
                    </div>
                  </div>

                  <textarea placeholder="মন্তব্য..." className="w-full p-4 bg-slate-50 border rounded-2xl font-bold min-h-[100px]" value={note} onChange={e => setNote(e.target.value)} />
                  {error && <div className="p-4 bg-rose-50 text-rose-600 rounded-xl text-xs font-bold">{error}</div>}
                  <button type="submit" disabled={loading} className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-lg active:scale-95 disabled:opacity-50">
                    {loading ? 'প্রক্রিয়াধীন...' : 'সাবমিট করুন'}
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        <>
          <div>
            <h2 className="text-2xl font-black text-slate-800">লেনদেন মেনু</h2>
            <p className="text-sm font-bold text-slate-400">সিস্টেমের সকল লেনদেন এখান থেকে পরিচালনা করুন</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {menuItems.map((item) => (
              <motion.button
                key={item.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setActiveType(item.id as TransactionType)}
                className="group bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm transition-all flex items-center justify-between"
              >
                <div className="flex items-center gap-5">
                  <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-lg", item.color)}>
                    <item.icon size={28} />
                  </div>
                  <div className="text-left">
                    <h3 className="font-black text-slate-800 text-lg leading-tight">{item.label}</h3>
                    <p className="text-xs font-bold text-slate-400">ক্লিক করে এগিয়ে যান</p>
                  </div>
                </div>
                <ChevronRight size={20} className="text-slate-300" />
              </motion.button>
            ))}
          </div>
        </>
      )}

      {/* Global Success Notification */}
      <AnimatePresence>
        {success && (
          <motion.div 
            initial={{ opacity: 0, y: 100, scale: 0.8 }} 
            animate={{ opacity: 1, y: 0, scale: 1 }} 
            exit={{ opacity: 0, y: 50, scale: 0.8 }} 
            className="fixed bottom-24 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:w-96 bg-emerald-600 text-white p-6 rounded-[2.5rem] shadow-[0_20px_50px_rgba(16,185,129,0.4)] z-[200] flex flex-col items-center gap-2 border-4 border-white text-center"
          >
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-2">
              <CheckCircle2 size={40} className="text-white" />
            </div>
            <h3 className="text-2xl font-black tracking-tight">সফল হয়েছে!</h3>
            <p className="text-emerald-50 font-bold mb-2">লেনদেনটি ডাটাবেজে সংরক্ষিত হয়েছে।</p>
            {lastTransaction?.type === 'payment' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handlePrint(lastTransaction);
                }}
                className="flex items-center gap-2 px-6 py-2 bg-white text-emerald-600 rounded-full font-black hover:bg-emerald-50 transition-colors active:scale-95 shadow-lg"
              >
                <Printer size={20} />
                রশিদ প্রিন্ট
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
