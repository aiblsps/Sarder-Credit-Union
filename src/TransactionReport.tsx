import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { formatCurrency, toBengaliNumber, cn } from './lib/utils';
import { Calendar, ArrowLeft, Search, TrendingUp, TrendingDown, Wallet, Landmark, UserCircle, Receipt, Printer } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';

export const TransactionReport = () => {
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [data, setData] = useState({
    transactions: [] as any[],
    directorTransactions: [] as any[],
    bankTransactions: [] as any[],
    directors: [] as any[],
    banks: [] as any[],
    customers: [] as any[],
  });

  useEffect(() => {
    const onBack = (e: Event) => {
      e.preventDefault();
      navigate('/reports');
    };
    window.addEventListener('app:back', onBack);
    return () => window.removeEventListener('app:back', onBack);
  }, [navigate]);

  useEffect(() => {
    const unsubD = onSnapshot(collection(db, 'directors'), (snap) => {
      setData(prev => ({ ...prev, directors: snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) }));
    });
    
    const unsubB = onSnapshot(collection(db, 'banks'), (snap) => {
      setData(prev => ({ ...prev, banks: snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) }));
    });
    
    const unsubC = onSnapshot(collection(db, 'customers'), (snap) => {
      setData(prev => ({ ...prev, customers: snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) }));
    });

    // We'll fetch all transactions for the selected date
    const unsubT = onSnapshot(query(collection(db, 'transactions'), where('date', '==', selectedDate)), (snap) => {
      setData(prev => ({ ...prev, transactions: snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) }));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'transactions');
    });

    const unsubDT = onSnapshot(query(collection(db, 'director_transactions'), where('date', '==', selectedDate)), (snap) => {
      setData(prev => ({ ...prev, directorTransactions: snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) }));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'director_transactions');
    });

    const unsubBT = onSnapshot(query(collection(db, 'bank_transactions'), where('date', '==', selectedDate)), (snap) => {
      setData(prev => ({ ...prev, bankTransactions: snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) }));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'bank_transactions');
    });

    return () => { unsubD(); unsubB(); unsubC(); unsubT(); unsubDT(); unsubBT(); };
  }, [selectedDate]);

  const handlePrint = (tr: any) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('পপ-আপ ব্লক করা হয়েছে। দয়া করে পপ-আপ এলাউ করুন।');
      return;
    }

    // Fallback for older transactions missing voucher data
    const investmentTotalAmount = tr.investmentTotalAmount || tr.amount;
    const investmentPaidAmount = tr.investmentPaidAmount || tr.amount;
    const investmentDueAmount = tr.investmentDueAmount || 0;
    const installmentNo = tr.installmentNo || 1;
    const totalInstallments = tr.totalInstallments || 1;
    const dueInstallments = tr.dueInstallments || 0;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Voucher - ${tr.code}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
            @page { size: A4; margin: 0; }
            body { 
              font-family: 'Inter', sans-serif; 
              margin: 0; 
              padding: 20mm; 
              background: #f0f0f0;
              display: flex;
              justify-content: center;
            }
            .a4-page {
              background: white;
              width: 210mm;
              height: 297mm;
              padding: 20mm;
              box-shadow: 0 0 10px rgba(0,0,0,0.1);
              box-sizing: border-box;
              position: relative;
            }
            .header {
              text-align: center;
              margin-bottom: 40px;
              border-bottom: 3px solid #003366;
              padding-bottom: 20px;
            }
            .header h1 {
              margin: 0;
              color: #003366;
              font-size: 32px;
              font-weight: 900;
              text-transform: uppercase;
              letter-spacing: 2px;
            }
            .header p {
              margin: 5px 0 0;
              color: #666;
              font-weight: 700;
              font-size: 14px;
            }
            .voucher-title {
              text-align: center;
              margin: 30px 0;
            }
            .voucher-title h2 {
              display: inline-block;
              background: #003366;
              color: white;
              padding: 10px 40px;
              border-radius: 50px;
              font-size: 20px;
              font-weight: 900;
              margin: 0;
            }
            .info-grid {
              display: grid;
              grid-template-columns: 1fr;
              gap: 15px;
              margin-bottom: 40px;
            }
            .info-row {
              display: flex;
              justify-content: space-between;
              border-bottom: 1px solid #eee;
              padding-bottom: 8px;
            }
            .label {
              color: #555;
              font-weight: 700;
              font-size: 16px;
            }
            .value {
              color: #000;
              font-weight: 900;
              font-size: 16px;
            }
            .amount-section {
              background: #f8fafc;
              border: 2px solid #e2e8f0;
              border-radius: 20px;
              padding: 30px;
              margin-top: 40px;
              text-align: center;
            }
            .amount-label {
              color: #64748b;
              font-weight: 700;
              font-size: 14px;
              text-transform: uppercase;
              letter-spacing: 1px;
              margin-bottom: 10px;
            }
            .amount-value {
              color: #059669;
              font-size: 48px;
              font-weight: 900;
            }
            .footer {
              position: absolute;
              bottom: 40mm;
              left: 20mm;
              right: 20mm;
              display: flex;
              justify-content: space-between;
            }
            .signature {
              text-align: center;
              width: 200px;
            }
            .sig-line {
              border-top: 2px solid #000;
              margin-bottom: 10px;
            }
            .sig-text {
              font-weight: 700;
              font-size: 14px;
              color: #444;
            }
            .trx-code {
              position: absolute;
              bottom: 20mm;
              left: 0;
              right: 0;
              text-align: center;
              color: #94a3b8;
              font-size: 12px;
              font-family: monospace;
            }
            @media print {
              body { background: white; padding: 0; }
              .a4-page { box-shadow: none; width: 100%; height: 100%; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="a4-page">
            <div class="header">
              <h1>Sarder Credit Union</h1>
              <p>সর্দার ক্রেডিট ইউনিয়ন লিমিটেড</p>
            </div>
            
            <div class="voucher-title">
              <h2>লেনদেন ভাউচার</h2>
            </div>

            <div class="info-grid">
              <div class="info-row">
                <span class="label">লেনদেনের তারিখঃ</span>
                <span class="value">${toBengaliNumber(tr.date.split('-').reverse().join('-'))}</span>
              </div>
              <div class="info-row">
                <span class="label">গ্রাহকের নামঃ</span>
                <span class="value">${tr.customerName || tr.relatedName || '---'}</span>
              </div>
              <div class="info-row">
                <span class="label">হিসাব নম্বরঃ</span>
                <span class="value">${toBengaliNumber(tr.customerAccountNumber || '---')}</span>
              </div>
              <div class="info-row">
                <span class="label">বিনিয়োগের পরিমাণ (মুনাফাসহ)ঃ</span>
                <span class="value">${formatCurrency(investmentTotalAmount)}</span>
              </div>
              <div class="info-row">
                <span class="label">মোট পরিশোধিতঃ</span>
                <span class="value">${formatCurrency(investmentPaidAmount)}</span>
              </div>
              <div class="info-row">
                <span class="label">মোট বকেয়াঃ</span>
                <span class="value">${formatCurrency(investmentDueAmount)}</span>
              </div>
              <div class="info-row">
                <span class="label">কিস্তির সংখ্যাঃ</span>
                <span class="value">${toBengaliNumber(installmentNo)} / ${toBengaliNumber(totalInstallments)}</span>
              </div>
              <div class="info-row">
                <span class="label">বকেয়া কিস্তিঃ</span>
                <span class="value">${toBengaliNumber(dueInstallments)}</span>
              </div>
              <div class="info-row">
                <span class="label">জরিমানাঃ</span>
                <span class="value">${formatCurrency(tr.fine || 0)}</span>
              </div>
            </div>

            <div class="amount-section">
              <div class="amount-label">আজ গৃহীত পরিমাণ</div>
              <div class="amount-value">${formatCurrency(tr.amount)}</div>
            </div>

            <div class="footer">
              <div class="signature">
                <div class="sig-line"></div>
                <div class="sig-text">গ্রাহকের স্বাক্ষর</div>
              </div>
              <div class="signature">
                <div class="sig-line"></div>
                <div class="sig-text">ক্যাশিয়ারের স্বাক্ষর</div>
              </div>
            </div>

            <div class="trx-code">
              Transaction ID: ${tr.code || tr.id} | Processed by: ${tr.processedBy || 'Admin'}
            </div>
          </div>
          <script>
            window.onload = function() {
              setTimeout(() => {
                window.print();
              }, 500);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const getTransactionTypeName = (type: string, subType?: string) => {
    switch (type) {
      case 'payment': return 'কিস্তি আদায়';
      case 'settlement': return 'বিনিয়োগ নিষ্পত্তি';
      case 'expense': return 'অফিস খরচ';
      case 'deposit': return subType === 'bank' ? 'ব্যাংক জমা' : 'পরিচালকের জমা';
      case 'withdrawal': return subType === 'bank' ? 'ব্যাংক উত্তোলন' : 'পরিচালকের উত্তোলন';
      case 'profit_distribution': return 'মুনাফা বন্টন';
      case 'profit_withdraw': return 'মুনাফা উত্তোলন';
      default: return type;
    }
  };

  const getNameOrNote = (item: any) => {
    if (item.type === 'expense') return item.note || 'অফিস খরচ';
    
    if (item.subType === 'bank') {
      const bank = data.banks.find(b => b.id === (item.bankId || item.relatedId));
      return bank ? `${bank.bankName} (${bank.accountName})` : 'ব্যাংক হিসাব';
    }

    if (item.directorId) {
      const director = data.directors.find(d => d.id === item.directorId);
      return director?.name || 'অজানা পরিচালক';
    }
    
    if (item.customerName) return item.customerName;
    if (item.relatedName) return item.relatedName;
    return '---';
  };

  // Combine all transactions into a single list
  const combinedTransactions = [
    ...data.transactions.map(t => ({ ...t, source: 'transactions' })),
    ...data.directorTransactions.map(t => ({ ...t, source: 'director_transactions' })),
    ...data.bankTransactions.map(t => ({ ...t, source: 'bank_transactions', subType: 'bank' }))
  ].sort((a, b) => {
    // Sort by createdAt if available, otherwise keep order
    const dateA = a.createdAt?.seconds || 0;
    const dateB = b.createdAt?.seconds || 0;
    return dateB - dateA;
  });

  // Calculate totals for summary
  const summaryTotals = combinedTransactions.reduce((acc: any, curr) => {
    const typeName = getTransactionTypeName(curr.type, curr.subType);
    acc[typeName] = (acc[typeName] || 0) + (curr.amount || 0);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-black text-slate-800">লেনদেন বিবরণি</h1>
          </div>
          <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
            <Calendar className="w-4 h-4 text-slate-500" />
            <input 
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent border-none focus:ring-0 text-sm font-bold text-slate-700 p-0"
            />
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-6">
        {/* Table Section */}
        <div className="bg-white border border-black overflow-hidden shadow-sm">
          <div className="bg-slate-800 text-white px-4 py-3 flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-widest">লেনদেন তালিকা</h2>
            <span className="text-[10px] font-bold bg-white/20 px-2 py-0.5 rounded">
              তারিখ: {toBengaliNumber(selectedDate.split('-').reverse().join('-'))}
            </span>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[600px] table-auto">
              <thead>
                <tr className="bg-slate-200 border-b border-black text-[12px]">
                  <th className="px-3 py-2 font-black text-black uppercase tracking-widest border-r border-black text-center whitespace-nowrap">ক্রমিক নং</th>
                  <th className="px-3 py-2 font-black text-black uppercase tracking-widest border-r border-black text-center whitespace-nowrap">লেনদেনের ধরন</th>
                  <th className="px-3 py-2 font-black text-black uppercase tracking-widest border-r border-black text-center">নাম/বিবরণ</th>
                  <th className="px-3 py-2 font-black text-black uppercase tracking-widest border-r border-black text-center whitespace-nowrap">তারিখ</th>
                  <th className="px-3 py-2 font-black text-black uppercase tracking-widest border-r border-black text-center whitespace-nowrap">প্রক্রিয়াকারী</th>
                  <th className="px-3 py-2 font-black text-black uppercase tracking-widest text-center whitespace-nowrap">টাকার পরিমাণ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black">
                {combinedTransactions.length > 0 ? (
                  combinedTransactions.map((item, idx) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors text-[11px]">
                      <td className="px-3 py-1 text-center font-bold text-slate-500 border-r border-black whitespace-nowrap">
                        {toBengaliNumber(idx + 1)}
                      </td>
                      <td className="px-3 py-1 font-bold text-slate-800 border-r border-black whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "w-2 h-2 rounded-full shrink-0",
                            item.type === 'payment' || item.type === 'deposit' ? "bg-emerald-500" : 
                            item.type === 'expense' || item.type === 'withdrawal' ? "bg-rose-500" : "bg-blue-500"
                          )} />
                          <span>{getTransactionTypeName(item.type, item.subType)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-1 font-bold text-slate-700 border-r border-black text-center">
                        {getNameOrNote(item)}
                      </td>
                      <td className="px-3 py-1 text-center font-bold text-slate-600 border-r border-black whitespace-nowrap">
                        {toBengaliNumber(item.date.split('-').reverse().join('-'))}
                      </td>
                      <td className="px-3 py-1 text-center font-bold text-slate-600 border-r border-black whitespace-nowrap">
                        {item.processedBy || 'Admin'}
                      </td>
                      <td className="px-3 py-1 text-center font-black text-slate-900 border-black whitespace-nowrap">
                        {formatCurrency(item.amount)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center gap-2 opacity-40">
                        <Search size={32} />
                        <p className="text-sm font-bold italic">এই তারিখে কোনো লেনদেন পাওয়া যায়নি</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-black text-slate-800">সারসংক্ষেপ (Summary)</h2>
          </div>
          
          <div className="bg-white border border-black overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-200 border-b border-black text-[12px]">
                  <th className="px-3 py-2 font-black text-black uppercase tracking-widest border-r border-black text-center w-16">ক্রমিক</th>
                  <th className="px-3 py-2 font-black text-black uppercase tracking-widest border-r border-black text-center">লেনদেনের ধরন</th>
                  <th className="px-3 py-2 font-black text-black uppercase tracking-widest text-center">মোট টাকার পরিমাণ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black">
                {Object.entries(summaryTotals).length > 0 ? (
                  Object.entries(summaryTotals).map(([type, total]: [string, any], idx) => (
                    <tr key={type} className="text-[11px]">
                      <td className="px-3 py-1 text-center font-bold text-slate-500 border-r border-black">
                        {toBengaliNumber(idx + 1)}
                      </td>
                      <td className="px-3 py-1 font-bold text-slate-800 border-r border-black text-center">
                        {type}
                      </td>
                      <td className="px-3 py-1 text-center font-black text-slate-900">
                        {formatCurrency(total)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-sm font-bold text-slate-400 italic">
                      কোনো সারসংক্ষেপ উপলব্ধ নেই
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
