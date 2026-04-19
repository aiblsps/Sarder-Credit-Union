import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from './firebase';
import { formatCurrency, toBengaliNumber, cn } from './lib/utils';
import { Calendar, ArrowLeft, Search, ChevronRight, TrendingUp, TrendingDown, Wallet, Trash2, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from './AuthContext';

type ViewState = 'list' | 'profit-loss-step1' | 'profit-loss-report' | 'investment-report' | 'overall-report' | 'expense-report-step1' | 'expense-report';

export const Reports = () => {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<ViewState>('list');
  const [fromDate, setFromDate] = useState(new Date().toISOString().split('T')[0]);
  const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Expense Report Dates
  const [expFromDate, setExpFromDate] = useState(new Date().toISOString().split('T')[0]);
  const [expToDate, setExpToDate] = useState(new Date().toISOString().split('T')[0]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  
  const [data, setData] = useState({
    investments: [] as any[],
    transactions: [] as any[],
    customers: [] as any[],
    directorTransactions: [] as any[],
    bankTransactions: [] as any[],
  });

  // Investment Report Filters
  const [invFilterType, setInvFilterType] = useState('সিলেক্ট করুন');
  const [invYear, setInvYear] = useState(new Date().getFullYear().toString());
  const [invMonth, setInvMonth] = useState((new Date().getMonth() + 1).toString());
  const [invAccount, setInvAccount] = useState('');

  useEffect(() => {
    const onBack = (e: Event) => {
      if (showDeleteConfirm) {
        e.preventDefault();
        setShowDeleteConfirm(null);
      } else if (showSuccess) {
        e.preventDefault();
        setShowSuccess(false);
      } else if (view !== 'list') {
        e.preventDefault();
        handleBack();
      }
    };
    window.addEventListener('app:back', onBack);
    return () => window.removeEventListener('app:back', onBack);
  }, [view, showDeleteConfirm, showSuccess]);

  useEffect(() => {
    const unsubI = onSnapshot(collection(db, 'investments'), (snap) => {
      setData(prev => ({ ...prev, investments: snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) }));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'investments');
    });
    const unsubT = onSnapshot(collection(db, 'transactions'), (snap) => {
      setData(prev => ({ ...prev, transactions: snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) }));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'transactions');
    });
    const unsubC = onSnapshot(collection(db, 'customers'), (snap) => {
      setData(prev => ({ ...prev, customers: snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) }));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'customers');
    });
    const unsubDT = onSnapshot(collection(db, 'director_transactions'), (snap) => {
      setData(prev => ({ ...prev, directorTransactions: snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) }));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'director_transactions');
    });
    const unsubBT = onSnapshot(collection(db, 'bank_transactions'), (snap) => {
      setData(prev => ({ ...prev, bankTransactions: snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) }));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'bank_transactions');
    });

    return () => { unsubI(); unsubT(); unsubC(); unsubDT(); unsubBT(); };
  }, []);

  const handleBack = () => {
    if (view === 'profit-loss-report') setView('profit-loss-step1');
    else if (view === 'expense-report') setView('expense-report-step1');
    else setView('list');
  };

  const handleDeleteExpense = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'transactions', id));
      setShowDeleteConfirm(null);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error("Error deleting expense:", error);
    }
  };

  const renderReportList = () => (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-white border border-black overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-200 border-b border-black">
              <th className="px-4 py-3 text-[13px] font-black text-black uppercase tracking-widest w-12 border-r border-black text-center">ক্রমিক</th>
              <th className="px-4 py-3 text-[13px] font-black text-black uppercase tracking-widest border-r border-black text-center">শিরোনাম</th>
              <th className="px-4 py-3 text-[13px] font-black text-black uppercase tracking-widest text-center w-32">প্রতিবেদন</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black">
            <tr className="hover:bg-slate-50/50 transition-colors group">
              <td className="px-4 py-2 text-[12px] font-bold text-slate-500 border-r border-black text-center">{toBengaliNumber(1)}</td>
              <td className="px-4 py-2 text-[12px] font-bold text-slate-800 border-r border-black">লাভ-ক্ষতি রিপোর্ট সংক্রান্ত</td>
              <td className="px-4 py-2 text-center">
                <button 
                  onClick={() => setView('profit-loss-step1')}
                  className="inline-flex items-center gap-2 px-3 py-1 bg-blue-600 text-white text-[10px] font-bold hover:bg-blue-700 transition-all active:scale-95"
                >
                  প্রতিবেদন
                  <ChevronRight size={12} />
                </button>
              </td>
            </tr>
            <tr className="hover:bg-slate-50/50 transition-colors group">
              <td className="px-4 py-2 text-[12px] font-bold text-slate-500 border-r border-black text-center">{toBengaliNumber(2)}</td>
              <td className="px-4 py-2 text-[12px] font-bold text-slate-800 border-r border-black">সর্বমোট হিসাব প্রতিবেদন</td>
              <td className="px-4 py-2 text-center">
                <button 
                  onClick={() => setView('overall-report')}
                  className="inline-flex items-center gap-2 px-3 py-1 bg-blue-600 text-white text-[10px] font-bold hover:bg-blue-700 transition-all active:scale-95"
                >
                  প্রতিবেদন
                  <ChevronRight size={12} />
                </button>
              </td>
            </tr>
            <tr className="hover:bg-slate-50/50 transition-colors group">
              <td className="px-4 py-2 text-[12px] font-bold text-slate-500 border-r border-black text-center">{toBengaliNumber(3)}</td>
              <td className="px-4 py-2 text-[12px] font-bold text-slate-800 border-r border-black">সব ব্যয়</td>
              <td className="px-4 py-2 text-center">
                <button 
                  onClick={() => setView('expense-report-step1')}
                  className="inline-flex items-center gap-2 px-3 py-1 bg-blue-600 text-white text-[10px] font-bold hover:bg-blue-700 transition-all active:scale-95"
                >
                  প্রতিবেদন
                  <ChevronRight size={12} />
                </button>
              </td>
            </tr>
            <tr className="hover:bg-slate-50/50 transition-colors group">
              <td className="px-4 py-2 text-[12px] font-bold text-slate-500 border-r border-black text-center">{toBengaliNumber(4)}</td>
              <td className="px-4 py-2 text-[12px] font-bold text-slate-800 border-r border-black">লেনদেন বিবরণি</td>
              <td className="px-4 py-2 text-center">
                <button 
                  onClick={() => navigate('/transaction-report')}
                  className="inline-flex items-center gap-2 px-3 py-1 bg-blue-600 text-white text-[10px] font-bold hover:bg-blue-700 transition-all active:scale-95"
                >
                  প্রতিবেদন
                  <ChevronRight size={12} />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderProfitLossStep1 = () => (
    <div className="max-w-xl mx-auto space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white p-6 border border-black space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-2 border border-blue-100">
            <Calendar size={24} />
          </div>
          <h3 className="text-lg font-black text-slate-800">সময়কাল নির্বাচন করুন</h3>
          <p className="text-slate-400 text-[10px] font-bold">রিপোর্ট দেখার জন্য তারিখ নির্বাচন করুন</p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">From Date</label>
            <input 
              type="date"
              className="w-full p-3 bg-slate-50 border border-black focus:outline-none font-bold text-xs text-slate-700"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">To Date</label>
            <input 
              type="date"
              className="w-full p-3 bg-slate-50 border border-black focus:outline-none font-bold text-xs text-slate-700"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
            />
          </div>
        </div>

        <button 
          onClick={() => setView('profit-loss-report')}
          className="w-full py-3 bg-blue-600 text-white font-black text-sm hover:bg-blue-700 transition-all active:scale-95"
        >
          রিপোর্ট দেখুন
        </button>
      </div>
    </div>
  );

  const renderProfitLossReport = () => {
    const filteredTransactions = data.transactions.filter(t => t.date >= fromDate && t.date <= toDate);
    
    let investmentProfit = 0;
    let totalFine = 0;
    
    filteredTransactions.forEach(t => {
      if (t.type === 'payment' || t.type === 'settlement') {
        totalFine += (t.fine || 0);
        const inv = data.investments.find(i => i.id === t.investmentId);
        if (inv && inv.totalAmount > 0) {
          if (t.type === 'settlement') {
            const ratio = inv.profitAmount / inv.totalAmount;
            const expectedProfit = ((t.amount + (t.discount || 0)) * ratio) - (t.discount || 0);
            investmentProfit += Math.max(0, expectedProfit);
          } else {
            const profitPortion = t.amount * (inv.profitAmount / inv.totalAmount);
            investmentProfit += profitPortion;
          }
        }
      }
    });

    const expenses = filteredTransactions.filter(t => t.type === 'expense');
    const totalIncome = investmentProfit + totalFine;
    const totalExpense = expenses.reduce((acc, curr) => acc + (curr.amount || 0), 0);
    const netProfitLoss = totalIncome - totalExpense;

    const incomeRows = [
      { name: 'কিস্তি থেকে মুনাফা', amount: investmentProfit },
      { name: 'জরিমানা', amount: totalFine }
    ];

    const maxRows = Math.max(incomeRows.length, expenses.length);

    return (
      <div className="space-y-4 animate-in fade-in duration-500 pb-20">
        <div className="border border-black overflow-hidden">
          {/* Header */}
          <div className="bg-[#CCEEFF] border-b border-black p-3 text-center">
            <h2 className="text-lg md:text-xl font-black text-black">
              লাভ-ক্ষতি প্রতিবেদন: || {toBengaliNumber(fromDate.split('-').reverse().join('-'))} থেকে {toBengaliNumber(toDate.split('-').reverse().join('-'))}
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse table-auto">
            <thead>
              {/* Top Header */}
              <tr className="bg-amber-100 border-b border-black text-[12px]">
                <th colSpan={3} className="border-r border-black py-1.5 text-center font-black text-black">আয়</th>
                <th colSpan={2} className="py-1.5 text-center font-black text-black">ব্যয়</th>
              </tr>
              {/* Sub Header */}
              <tr className="bg-amber-50 border-b border-black text-[11px]">
                <th className="border-r border-black py-1 px-2 text-center text-black font-black w-min">ক্রমিক</th>
                <th className="border-r border-black py-1 px-3 text-center text-black font-black">হিসাবের নাম</th>
                <th className="border-r border-black py-1 px-3 text-center text-black font-black">পরিমাণ</th>
                <th className="border-r border-black py-1 px-3 text-center text-black font-black">হিসাবের নাম</th>
                <th className="py-1 px-3 text-center text-black font-black">পরিমাণ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black">
              {Array.from({ length: maxRows }).map((_, idx) => (
                <tr key={idx} className="text-[10px]">
                  {/* Income side */}
                  <td className="border-r border-black py-0.5 px-2 text-center font-bold">
                    {incomeRows[idx] ? toBengaliNumber(idx + 1) : ''}
                  </td>
                  <td className="border-r border-black py-0.5 px-3 font-bold">
                    {incomeRows[idx]?.name || ''}
                  </td>
                  <td className="border-r border-black py-0.5 px-3 text-center font-bold">
                    {incomeRows[idx] ? toBengaliNumber(Math.round(incomeRows[idx].amount)) : ''}
                  </td>
                  {/* Expense side */}
                  <td className="border-r border-black py-0.5 px-3 font-bold">
                    {expenses[idx]?.note || (expenses[idx] ? 'অফিস খরচ' : '')}
                  </td>
                  <td className="py-0.5 px-3 text-center font-bold">
                    {expenses[idx] ? toBengaliNumber(Math.round(expenses[idx].amount)) : ''}
                  </td>
                </tr>
              ))}
              {/* Summary Row */}
              <tr className="text-[10px] font-black">
                <td colSpan={2} className="border-r border-black py-0.5 px-3 text-center">মোট আয় :</td>
                <td className="border-r border-black py-0.5 px-3 text-center">{toBengaliNumber(Math.round(totalIncome))}</td>
                <td className="border-r border-black py-0.5 px-3 text-center">মোট ব্যয় :</td>
                <td className="py-0.5 px-3 text-center">{toBengaliNumber(Math.round(totalExpense))}</td>
              </tr>
              {/* Net Result Row */}
              <tr className="text-xs font-black border-t border-black">
                <td colSpan={4} className="border-r border-black py-1 px-3 text-center">এই সময়ের ক্ষতি/লাভ :</td>
                <td className="py-1 px-3 text-center">{toBengaliNumber(Math.round(netProfitLoss))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
    );
  };

  const renderInvestmentReport = () => {
    let filtered = [] as any[];
    
    if (invFilterType !== 'সিলেক্ট করুন') {
      filtered = data.investments.filter(inv => {
        if (invFilterType === 'সব হিসাব দেখুন') return true;
        
        if (invFilterType === 'বছর অনুযায়ী দেখুন') {
          return inv.startDate?.startsWith(invYear);
        }
        
        if (invFilterType === 'মাস অনুযায়ী দেখুন') {
          const target = `${invYear}-${invMonth.padStart(2, '0')}`;
          return inv.startDate?.startsWith(target);
        }
        
        if (invFilterType === 'একাউন্ট নাম্বার দিয়ে দেখুন') {
          return inv.customerAccountNumber === invAccount;
        }
        
        return false;
      });
    }

    const summary = {
      count: filtered.length,
      totalPrincipal: filtered.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0),
      totalWithProfit: filtered.reduce((acc, curr) => acc + (curr.totalAmount || 0), 0)
    };

    const months = [
      { id: '1', name: 'জানুয়ারি' }, { id: '2', name: 'ফেব্রুয়ারি' }, { id: '3', name: 'মার্চ' },
      { id: '4', name: 'এপ্রিল' }, { id: '5', name: 'মে' }, { id: '6', name: 'জুন' },
      { id: '7', name: 'জুলাই' }, { id: '8', name: 'আগস্ট' }, { id: '9', name: 'সেপ্টেম্বর' },
      { id: '10', name: 'অক্টোবর' }, { id: '11', name: 'নভেম্বর' }, { id: '12', name: 'ডিসেম্বর' }
    ];

    return (
      <div className="space-y-4 animate-in fade-in duration-500 pb-20">
        <div className="flex items-center justify-end">
          <h2 className="text-xl font-black text-slate-800">বিনিয়োগ সংক্রান্ত রিপোর্ট</h2>
        </div>

        {/* Filters */}
        <div className="bg-white p-4 border border-black space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">ফিল্টার ধরন</label>
              <select 
                className="w-full p-2 bg-slate-50 border border-black focus:outline-none font-bold text-[11px]"
                value={invFilterType}
                onChange={e => setInvFilterType(e.target.value)}
              >
                <option value="সিলেক্ট করুন">সিলেক্ট করুন</option>
                <option value="সব হিসাব দেখুন">সব হিসাব দেখুন</option>
                <option value="বছর অনুযায়ী দেখুন">বছর অনুযায়ী দেখুন</option>
                <option value="মাস অনুযায়ী দেখুন">মাস অনুযায়ী দেখুন</option>
                <option value="একাউন্ট নাম্বার দিয়ে দেখুন">একাউন্ট নাম্বার দিয়ে দেখুন</option>
              </select>
            </div>

            {invFilterType === 'বছর অনুযায়ী দেখুন' && (
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">বছর</label>
                <input 
                  type="number"
                  placeholder="২০২৪"
                  className="w-full p-2 bg-slate-50 border border-black focus:outline-none font-bold text-[11px]"
                  value={invYear}
                  onChange={e => setInvYear(e.target.value)}
                />
              </div>
            )}

            {invFilterType === 'মাস অনুযায়ী দেখুন' && (
              <>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">বছর</label>
                  <input 
                    type="number"
                    placeholder="২০২৪"
                    className="w-full p-2 bg-slate-50 border border-black focus:outline-none font-bold text-[11px]"
                    value={invYear}
                    onChange={e => setInvYear(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">মাস</label>
                  <select 
                    className="w-full p-2 bg-slate-50 border border-black focus:outline-none font-bold text-[11px]"
                    value={invMonth}
                    onChange={e => setInvMonth(e.target.value)}
                  >
                    {months.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              </>
            )}

            {invFilterType === 'একাউন্ট নাম্বার দিয়ে দেখুন' && (
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">একাউন্ট নাম্বার</label>
                <input 
                  type="text"
                  placeholder="একাউন্ট নাম্বার লিখুন"
                  className="w-full p-2 bg-slate-50 border border-black focus:outline-none font-bold text-[11px]"
                  value={invAccount}
                  onChange={e => setInvAccount(e.target.value)}
                />
              </div>
            )}
          </div>
        </div>

        {invFilterType !== 'সিলেক্ট করুন' ? (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-white p-4 border border-black">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">বিনিয়োগের সংখ্যা</p>
                <h4 className="text-lg font-black text-slate-800">{toBengaliNumber(summary.count)} টি</h4>
              </div>
              <div className="bg-white p-4 border border-black">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">বিনিয়োগের মোট পরিমাণ</p>
                <h4 className="text-lg font-black text-emerald-600">{formatCurrency(summary.totalPrincipal)}</h4>
              </div>
              <div className="bg-white p-4 border border-black">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">মুনাফাসহ মোট পরিমাণ</p>
                <h4 className="text-lg font-black text-blue-600">{formatCurrency(summary.totalWithProfit)}</h4>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white border border-black overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead>
                  <tr className="bg-blue-100 text-black text-[11px]">
                    <th className="px-2 py-2 font-black uppercase tracking-widest border border-black w-12 text-center">ক্রমিক নং</th>
                    <th className="px-2 py-2 font-black uppercase tracking-widest border border-black text-center">গ্রাহকের নাম</th>
                    <th className="px-2 py-2 font-black uppercase tracking-widest border border-black text-center">একাউন্ট নাম্বার</th>
                    <th className="px-2 py-2 font-black uppercase tracking-widest border border-black text-center">এরিয়া</th>
                    <th className="px-2 py-2 font-black uppercase tracking-widest border border-black text-center">মোবাইল নাম্বার</th>
                    <th className="px-2 py-2 font-black uppercase tracking-widest border border-black text-center">বিনিয়োগের পরিমাণ</th>
                    <th className="px-2 py-2 font-black uppercase tracking-widest border border-black text-center">মুনাফা সহ মোট</th>
                    <th className="px-2 py-2 font-black uppercase tracking-widest border border-black text-center">প্রদানের তারিখ</th>
                    <th className="px-2 py-2 font-black uppercase tracking-widest border border-black text-center">শেষ হবার তারিখ</th>
                    <th className="px-2 py-2 font-black uppercase tracking-widest border border-black text-center">স্ট্যাটাস</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black">
                  {filtered.length > 0 ? filtered.map((inv, idx) => {
                    const customer = data.customers.find(c => c.id === inv.customerId);
                    return (
                      <tr key={inv.id} className="hover:bg-slate-50 transition-colors text-[10px]">
                        <td className="px-2 py-0.5 text-center font-bold text-slate-500 border border-black">{toBengaliNumber(idx + 1)}</td>
                        <td className="px-2 py-0.5 font-bold text-slate-800 border border-black text-center">{inv.customerName}</td>
                        <td className="px-2 py-0.5 font-mono font-bold text-emerald-700 border border-black text-center">{toBengaliNumber(inv.customerAccountNumber)}</td>
                        <td className="px-2 py-0.5 font-bold text-slate-800 border border-black text-center">{customer?.area || inv.area || '---'}</td>
                        <td className="px-2 py-0.5 font-bold text-slate-600 border border-black text-center">
                          <a 
                            href={`tel:${customer?.mobile}`}
                            className="hover:text-blue-700 hover:underline transition-colors"
                          >
                            {toBengaliNumber(customer?.mobile || '---')}
                          </a>
                        </td>
                        <td className="px-2 py-0.5 font-black text-slate-800 border border-black text-center">{formatCurrency(inv.amount)}</td>
                        <td className="px-2 py-0.5 font-black text-blue-600 border border-black text-center">{formatCurrency(inv.totalAmount)}</td>
                        <td className="px-2 py-0.5 font-bold text-slate-500 border border-black text-center">{toBengaliNumber(inv.startDate?.split('-').reverse().join('-') || '---')}</td>
                        <td className="px-2 py-0.5 font-bold text-slate-500 border border-black text-center">{toBengaliNumber(inv.endDate?.split('-').reverse().join('-') || '---')}</td>
                        <td className="px-2 py-0.5 border border-black text-center">
                          <span className={cn(
                            "px-1.5 py-0 text-[7px] font-black uppercase tracking-widest",
                            inv.status === 'চলমান' ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"
                          )}>
                            {inv.status}
                          </span>
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan={9} className="px-6 py-10 text-center text-slate-400 font-bold italic border border-black">কোন তথ্য পাওয়া যায়নি</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="bg-white p-12 text-center border border-black">
            <Search size={32} className="mx-auto text-slate-200 mb-2" />
            <p className="text-sm font-black text-slate-400 italic">দয়া করে ফিল্টার নির্বাচন করুন</p>
          </div>
        )}
      </div>
    );
  };

  const renderOverallReport = () => {
    // 1. Director Stats
    let totalDirectorDeposit = 0;
    let totalDirectorWithdrawal = 0;
    let totalProfitDistribution = 0;
    let totalProfitWithdrawal = 0;

    data.directorTransactions.forEach(t => {
      if (t.type === 'deposit') totalDirectorDeposit += t.amount || 0;
      if (t.type === 'withdrawal') totalDirectorWithdrawal += t.amount || 0;
      if (t.type === 'profit_distribution') totalProfitDistribution += t.amount || 0;
      if (t.type === 'profit_withdraw') totalProfitWithdrawal += t.amount || 0;
    });

    // 2. Bank Stats
    let totalBankDeposit = 0;
    let totalBankWithdrawal = 0;
    data.bankTransactions.forEach(t => {
      if (t.type === 'deposit') totalBankDeposit += t.amount || 0;
      if (t.type === 'withdrawal') totalBankWithdrawal += t.amount || 0;
    });
    const currentBankBalance = totalBankDeposit - totalBankWithdrawal;

    // 3. Investment & Transaction Stats
    let totalInvestmentGiven = 0;
    data.investments.forEach(inv => {
      totalInvestmentGiven += parseFloat(inv.amount) || 0;
    });

    let totalPrincipalCollected = 0;
    let totalProfitCollected = 0;
    let totalFineCollected = 0;
    let totalExpense = 0;

    data.transactions.forEach(t => {
      if (t.type === 'payment' || t.type === 'settlement') {
        totalFineCollected += (t.fine || 0);
        const inv = data.investments.find(i => i.id === t.investmentId);
        if (inv && inv.totalAmount > 0) {
          if (t.type === 'settlement') {
            // Subtract full discount from the profit portion for settlements
            const ratio = inv.profitAmount / inv.totalAmount;
            const expectedProfit = ((t.amount + (t.discount || 0)) * ratio) - (t.discount || 0);
            const actualProfit = Math.max(0, expectedProfit);
            totalProfitCollected += actualProfit;
            totalPrincipalCollected += (t.amount - actualProfit);
          } else {
            const profitPortion = t.amount * (inv.profitAmount / inv.totalAmount);
            totalProfitCollected += profitPortion;
            totalPrincipalCollected += (t.amount - profitPortion);
          }
        }
      } else if (t.type === 'expense') {
        totalExpense += t.amount || 0;
      }
    });

    // Calculate Outstanding Profit (Profit from ongoing investments)
    let totalOutstandingProfit = 0;
    data.investments.forEach(inv => {
      if (inv.status === 'চলমান') {
        const total = inv.totalAmount || 0;
        const profit = parseFloat(inv.profitAmount) || 0;
        const due = inv.dueAmount || 0;
        if (total > 0) {
          totalOutstandingProfit += (due * (profit / total));
        }
      }
    });

    // 4. Cash Calculation (Strictly following user formula + bank movement)
    // Cash = (Dir Dep - Dir Wd) - Inv Given + (Prin Coll + Prof Coll + Fine Coll) - Expense - Bank Dep + Bank Wd - Prof Wd
    const currentCash = (totalDirectorDeposit - totalDirectorWithdrawal) 
                      - totalInvestmentGiven 
                      + (totalPrincipalCollected + totalProfitCollected + totalFineCollected) 
                      - totalExpense 
                      - totalBankDeposit 
                      + totalBankWithdrawal 
                      - totalProfitWithdrawal;

    const totalStatus = currentCash + currentBankBalance;
    const arrears = totalInvestmentGiven - totalPrincipalCollected;
    
    // 5. Profit Calculation
    const totalEarnedProfit = totalProfitCollected + totalFineCollected;
    const netProfit = totalEarnedProfit - totalProfitDistribution;
    
    // 6. Final Balance (Total Money)
    // Total Money = (Dir Dep - Dir Wd) + Earned Profit - Prof Wd - totalExpense
    const totalMoney = (totalDirectorDeposit - totalDirectorWithdrawal) + totalEarnedProfit - totalProfitWithdrawal - totalExpense;

    // 7. Verification
    // Total Money == Cash + Bank + Arrears
    const verificationSum = currentCash + currentBankBalance + arrears;
    const isMatched = Math.abs(totalMoney - verificationSum) < 1;

    return (
      <div className="space-y-6 animate-in fade-in duration-500 pb-20">
        <div className="flex items-center justify-end">
          <div className="text-right">
             <h2 className="text-xl font-black text-slate-800">সর্বমোট হিসাব প্রতিবেদন</h2>
             <p className="text-[10px] font-bold text-slate-400">বর্তমান অবস্থা পর্যন্ত</p>
          </div>
        </div>

        {/* 1. Report Header */}
        <div className="bg-white border-2 border-black p-6 text-center space-y-2">
          <h1 className="text-3xl font-black text-slate-900">Sarder Credit Union</h1>
          <div className="h-1 bg-black w-48 mx-auto" />
          <h2 className="text-lg font-bold text-slate-700 uppercase tracking-widest">সর্বমোট হিসাব প্রতিবেদন (বর্তমান অবস্থা)</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 2. Summary Section */}
          <div className="bg-white border border-black overflow-hidden">
            <div className="bg-slate-800 text-white px-4 py-2 font-black text-xs uppercase tracking-widest">
              ২. মূল সারসংক্ষেপ (Summary)
            </div>
            <div className="p-4 space-y-3">
              <SummaryRow label="মোট পরিচালক জমা" value={totalDirectorDeposit} />
              <SummaryRow label="মোট পরিচালক উত্তোলন" value={totalDirectorWithdrawal} />
              <div className="h-px bg-slate-200" />
              <SummaryRow label="মোট বিনিয়োগ প্রদান" value={totalInvestmentGiven} color="text-blue-600" />
              <SummaryRow label="মোট আদায়" value={totalPrincipalCollected + totalProfitCollected + totalFineCollected} color="text-emerald-600" />
              <div className="h-px bg-slate-200" />
              <SummaryRow label="মোট মুনাফা (Earned Profit)" value={totalProfitCollected} />
              <SummaryRow label="মোট জরিমানা" value={totalFineCollected} />
              <SummaryRow label="মোট ব্যয়" value={totalExpense} color="text-red-600" />
              <div className="h-px bg-slate-200" />
              <SummaryRow label="মোট মুনাফা বন্টন" value={totalProfitDistribution} color="text-indigo-600" />
              <SummaryRow label="মোট মুনাফা উত্তোলন" value={totalProfitWithdrawal} color="text-orange-600" />
            </div>
          </div>

          <div className="space-y-6">
            {/* 3. Cash & Bank Section */}
            <div className="bg-white border border-black overflow-hidden">
              <div className="bg-emerald-600 text-white px-4 py-2 font-black text-xs uppercase tracking-widest">
                ৩. ক্যাশ ও ব্যাংক হিসাব
              </div>
              <div className="p-4 space-y-3">
                <SummaryRow label="বর্তমান ক্যাশ" value={currentCash} />
                <SummaryRow label="বর্তমান ব্যাংক ব্যালেন্স" value={currentBankBalance} />
                <div className="h-px bg-emerald-100" />
                <SummaryRow label="মোট স্থিতি (ক্যাশ + ব্যাংক)" value={totalStatus} fontClass="font-black text-lg" />
              </div>
            </div>

            {/* 4. Due Account Section */}
            <div className="bg-white border border-black overflow-hidden">
              <div className="bg-amber-500 text-white px-4 py-2 font-black text-xs uppercase tracking-widest">
                ৪. বকেয়া হিসাব (Outstanding)
              </div>
              <div className="p-4 space-y-3">
                <SummaryRow label="মোট বিনিয়োগ প্রদান" value={totalInvestmentGiven} />
                <SummaryRow label="মোট আদায় (আসল)" value={totalPrincipalCollected} />
                <div className="h-px bg-amber-100" />
                <SummaryRow label="বর্তমান বকেয়া (আসল)" value={arrears} color="text-amber-600" fontClass="font-black text-lg" />
                <SummaryRow label="বকেয়া মুনাফা (Outstanding Profit)" value={totalOutstandingProfit} />
                <div className="h-px bg-amber-100" />
                <SummaryRow label="মোট বকেয়া (আসল + মুনাফা)" value={arrears + totalOutstandingProfit} color="text-amber-700" fontClass="font-black text-lg" />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 5. Profit/Loss Section */}
          <div className="bg-white border border-black overflow-hidden">
            <div className="bg-blue-600 text-white px-4 py-2 font-black text-xs uppercase tracking-widest">
              ৫. লাভ-ক্ষতি হিসাব
            </div>
            <div className="p-4 space-y-3">
              <SummaryRow label="মোট মুনাফা" value={totalProfitCollected} />
              <SummaryRow label="মোট জরিমানা" value={totalFineCollected} />
              <SummaryRow label="মোট ব্যয়" value={totalExpense} />
              <div className="h-px bg-blue-100" />
              <SummaryRow label="মোট অর্জিত মুনাফা" value={totalEarnedProfit} color="text-blue-700" fontClass="font-black" />
              <SummaryRow label="মুনাফা বন্টন" value={totalProfitDistribution} color="text-indigo-600" />
              <div className="h-px bg-blue-100" />
              <SummaryRow label="নিট মুনাফা" value={netProfit} color="text-emerald-700" fontClass="font-black text-lg" />
            </div>
          </div>

          {/* 6. Final Balance Section */}
          <div className="bg-slate-900 text-white border border-black overflow-hidden">
            <div className="bg-black text-white px-4 py-2 font-black text-xs uppercase tracking-widest">
              ৬. চূড়ান্ত ব্যালেন্স ও প্রাপ্য
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 gap-6">
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">চূড়ান্ত ব্যালেন্স (Accounting)</p>
                  <h3 className="text-3xl font-black">{formatCurrency(totalMoney)}</h3>
                  <p className="text-[10px] text-slate-500 font-bold">(ক্যাশ + আসল বকেয়া)</p>
                </div>
                
                <div className="h-px bg-white/10" />
                
                <div className="space-y-1">
                  <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">মোট প্রাপ্য (Recoverable)</p>
                  <h3 className="text-3xl font-black text-emerald-400">{formatCurrency(totalMoney + totalOutstandingProfit)}</h3>
                  <p className="text-[10px] text-emerald-500/60 font-bold">(ক্যাশ + আসল + মুনাফা)</p>
                </div>
              </div>
              
              <div className="p-4 bg-white/10 rounded-xl border border-white/20 space-y-4">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-400">ক্যাশ + ব্যাংক + আসল বকেয়া</span>
                  <span className="font-black">{formatCurrency(verificationSum)}</span>
                </div>
                
                <div className="pt-3 border-t border-white/10 flex justify-between items-center">
                  <span className="text-sm font-black uppercase tracking-widest">যাচাই ফলাফল (Accounting)</span>
                  <div className={cn(
                    "px-4 py-1 rounded-full text-xs font-black flex items-center gap-2",
                    isMatched ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"
                  )}>
                    {isMatched ? (
                      <>মিল আছে <Check size={14} /></>
                    ) : (
                      <>মিল নেই <X size={14} /></>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-white/10 flex justify-between items-center text-xs text-emerald-400/80">
                  <span className="font-bold">ক্যাশ + ব্যাংক + আসল + মুনাফা</span>
                  <span className="font-black">{formatCurrency(verificationSum + totalOutstandingProfit)}</span>
                </div>

                {!isMatched && (
                  <p className="text-[10px] text-rose-300 font-bold leading-relaxed">
                    সতর্কতা: চূড়ান্ত ব্যালেন্সের সাথে স্থিতি মিলছে না। দয়া করে সকল লেনদেন পুনরায় যাচাই করুন।
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderExpenseReportStep1 = () => (
    <div className="max-w-xl mx-auto space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white p-6 border border-black space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-2 border border-blue-100">
            <Calendar size={24} />
          </div>
          <h3 className="text-lg font-black text-slate-800">সব ব্যয় রিপোর্ট</h3>
          <p className="text-slate-400 text-[10px] font-bold">রিপোর্ট দেখার জন্য তারিখ নির্বাচন করুন</p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">From Date</label>
            <input 
              type="date"
              className="w-full p-3 bg-slate-50 border border-black focus:outline-none font-bold text-xs text-slate-700"
              value={expFromDate}
              onChange={e => setExpFromDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">To Date</label>
            <input 
              type="date"
              className="w-full p-3 bg-slate-50 border border-black focus:outline-none font-bold text-xs text-slate-700"
              value={expToDate}
              onChange={e => setExpToDate(e.target.value)}
            />
          </div>
        </div>

        <button 
          onClick={() => setView('expense-report')}
          className="w-full py-3 bg-blue-600 text-white font-black text-sm hover:bg-blue-700 transition-all active:scale-95"
        >
          রিপোর্ট দেখুন
        </button>
      </div>
    </div>
  );

  const renderExpenseReport = () => {
    const expenses = data.transactions.filter(t => t.type === 'expense' && t.date >= expFromDate && t.date <= expToDate);
    const totalExpense = expenses.reduce((acc, curr) => acc + (curr.amount || 0), 0);

    return (
      <div className="space-y-4 animate-in fade-in duration-500 pb-20">
        <div className="flex items-center justify-end">
          <div className="text-right">
            <h2 className="text-xl font-black text-slate-800">সব ব্যয় রিপোর্ট</h2>
            <p className="text-[10px] font-bold text-slate-400">
              {toBengaliNumber(expFromDate.split('-').reverse().join('-'))} থেকে {toBengaliNumber(expToDate.split('-').reverse().join('-'))}
            </p>
          </div>
        </div>

        <div className="bg-white border border-black overflow-x-auto">
          <table className="w-full text-left border-collapse table-auto min-w-[700px]">
            <thead>
              <tr className="bg-slate-200 border-b-2 border-black">
                <th className="px-4 py-2 text-[12px] font-black text-black uppercase tracking-widest border border-black text-center whitespace-nowrap">ক্রমিক নং</th>
                <th className="px-4 py-2 text-[12px] font-black text-black uppercase tracking-widest border border-black text-center whitespace-nowrap">তারিখ</th>
                <th className="px-4 py-2 text-[12px] font-black text-black uppercase tracking-widest border border-black text-center min-w-[250px]">বিবরণ</th>
                <th className="px-4 py-2 text-[12px] font-black text-black uppercase tracking-widest border border-black text-center whitespace-nowrap">টাকার পরিমাণ</th>
                {role === 'super_admin' && (
                  <th className="px-4 py-2 text-[12px] font-black text-black uppercase tracking-widest border border-black text-center whitespace-nowrap">একশন</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-black">
              {expenses.length > 0 ? expenses.map((exp, idx) => (
                <tr key={exp.id} className="hover:bg-slate-50 transition-colors text-[11px]">
                  <td className="px-4 py-1 text-center font-bold text-slate-500 border border-black whitespace-nowrap">{toBengaliNumber(idx + 1)}</td>
                  <td className="px-4 py-1 text-center font-bold text-slate-600 border border-black whitespace-nowrap">{toBengaliNumber(exp.date.split('-').reverse().join('-'))}</td>
                  <td className="px-4 py-1 font-bold text-slate-800 border border-black text-center">{exp.note || 'অফিস খরচ'}</td>
                  <td className="px-4 py-1 text-center font-black text-slate-900 border border-black whitespace-nowrap">{formatCurrency(exp.amount)}</td>
                  {role === 'super_admin' && (
                    <td className="px-4 py-1 text-center border border-black whitespace-nowrap">
                      <div className="flex justify-center">
                        <button 
                          onClick={() => setShowDeleteConfirm(exp.id)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              )) : (
                <tr>
                  <td colSpan={role === 'super_admin' ? 5 : 4} className="px-6 py-10 text-center text-slate-400 font-bold italic border border-black">কোন তথ্য পাওয়া যায়নি</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-black text-xs border-t-2 border-black">
                <td colSpan={3} className="px-4 py-3 text-right border border-black whitespace-nowrap">মোট ব্যয় :</td>
                <td className="px-4 py-3 text-right text-red-600 border border-black whitespace-nowrap">{formatCurrency(totalExpense)}</td>
                {role === 'super_admin' && <td className="border border-black"></td>}
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Delete Confirmation Modal */}
        <AnimatePresence>
          {showDeleteConfirm && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white border border-black p-6 max-w-sm w-full space-y-6"
              >
                <div className="text-center space-y-2">
                  <div className="w-12 h-12 bg-red-50 text-red-600 flex items-center justify-center mx-auto border border-red-100">
                    <Trash2 size={24} />
                  </div>
                  <h3 className="text-lg font-black text-slate-800">আপনি কি নিশ্চিত?</h3>
                  <p className="text-slate-500 font-bold">এই লেনদেনটি ডিলিট করতে চান?</p>
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setShowDeleteConfirm(null)}
                    className="flex-1 py-2 border border-black font-bold text-[10px] hover:bg-slate-50 transition-colors"
                  >
                    না, ফিরে যান
                  </button>
                  <button 
                    onClick={() => handleDeleteExpense(showDeleteConfirm)}
                    className="flex-1 py-2 bg-red-600 text-white font-black text-[10px] hover:bg-red-700 transition-all active:scale-95"
                  >
                    হ্যাঁ, ডিলিট করুন
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Success Toast */}
        <AnimatePresence>
          {showSuccess && (
            <motion.div 
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-6 py-3 font-black text-sm shadow-2xl z-50 border border-emerald-500"
            >
              ডাটা সফলভাবে ডিলিট হয়েছে
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const SummaryRow = ({ label, value, color = "text-slate-800", fontClass = "font-bold" }: any) => (
    <div className="flex justify-between items-center">
      <span className="text-[11px] font-bold text-slate-500">{label}</span>
      <span className={cn("text-sm", fontClass, color)}>{formatCurrency(value)}</span>
    </div>
  );


  return (
    <div className="space-y-6">
      <AnimatePresence mode="wait">
        {view === 'list' && (
          <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {renderReportList()}
          </motion.div>
        )}
        {view === 'profit-loss-step1' && (
          <motion.div key="step1" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
            {renderProfitLossStep1()}
          </motion.div>
        )}
        {view === 'profit-loss-report' && (
          <motion.div key="report1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {renderProfitLossReport()}
          </motion.div>
        )}
        {view === 'investment-report' && (
          <motion.div key="report2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {renderInvestmentReport()}
          </motion.div>
        )}
        {view === 'overall-report' && (
          <motion.div key="report3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {renderOverallReport()}
          </motion.div>
        )}
        {view === 'expense-report-step1' && (
          <motion.div key="exp-step1" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
            {renderExpenseReportStep1()}
          </motion.div>
        )}
        {view === 'expense-report' && (
          <motion.div key="exp-report" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {renderExpenseReport()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
