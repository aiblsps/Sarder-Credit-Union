import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, getDocs, addDoc, doc, updateDoc, increment, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { useAuth } from './AuthContext';
import { useLocation } from 'react-router-dom';
import { Search, Wallet, UserCircle, Landmark, Receipt, ArrowDownRight, ArrowUpRight, CheckCircle2, AlertCircle, ChevronRight, X, Printer, History, ArrowLeft, Calendar, ChevronDown } from 'lucide-react';
import { formatCurrency, toBengaliNumber, cn, getDirectDriveUrl, formatAddress } from './lib/utils';
import { motion, AnimatePresence } from 'motion/react';

type TransactionType = 'installment' | 'settlement' | 'director_deposit' | 'director_withdrawal' | 'bank_deposit' | 'bank_withdrawal' | 'profit_distribution' | 'profit_withdraw' | 'expense';

export const Transactions = () => {
  const { user, role } = useAuth();
  const location = useLocation();
  const [activeType, setActiveType] = useState<TransactionType | null>(null);

  useEffect(() => {
    if (location.state?.type) {
      setActiveType(location.state.type);
    }
  }, [location.state]);
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
  const [discountPercent, setDiscountPercent] = useState('0');
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
    if (!success) return;
    const handleGlobalClick = () => setSuccess(false);
    // Add small delay to avoid immediate trigger from the submit click bubbling up
    const timer = setTimeout(() => {
      window.addEventListener('click', handleGlobalClick);
    }, 100);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('click', handleGlobalClick);
    };
  }, [success]);

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
    if (!role) return;
    const unsubU = onSnapshot(collection(db, 'users'), (snap) => {
      setAppUsers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
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
    return () => { unsubU(); unsubD(); unsubB(); unsubT(); unsubI(); unsubDT(); };
  }, [role]);

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

        const accNo = invData.customerAccountNumber;
        let custSnap = await getDocs(query(collection(db, 'customers'), where('accountNumber', '==', accNo.toString())));
        
        if (custSnap.empty && typeof accNo === 'string') {
          custSnap = await getDocs(query(collection(db, 'customers'), where('accountNumber', '==', parseInt(accNo) || 0)));
        }
        
        if (custSnap.empty && invData.customerId) {
          custSnap = await getDocs(query(collection(db, 'customers'), where('id', '==', invData.customerId)));
        }

        if (!custSnap.empty) {
          const custData = { id: custSnap.docs[0].id, ...custSnap.docs[0].data() } as any;
          setFoundCustomer({
            ...custData,
            area: custData.area || custData.presentAddress?.village, // Fix: Use area or fallback to village
            mobile: custData.mobile || custData.phone // Ensure both are handled
          });
        } else {
          // Fallback if customer doc is missing or ID mismatch
          setFoundCustomer({
            photoUrl: invData.customerPhotoUrl,
            mobile: invData.customerMobile || invData.mobile || invData.customerPhone || invData.phone,
            area: invData.area,
            presentAddress: invData.presentAddress,
            fatherName: invData.fatherName,
            motherName: invData.motherName,
            spouseName: invData.spouseName
          });
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
        if (amt > (foundEntity.balance || 0)) throw new Error('বর্তমান পরিচালক ব্যালেন্সের চেয়ে বেশি উত্তোলন করা সম্ভব নয়।');
      }

      if (activeType === 'bank_withdrawal') {
        if (!foundEntity) throw new Error('ব্যাংক একাউন্ট নির্বাচন করুন।');
        if (amt > (foundEntity.balance || 0)) throw new Error('ব্যাংক একাউন্ট ব্যালেন্সের চেয়ে বেশি উত্তোলন করা সম্ভব নয়।');
      }

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
          status: 'পরিশোধিত',
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
            amount: totalPayable - f,
            fine: f,
            discount: d,
            date: date,
            totalWithFine: totalPayable,
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

      if (activeType === 'expense') {
        batch.set(doc(collection(db, 'transactions')), {
          type: 'expense', amount: amt, date, note, processedBy, createdAt: timestamp, code: `EXP-${Math.random().toString(36).substr(2, 9).toUpperCase()}`
        });
      }

      await batch.commit();
      setSuccess(true);
      resetForm();
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
    setDiscountPercent('0');
    setDistributionType('select');
    setError('');
    const today = new Date().toISOString().split('T')[0];
    setDate(today);
  };

  const handlePrint = (tr: any) => {
    if (!tr) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('পপ-আপ ব্লক করা হয়েছে। দয়া করে পপ-আপ এলাউ করুন।');
      return;
    }

    const cashier = appUsers.find(u => u.email === tr.processedBy);
    const signatureUrl = cashier?.signatureUrl ? getDirectDriveUrl(cashier.signatureUrl) : '';

    const investmentTotalAmount = tr.investmentTotalAmount || tr.amount;
    const investmentPaidAmount = tr.investmentPaidAmount || tr.amount;
    const investmentDueAmount = tr.investmentDueAmount || 0;
    const installmentNo = tr.installmentNo || 1;
    const totalInstallments = tr.totalInstallments || 1;

    const voucherHtml = `
      <div class="voucher">
        <div class="header">
          <h1 class="main-title">সরদার ক্রেডিট ইউনিয়ন</h1>
          <p class="sub-title">কয়ারিয়া, কালকিনি, মাদারীপুর</p>
          <div class="divider"></div>
          <h2 class="voucher-type">লেনদেন ভাউচার</h2>
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
            <span class="label">আজ গৃহীতঃ</span>
            <span class="value">${toBengaliNumber(tr.amount)} টাকা</span>
          </div>
          <div class="info-row">
            <span class="label">হিসাব নম্বরঃ</span>
            <span class="value">${toBengaliNumber(tr.customerAccountNumber || '---')}</span>
          </div>
          <div class="info-row">
            <span class="label">বিনিয়োগের পরিমাণঃ</span>
            <span class="value">${toBengaliNumber(investmentTotalAmount)} টাকা</span>
          </div>
          <div class="info-row">
            <span class="label">মোট পরিশোধিতঃ</span>
            <span class="value">${toBengaliNumber(investmentPaidAmount)} টাকা</span>
          </div>
          <div class="info-row">
            <span class="label">মোট বকেয়াঃ</span>
            <span class="value">${toBengaliNumber(investmentDueAmount)} টাকা</span>
          </div>
          <div class="info-row">
            <span class="label">কিস্তির সংখ্যাঃ</span>
            <span class="value">${toBengaliNumber(installmentNo)} / ${toBengaliNumber(totalInstallments)} টি</span>
          </div>
          <div class="info-row">
            <span class="label">জরিমানাঃ</span>
            <span class="value">${toBengaliNumber(tr.fine || 0)} টাকা</span>
          </div>
        </div>

        <div class="trx-id">
          Transaction ID: ${tr.code} | Processed by: ${tr.processedBy}
        </div>

        <div class="footer">
          <div class="signature-box">
            <div class="signature-img-container">
              ${signatureUrl ? `<img src="${signatureUrl}" class="signature-img" onerror="this.style.display='none'" />` : ''}
            </div>
            <div class="signature-line"></div>
            <div class="signature-label">ক্যাশিয়ার</div>
          </div>
        </div>
      </div>
    `;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Voucher - ${tr.code}</title>
          <style>
            @import url('https://fonts.maateen.me/solaiman-lipi/font.css');
            @page { 
              size: A4; 
              margin: 0mm !important; 
            }
            body { 
              font-family: 'SolaimanLipi', sans-serif; 
              margin: 0; 
              padding: 0; 
              background: #f5f5f5;
            }
            .page-container {
              width: 210mm;
              height: 297mm;
              margin: 0 auto;
              background: white;
              padding: 10mm 20mm;
              box-sizing: border-box;
              display: flex;
              flex-direction: column;
            }
            .voucher {
              height: 138mm;
              padding: 0;
              position: relative;
              display: flex;
              flex-direction: column;
              box-sizing: border-box;
            }
            .header {
              text-align: center;
              margin-bottom: 20px;
            }
            .main-title {
              margin: 0;
              font-size: 32px;
              font-weight: 900;
              color: #003366;
            }
            .sub-title {
              margin: 2px 0;
              font-size: 16px;
              font-weight: 700;
              color: #444;
            }
            .divider {
              height: 2px;
              background: #003366;
              margin: 10px 0;
              display: none;
            }
            .voucher-type {
              font-size: 22px;
              font-weight: 900;
              color: #333;
              margin: 10px 0;
            }
            .info-grid {
              display: flex;
              flex-direction: column;
              gap: 4px;
            }
            .info-row {
              display: flex;
              justify-content: space-between;
              border-bottom: 1px solid #eee;
              padding: 4px 0;
            }
            .label {
              font-size: 16px;
              font-weight: 700;
              color: #333;
            }
            .value {
              font-size: 16px;
              font-weight: 900;
              color: #000;
            }
            .trx-id {
              font-size: 11px;
              color: #666;
              margin-top: 8px;
              text-align: left;
            }
            .footer {
              margin-top: 40px;
              display: flex;
              justify-content: flex-end;
            }
            .signature-box {
              text-align: center;
              width: 220px;
              position: relative;
            }
            .signature-img-container {
              height: 45px;
              position: relative;
              margin-bottom: -25px;
              z-index: 10;
              display: flex;
              align-items: flex-end;
              justify-content: center;
            }
            .signature-img {
              max-height: 60px;
              max-width: 150px;
              display: block;
              transform: translateY(-35px);
            }
            .signature-line {
              border-top: 2px solid #000;
              margin-bottom: 5px;
              position: relative;
              z-index: 5;
            }
            .signature-label {
              font-size: 24px;
              font-weight: 900;
              color: #000;
              letter-spacing: 1px;
            }
            @media print {
              html, body { 
                margin: 0 !important; 
                padding: 0 !important; 
                background: white !important;
                -webkit-print-color-adjust: exact;
              }
              .page-container { 
                margin: 0 !important; 
                padding: 10mm 20mm !important; 
                width: 210mm !important; 
                height: 297mm !important; 
                box-shadow: none !important;
              }
              .voucher { border: none !important; }
            }
          </style>
        </head>
        <body>
          <div class="page-container">
            ${voucherHtml}
          </div>
          <script>
            window.onload = function() {
              setTimeout(() => {
                window.print();
              }, 800);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const menuItems = [
    { id: 'installment', label: 'কিস্তি আদায়', icon: Receipt, color: 'bg-emerald-500' },
    { id: 'settlement', label: 'বিনিয়োগ নিষ্পত্তি', icon: CheckCircle2, color: 'bg-blue-500' },
    { id: 'director_deposit', label: 'পরিচালকের জমা', icon: UserCircle, color: 'bg-indigo-500' },
    { id: 'director_withdrawal', label: 'পরিচালকের উত্তোলন', icon: ArrowUpRight, color: 'bg-rose-500' },
    { id: 'bank_deposit', label: 'ব্যাংক জমা', icon: Landmark, color: 'bg-amber-500' },
    { id: 'bank_withdrawal', label: 'ব্যাংক উত্তোলন', icon: ArrowDownRight, color: 'bg-orange-500' },
    { id: 'expense', label: 'ব্যয়', icon: ArrowUpRight, color: 'bg-red-500' },
    { id: 'profit_distribution', label: 'মুনাফা বন্টন', icon: ArrowUpRight, color: 'bg-indigo-600' },
    { id: 'profit_withdraw', label: 'মুনাফা উত্তোলন', icon: ArrowDownRight, color: 'bg-rose-600' },
  ];

  return (
    <div className="space-y-2 animate-in fade-in duration-500 pb-20 relative min-h-[60vh]">
      {activeType ? (
        <div className={cn(
          "mx-auto space-y-4 animate-in slide-in-from-bottom-4 duration-500 relative max-w-7xl"
        )}>
          <AnimatePresence mode="wait">
            {!foundEntity && (activeType === 'installment' || activeType === 'settlement') ? (
              <motion.div 
                key="search"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="pt-4"
              >
                <div className="bg-white rounded-[1rem] shadow-sm border border-slate-100 p-4 space-y-4">
                  <div className="relative">
                    <input 
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      className="w-full h-12 px-10 bg-white border-[3px] border-[#1e90ff] rounded-full focus:outline-none transition-all font-black text-2xl text-center text-slate-800"
                      value={searchId}
                      onChange={e => setSearchId(e.target.value.replace(/[^0-9]/g, ''))}
                      onKeyDown={e => e.key === 'Enter' && handleSearch()}
                      autoFocus
                    />
                  </div>

                  <button 
                    onClick={handleSearch} 
                    disabled={loading} 
                    className="w-full h-12 bg-[#007bff] hover:bg-[#0069d9] text-white font-black rounded-xl text-xl active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center shadow-lg"
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
                className="space-y-6 pb-10"
              >
                {/* Close Button at top matching screenshot style */}
                <div className="flex justify-end pr-2 overflow-visible">
                  <button 
                    onClick={() => { setFoundEntity(null); setFoundCustomer(null); setError(''); }}
                    className="w-10 h-10 bg-slate-300 rounded-full flex items-center justify-center text-white hover:bg-slate-400 transition-colors shadow-sm"
                  >
                    <X size={24} />
                  </button>
                </div>

                {/* Top Grid: Info Boxes */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
                  {/* Primary Info */}
                  <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                    <div className="bg-[#89a5df] px-4 py-2 font-black text-slate-900 border-b border-slate-200 text-sm italic">
                      প্রাথমিক তথ্য
                    </div>
                    <div className="divide-y divide-slate-100">
                      <div className="flex">
                        <div className="w-40 bg-slate-50/50 px-4 py-2 font-bold text-slate-800 border-r border-slate-100 shrink-0">হিসাব নম্বর</div>
                        <div className="flex-1 px-4 py-2 font-bold text-slate-900 leading-tight">{toBengaliNumber(foundEntity.customerAccountNumber)}</div>
                      </div>
                      <div className="flex">
                        <div className="w-40 bg-slate-50/50 px-4 py-2 font-bold text-slate-800 border-r border-slate-100 shrink-0">নাম</div>
                        <div className="flex-1 px-4 py-2 font-bold text-slate-900 leading-tight">{foundEntity.customerName}</div>
                      </div>
                      <div className="flex">
                        <div className="w-40 bg-slate-50/50 px-4 py-2 font-bold text-slate-800 border-r border-slate-100 shrink-0">এরিয়া</div>
                        <div className="flex-1 px-4 py-2 font-bold text-slate-900 leading-tight">{formatAddress(foundCustomer?.area)}</div>
                      </div>
                      <div className="flex">
                        <div className="w-40 bg-slate-50/50 px-4 py-2 font-bold text-slate-800 border-r border-slate-100 shrink-0">সদস্যের পিতা-মাতা</div>
                        <div className="flex-1 px-4 py-2 font-bold text-slate-900 leading-tight">{foundCustomer?.fatherName} / {foundCustomer?.motherName}</div>
                      </div>
                    </div>
                  </div>

                  {/* Contact Info */}
                  <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                    <div className="bg-[#c8e2bc] px-4 py-2 font-black text-slate-900 border-b border-slate-200 text-sm italic">
                      <span className="mr-1">📞</span> যোগাযোগ ও অন্যান্য তথ্য
                    </div>
                    <div className="divide-y divide-slate-100">
                      <div className="flex">
                        <div className="w-40 bg-slate-50/50 px-4 py-2 font-bold text-slate-800 border-r border-slate-100 shrink-0 text-xs">স্ত্রী</div>
                        <div className="flex-1 px-4 py-2 font-bold text-slate-900 leading-tight">{foundCustomer?.spouseName || 'কোন তথ্য নাই'}</div>
                      </div>
                      <div className="flex">
                        <div className="w-40 bg-slate-50/50 px-4 py-2 font-bold text-slate-800 border-r border-slate-100 shrink-0 text-xs">ঠিকানা</div>
                        <div className="flex-1 px-4 py-2 font-bold text-slate-900 leading-tight text-sm">{formatAddress(foundCustomer?.presentAddress)}</div>
                      </div>
                      <div className="flex">
                        <div className="w-40 bg-slate-50/50 px-4 py-2 font-bold text-slate-800 border-r border-slate-100 shrink-0 text-xs">মোবাইল নং</div>
                        <div className="flex-1 px-4 py-2 font-bold text-[#007bff] leading-tight underline">{toBengaliNumber(foundCustomer?.mobile || foundCustomer?.phone || '')}</div>
                      </div>
                      <div className="flex">
                        <div className="w-40 bg-slate-50/50 px-4 py-2 font-bold text-slate-800 border-r border-slate-100 shrink-0 text-xs">সদস্যের ধরণ</div>
                        <div className="flex-1 px-4 py-2 font-bold text-slate-900 leading-tight">{foundEntity.investmentType || 'মাসিক'}</div>
                      </div>
                    </div>
                  </div>

                  {/* Photo Info */}
                  <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                    <div className="bg-[#f3ccab] px-4 py-2 font-black text-slate-900 border-b border-slate-200 text-sm italic">
                      ছবি
                    </div>
                    <div className="p-2 flex justify-center bg-white">
                      <div className="w-32 h-36 bg-white rounded-full overflow-hidden shadow-md border-4 border-slate-100 p-0.5 relative">
                        <img 
                          src={foundCustomer?.photoUrl ? getDirectDriveUrl(foundCustomer.photoUrl) : "https://picsum.photos/seed/user/200/250"} 
                          alt="Customer" 
                          className="w-full h-full object-cover rounded-full"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Form Section: Full Width */}
                <div className="bg-white rounded-xl shadow-xl border border-slate-300 overflow-hidden">
                  {activeType === 'installment' ? (
                    <>
                      <div className="bg-[#107c7c] p-2 text-white flex items-center gap-3">
                        <ArrowDownRight size={24} />
                        <h3 className="text-xl font-black">কিস্তি আদায় ফর্ম</h3>
                      </div>

                      <form onSubmit={handleSubmit} className="p-4 space-y-4">
                        {/* Two Big Columns for Amount and Fine */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-sm font-black text-[#107c7c] block ml-1 text-left">আজ গৃহীত*</label>
                            <div className="rounded-lg border-[3px] border-[#107c7c] bg-white overflow-hidden">
                              <input 
                                type="number"
                                inputMode="numeric"
                                required
                                className="w-full h-12 bg-white border-none focus:outline-none transition-all font-black text-3xl text-center text-black"
                                value={amount}
                                onChange={e => setAmount(e.target.value)}
                                autoFocus
                              />
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className="text-sm font-black text-[#107c7c] block ml-1 text-left">জরিমানা</label>
                            <div className="rounded-lg border-[3px] border-[#107c7c] bg-white overflow-hidden">
                              <input 
                                type="number"
                                inputMode="numeric"
                                className="w-full h-12 bg-white border-none focus:outline-none transition-all font-black text-3xl text-center text-black"
                                value={fine}
                                onChange={e => setFine(e.target.value)}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Three Column Grid for Info Fields */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-1">
                            <label className="text-sm font-bold text-slate-800 ml-1 block text-center">আদায়ের তারিখ</label>
                            <div className="rounded-lg border-2 border-slate-300 bg-white overflow-hidden">
                              <input 
                                type="date"
                                required
                                className="w-full h-10 bg-white border-none focus:outline-none transition-all font-bold text-lg text-center text-slate-700"
                                value={date}
                                onChange={e => setDate(e.target.value)}
                              />
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className="text-sm font-bold text-slate-800 ml-1 block text-left">বিনিয়োগের ধরন</label>
                            <div className="rounded-lg border-2 border-slate-300 bg-slate-50 h-10 flex items-center justify-center font-bold text-lg text-slate-700">
                              {foundEntity.investmentType || 'সাপ্তাহিক'}
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className="text-sm font-bold text-slate-800 ml-1 block text-left">প্রতি কিস্তি</label>
                            <div className="rounded-lg border-2 border-slate-300 bg-slate-50 h-10 flex items-center justify-center font-bold text-lg text-slate-700">
                              {toBengaliNumber(foundEntity.perInstallment || 0)}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-sm font-bold text-slate-800 ml-1 block text-left">মোট পরিশোধযোগ্য</label>
                            <div className="rounded-lg border-2 border-slate-300 bg-slate-50 h-10 flex items-center justify-center font-bold text-lg text-slate-700">
                              {toBengaliNumber(foundEntity.totalAmount || 0)}
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className="text-sm font-bold text-slate-800 ml-1 block text-left">পরিশোধিত</label>
                            <div className="rounded-lg border-2 border-slate-300 bg-slate-50 h-10 flex items-center justify-center font-bold text-lg text-slate-700">
                              {toBengaliNumber(foundEntity.paidAmount || 0)}
                            </div>
                          </div>
                        </div>

                        {/* Full Width Due Amount Row */}
                        <div className="space-y-1">
                          <label className="text-sm font-bold text-slate-800 ml-1 block text-left">বকেয়ার পরিমাণ</label>
                          <div className="rounded-lg border-2 border-slate-300 bg-slate-50 h-10 flex items-center justify-center font-bold text-lg text-slate-700">
                            {toBengaliNumber(foundEntity.dueAmount || 0)}
                          </div>
                        </div>

                        {/* Full Width Note */}
                        <div className="space-y-1">
                          <label className="text-sm font-bold text-slate-800 ml-1 block text-left">আদায় বিবরণ লিখন</label>
                          <div className="rounded-lg border-2 border-slate-300 bg-white overflow-hidden">
                            <input 
                              type="text"
                              className="w-full h-10 bg-white border-none focus:outline-none px-4 font-bold text-lg text-slate-700"
                              placeholder="বিবরণ লিখুন..."
                              value={note}
                              onChange={e => setNote(e.target.value)}
                            />
                          </div>
                        </div>

                        {error && (
                          <div className="p-3 bg-rose-50 text-rose-600 rounded-xl text-xs font-bold border border-rose-100 text-center">
                            {error}
                          </div>
                        )}

                        <button
                          type="submit"
                          disabled={loading}
                          className="w-full py-3 bg-[#00a651] hover:bg-[#008f45] text-white rounded-lg font-black text-xl active:scale-[0.98] transition-all disabled:opacity-50 shadow-md flex items-center justify-center mt-2 border-b-4 border-emerald-800"
                        >
                          {loading ? (
                            <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            'সাবমিট করুন'
                          )}
                        </button>
                      </form>
                    </>
                  ) : (
                      /* INVESTMENT SETTLEMENT FORM - MATCHING SCREENSHOT EXACTLY */
                      <div className="flex flex-col">
                        <div className="pt-4 pb-2 text-center">
                          <h2 className="text-2xl font-black text-[#c026d3]">বিনিয়োগ/ঋণ হিসাব নিষ্পত্তি ফর্ম</h2>
                        </div>

                        <form onSubmit={(e) => {
                          // Update amount to total payable before submitting for settlement
                          const f = parseFloat(fine) || 0;
                          const d = parseFloat(discount) || 0;
                          const total = foundEntity.dueAmount + f - d;
                          setAmount(total.toString());
                          handleSubmit(e);
                        }} className="p-4 space-y-4">
                          
                          {/* তারিখ এবং বিনিয়োগের তথ্যের গ্রিড */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {/* তারিখ */}
                            <div className="space-y-1">
                              <label className="text-sm font-bold text-slate-800 ml-1">তারিখ</label>
                              <div className="flex gap-1">
                                <input 
                                  type="date"
                                  required
                                  className="flex-1 border-2 border-black rounded-lg p-2 text-center font-black text-lg focus:outline-none"
                                  value={date}
                                  onChange={e => setDate(e.target.value)}
                                />
                              </div>
                            </div>

                            {/* বিনিয়োগ প্রদানের তারিখ */}
                            <div className="space-y-1">
                              <label className="text-sm font-bold text-slate-800 ml-1">বিনিয়োগ প্রদানের তারিখ</label>
                              <div className="w-full border-2 border-black rounded-lg p-2 text-center font-black text-lg bg-slate-50">
                                {toBengaliNumber(foundEntity.startDate?.split('-').reverse().join('-'))}
                              </div>
                            </div>

                            {/* মেয়াদ উত্তীর্ণের তারিখ */}
                            <div className="space-y-1">
                              <label className="text-sm font-bold text-slate-800 ml-1">মেয়াদ উত্তীর্ণের তারিখ</label>
                              <div className="w-full border-2 border-black rounded-lg p-2 text-center font-black text-lg bg-slate-50">
                                {toBengaliNumber(foundEntity.endDate?.split('-').reverse().join('-'))}
                              </div>
                            </div>

                            {/* বিনিয়োগ প্রদান (আসল) */}
                            <div className="space-y-1">
                              <label className="text-sm font-bold text-slate-800 ml-1">বিনিয়োগ প্রদান (আসল)</label>
                              <div className="w-full border-2 border-black rounded-lg p-2 text-center font-black text-lg bg-slate-100">
                                {toBengaliNumber(foundEntity.amount || 0)}
                              </div>
                            </div>

                            {/* বিনিয়োগ প্রদান (মুনাফা) */}
                            <div className="space-y-1">
                              <label className="text-sm font-bold text-slate-800 ml-1">বিনিয়োগ প্রদান (মুনাফা)</label>
                              <div className="w-full border-2 border-black rounded-lg p-2 text-center font-black text-lg bg-slate-100">
                                {toBengaliNumber(foundEntity.profitAmount || 0)}
                              </div>
                            </div>

                            {/* মোট বিনিয়োগ প্রদান (মুনাফাসহ) */}
                            <div className="space-y-1">
                              <label className="text-sm font-bold text-slate-800 ml-1">মোট বিনিয়োগ প্রদান (মুনাফাসহ)</label>
                              <div className="w-full border-2 border-black rounded-lg p-2 text-center font-black text-lg bg-slate-100">
                                {toBengaliNumber(foundEntity.totalAmount || 0)}
                              </div>
                            </div>

                            {/* আসল পরিশোধ */}
                            <div className="space-y-1">
                              <label className="text-sm font-bold text-slate-800 ml-1">আসল পরিশোধ</label>
                              <div className="w-full border-2 border-black rounded-lg p-2 text-center font-black text-lg bg-slate-100">
                                {toBengaliNumber(Math.round(foundEntity.paidAmount * ((foundEntity.totalAmount - foundEntity.profitAmount) / foundEntity.totalAmount)))}
                              </div>
                            </div>

                            {/* মুনাফা পরিশোধ */}
                            <div className="space-y-1">
                              <label className="text-sm font-bold text-slate-800 ml-1">মুনাফা পরিশোধ</label>
                              <div className="w-full border-2 border-black rounded-lg p-2 text-center font-black text-lg bg-slate-100">
                                {toBengaliNumber(Math.round(foundEntity.paidAmount * (foundEntity.profitAmount / foundEntity.totalAmount)))}
                              </div>
                            </div>

                            {/* মোট পরিশোধ */}
                            <div className="space-y-1">
                              <label className="text-sm font-bold text-slate-800 ml-1">মোট পরিশোধ</label>
                              <div className="w-full border-2 border-black rounded-lg p-2 text-center font-black text-lg bg-slate-100">
                                {toBengaliNumber(foundEntity.paidAmount || 0)}
                              </div>
                            </div>

                            {/* পরিশোধি কিস্তি সংখ্যা */}
                            <div className="space-y-1">
                              <label className="text-sm font-bold text-slate-800 ml-1">পরিশোধি কিস্তি সংখ্যা</label>
                              <div className="w-full border-2 border-black rounded-lg p-2 text-center font-black text-lg bg-slate-100">
                                {toBengaliNumber(foundEntity.paidInstallmentCount || 0)} / {toBengaliNumber(foundEntity.installmentCount || 0)}
                              </div>
                            </div>

                            {/* বকেয়া (আসল) */}
                            <div className="space-y-1">
                              <label className="text-sm font-bold text-slate-800 ml-1">বকেয়া (আসল)</label>
                              <div className="w-full border-2 border-black rounded-lg p-2 text-center font-black text-lg bg-slate-100">
                                {toBengaliNumber(Math.round(foundEntity.dueAmount * ((foundEntity.totalAmount - foundEntity.profitAmount) / foundEntity.totalAmount)))}
                              </div>
                            </div>

                            {/* বকেয়া (মুনাফা) */}
                            <div className="space-y-1">
                              <label className="text-sm font-bold text-slate-800 ml-1">বকেয়া (মুনাফা)</label>
                              <div className="w-full border-2 border-black rounded-lg p-2 text-center font-black text-lg bg-slate-100">
                                {toBengaliNumber(Math.round(foundEntity.dueAmount * (foundEntity.profitAmount / foundEntity.totalAmount)))}
                              </div>
                            </div>

                            {/* মোট বকেয়ার পরিমাণ */}
                            <div className="space-y-1">
                              <label className="text-sm font-bold text-slate-800 ml-1">মোট বকেয়ার পরিমাণ</label>
                              <div className="w-full border-2 border-black rounded-lg p-2 text-center font-black text-lg bg-slate-100">
                                {toBengaliNumber(foundEntity.dueAmount || 0)}
                              </div>
                            </div>

                            {/* জরিমানা */}
                            <div className="space-y-1">
                              <label className="text-sm font-bold text-slate-800 ml-1">জরিমানা</label>
                              <input 
                                type="number"
                                className="w-full border-2 border-black rounded-lg p-2 text-center font-black text-lg focus:outline-none"
                                value={fine}
                                onChange={e => setFine(e.target.value)}
                              />
                            </div>

                            {/* ছাড়% */}
                            <div className="space-y-1">
                              <label className="text-sm font-bold text-slate-800 ml-1">ছাড়%</label>
                              <input 
                                type="number"
                                className="w-full border-2 border-black rounded-lg p-2 text-center font-black text-lg focus:outline-none"
                                value={discountPercent}
                                onChange={e => {
                                  if (!foundEntity) return;
                                  const dPercent = parseFloat(e.target.value) || 0;
                                  if (dPercent > 100) return;
                                  
                                  const dueProfit = Math.round(foundEntity.dueAmount * (foundEntity.profitAmount / foundEntity.totalAmount));
                                  let dAmount = Math.round((foundEntity.dueAmount * dPercent) / 100);
                                  
                                  if (dAmount > dueProfit) {
                                    dAmount = dueProfit;
                                    const correctedPercent = (dAmount / foundEntity.dueAmount) * 100;
                                    setDiscountPercent(correctedPercent.toFixed(2));
                                  } else {
                                    setDiscountPercent(e.target.value);
                                  }
                                  setDiscount(dAmount.toString());
                                }}
                              />
                            </div>

                            {/* ছাড় (টাকা) */}
                            <div className="space-y-1">
                              <label className="text-sm font-bold text-slate-800 ml-1">ছাড় (টাকা)</label>
                              <input 
                                type="number"
                                className="w-full border-2 border-black rounded-lg p-2 text-center font-black text-lg focus:outline-none"
                                value={discount}
                                onChange={e => {
                                  if (!foundEntity) return;
                                  let dAmount = parseFloat(e.target.value) || 0;
                                  const dueProfit = Math.round(foundEntity.dueAmount * (foundEntity.profitAmount / foundEntity.totalAmount));
                                  
                                  if (dAmount > dueProfit) {
                                    dAmount = dueProfit;
                                  }
                                  
                                  setDiscount(dAmount.toString());
                                  const dPercent = (dAmount / foundEntity.dueAmount) * 100;
                                  setDiscountPercent(dPercent.toFixed(2));
                                }}
                              />
                            </div>

                            {/* নিষ্পত্তির জন্য সংগ্রহ করুন */}
                            <div className="space-y-1">
                              <label className="text-sm font-bold text-slate-800 ml-1">নিষ্পত্তির জন্য সংগ্রহ করুন</label>
                              <div className="w-full border-2 border-black rounded-lg p-2 text-center font-black text-2xl bg-slate-100 text-[#00a651]">
                                {toBengaliNumber(foundEntity.dueAmount + (parseFloat(fine) || 0) - (parseFloat(discount) || 0))}
                              </div>
                            </div>
                            
                            {/* নিষ্পত্তির কারণ */}
                            <div className="space-y-1 lg:col-span-2 xl:col-span-3">
                              <label className="text-sm font-bold text-slate-800 ml-1">বিনিয়োগ নিষ্পত্তির কারণ</label>
                              <input 
                                type="text"
                                className="w-full border-2 border-black rounded-lg p-2 text-center font-bold text-lg focus:outline-none"
                                placeholder="বিবরণ লিখুন..."
                                value={note}
                                onChange={e => setNote(e.target.value)}
                              />
                            </div>
                          </div>

                          {error && (
                            <div className="p-3 bg-rose-50 text-rose-600 rounded-xl text-xs font-bold border border-rose-100 text-center">
                              {error}
                            </div>
                          )}

                          <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-4 bg-[#00a651] hover:bg-[#008f45] text-white rounded-xl font-black text-2xl active:scale-[0.98] transition-all disabled:opacity-50 shadow-md flex items-center justify-center mt-4"
                          >
                            {loading ? (
                              <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              'নিষ্পত্তি নিশ্চিত করুন'
                            )}
                          </button>
                        </form>
                      </div>
                    )}
                  </div>
              </motion.div>
            ) : (activeType !== 'installment' && activeType !== 'settlement') ? (
              <motion.div 
                key="others"
                initial={{ opacity: 0, scale: 0.98, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: -10 }}
                className="w-full px-4"
              >
                {(activeType === 'director_deposit' || activeType === 'director_withdrawal' || activeType === 'bank_deposit' || activeType === 'bank_withdrawal' || activeType === 'profit_distribution' || activeType === 'profit_withdraw' || activeType === 'expense') ? (
                  <div className="w-full space-y-6">
                    <div className="bg-[#0b54ad] py-4 px-6 text-center rounded-2xl">
                      <h2 className="text-xl md:text-2xl font-black text-white">
                        {activeType === 'director_deposit' && 'পরিচালকের জমা'}
                        {activeType === 'director_withdrawal' && 'পরিচালকের উত্তোলন'}
                        {activeType === 'bank_deposit' && 'ব্যাংক জমা'}
                        {activeType === 'bank_withdrawal' && 'ব্যাংক উত্তোলন'}
                        {activeType === 'expense' && 'ব্যয়'}
                        {activeType === 'profit_distribution' && 'মুনাফা বন্টন'}
                        {activeType === 'profit_withdraw' && 'মুনাফা উত্তোলন'}
                      </h2>
                    </div>
                    
                    <form onSubmit={handleSubmit} className="p-2 space-y-6">
                      <div className="space-y-6">
                        {/* তারিখ */}
                        <div className="space-y-2 text-left">
                          <label className="flex items-center gap-2 text-sm font-bold text-slate-800 ml-1">
                            <Calendar size={18} className="text-[#0b54ad]" />
                            তারিখ
                          </label>
                          <div className="relative group flex gap-2">
                            <input 
                              type="date"
                              required
                              className="flex-1 bg-white border border-slate-300 rounded-xl px-4 py-3 font-bold text-lg text-slate-800 outline-none focus:border-[#0b54ad] transition-all appearance-none text-center"
                              value={date}
                              onChange={e => setDate(e.target.value)}
                            />
                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 group-hover:text-[#0b54ad] transition-colors pointer-events-none opacity-0" size={20} />
                          </div>
                        </div>

                        {/* সিলেকশন (পরিচালক/ব্যাংক/বন্টন পদ্ধতি) - Only for types that need it */}
                        {activeType !== 'expense' && (
                          <div className="space-y-2 text-left">
                            <label className="text-sm font-bold text-slate-800 ml-1">
                              { (activeType === 'director_deposit' || activeType === 'director_withdrawal' || activeType === 'profit_withdraw') && 'পরিচালকের নাম' }
                              { (activeType === 'bank_deposit' || activeType === 'bank_withdrawal') && 'ব্যাংক একাউন্ট নির্বাচন' }
                              { activeType === 'profit_distribution' && 'বন্টন পদ্ধতি' }
                            </label>
                            <div className="relative group">
                              { activeType === 'profit_distribution' ? (
                                <select 
                                  required 
                                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 font-bold text-lg text-slate-800 outline-none focus:border-[#0b54ad] transition-all appearance-none text-center"
                                  value={distributionType}
                                  onChange={e => setDistributionType(e.target.value as any)}
                                >
                                  <option value="select">বন্টন পদ্ধতি নির্বাচন করুন</option>
                                  <option value="automatic">স্বয়ংক্রিয় বন্টন</option>
                                  <option value="manual">ম্যানুয়াল বন্টন</option>
                                </select>
                              ) : (
                                <select 
                                  required 
                                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 font-bold text-lg text-slate-800 outline-none focus:border-[#0b54ad] transition-all appearance-none text-center"
                                  onChange={e => {
                                    if (activeType === 'bank_deposit' || activeType === 'bank_withdrawal') {
                                      setFoundEntity(banks.find(b => b.id === e.target.value));
                                    } else {
                                      setFoundEntity(directors.find(d => d.id === e.target.value));
                                    }
                                  }}
                                  value={foundEntity?.id || ''}
                                >
                                  <option value="">
                                    { (activeType === 'bank_deposit' || activeType === 'bank_withdrawal') ? 'ব্যাংক একাউন্ট সিলেক্ট করুন' : 'পরিচালকের সিলেক্ট করুন' }
                                  </option>
                                  { (activeType === 'bank_deposit' || activeType === 'bank_withdrawal') 
                                    ? banks.map(b => <option key={b.id} value={b.id}>{b.accountNumber}</option>)
                                    : directors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)
                                  }
                                </select>
                              ) }
                              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 group-hover:text-[#0b54ad] transition-colors pointer-events-none" size={20} />
                            </div>
                          </div>
                        )}

                        {/* বর্তমান ব্যালেন্স/নিট মুনাফা */}
                        {activeType !== 'expense' && (
                          <div className="space-y-2 text-left">
                            <label className="text-sm font-bold text-slate-800 ml-1">
                               { activeType === 'profit_distribution' && 'বর্তমান নিট মুনাফা' }
                               { activeType === 'profit_withdraw' && 'পরিচালকের মুনাফা ব্যালেন্স' }
                               { (activeType === 'director_deposit' || activeType === 'director_withdrawal') && 'পরিচালকের বর্তমান ব্যালেন্স' }
                               { (activeType === 'bank_deposit' || activeType === 'bank_withdrawal') && 'ব্যাংক বর্তমান ব্যালেন্স' }
                            </label>
                            <div className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 font-black text-2xl text-emerald-600 min-h-[56px] flex items-center justify-center">
                               { activeType === 'profit_distribution' && formatCurrency(calculateNetProfit()) }
                               { activeType === 'profit_withdraw' && (foundEntity ? formatCurrency(foundEntity.profitBalance || 0) : '') }
                               { (activeType === 'director_deposit' || activeType === 'director_withdrawal') && (foundEntity ? formatCurrency(foundEntity.balance || 0) : '') }
                               { (activeType === 'bank_deposit' || activeType === 'bank_withdrawal') && (foundEntity ? formatCurrency(foundEntity.balance || 0) : '') }
                            </div>
                          </div>
                        )}
                        
                        {/* অতিরিক্ত সিলেকশন (ম্যানুয়াল বন্টনের জন্য) */}
                        { activeType === 'profit_distribution' && distributionType === 'manual' && (
                          <div className="space-y-2 text-left">
                            <label className="text-sm font-bold text-slate-800 ml-1">পরিচালক নির্বাচন করুন</label>
                            <div className="relative group">
                              <select 
                                required 
                                className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 font-bold text-lg text-slate-800 outline-none focus:border-[#0b54ad] transition-all appearance-none text-center"
                                onChange={e => setFoundEntity(directors.find(d => d.id === e.target.value))}
                                value={foundEntity?.id || ''}
                              >
                                <option value="">পরিচালকের সিলেক্ট করুন</option>
                                {directors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                              </select>
                              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 group-hover:text-[#0b54ad] transition-colors pointer-events-none" size={20} />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* অটোমেটিক বন্টন তথ্য (মোট পরিচালক ও প্রতিজন কত পাবে) */}
                      { activeType === 'profit_distribution' && distributionType === 'automatic' && (
                        <div className="space-y-5">
                          <div className="space-y-2 text-left">
                            <label className="text-sm font-bold text-slate-800 ml-1">মোট পরিচালক সংখ্যা</label>
                            <div className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-black text-xl text-slate-600 min-h-[56px] flex items-center justify-center">
                              {directors.length} জন
                            </div>
                          </div>
                          <div className="space-y-2 text-left">
                            <label className="text-sm font-bold text-slate-800 ml-1">প্রতি পরিচালক পাবে</label>
                            <div className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-black text-xl text-emerald-600 min-h-[56px] flex items-center justify-center">
                              {amount && parseFloat(amount) > 0 ? formatCurrency(parseFloat(amount) / directors.length) : formatCurrency(0)}
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="space-y-6">
                        {/* টাকার পরিমাণ */}
                        <div className="space-y-2 text-left">
                          <label className="text-sm font-bold text-slate-800 ml-1">টাকার পরিমাণ*</label>
                          <input 
                            type="number" 
                            required 
                            placeholder="টাকার পরিমাণ লিখুন"
                            className="w-full bg-white border-2 border-[#0b54ad]/30 rounded-2xl px-4 py-4 font-black text-3xl text-center text-slate-800 outline-none focus:border-[#0b54ad] transition-all" 
                            value={amount} 
                            onChange={e => setAmount(e.target.value)} 
                          />
                        </div>

                        {/* বিবরণ */}
                        <div className="space-y-2 text-left">
                          <label className="text-sm font-bold text-slate-800 ml-1">বিবরণ</label>
                          <textarea 
                            placeholder="বিস্তারিত লিখুন"
                            className="w-full bg-white border border-slate-300 rounded-xl px-4 py-4 font-bold text-2xl text-center text-slate-800 outline-none focus:border-[#0b54ad] transition-all min-h-[82px]" 
                            value={note} 
                            onChange={e => setNote(e.target.value)} 
                          />
                        </div>
                      </div>

                      {error && (
                        <div className="p-4 bg-rose-50 text-rose-600 rounded-xl text-xs font-bold border border-rose-100 text-center">
                          {error}
                        </div>
                      )}
                      
                      <button 
                        type="submit" 
                        disabled={loading} 
                        className="w-full py-5 bg-[#5b96e9] hover:bg-[#4a85d8] text-white rounded-2xl font-black text-xl active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg"
                      >
                        {loading ? (
                          <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin mx-auto" />
                        ) : (
                          'সাবমিট করুন'
                        )}
                      </button>
                    </form>
                  </div>
                ) : (
                  <div className="w-full">
                  </div>
                )}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-black text-slate-800">লেনদেন</h2>
            <p className="text-sm font-bold text-slate-400">সিস্টেমের লেনদেনসমূহ পরিচালনা করুন</p>
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

      <AnimatePresence>
        {success && (
          <motion.div 
            initial={{ opacity: 0, y: 100, scale: 0.8 }} 
            animate={{ opacity: 1, y: 0, scale: 1 }} 
            exit={{ opacity: 0, y: 50, scale: 0.8 }} 
            className="fixed bottom-6 left-1/2 -translate-x-1/2 max-w-[90vw] whitespace-nowrap bg-emerald-50 text-emerald-900 px-6 py-2.5 rounded-full shadow-2xl z-[200] flex items-center gap-4 border-2 border-emerald-200"
          >
            {lastTransaction?.type === 'payment' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handlePrint(lastTransaction);
                }}
                className="w-10 h-10 bg-emerald-600 text-white rounded-full flex items-center justify-center hover:bg-emerald-700 transition-colors shadow-sm shrink-0 active:scale-90"
              >
                <Printer size={20} />
              </button>
            )}
            <h3 className="text-lg font-black tracking-tight">লেনদেন সফল হয়েছে</h3>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
