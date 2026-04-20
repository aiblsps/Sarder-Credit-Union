import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, doc, updateDoc, increment, serverTimestamp, deleteDoc, query, where, getDocs, orderBy, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { useAuth } from './AuthContext';
import { formatCurrency, toBengaliNumber, cn, formatNumberWithCommas, parseNumberFromCommas, getDirectDriveUrl } from './lib/utils';
import { Plus, Search, MoreVertical, Trash2, FileText, Info, Award, X, User, ShieldCheck, Calendar, DollarSign, Package, Clock, Users, MapPin, Phone, CheckCircle2, List, ChevronDown, Printer, Download, ArrowLeft, Hash, Receipt, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DataTable } from './components/DataTable';

const formatAddressInternal = (addr: any) => {
  if (!addr) return '';
  if (typeof addr === 'string') return addr;
  const parts = [];
  if (addr.village) parts.push(`গ্রামঃ ${addr.village}`);
  if (addr.postOffice) parts.push(`ডাকঘরঃ ${addr.postOffice}`);
  if (addr.thana) parts.push(`থানাঃ ${addr.thana}`);
  if (addr.district) parts.push(`জেলাঃ ${addr.district}`);
  return parts.join(', ');
};

const formatDate = (date: any) => {
  if (!date) return '';
  let dateStr = '';
  if (typeof date === 'string') {
    dateStr = date;
  } else if (date && typeof date.toDate === 'function') {
    dateStr = date.toDate().toISOString();
  } else {
    return '';
  }
  const datePart = dateStr.split('T')[0];
  const [y, m, d] = datePart.split('-');
  return `${d}-${m}-${y}`;
};

export const Investments = () => {
  const { role, user } = useAuth();
  const [investments, setInvestments] = useState<any[]>(() => {
    const saved = localStorage.getItem('cache_investments');
    return saved ? JSON.parse(saved) : [];
  });
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('চলমান');
  const [activeActionMenu, setActiveActionMenu] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, isUpward: false });
  const [successMessage, setSuccessMessage] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 20;
  
  // Action Modals State
  const [selectedInvestment, setSelectedInvestment] = useState<any>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showTransactionsModal, setShowTransactionsModal] = useState(false);
  const [showGuarantorsModal, setShowGuarantorsModal] = useState(false);
  const [combinedGuarantors, setCombinedGuarantors] = useState<any[] | null>(null);

  useEffect(() => {
    const fetchGuarantorDetails = async () => {
      if (!showGuarantorsModal || !selectedInvestment) {
        setCombinedGuarantors(null);
        return;
      }
      
      // Consolidate guarantors: prioritize populated guarantors, fallback to reference fields
      let list = [...(selectedInvestment.guarantors || [])].filter((g: any) => g.name || g.accountNumber);
      
      if (list.length === 0 && (selectedInvestment.referenceAccountNumber || selectedInvestment.referenceName)) {
        list = [{
          type: selectedInvestment.referenceType || (selectedInvestment.referenceAccountNumber ? 'member' : 'other'),
          accountNumber: selectedInvestment.referenceAccountNumber || '',
          name: selectedInvestment.referenceName || '',
          relationship: selectedInvestment.referenceRelationship || '',
          mobile: selectedInvestment.referenceMobile || selectedInvestment.referencePhone || '',
          fatherName: selectedInvestment.referenceFatherName || '',
          motherName: selectedInvestment.referenceMotherName || '',
          nid: selectedInvestment.referenceNid || '',
          address: selectedInvestment.referenceAddress || '',
          profession: selectedInvestment.referenceProfession || ''
        }];
      }

      // Show whatever we have immediately
      setCombinedGuarantors(list);

      // Automatically fetch details for all member guarantors in background
      const enriched = await Promise.all(list.map(async (g: any) => {
        let memberData = null;
        if (g.accountNumber && !g.fatherName) {
          const accNo = String(g.accountNumber).trim();
          if (accNo) {
            let mq = query(collection(db, 'customers'), where('accountNumber', '==', accNo));
            let msnap = await getDocs(mq);
            
            if (msnap.empty && !isNaN(Number(accNo))) {
              mq = query(collection(db, 'customers'), where('accountNumber', '==', `100${accNo}`));
              msnap = await getDocs(mq);
            }

            if (!msnap.empty) {
              memberData = msnap.docs[0].data();
            }
          }
        }

        if (memberData) {
          return {
            ...g,
            name: memberData.name || g.name || '',
            fatherName: memberData.fatherName || g.fatherName || '',
            motherName: memberData.motherName || g.motherName || '',
            mobile: memberData.mobile || g.mobile || '',
            nid: memberData.nid || g.nid || '',
            dob: memberData.dob || g.dob || '',
            address: memberData.presentAddress || g.address || '',
            profession: memberData.profession || g.profession || '',
            type: 'member'
          };
        }
        return g;
      }));

      setCombinedGuarantors(enriched);
    };

    fetchGuarantorDetails();
  }, [showGuarantorsModal, selectedInvestment]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  const DetailItem = ({ label, value, className, multiline }: { label: string, value: string, className?: string, multiline?: boolean }) => (
    <div className={cn("space-y-2", className)}>
      <label className="text-sm font-bold text-slate-700">{label}</label>
      <div className={cn(
        "w-full px-4 border border-slate-900 rounded-lg flex bg-white text-slate-900 font-medium",
        multiline ? "min-h-[140px] py-3 items-start" : "h-12 items-center"
      )}>
        {value || '---'}
      </div>
    </div>
  );
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [fineAmount, setFineAmount] = useState(0);
  const [lastTransaction, setLastTransaction] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorModal, setErrorModal] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<any[]>(() => {
    const saved = localStorage.getItem('cache_investment_transactions_last');
    return saved ? JSON.parse(saved) : [];
  });
  const [appUsers, setAppUsers] = useState<any[]>([]);
  const [customerMap, setCustomerMap] = useState<Record<string, string>>({});
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateFormData, setGenerateFormData] = useState<any>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{ id: string, type: 'investment' | 'transaction', data?: any } | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'customers'), (snap) => {
      const mapping: Record<string, string> = {};
      snap.docs.forEach(doc => {
        const data = doc.data();
        mapping[data.accountNumber] = data.name;
      });
      setCustomerMap(mapping);
    }, (error) => {
      console.error("Error fetching customers for mapping:", error);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (showDetailsModal && selectedInvestment?.customerId) {
      const unsub = onSnapshot(doc(db, 'customers', selectedInvestment.customerId), (snap) => {
        if (snap.exists()) {
          setSelectedCustomer({ id: snap.id, ...snap.data() });
        }
      }, (error) => {
        console.error("Error fetching selected customer:", error);
      });
      return () => unsub();
    } else {
      setSelectedCustomer(null);
    }
  }, [showDetailsModal, selectedInvestment]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      setAppUsers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.error("Error fetching users for signatures:", error);
    });
    return () => unsub();
  }, []);
  
  // Calculate principal and profit splits for transactions
  const transactionSplits = React.useMemo(() => {
    const currentInv = investments.find(inv => inv.id === selectedInvestment?.id) || selectedInvestment;
    if (!currentInv || transactions.length === 0) return {};
    
    const totalPrincipal = parseFloat(currentInv.amount) || 0;
    const totalProfit = parseFloat(currentInv.profitAmount) || 0;
    const totalAmount = totalPrincipal + totalProfit;
    
    if (totalAmount === 0) return {};
    
    const principalRatio = totalPrincipal / totalAmount;
    const profitRatio = totalProfit / totalAmount;
    
    // Sort chronologically for calculation
    const sortedTrs = [...transactions].sort((a, b) => {
      const timeA = a.createdAt?.seconds || 0;
      const timeB = b.createdAt?.seconds || 0;
      return timeA - timeB;
    });
    
    const splits: Record<string, { principal: number, profit: number }> = {};
    let collectedPrincipal = 0;
    let collectedProfit = 0;
    let cumulativeAmount = 0;
    
    // We track rounded totals to ensure the sum of parts equals the total
    let shownProfitTotal = 0;

      const totalPaidInList = sortedTrs.reduce((sum, t) => sum + t.amount + (t.discount || 0), 0);
      const isInvestmentSettled = totalPaidInList >= totalAmount - 0.1;

    sortedTrs.forEach((tr, index) => {
      const isLastItem = index === sortedTrs.length - 1;
      let principalPart, profitPart;
      
      if (isLastItem && isInvestmentSettled) {
        principalPart = totalPrincipal - collectedPrincipal;
        // The remaining profit cash part is total profit minus what we already collected (cash) and minus this transaction's discount.
        // Wait, NO. collectedProfit is cash. 
        // totalProfit - (collectedProfit + totalDiscountsUsedBefore) gives total remaining profit (due).
        // Then we subtract this tr's discount to get this tr's profitPart (cash).
        
        // Actually, let's keep it simple: 
        // If it's a settlement, profitPart is simply tr.amount - remaining principal.
        profitPart = tr.amount - principalPart;
        if (profitPart < 0) profitPart = 0;
      } else {
        // Calculate what the total profit should be for the cumulative amount paid so far
        const nextCumulativeAmount = cumulativeAmount + tr.amount + (tr.discount || 0);
        const targetProfitTotal = Math.round(nextCumulativeAmount * profitRatio);
        
        profitPart = (targetProfitTotal - shownProfitTotal) - (tr.discount || 0);
        if (profitPart < 0) profitPart = 0;
        principalPart = tr.amount - profitPart;
      }
      
      splits[tr.id] = { principal: principalPart, profit: profitPart };
      collectedPrincipal += principalPart;
      collectedProfit += profitPart;
      shownProfitTotal += profitPart + (tr.discount || 0);
      cumulativeAmount += tr.amount;
    });
    
    return splits;
  }, [transactions, selectedInvestment, investments]);
  
  // Search state
  const [searchAccount, setSearchAccount] = useState('');
  const [foundCustomer, setFoundCustomer] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  const initialInvestmentData = {
    amount: '',
    profitPercent: '',
    profitAmount: '',
    totalAmount: 0,
    installmentCount: '1',
    perInstallment: 0,
    productInfo: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    investmentType: 'মাসিক',
    // Bank Check Details
    bankAccountType: 'MSD',
    bankName: '',
    bankBranch: '',
    routingNumber: '',
    bankAccountName: '',
    bankAccountNumber: '',
    mtdrAccountNumber: '',
    checkNumber: '',
    bankAmount: '',
    // Reference Details
    referenceType: null as 'member' | 'other' | null,
    referenceAccountNumber: '',
    referenceRelationship: '',
  };

  const initialGuarantorData = {
    type: 'other' as 'member' | 'other',
    accountNumber: '',
    name: '',
    fatherName: '',
    motherName: '',
    mobile: '',
    nid: '',
    dob: '',
    profession: '',
    relationship: '',
    address: { village: '', postOffice: '', thana: '', district: '' }
  };

  const [investmentData, setInvestmentData] = useState(initialInvestmentData);
  const [guarantors, setGuarantors] = useState<any[]>([initialGuarantorData]);
  const [showGuarantorPopup, setShowGuarantorPopup] = useState(false);

  // Auto-calculate End Date for Monthly investments
  useEffect(() => {
    if (investmentData.investmentType === 'মাসিক' && investmentData.startDate && investmentData.installmentCount) {
      const start = new Date(investmentData.startDate);
      if (!isNaN(start.getTime())) {
        const months = parseInt(investmentData.installmentCount) || 0;
        if (months > 0) {
          const end = new Date(start);
          // Add months
          end.setMonth(start.getMonth() + months);
          const endStr = end.toISOString().split('T')[0];
          
          // Only update if different to avoid infinite loop
          if (investmentData.endDate !== endStr) {
            setInvestmentData(prev => ({ ...prev, endDate: endStr }));
          }
        }
      }
    }
  }, [investmentData.investmentType, investmentData.startDate, investmentData.installmentCount]);

  useEffect(() => {
    const onBack = (e: Event) => {
      if (showDeleteConfirm) {
        e.preventDefault();
        setShowDeleteConfirm(null);
      } else if (showDetailsModal) {
        e.preventDefault();
        setShowDetailsModal(false);
      } else if (showTransactionsModal) {
        e.preventDefault();
        setShowTransactionsModal(false);
      } else if (showGuarantorsModal) {
        e.preventDefault();
        setShowGuarantorsModal(false);
      } else if (showPaymentModal) {
        e.preventDefault();
        setShowPaymentModal(false);
      } else if (showGenerateModal) {
        e.preventDefault();
        setShowGenerateModal(false);
      } else if (showAddModal) {
        e.preventDefault();
        setShowAddModal(false);
        setFoundCustomer(null);
        setSearchAccount('');
        setInvestmentData(initialInvestmentData);
        setGuarantors([initialGuarantorData]);
      }
    };
    window.addEventListener('app:back', onBack);
    return () => window.removeEventListener('app:back', onBack);
  }, [showDetailsModal, showTransactionsModal, showGuarantorsModal, showPaymentModal, showAddModal, showDeleteConfirm]);

  useEffect(() => {
    if (!role) return;
    const unsub = onSnapshot(collection(db, 'investments'), (snap) => {
      const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setInvestments(docs);
      localStorage.setItem('cache_investments', JSON.stringify(docs));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'investments');
    });
    return unsub;
  }, [role]);

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  const handleSearchCustomer = async () => {
    if (!searchAccount) return;
    setIsSearching(true);
    setSearchError('');
    try {
      // Try exact match first
      let q = query(collection(db, 'customers'), where('accountNumber', '==', searchAccount));
      let snap = await getDocs(q);
      
      // If not found and it's a number, try with 100 prefix
      if (snap.empty && !isNaN(Number(searchAccount))) {
        const prefixedAccount = `100${searchAccount}`;
        q = query(collection(db, 'customers'), where('accountNumber', '==', prefixedAccount));
        snap = await getDocs(q);
      }

      if (!snap.empty) {
        setFoundCustomer({ id: snap.docs[0].id, ...snap.docs[0].data() });
      } else {
        setSearchError('গ্রাহক খুঁজে পাওয়া যায়নি');
      }
    } catch (err) {
      setSearchError('সার্চ করতে সমস্যা হয়েছে');
    } finally {
      setIsSearching(false);
    }
  };

  const calculateProfit = (type: 'percent' | 'amount', value: string) => {
    const amount = parseFloat(investmentData.amount) || 0;
    if (type === 'percent') {
      const percent = parseFloat(value) || 0;
      const profit = (amount * percent) / 100;
      const total = amount + profit;
      const perInst = total / (parseInt(investmentData.installmentCount) || 1);
      setInvestmentData(prev => ({
        ...prev,
        profitPercent: value,
        profitAmount: profit.toString(),
        totalAmount: total,
        perInstallment: perInst
      }));
    } else {
      const profit = parseFloat(value) || 0;
      const percent = amount > 0 ? (profit / amount) * 100 : 0;
      const total = amount + profit;
      const perInst = total / (parseInt(investmentData.installmentCount) || 1);
      setInvestmentData(prev => ({
        ...prev,
        profitAmount: value,
        profitPercent: percent.toFixed(2),
        totalAmount: total,
        perInstallment: perInst
      }));
    }
  };

  const handleAmountChange = (val: string) => {
    const rawValue = parseNumberFromCommas(val);
    const amount = parseFloat(rawValue) || 0;
    const percent = parseFloat(investmentData.profitPercent) || 0;
    const profit = (amount * percent) / 100;
    const total = amount + profit;
    const perInst = total / (parseInt(investmentData.installmentCount) || 1);
    setInvestmentData(prev => ({
      ...prev,
      amount: rawValue,
      profitAmount: profit.toString(),
      totalAmount: total,
      perInstallment: perInst
    }));
  };

  const handleInstallmentChange = (val: string) => {
    const count = parseInt(val) || 1;
    const perInst = investmentData.totalAmount / count;
    setInvestmentData(prev => ({
      ...prev,
      installmentCount: val,
      perInstallment: perInst
    }));
  };

  const handleAddGuarantor = () => {
    setGuarantors([...guarantors, initialGuarantorData]);
  };

  const updateGuarantor = (index: number, field: string, value: any) => {
    const newGuarantors = [...guarantors];
    if (field.includes('.')) {
      const [parent, child] = field.split('.');
      newGuarantors[index][parent][child] = value;
    } else {
      newGuarantors[index][field] = value;
    }
    setGuarantors(newGuarantors);
  };

  const [formTab, setFormTab] = useState<'investment' | 'guarantors'>('investment');

  const [showConfirmModal, setShowConfirmModal] = useState(false);

  useEffect(() => {
    const handleEnter = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        if (showConfirmModal) {
          e.preventDefault();
          const confirmBtn = document.getElementById('investment-confirm-btn');
          if (confirmBtn) confirmBtn.click();
        } else if (showAddModal) {
          e.preventDefault();
          if (!foundCustomer) {
            handleSearchCustomer();
          } else {
            const submitBtn = document.getElementById('investment-submit-btn');
            if (submitBtn) submitBtn.click();
          }
        }
      }
    };
    window.addEventListener('keydown', handleEnter);
    return () => window.removeEventListener('keydown', handleEnter);
  }, [showConfirmModal, showAddModal, foundCustomer, searchAccount, isSearching]);

  const handleSubmit = async () => {
    if (!foundCustomer) return;
    if (role !== 'super_admin') return;

    if (!showConfirmModal) {
      setShowConfirmModal(true);
      return;
    }

    setShowConfirmModal(false);
    // Basic validation
    if (!investmentData.amount || !investmentData.installmentCount) {
      setErrorModal('দয়া করে বিনিয়োগের পরিমাণ এবং কিস্তির সংখ্যা প্রদান করুন');
      return;
    }

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'investments'), {
        ...investmentData,
        guarantors,
        customerId: foundCustomer.id,
        customerName: foundCustomer.name,
        customerAccountNumber: foundCustomer.accountNumber,
        area: foundCustomer.area || foundCustomer.presentAddress?.village || '',
        paidAmount: 0,
        paidInstallmentCount: 0,
        dueAmount: investmentData.totalAmount,
        status: 'চলমান',
        createdAt: serverTimestamp(),
        createdBy: user?.name || user?.displayName || user?.email || 'Admin',
        createdByUserId: user?.uid || 'unknown'
      });

      // Reset
      setShowAddModal(false);
      setFoundCustomer(null);
      setSearchAccount('');
      setInvestmentData(initialInvestmentData);
      setGuarantors([initialGuarantorData]);
      setFormTab('investment');
      setSuccessMessage('বিনিয়োগ সফলভাবে সংরক্ষণ করা হয়েছে');
    } catch (err) {
      console.error("Error saving investment:", err);
      setErrorModal('বিনিয়োগ সংরক্ষণ করতে সমস্যা হয়েছে');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'investments', id));
      setShowDeleteConfirm(null);
      setActiveActionMenu(null);
      setSuccessMessage('বিনিয়োগ ডিলিট করা হয়েছে');
    } catch (err) {
      console.error("Error deleting investment:", err);
      setErrorModal('বিনিয়োগ ডিলিট করতে সমস্যা হয়েছে');
    } finally {
      setIsDeleting(false);
    }
  };

  const filtered = investments.filter(inv => {
    const matchesSearch = inv.customerAccountNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         inv.customerName?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'সব' || inv.status === statusFilter;
    return matchesSearch && matchesStatus;
  }).sort((a, b) => {
    // Latest investments first
    const dateA = a.createdAt?.seconds || 0;
    const dateB = b.createdAt?.seconds || 0;
    return dateB - dateA;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginatedData = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Totals for current page
  const pageTotals = paginatedData.reduce((acc, inv) => {
    acc.amount += parseFloat(inv.amount) || 0;
    acc.profitAmount += parseFloat(inv.profitAmount) || 0;
    acc.totalAmount += parseFloat(inv.totalAmount) || 0;
    acc.paidAmount += parseFloat(inv.paidAmount) || 0;
    acc.dueAmount += (parseFloat(inv.totalAmount) || 0) - (parseFloat(inv.paidAmount) || 0);
    return acc;
  }, { amount: 0, profitAmount: 0, totalAmount: 0, paidAmount: 0, dueAmount: 0 });

  const renderTableFooter = () => (
    <tr className="bg-emerald-50 border-t-2 border-black font-black">
      <td colSpan={9} className="py-2 px-4 text-center border border-black"></td>
      <td className="py-2 px-4 text-center border border-black">{formatCurrency(pageTotals.amount)}</td>
      <td className="py-2 px-4 text-center border border-black">{formatCurrency(pageTotals.profitAmount)}</td>
      <td className="py-2 px-4 text-center border border-black">{formatCurrency(pageTotals.totalAmount)}</td>
      <td className="py-2 px-4 text-center border border-black text-emerald-600">{formatCurrency(pageTotals.paidAmount)}</td>
      <td className="py-2 px-4 text-center border border-black text-rose-600">{formatCurrency(pageTotals.dueAmount)}</td>
      <td className="border border-black"></td>
      <td className="border border-black"></td>
    </tr>
  );

  const handlePageChange = (p: number) => {
    setCurrentPage(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const columns = [
    { header: 'ক্রমিক', render: (_: any, index: number) => toBengaliNumber((currentPage - 1) * PAGE_SIZE + index + 1), className: "text-center font-bold text-slate-500", headerClassName: "text-center" },
    { header: 'সদস্যের নাম', accessor: 'customerName', className: "font-bold text-slate-800 text-left", headerClassName: "text-center" },
    { header: 'হিসাব নম্বর', accessor: 'customerAccountNumber', className: "font-mono font-bold text-emerald-700 text-center", headerClassName: "text-center" },
    { header: 'বিনিয়োগের ধরন', accessor: 'investmentType', className: "text-center", headerClassName: "text-center" },
    { 
      header: 'রেফারেন্স', 
      render: (inv: any) => {
        if (inv.referenceType === 'member') {
          let name = customerMap[inv.referenceAccountNumber];
          // Try with 100 prefix if not found and it's a number
          if (!name && inv.referenceAccountNumber && !isNaN(Number(inv.referenceAccountNumber))) {
            name = customerMap[`100${inv.referenceAccountNumber}`];
          }
          
          return (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                // Navigate to customers and search for this account
                window.location.href = `?search=${inv.referenceAccountNumber}#/customers`;
              }}
              className="text-blue-600 hover:underline font-bold"
            >
              {name || inv.referenceAccountNumber}
            </button>
          );
        } else if (inv.guarantors && inv.guarantors.length > 0) {
          return <span className="font-bold text-slate-600">{inv.guarantors[0].name}</span>;
        }
        return '---';
      },
      className: "text-center",
      headerClassName: "text-center"
    },
    { 
      header: 'সময়কাল', 
      render: (inv: any) => (
        <div className="text-[11px] leading-tight font-bold text-slate-600 text-center whitespace-nowrap">
          {toBengaliNumber(formatDate(inv.startDate))} থেকে {toBengaliNumber(formatDate(inv.endDate))}
        </div>
      ),
      headerClassName: "text-center",
      className: "text-center"
    },
    { 
      header: 'কিস্তির সংখ্যা', 
      render: (inv: any) => {
        const paidCount = Math.floor((inv.paidAmount || 0) / (inv.perInstallment || 1));
        return (
          <div className="text-center">
            <span className="text-emerald-600 font-bold">{toBengaliNumber(paidCount)}</span>
            <span className="text-slate-400 mx-1">/</span>
            <span className="text-slate-600 font-bold">{toBengaliNumber(inv.installmentCount)}</span>
          </div>
        );
      },
      className: "text-center",
      headerClassName: "text-center"
    },
    { header: 'প্রতি কিস্তি', render: (inv: any) => formatCurrency(inv.perInstallment), className: "text-center", headerClassName: "text-center" },
    { header: 'পণ্য', accessor: 'productInfo', className: "text-center", headerClassName: "text-center" },
    { header: 'আসল', render: (inv: any) => formatCurrency(inv.amount), className: "text-center", headerClassName: "text-center" },
    { header: 'মুনাফা', render: (inv: any) => formatCurrency(inv.profitAmount), className: "text-center", headerClassName: "text-center" },
    { header: 'মোট', render: (inv: any) => formatCurrency(inv.totalAmount), className: "text-center", headerClassName: "text-center" },
    { header: 'পরিশোধিত', render: (inv: any) => formatCurrency(inv.paidAmount || 0), className: "text-emerald-600 font-bold text-center", headerClassName: "text-center" },
    { header: 'বকেয়া', render: (inv: any) => formatCurrency(inv.totalAmount - (inv.paidAmount || 0)), className: "text-rose-600 font-bold text-center", headerClassName: "text-center" },
    { 
      header: 'স্ট্যাটাস', 
      render: (inv: any) => (
        <span className={cn(
          "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
          inv.status === 'চলমান' ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"
        )}>
          {inv.status}
        </span>
      ),
      className: "text-center",
      headerClassName: "text-center"
    },
    {
      header: 'একশন',
      render: (inv: any) => (
        <div className="relative text-center">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              const windowHeight = window.innerHeight;
              const menuHeight = 260; // Estimated height for 5 items
              const spaceBelow = windowHeight - rect.bottom;
              const spaceAbove = rect.top;
              
              // Open upward only if there's more space above than below AND not enough space below
              const isUpward = spaceBelow < menuHeight && spaceAbove > spaceBelow;
              
              setMenuPosition({
                top: isUpward ? rect.top : rect.bottom,
                left: rect.left,
                isUpward
              });
              setActiveActionMenu(activeActionMenu === inv.id ? null : inv.id);
            }}
            className="flex items-center gap-1 px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl hover:bg-slate-200 transition-all text-slate-700 mx-auto shadow-sm active:scale-95"
          >
            <List size={16} />
            <ChevronDown size={12} className={cn("transition-transform duration-300", activeActionMenu === inv.id && "rotate-180")} />
          </button>
          
          <AnimatePresence>
            {activeActionMenu === inv.id && (
              <>
                <div className="fixed inset-0 z-[100]" onClick={() => setActiveActionMenu(null)}></div>
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95, y: menuPosition.isUpward ? 10 : -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: menuPosition.isUpward ? 10 : -10 }}
                  style={{ 
                    position: 'fixed',
                    top: menuPosition.isUpward ? 'auto' : menuPosition.top + 4,
                    bottom: menuPosition.isUpward ? (window.innerHeight - menuPosition.top) + 4 : 'auto',
                    left: Math.max(16, Math.min(window.innerWidth - 256, menuPosition.left - 180)),
                    width: '240px'
                  }}
                  className="bg-white rounded-2xl shadow-[0_20px_70px_rgba(0,0,0,0.2)] border border-slate-100 z-[101] py-2 overflow-hidden text-left"
                >
                  <button 
                    onClick={() => {
                      setSelectedInvestment(inv);
                      setShowTransactionsModal(true);
                      setActiveActionMenu(null);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors border-b border-slate-50"
                  >
                    <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
                      <FileText size={16} />
                    </div>
                    <span>লেনদেনের তালিকা</span>
                  </button>
                  <button 
                    onClick={() => {
                      setSelectedInvestment(inv);
                      setShowDetailsModal(true);
                      setActiveActionMenu(null);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors border-b border-slate-50"
                  >
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
                      <FileText size={16} />
                    </div>
                    <span>বিনিয়োগ তথ্য</span>
                  </button>
                  <button 
                    onClick={() => {
                      setSelectedInvestment(inv);
                      setShowGuarantorsModal(true);
                      setActiveActionMenu(null);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors border-b border-slate-50"
                  >
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600">
                      <ShieldCheck size={16} />
                    </div>
                    <span>জামিনদারের বিবরণ</span>
                  </button>
                  {inv.status !== 'পরিশোধিত' && (inv.paidAmount === 0 || !inv.paidAmount) && (
                    <button 
                      onClick={() => {
                        openGenerateModal(inv);
                        setActiveActionMenu(null);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors border-b border-slate-50"
                    >
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600">
                        <Download size={16} />
                      </div>
                      <span>জেনারেট ফাইল</span>
                    </button>
                  )}
                  {role === 'super_admin' && (
                    <button 
                      onClick={() => setShowDeleteConfirm({ id: inv.id, type: 'investment' })}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-rose-600 hover:bg-rose-50 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center text-rose-600">
                        <Trash2 size={16} />
                      </div>
                      <span>ডিলিট বিনিয়োগ</span>
                    </button>
                  )}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      ),
      headerClassName: "text-center",
      className: "text-center"
    }
  ];

  const handlePrint = (tr: any) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('পপ-আপ ব্লক করা হয়েছে। দয়া করে পপ-আপ এলাউ করুন।');
      return;
    }

    const cashier = appUsers.find(u => u.email === tr.processedBy);
    const signatureUrl = cashier?.signatureUrl ? getDirectDriveUrl(cashier.signatureUrl) : '';

    // Fallback for older transactions missing voucher data
    const investmentTotalAmount = tr.investmentTotalAmount || tr.amount;
    const investmentPaidAmount = tr.investmentPaidAmount || tr.amount;
    const investmentDueAmount = tr.investmentDueAmount || 0;
    const installmentNo = tr.installmentNo || 1;
    const totalInstallments = tr.totalInstallments || 1;
    const dueInstallments = tr.dueInstallments || 0;

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

  const openGenerateModal = (inv: any) => {
    setSelectedInvestment(inv);
    
    // Initial data from the investment record itself
    const initialForm = {
      name: inv.customerName || '',
      fatherName: '',
      motherName: '',
      nid: '',
      dob: '',
      mobile: '',
      presentAddress: '',
      permanentAddress: '',
      profession: '',
      monthlyIncome: '',
      businessName: inv.productInfo || '',
      businessAddress: '',
      businessCapital: '',
      investmentAmount: inv.amount || '',
      duration: inv.installmentCount || '',
      profit: inv.profitAmount || '',
      totalAmount: inv.totalAmount || '',
      installmentCount: inv.installmentCount || '',
      perInstallment: inv.perInstallment || '',
      date: inv.startDate || '',
      investmentType: inv.investmentType || 'মাসিক',
      bankName: inv.bankName || '',
      bankBranch: inv.bankBranch || '',
      routingNumber: inv.routingNumber || '',
      bankAccountName: inv.bankAccountName || '',
      bankAccountNumber: inv.bankAccountNumber || '',
      bankAccountType: inv.bankAccountType || 'Savings',
      mtdrAccountNumber: inv.mtdrAccountNumber || '',
      checkNumber: inv.checkNumber || '',
      bankAmount: inv.bankAmount || '',
      representativeName: '',
      representativeDate: new Date().toISOString().split('T')[0],
      guarantors: [] as any[]
    };

    // Consolidate guarantors: prioritize populated guarantors, fallback to reference fields
    let rawGuarantors = (inv.guarantors || []).filter((g: any) => g.name || g.accountNumber);
    
    if (rawGuarantors.length === 0 && (inv.referenceAccountNumber || inv.referenceName)) {
      rawGuarantors = [{
        ...initialGuarantorData,
        type: inv.referenceType || (inv.referenceAccountNumber ? 'member' : 'other'),
        accountNumber: inv.referenceAccountNumber || '',
        name: inv.referenceName || '',
        relationship: inv.referenceRelationship || '',
        mobile: inv.referenceMobile || inv.referencePhone || '',
        fatherName: inv.referenceFatherName || '',
        motherName: inv.referenceMotherName || '',
        nid: inv.referenceNid || '',
        address: inv.referenceAddress || ''
      }];
    } else {
      rawGuarantors = rawGuarantors.map((g: any) => ({ ...initialGuarantorData, ...g }));
    }

    initialForm.guarantors = rawGuarantors;
    setGenerateFormData(initialForm);
    setShowGenerateModal(true);

    // Background enrichment
    const enrichData = async () => {
      try {
        let customer: any = {};
        const q = query(collection(db, 'customers'), where('accountNumber', '==', inv.customerAccountNumber));
        const snap = await getDocs(q);
        if (!snap.empty) {
          customer = snap.docs[0].data();
        }

        const preparedGuarantors = await Promise.all(rawGuarantors.map(async (g: any) => {
          let memberData = null;
          if ((g.type === 'member' || !g.type || g.accountNumber) && !g.fatherName && g.accountNumber) {
            const accNo = String(g.accountNumber).trim();
            if (accNo) {
              let mq = query(collection(db, 'customers'), where('accountNumber', '==', accNo));
              let msnap = await getDocs(mq);
              if (msnap.empty && !isNaN(Number(accNo))) {
                mq = query(collection(db, 'customers'), where('accountNumber', '==', `100${accNo}`));
                msnap = await getDocs(mq);
              }
              if (!msnap.empty) memberData = msnap.docs[0].data();
            }
          }

          const formatAddr = (addr: any) => {
            if (!addr) return '';
            if (typeof addr === 'string') return addr;
            if (typeof addr === 'object') {
              return [addr.village, addr.postOffice, addr.thana, addr.district].filter(Boolean).join(', ');
            }
            return '';
          };

          if (memberData) {
            return {
              ...initialGuarantorData,
              ...g,
              name: memberData.name || g.name || '',
              fatherName: memberData.fatherName || g.fatherName || '',
              motherName: memberData.motherName || g.motherName || '',
              mobile: memberData.mobile || g.mobile || '',
              nid: memberData.nid || g.nid || '',
              dob: memberData.dob || g.dob || '',
              address: formatAddr(memberData.presentAddress) || formatAddr(g.address) || '',
              profession: memberData.profession || g.profession || '',
              type: 'member'
            };
          }
          return { ...initialGuarantorData, ...g, address: formatAddr(g.address) };
        }));

        setGenerateFormData((prev: any) => ({
          ...prev,
          name: customer.name || prev.name || '',
          fatherName: customer.fatherName || prev.fatherName || '',
          motherName: customer.motherName || prev.motherName || '',
          nid: customer.nid || prev.nid || '',
          dob: customer.dob || prev.dob || '',
          mobile: customer.mobile || prev.mobile || '',
          presentAddress: formatAddressInternal(customer.presentAddress) || prev.presentAddress || '',
          permanentAddress: formatAddressInternal(customer.permanentAddress) || prev.permanentAddress || '',
          profession: customer.profession || prev.profession || '',
          monthlyIncome: customer.monthlyIncome || prev.monthlyIncome || '',
          guarantors: preparedGuarantors
        }));
      } catch (err) {
        console.error("Enrichment error:", err);
      }
    };

    enrichData();
  };

  const [isFetchingMember, setIsFetchingMember] = useState<number | null>(null);
  const handleFetchGuarantorMember = async (accountNo: string, idx: number) => {
    if (!accountNo) return;
    setIsFetchingMember(idx);
    try {
      const q = query(collection(db, 'customers'), where('accountNumber', '==', accountNo));
      const snap = await getDocs(q);
      
      if (!snap.empty) {
        const customer = snap.docs[0].data();
        const newGuarantors = [...generateFormData.guarantors];
        newGuarantors[idx] = {
          ...newGuarantors[idx],
          name: customer.name || '',
          fatherName: customer.fatherName || '',
          motherName: customer.motherName || '',
          mobile: customer.mobile || '',
          nid: customer.nid || '',
          dob: customer.dob || '',
          address: formatAddressInternal(customer.presentAddress) || '',
          profession: customer.profession || ''
        };
        setGenerateFormData({ ...generateFormData, guarantors: newGuarantors });
      } else {
        setErrorModal('এই হিসাব নম্বরের গ্রাহক পাওয়া যায়নি');
      }
    } catch (err) {
      console.error("Error fetching member:", err);
      setErrorModal('সার্ভার থেকে তথ্য আনতে সমস্যা হয়েছে');
    } finally {
      setIsFetchingMember(null);
    }
  };

  const handleGenerateFile = (data: any) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('পপ-আপ ব্লক করা হয়েছে। দয়া করে পপ-আপ এলাউ করুন।');
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Investment Form - ${data.name}</title>
          <style>
            @import url('https://fonts.maateen.me/solaiman-lipi/font.css');
            @page { size: A4; margin: 0; }
            body { 
              font-family: 'SolaimanLipi', sans-serif; 
              margin: 0; 
              padding: 0; 
              background: #f0f0f0; 
            }
            .page { 
              background: white; 
              width: 210mm; 
              height: 297mm; 
              padding: 20mm 25mm; 
              margin: 10mm auto; 
              box-shadow: 0 0 10px rgba(0,0,0,0.1); 
              box-sizing: border-box; 
              position: relative;
              overflow: hidden;
              display: flex;
              flex-direction: column;
            }
            .header { text-align: center; margin-bottom: 5px; }
            .header h1 { font-size: 32px; font-weight: 900; margin: 0; color: #000; }
            .header p { font-size: 16px; margin: 5px 0; font-weight: bold; }
            .divider { border-bottom: 2px solid #000; margin: 10px 0 20px 0; }
            
            .form-title { 
              text-align: center; 
              font-size: 22px; 
              font-weight: 900; 
              margin-bottom: 25px; 
              display: block;
            }
            .form-title span {
              border-bottom: 2px solid #000;
              padding-bottom: 2px;
              display: inline-block;
            }
            
            .section-title { 
              font-size: 17px; 
              font-weight: 900; 
              display: inline-block;
              align-self: flex-start;
              border-bottom: 1.5px solid #000;
              margin: 15px 0 8px 0; 
              padding-bottom: 1px;
            }
            
            .field-container { display: flex; flex-direction: column; gap: 3px; }
            .field { font-size: 14px; padding-bottom: 2px; display: flex; align-items: flex-start; }
            .label { font-weight: bold; margin-right: 6px; white-space: nowrap; }
            .value { flex: 1; font-weight: normal; color: #000; word-break: break-word; }
            
            .terms-list { list-style: none; padding: 0; }
            .terms-list li { margin-bottom: 10px; font-size: 14px; text-align: justify; line-height: 1.4; }
            
            .signature-section { 
              margin-top: 50px; 
              display: grid; 
              grid-template-columns: 1fr 1fr; 
              gap: 40px; 
            }
            .sig-box { 
              padding: 10px; 
              min-height: 100px; 
              display: flex; 
              flex-direction: column; 
              justify-content: space-between;
              text-align: center;
            }
            .sig-title { font-weight: 900; margin-bottom: 5px; }
            .sig-underline {
              border-top: 1.5px solid #000;
              width: 160px;
              margin: 50px auto 0;
              padding-top: 5px;
              font-weight: bold;
              font-size: 13px;
            }
            .sig-row {
              display: flex;
              justify-content: space-between;
              margin-top: 40px;
            }
            .sig-single-right {
              display: flex;
              justify-content: flex-end;
              margin-top: 40px;
            }
            
            @media print {
              body { background: white; }
              .page { 
                margin: 0; 
                box-shadow: none; 
                page-break-after: always;
              }
            }
          </style>
        </head>
        <body>
          <!-- Page 1 -->
          <div class="page">
            <div class="header">
              <h1>সরদার ক্রেডিট ইউনিয়ন</h1>
              <p>কয়ারিয়া, কালকিনি, মাদারীপুর।</p>
              <p>Email: sardercreditunin@gmail.com</p>
            </div>
            <div class="divider"></div>
            <div style="text-align: right; font-weight: bold; margin-bottom: 10px; font-size: 14px;">তারিখঃ ${toBengaliNumber(formatDate(data.date))}</div>
            <h2 class="form-title"><span>বিনিয়োগ আবেদন ফর্ম</span></h2>
            
            <div class="section-title">বিনিয়োগ গ্রহীতার তথ্যঃ</div>
            <div class="field-container">
              <div class="field"><span class="label">নামঃ</span> <span class="value">${data.name}</span></div>
              <div class="field"><span class="label">পিতা/স্বামীর নামঃ</span> <span class="value">${data.fatherName}</span></div>
              <div class="field"><span class="label">মাতাঃ</span> <span class="value">${data.motherName}</span></div>
              <div class="field"><span class="label">জাতীয় পরিচয়পত্রঃ</span> <span class="value">${toBengaliNumber(data.nid)}</span></div>
              <div class="field"><span class="label">জন্ম তারিখঃ</span> <span class="value">${toBengaliNumber(formatDate(data.dob))}</span></div>
              <div class="field"><span class="label">মোবাইল নম্বরঃ</span> <span class="value">${toBengaliNumber(data.mobile)}</span></div>
              <div class="field"><span class="label">বর্তমান ঠিকানাঃ</span> <span class="value">${data.presentAddress}</span></div>
              <div class="field"><span class="label">স্থায়ী ঠিকানাঃ</span> <span class="value">${data.permanentAddress}</span></div>
              <div class="field"><span class="label">পেশাঃ</span> <span class="value">${data.profession}</span></div>
              <div class="field"><span class="label">মাসিক আয়ঃ</span> <span class="value">${toBengaliNumber(data.monthlyIncome)}</span></div>
            </div>

            <div class="section-title" style="margin-top: 25px;">ব্যবসার তথ্যঃ</div>
            <div class="field-container">
              <div class="field"><span class="label">ব্যবসার নামঃ</span> <span class="value">${data.businessName}</span></div>
              <div class="field"><span class="label">ব্যবসার ঠিকানাঃ</span> <span class="value">${data.businessAddress}</span></div>
              <div class="field"><span class="label">ব্যবসায় আনুমানিক মূলধনঃ</span> <span class="value">${data.businessCapital}</span></div>
            </div>

            <div class="section-title" style="margin-top: 25px;">বিনিয়োগের তথ্য</div>
            <div class="field-container">
              <div class="field"><span class="label">বিনিয়োগের পরিমাণঃ</span> <span class="value">${toBengaliNumber(data.investmentAmount)} টাকা</span></div>
              <div class="field"><span class="label">মেয়াদঃ</span> <span class="value">${toBengaliNumber(data.duration)} মাস</span></div>
              <div class="field"><span class="label">মুনাফাঃ</span> <span class="value">${toBengaliNumber(data.profit)}</span></div>
              <div class="field"><span class="label">মোট পরিশোধযোগ্যঃ</span> <span class="value">${toBengaliNumber(data.totalAmount)}</span></div>
              <div class="field"><span class="label">কিস্তির সংখ্যাঃ</span> <span class="value">${toBengaliNumber(data.installmentCount)}</span></div>
              <div class="field"><span class="label">প্রতি কিস্তিঃ</span> <span class="value">${toBengaliNumber(data.perInstallment)}</span></div>
              <div class="field"><span class="label">কিস্তির ধরণঃ</span> <span class="value">${data.investmentType}</span></div>
            </div>

            <div class="sig-single-right">
              <div style="text-align: center;">
                <div style="margin-bottom: 40px; font-weight: bold;">বিনিয়োগ গ্রহীতাঃ ${data.name}</div>
                <div class="sig-underline">বিনিয়োগ গ্রহীতার স্বাক্ষর</div>
              </div>
            </div>
          </div>

          <!-- Page 2 -->
          <div class="page">
            ${(data.bankName || data.checkNumber || data.bankAmount || data.bankAccountNumber || data.mtdrAccountNumber) ? `
              <div class="section-title" style="margin-top: 0px;">ব্যাংক চেক (Security)</div>
              <div class="field-container">
                ${data.bankName ? `<div class="field"><span class="label">ব্যাংকের নামঃ</span> <span class="value">${data.bankName}</span></div>` : ''}
                ${data.bankBranch ? `<div class="field"><span class="label">শাখাঃ</span> <span class="value">${data.bankBranch}</span></div>` : ''}
                ${data.routingNumber ? `<div class="field"><span class="label">রাউটিং নাম্বারঃ</span> <span class="value">${toBengaliNumber(data.routingNumber)}</span></div>` : ''}
                ${data.bankAccountName ? `<div class="field"><span class="label">একাউন্ট নামঃ</span> <span class="value">${data.bankAccountName}</span></div>` : ''}
                ${data.bankAccountNumber ? `<div class="field"><span class="label">একাউন্ট নম্বরঃ</span> <span class="value">${toBengaliNumber(data.bankAccountNumber)}</span></div>` : ''}
                ${data.mtdrAccountNumber ? `<div class="field"><span class="label">MTDR একাউন্ট নম্বরঃ</span> <span class="value">${toBengaliNumber(data.mtdrAccountNumber)}</span></div>` : ''}
                ${data.checkNumber ? `<div class="field"><span class="label">চেক নম্বরঃ</span> <span class="value">${toBengaliNumber(data.checkNumber)}</span></div>` : ''}
                ${data.bankAmount ? `<div class="field"><span class="label">টাকার পরিমাণঃ</span> <span class="value">${toBengaliNumber(data.bankAmount)}</span></div>` : ''}
              </div>
              <p style="margin-top: 20px; line-height: 1.6; font-size: 15px; text-align: justify;">বিনিয়োগ গ্রহীতা সম্মত যে, নির্ধারিত সময়মতো টাকা পরিশোধ না করলে উক্ত চেক প্রতিষ্ঠান কর্তৃক আইনগতভাবে ব্যবহার করা যাবে।</p>
            ` : ''}
            
            <div class="section-title" style="margin-top: 30px;">জামিনদারের তথ্য</div>
            ${(data.guarantors || []).map((g: any) => `
              <div class="field-container" style="margin-bottom: 20px;">
                <div class="field"><span class="label">নামঃ</span> <span class="value">${g.name || ''}</span></div>
                <div class="field"><span class="label">পিতার নামঃ</span> <span class="value">${g.fatherName || ''}</span></div>
                <div class="field"><span class="label">মাতার নামঃ</span> <span class="value">${g.motherName || ''}</span></div>
                <div class="field"><span class="label">এনআইডিঃ</span> <span class="value">${g.nid ? toBengaliNumber(g.nid) : ''}</span></div>
                <div class="field"><span class="label">জন্ম তারিখঃ</span> <span class="value">${g.dob ? toBengaliNumber(formatDate(g.dob)) : ''}</span></div>
                <div class="field"><span class="label">মোবাইলঃ</span> <span class="value">${g.mobile ? toBengaliNumber(g.mobile) : ''}</span></div>
                <div class="field"><span class="label">ঠিকানাঃ</span> <span class="value">${formatAddressInternal(g.address)}</span></div>
                <div class="field"><span class="label">সম্পর্কঃ</span> <span class="value">${g.relationship || ''}</span></div>
              </div>
            `).join('')}
            
            <p style="margin-top: 10px; line-height: 1.6; font-size: 15px; text-align: justify;">আমি জামিনদার হিসেবে ঘোষণা করছি যে, বিনিয়োগ গ্রহীতা পরিশোধে ব্যর্থ হলে আমি সম্পূর্ণ দায়ভার বহন করবো।</p>
            
            <div class="sig-single-right" style="margin-top: 20px;">
              <div style="text-align: center;">
                <div style="margin-bottom: 40px; font-weight: bold;">জামিনদারঃ ${data.guarantors && data.guarantors[0] ? data.guarantors[0].name : ''}</div>
                <div class="sig-underline">জামিনদারের স্বাক্ষর</div>
              </div>
            </div>

            <div class="section-title" style="margin-top: 30px;">সংযুক্ত ডকুমেন্ট</div>
            <div style="margin-top: 10px; display: flex; flex-direction: column; gap: 8px; font-size: 15px;">
              <div>☐ বিনিয়োগ গ্রহীতার NID কপি</div>
              <div>☐ জামিনদারের NID কপি</div>
              <div>☐ ২ কপি পাসপোর্ট সাইজ ছবি (উভয়ের)</div>
              <div>☐ ব্যাংক চেক</div>
              <div>☐ স্ট্যাম্প পেপারে চুক্তিপত্র</div>
            </div>
          </div>

          <!-- Page 3 -->
          <div class="page">
            <h2 class="form-title"><span>চুক্তির শর্তাবলী</span></h2>
            <ul class="terms-list">
              <li>১। বিনিয়োগ গ্রহীতা নির্ধারিত সময় অনুযায়ী কিস্তি পরিশোধ করতে বাধ্য থাকবেন।</li>
              <li>২। নির্ধারিত সময়ের মধ্যে কিস্তি পরিশোধ না করলে প্রতি কিস্তিতে ২% হারে বিলম্ব জরিমানা ধার্য হবে।</li>
              <li>৩। টানা ২ (দুই) বা ততোধিক কিস্তি বকেয়া থাকলে সম্পূর্ণ বকেয়া টাকা এককালীন পরিশোধযোগ্য হবে।</li>
              <li>৪। বিনিয়োগ গ্রহীতার প্রদত্ত ব্যাংক চেক প্রতিষ্ঠান কর্তৃক বকেয়া আদায়ের জন্য ব্যবহারযোগ্য হবে।</li>
              <li>৫। চেক বাউন্স হলে অনুযায়ী আইনগত ব্যবস্থা গ্রহণ করা হবে।</li>
              <li>৬। বিনিয়োগ গ্রহীতার প্রদত্ত তথ্য মিথ্যা প্রমাণিত হলে বিনিয়োগ বাতিলযোগ্য হবে এবং সম্পূর্ণ টাকা এককালীন আদায়যোগ্য হবে।</li>
              <li>৭। বিনিয়োগের অর্থ শুধুমাত্র ব্যবসার কাজে ব্যবহার করতে হবে। অন্য কাজে ব্যবহার করলে প্রতিষ্ঠান ব্যবস্থা নিতে পারবে।</li>
              <li>৮। বিনিয়োগ গ্রহীতা ও জামিনদারের স্থাবর/অস্থাবর সম্পদ হতে বকেয়া আদায়ের অধিকার প্রতিষ্ঠান সংরক্ষণ করে।</li>
              <li>৯। প্রতিষ্ঠান প্রয়োজনবোধে ব্যবসা/বাসা পরিদর্শন করতে পারবে।</li>
              <li>১০। বিনিয়োগ গ্রহীতা বা জামিনদার ঠিকানা পরিবর্তন করলে পূর্বে প্রতিষ্ঠানকে জানাতে বাধ্য থাকবেন।</li>
              <li>১১। বিনিয়োগ গ্রহীতা মৃত্যু বা অক্ষম হলে জামিনদার সম্পূর্ণ দায়ভার বহন করবেন।</li>
              <li>১২। বিনিয়োগ গ্রহীতা ও জামিনদার উভয়ই এই চুক্তির জন্য যৌথভাবে দায়বদ্ধ থাকবেন।</li>
              <li>১৩। পরিশোধে ব্যর্থ হলে প্রতিষ্ঠান দেওয়ানি ও ফৌজদারি আইন অনুযায়ী ব্যবস্থা নিতে পারবে।</li>
              <li>১৪। প্রতিষ্ঠান প্রয়োজন অনুযায়ী প্রদত্ত কাগজপত্র ব্যবহার করে বকেয়া আদায় করতে পারবে।</li>
              <li>১৫। কোনো বিরোধ দেখা দিলে বাংলাদেশের প্রচলিত আইন অনুযায়ী নিষ্পত্তি হবে।</li>
            </ul>

            <div class="sig-single-right" style="margin-top: auto; padding-bottom: 20px;">
              <div style="text-align: center;">
                <div style="margin-bottom: 40px; font-weight: bold;">বিনিয়োগ গ্রহীতাঃ ${data.name}</div>
                <div class="sig-underline">বিনিয়োগ গ্রহীতার স্বাক্ষর</div>
              </div>
            </div>
          </div>

          <!-- Page 4 -->
          <div class="page">
            <h2 class="form-title"><span>গ্রাহকের ঘোষণা</span></h2>
            <div style="line-height: 1.6; font-size: 14px; text-align: justify; display: flex; flex-direction: column; gap: 15px;">
              <p>আমি এই মর্মে ঘোষণা করিতেছি যে, এই আবেদনপত্রে প্রদত্ত সকল তথ্য আমার জ্ঞাতসারে সঠিক, সত্য ও পূর্ণাঙ্গ। কোনো তথ্য গোপন বা মিথ্যা প্রদান করিলে প্রতিষ্ঠান যে কোনো সময় বিনিয়োগ বাতিল করিবার এবং সম্পূর্ণ বকেয়া অর্থ এককালীন আদায় করিবার অধিকার সংরক্ষণ করে—এই বিষয়ে আমি সম্পূর্ণরূপে সম্মত আছি।</p>
              <p>আমি স্বেচ্ছায় এবং সুস্থ মস্তিষ্কে এই চুক্তিপত্রে স্বাক্ষর করিতেছি এবং চুক্তির সকল শর্তাবলী মনোযোগ সহকারে পড়িয়া বুঝিয়াছি। আমি উক্ত শর্তাবলী মেনে চলিতে বাধ্য থাকিব এবং নির্ধারিত সময় অনুযায়ী কিস্তি পরিশোধ করিব।</p>
              <p>আমি এই মর্মে অঙ্গীকার করিতেছি যে, প্রাপ্ত বিনিয়োগের অর্থ শুধুমাত্র বৈধ ও ব্যবসায়িক কাজে ব্যবহার করিব। কোনো প্রকার অবৈধ বা শরীয়াহ্ পরিপন্থী (হারাম) কাজে এই অর্থ ব্যবহার করিলে উক্ত কার্যক্রমের সম্পূর্ণ দায়ভার আমার নিজস্ব থাকিবে এবং এই বিষয়ে প্রতিষ্ঠানের উপর কোনো প্রকার দায় বর্তাইবে না।</p>
              <p>আমি সম্মত আছি যে, নির্ধারিত সময়ের মধ্যে পরিশোধে ব্যর্থ হইলে প্রতিষ্ঠান আমার প্রদানকৃত ব্যাংক চেক ব্যবহার করিতে পারিবে এবং অনুযায়ী আইনগত ব্যবস্থা গ্রহণ করিতে পারিবে।</p>
              <p>আমি এবং আমার প্রদত্ত জামিনদার উভয়ই এই বিনিয়োগের জন্য যৌথভাবে দায়বদ্ধ থাকিব এবং কোনো প্রকার আপত্তি ব্যতীত প্রতিষ্ঠানকে বকেয়া আদায়ে সহযোগিতা করিব।</p>
              <p>আমি স্বীকার করিতেছি যে, ভবিষ্যতে কোনো বিরোধ সৃষ্টি হইলে তাহা বাংলাদেশের প্রচলিত আইন অনুযায়ী নিষ্পত্তি হইবে এবং এই বিষয়ে আমার কোনো আপত্তি থাকিবে না।</p>
            </div>

            <div class="signature-section" style="margin-top: 40px;">
              <div class="sig-box">
                <div class="sig-title">বিনিয়োগ গ্রহীতাঃ</div>
                <div style="margin-top: 10px; font-weight: bold;">নামঃ ${data.name}</div>
                <div class="sig-underline">স্বাক্ষর</div>
              </div>
              <div class="sig-box">
                <div class="sig-title">জামিনদারঃ</div>
                ${data.guarantors && data.guarantors[0] ? `<div style="margin-top: 10px; font-weight: bold;">নামঃ ${data.guarantors[0].name}</div>` : '<div style="margin-top: 10px; font-weight: bold;">নামঃ</div>'}
                <div class="sig-underline">স্বাক্ষর</div>
              </div>
            </div>

            <div class="sig-box" style="margin-top: 30px; text-align: center;">
              <div class="sig-title">প্রতিষ্ঠান প্রতিনিধিঃ</div>
              <div style="display: flex; justify-content: space-between; margin-top: 10px; padding: 0 40px;">
                <div>সম্পূর্ণ নামঃ ${data.representativeName}</div>
                <div>তারিখঃ ${data.representativeDate ? toBengaliNumber(formatDate(data.representativeDate)) : ''}</div>
              </div>
              <div class="sig-underline" style="width: 250px;">স্বাক্ষক ও সীল</div>
            </div>
            <div style="height: 40px;"></div>
          </div>

          <script>
            window.onload = function() {
              setTimeout(() => {
                window.print();
              }, 1000);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };


  const handlePrintInvestment = (inv: any) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('পপ-আপ ব্লক করা হয়েছে। দয়া করে পপ-আপ এলাউ করুন।');
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Investment - ${inv.customerAccountNumber}</title>
          <style>
            @import url('https://fonts.maateen.me/solaiman-lipi/font.css');
            @page { size: A4; margin: 0; }
            body { font-family: 'SolaimanLipi', sans-serif; margin: 0; padding: 20mm; background: #fff; display: flex; justify-content: center; }
            .a4-page { background: white; width: 210mm; height: 297mm; padding: 20mm; box-sizing: border-box; position: relative; }
            .header { text-align: center; margin-bottom: 40px; border-bottom: 3px solid #003366; padding-bottom: 20px; }
            .header h1 { margin: 0; color: #003366; font-size: 38px; font-weight: 900; letter-spacing: 1px; }
            .header p { margin: 5px 0 0; color: #444; font-weight: 700; font-size: 18px; }
            .title { text-align: center; margin: 30px 0; }
            .title h2 { display: inline-block; color: #999; font-size: 24px; font-weight: 900; margin: 0; }
            .info-grid { 
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 15px 40px;
              margin: 0 auto 40px auto; 
              max-width: 800px;
            }
            .info-item { 
              border-bottom: 1px solid #eee; 
              padding-bottom: 8px; 
              text-align: left; 
            }
            .label { color: #555; font-weight: 700; font-size: 14px; display: block; margin-bottom: 2px; }
            .value { color: #000; font-weight: 900; font-size: 18px; display: block; }
            .footer { position: absolute; bottom: 20mm; left: 0; right: 0; text-align: center; color: #94a3b8; font-size: 12px; }
            @media print { body { background: white; padding: 0; } .a4-page { box-shadow: none; width: 100%; height: 100%; } }
          </style>
        </head>
        <body>
          <div class="a4-page">
            <div class="header">
              <h1>সরদার ক্রেডিট ইউনিয়ন</h1>
              <p>কয়ারিয়া, কালকিনি মাদারীপুর</p>
            </div>
            <div class="title"><h2>বিনিয়োগের বিস্তারিত তথ্য</h2></div>
            <div class="info-grid">
              <div class="info-item"><span class="label">সদস্যের নামঃ</span><span class="value">${inv.customerName}</span></div>
              <div class="info-item"><span class="label">হিসাব নম্বরঃ</span><span class="value">${toBengaliNumber(inv.customerAccountNumber)}</span></div>
              <div class="info-item"><span class="label">বিনিয়োগের পরিমাণঃ</span><span class="value">${formatCurrency(inv.amount)} টাকা</span></div>
              <div class="info-item"><span class="label">মুনাফার পরিমাণঃ</span><span class="value">${formatCurrency(inv.profitAmount)} টাকা (${toBengaliNumber(inv.profitPercent)}%)</span></div>
              <div class="info-item"><span class="label">মোট পরিমাণঃ</span><span class="value">${formatCurrency(inv.totalAmount)} টাকা</span></div>
              <div class="info-item"><span class="label">কিস্তির সংখ্যাঃ</span><span class="value">${toBengaliNumber(inv.installmentCount)} টি</span></div>
              <div class="info-item"><span class="label">প্রতি কিস্তিঃ</span><span class="value">${formatCurrency(inv.perInstallment)} টাকা</span></div>
              <div class="info-item"><span class="label">শুরুর তারিখঃ</span><span class="value">${toBengaliNumber(formatDate(inv.startDate))}</span></div>
              <div class="info-item"><span class="label">শেষের তারিখঃ</span><span class="value">${toBengaliNumber(formatDate(inv.endDate))}</span></div>
              <div class="info-item"><span class="label">বিনিয়োগের ধরনঃ</span><span class="value">${inv.investmentType}</span></div>
              <div class="info-item"><span class="label">পণ্যঃ</span><span class="value">${inv.productInfo || '---'}</span></div>
              <div class="info-item"><span class="label">স্ট্যাটাসঃ</span><span class="value">${inv.status}</span></div>
            </div>
            <div class="footer">Printed on: ${toBengaliNumber(new Date().toLocaleString())} | Processed by: ${inv.createdBy}</div>
          </div>
          <script>window.onload = () => setTimeout(() => window.print(), 500);</script>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const investmentInfoColumns = [
    { header: 'সদস্যের নাম', accessor: 'customerName', className: "font-bold" },
    { header: 'হিসাব নম্বর', render: (inv: any) => toBengaliNumber(inv.customerAccountNumber), className: "font-mono font-bold" },
    { header: 'বিনিয়োগের পরিমাণ', render: (inv: any) => formatCurrency(inv.totalAmount), className: "font-bold" },
    { 
      header: 'কিস্তির সংখ্যা', 
      render: (inv: any) => (
        <div className="font-bold">
          {toBengaliNumber(inv.paidInstallmentCount || 0)}/{toBengaliNumber(inv.installmentCount)}
        </div>
      ),
      className: "text-center"
    },
    { header: 'শুরুর তারিখ', render: (inv: any) => toBengaliNumber(formatDate(inv.startDate)), className: "font-bold" },
    { header: 'মেয়াদ উত্তীর্ণের তারিখ', render: (inv: any) => toBengaliNumber(formatDate(inv.endDate)), className: "font-bold" },
    { header: 'পরিশোধিত', render: (inv: any) => formatCurrency(inv.paidAmount), className: "text-emerald-600 font-bold" },
    { header: 'বকেয়া', render: (inv: any) => formatCurrency(inv.dueAmount), className: "text-rose-600 font-bold" },
    { 
      header: 'স্ট্যাটাস', 
      render: (inv: any) => (
        <span className={cn(
          "px-2 py-0.5 rounded-full text-[10px] font-bold",
          inv.status === 'চলমান' ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"
        )}>
          {inv.status}
        </span>
      ),
      className: "text-center"
    }
  ];

  const investmentTransactionColumns = [
    { header: 'ক্রমিক', render: (_: any, index: number) => toBengaliNumber(index + 1), className: "text-center font-bold text-slate-500" },
    { header: 'কোড', accessor: 'code', className: "font-mono" },
    { header: 'তারিখ', render: (tr: any) => formatDate(tr.date) },
    { header: 'জমার পরিমাণ', render: (tr: any) => formatCurrency(tr.amount), className: "font-bold" },
    { 
      header: 'আসল', 
      render: (tr: any) => formatCurrency(transactionSplits[tr.id]?.principal || 0),
      className: "text-blue-600 font-bold"
    },
    { 
      header: 'মুনাফা', 
      render: (tr: any) => formatCurrency(transactionSplits[tr.id]?.profit || 0),
      className: "text-amber-600 font-bold"
    },
    { header: 'জরিমানা', render: (tr: any) => formatCurrency(tr.fine || 0), className: "text-rose-600" },
    { header: 'বিবরণ', render: (tr: any) => tr.description || 'কিস্তি আদায়' },
    { header: 'এন্ট্রির তারিখ', render: (tr: any) => formatDate(tr.createdAt) },
    { 
      header: 'প্রক্রিয়াকারী', 
      render: (tr: any) => {
        const user = appUsers.find(u => u.email === tr.processedBy);
        return user?.name || tr.processedBy || '---';
      }
    },
    {
      header: 'একশন',
      render: (tr: any) => (
        <div className="flex justify-center gap-2">
          <button 
            onClick={() => handlePrint(tr)}
            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
            title="ভাউচার প্রিন্ট"
          >
            <Printer size={16} />
          </button>
          {role === 'super_admin' && (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setShowDeleteConfirm({ id: tr.id, type: 'transaction', data: tr });
              }}
              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
              title="ডিলিট"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      ),
      headerClassName: "text-center"
    }
  ];

  useEffect(() => {
    if (!role || !selectedInvestment || !showTransactionsModal) return;

    // Try to load from specific cache for this investment
    const saved = localStorage.getItem(`cache_investment_transactions_${selectedInvestment.id}`);
    if (saved) {
      setTransactions(JSON.parse(saved));
    }

    const q = query(collection(db, 'transactions'), where('investmentId', '==', selectedInvestment.id));
    const unsub = onSnapshot(q, (snap) => {
      const trs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      
      // Sort on client side to avoid composite index requirement
      trs.sort((a: any, b: any) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      });
      
      setTransactions(trs);
      localStorage.setItem(`cache_investment_transactions_${selectedInvestment.id}`, JSON.stringify(trs));
      localStorage.setItem('cache_investment_transactions_last', JSON.stringify(trs));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'transactions');
    });

    return unsub;
  }, [selectedInvestment, showTransactionsModal, role]);

  const handlePayment = async (amount: number, fine: number, date: string, description: string) => {
    if (!selectedInvestment) return;
    
    setIsSubmitting(true);
    try {
      // 1. Add the transaction first
      const transactionData = {
        investmentId: selectedInvestment.id,
        customerId: selectedInvestment.customerId,
        customerName: selectedInvestment.customerName,
        customerAccountNumber: selectedInvestment.customerAccountNumber,
        amount: amount,
        fine: fine,
        totalWithFine: amount + fine,
        date: date,
        description: description,
        type: 'payment',
        createdAt: new Date().toISOString(),
        processedBy: user?.name || user?.displayName || user?.email || 'Admin',
        code: `TRX-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
        investmentTotal: selectedInvestment.totalAmount,
        // Voucher data
        investmentTotalAmount: selectedInvestment.totalAmount,
        investmentPaidAmount: (selectedInvestment.paidAmount || 0) + amount,
        investmentDueAmount: (selectedInvestment.dueAmount || 0) - amount,
        installmentNo: Math.floor(((selectedInvestment.paidAmount || 0) + amount) / (selectedInvestment.perInstallment || 1)),
        totalInstallments: selectedInvestment.installmentCount,
        dueInstallments: selectedInvestment.installmentCount - Math.floor(((selectedInvestment.paidAmount || 0) + amount) / (selectedInvestment.perInstallment || 1))
      };

      const transRef = await addDoc(collection(db, 'transactions'), {
        ...transactionData,
        createdAt: serverTimestamp()
      });

      // 2. Recalculate total paid amount from ALL transactions to ensure 100% accuracy
      const q = query(collection(db, 'transactions'), where('investmentId', '==', selectedInvestment.id));
      const snap = await getDocs(q);
      
      let totalPaid = snap.docs.reduce((sum, doc) => sum + (doc.data().amount || 0), 0);
      
      // Robustness check: ensure the new transaction is counted
      if (!snap.docs.some(d => d.id === transRef.id)) {
        totalPaid += amount;
      }

      // Calculate paid installments based on amount
      const perInstallment = selectedInvestment.perInstallment || 1;
      const paidCount = Math.floor(totalPaid / perInstallment);
      
      const dueAmount = selectedInvestment.totalAmount - totalPaid;
      const isFullyPaid = dueAmount <= 0;

      // 3. Update Investment with absolute values
      await updateDoc(doc(db, 'investments', selectedInvestment.id), {
        paidAmount: totalPaid,
        paidInstallmentCount: Math.min(selectedInvestment.installmentCount, paidCount),
        dueAmount: Math.max(0, dueAmount),
        status: isFullyPaid ? 'পরিশোধিত' : 'চলমান',
        lastPaymentDate: date
      });
      
      setLastTransaction({ ...transactionData, investmentDue: Math.max(0, dueAmount) });
      setShowPaymentModal(false);
      setSuccessMessage('পেমেন্ট সফলভাবে সম্পন্ন হয়েছে');
    } catch (err) {
      console.error("Payment error:", err);
      setErrorModal('পেমেন্ট প্রসেস করতে সমস্যা হয়েছে');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSyncBalance = async (investmentId: string) => {
    try {
      const q = query(collection(db, 'transactions'), where('investmentId', '==', investmentId));
      const snap = await getDocs(q);
      const totalPaid = snap.docs.reduce((sum, doc) => sum + (doc.data().amount || 0), 0);
      
      const inv = investments.find(i => i.id === investmentId);
      if (!inv) return;

      const perInstallment = inv.perInstallment || 1;
      const paidCount = Math.floor(totalPaid / perInstallment);
      const dueAmount = inv.totalAmount - totalPaid;
      
      await updateDoc(doc(db, 'investments', investmentId), {
        paidAmount: totalPaid,
        paidInstallmentCount: Math.min(inv.installmentCount, paidCount),
        dueAmount: Math.max(0, dueAmount),
        status: dueAmount <= 0 ? 'পরিশোধিত' : 'চলমান'
      });
      
      setSuccessMessage('ব্যালেন্স আপডেট করা হয়েছে');
    } catch (err) {
      console.error("Sync error:", err);
      setErrorModal('ব্যালেন্স আপডেট করতে সমস্যা হয়েছে');
    }
  };

  const handleDeleteTransaction = async (tr: any) => {
    setIsDeleting(true);
    try {
      // 1. Delete the specific transaction
      await deleteDoc(doc(db, 'transactions', tr.id));
      
      // 2. Immediately recalculate the total paid amount from remaining transactions
      const q = query(collection(db, 'transactions'), where('investmentId', '==', tr.investmentId));
      const snap = await getDocs(q);
      
      let totalPaid = snap.docs.reduce((sum, doc) => sum + (doc.data().amount || 0), 0);
      
      // Robustness check: ensure the deleted transaction is NOT counted
      if (snap.docs.some(d => d.id === tr.id)) {
        totalPaid -= tr.amount;
      }
      
      // 3. Get current investment data to calculate due amount
      const currentInv = investments.find(i => i.id === tr.investmentId);
      if (currentInv) {
        const perInstallment = currentInv.perInstallment || 1;
        const paidCount = Math.floor(totalPaid / perInstallment);
        const dueAmount = currentInv.totalAmount - totalPaid;
        
        await updateDoc(doc(db, 'investments', tr.investmentId), {
          paidAmount: totalPaid,
          paidInstallmentCount: Math.min(currentInv.installmentCount, Math.max(0, paidCount)),
          dueAmount: Math.max(0, dueAmount),
          status: dueAmount <= 0 ? 'পরিশোধিত' : 'চলমান'
        });
      }

      setShowDeleteConfirm(null);
      // Refresh UI
      setSuccessMessage('লেনদেন ডিলিট এবং ব্যালেন্স সমন্বয় করা হয়েছে');
    } catch (error) {
      console.error("Error deleting transaction:", error);
      setErrorModal('লেনদেন ডিলিট করতে সমস্যা হয়েছে');
    } finally {
      setIsDeleting(false);
    }
  };

  if (showTransactionsModal && selectedInvestment) {
    const currentInv = investments.find(inv => inv.id === selectedInvestment?.id) || selectedInvestment;
    
    return (
      <div className="fixed inset-0 top-[calc(env(safe-area-inset-top)+64px)] bottom-[calc(env(safe-area-inset-bottom)+64px)] z-20 bg-white flex flex-col animate-in slide-in-from-right duration-300">
        {/* Sticky Header */}
        <div className="bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm">
          <div className="flex items-center gap-2 ml-2">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
            <h2 className="text-base font-black text-slate-800 tracking-tight">লেনদেনের তালিকা</h2>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => handleSyncBalance(selectedInvestment.id)}
              className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
              title="ব্যালেন্স ঠিক করুন"
            >
              <Clock size={18} />
            </button>
            <div className="w-16 hidden md:block"></div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-white">
          <div className="max-w-7xl mx-auto px-4 md:px-8 py-6 space-y-0">
            {/* Investment Info Table */}
            <div className="bg-white overflow-hidden">
              <DataTable 
                columns={investmentInfoColumns} 
                data={[currentInv]} 
                keyExtractor={(inv) => inv.id} 
                className="mb-4"
              />
            </div>

            {/* Transactions Table Section */}
            <div className="bg-white overflow-hidden">
              <div className="p-0 overflow-x-auto">
                <DataTable 
                  columns={investmentTransactionColumns} 
                  data={transactions} 
                  keyExtractor={(tr) => tr.id} 
                  emptyMessage="কোন লেনদেন পাওয়া যায়নি"
                  className="mb-0"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Essential Modals to be visible in this view */}
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
                    {showDeleteConfirm.type === 'investment' 
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
                      if (showDeleteConfirm.type === 'investment') {
                        handleDelete(showDeleteConfirm.id);
                      } else {
                        handleDeleteTransaction(showDeleteConfirm.data);
                      }
                    }}
                    className="flex-1 py-3 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 transition-colors disabled:opacity-50"
                  >
                    ডিলিট করুন
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {errorModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8 text-center border border-slate-100"
              >
                <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-6">
                  <AlertCircle className="text-rose-500" size={40} />
                </div>
                <h3 className="text-2xl font-black text-slate-800 mb-3 tracking-tight">ত্রুটি!</h3>
                <p className="text-slate-600 font-bold mb-8 leading-relaxed">
                  {errorModal}
                </p>
                <button
                  onClick={() => setErrorModal(null)}
                  className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-sm hover:bg-slate-800 transition-all active:scale-95 shadow-lg shadow-slate-200"
                >
                  ঠিক আছে
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {successMessage && (
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="fixed bottom-24 left-4 right-4 z-[100] pointer-events-none flex justify-center"
            >
              <div className="bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 border border-slate-800">
                <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center">
                  <CheckCircle2 size={18} />
                </div>
                <p className="font-bold text-sm tracking-tight">{successMessage}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  if (showGuarantorsModal && selectedInvestment) {
    return (
      <div className="min-h-screen bg-white pb-20 animate-in fade-in slide-in-from-right-10 duration-500 overflow-y-auto">
        {/* Header - Not sticky, will scroll with page */}
        <div className="bg-white px-4 py-6 flex justify-between items-center border-b border-slate-100 mb-6">
          <h3 className="text-2xl font-bold text-slate-900">জামিনদারের বিবরণ</h3>
          <button 
            onClick={() => setShowGuarantorsModal(false)} 
            className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"
          >
            <X size={28} />
          </button>
        </div>

        <div className="p-4 space-y-12">
          {combinedGuarantors === null ? (
            <div className="flex flex-col items-center justify-center py-24">
              {/* Optional: Empty or tiny spinner that doesn't feel like a screen */}
            </div>
          ) : combinedGuarantors.length > 0 ? (
            combinedGuarantors.map((g: any, idx: number) => (
              <div key={idx} className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both" style={{ animationDelay: `${idx * 150}ms` }}>
                <div className="flex items-center gap-4 border-b-2 border-slate-900 pb-2">
                  <div className="w-10 h-10 bg-slate-900 text-white rounded-lg flex items-center justify-center text-lg font-bold">
                    {toBengaliNumber(idx + 1)}
                  </div>
                  <h4 className="text-2xl font-bold text-slate-900">জামিনদার {toBengaliNumber(idx + 1)}</h4>
                </div>

                {/* Primary Info section */}
                <section className="space-y-6">
                  <div className="flex items-center gap-3 border-l-4 border-slate-900 pl-3">
                    <h5 className="text-lg font-bold text-slate-900">প্রাথমিক তথ্য</h5>
                    {g.type === 'member' && <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full uppercase">Co-Member</span>}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <DetailItem label="নাম" value={g.name} />
                    <DetailItem label="মোবাইল নম্বর" value={toBengaliNumber(g.mobile)} />
                    <DetailItem label="সম্পর্ক" value={g.relationship} />
                    <DetailItem label="পিতার নাম" value={g.fatherName} />
                    <DetailItem label="মাতার নাম" value={g.motherName} />
                    <DetailItem label="এনআইডি নম্বর" value={toBengaliNumber(g.nid)} />
                    <DetailItem label="জন্ম তারিখ" value={g.dob ? toBengaliNumber(g.dob.split('-').reverse().join('-')) : '---'} />
                    <DetailItem label="পেশা" value={g.profession} />
                  </div>
                </section>

                {/* Address Info section */}
                <section className="space-y-6">
                  <h5 className="text-lg font-bold text-slate-900 border-l-4 border-emerald-600 pl-3">ঠিকানা</h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <DetailItem label="ঠিকানা" value={typeof g.address === 'object' ? formatAddressInternal(g.address) : g.address} className="md:col-span-2 lg:col-span-3" multiline />
                  </div>
                </section>

                {idx < combinedGuarantors.length - 1 && (
                  <div className="h-4 bg-slate-50 rounded-full border border-slate-100" />
                )}
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-24 text-slate-300 space-y-4">
              <ShieldCheck size={80} strokeWidth={1} />
              <p className="text-xl font-bold">কোন জামিনদারের তথ্য পাওয়া যায়নি</p>
            </div>
          )}
        </div>

        {/* Bottom Button - Not fixed, will scroll with page */}
        <div className="p-8 pb-32 flex justify-center">
          <button 
            onClick={() => setShowGuarantorsModal(false)}
            className="w-full max-w-sm py-4 bg-slate-900 text-white text-lg font-bold rounded-xl shadow-xl hover:bg-slate-800 transition-all active:scale-[0.98]"
          >
            বন্ধ করুন
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-96 animate-in fade-in duration-500">
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
                <h3 className="text-xl font-bold text-slate-800 tracking-tight">বিনিয়োগ তথ্য নিশ্চিত করুন</h3>
                <p className="text-slate-500">আপনি কি নিশ্চিত যে এই বিনিয়োগ তথ্যটি সংরক্ষণ করতে চান?</p>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowConfirmModal(false)}
                  className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-50 rounded-xl transition-colors"
                >
                  বাতিল
                </button>
                <button 
                  id="investment-confirm-btn"
                  onClick={() => handleSubmit()}
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
        <h2 className="text-xl font-black text-slate-800">সকল বিনিয়োগ</h2>
        {role === 'super_admin' && (
          <button 
            onClick={() => setShowAddModal(true)}
            className="bg-emerald-600 text-white flex items-center gap-2 px-4 py-2 rounded-xl shadow-lg hover:bg-emerald-700 transition-all font-bold text-xs active:scale-95"
          >
            <Plus size={16} />
            <span>নতুন বিনিয়োগ</span>
          </button>
        )}
      </div>

      {/* Filter */}
      <div className="bg-white p-2 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input 
            type="text" 
            placeholder="একাউন্ট নাম্বার বা নাম দিয়ে ফিল্টার করুন"
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-xs font-bold"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="w-32 md:w-40">
          <select 
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-black text-slate-700 text-[10px] uppercase"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="সব">সব</option>
            <option value="চলমান">চলমান</option>
            <option value="পরিশোধিত">পরিশোধিত</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="-mt-1 relative">
        <DataTable 
          columns={columns} 
          data={paginatedData} 
          keyExtractor={(inv) => inv.id} 
          renderFooter={renderTableFooter}
          className="mb-2"
        />
        
        {totalPages > 1 && (
          <div className="flex justify-start items-center gap-2 mt-2 mb-20">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => handlePageChange(p)}
                className={cn(
                  "w-10 h-10 rounded-xl font-bold transition-all active:scale-95 shadow-sm",
                  currentPage === p 
                    ? "bg-[#003366] text-white" 
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                )}
              >
                {toBengaliNumber(p)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Error Modal */}
      <AnimatePresence>
        {errorModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8 text-center border border-slate-100"
            >
              <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="text-rose-500" size={40} />
              </div>
              <h3 className="text-2xl font-black text-slate-800 mb-3 tracking-tight">ত্রুটি!</h3>
              <p className="text-slate-600 font-bold mb-8 leading-relaxed">
                {errorModal}
              </p>
              <button
                onClick={() => setErrorModal(null)}
                className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-sm hover:bg-slate-800 transition-all active:scale-95 shadow-lg shadow-slate-200"
              >
                ঠিক আছে
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
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
                  {showDeleteConfirm.type === 'investment' 
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
                    if (showDeleteConfirm.type === 'investment') {
                      handleDelete(showDeleteConfirm.id);
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
        {successMessage && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-24 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:w-auto bg-white border-2 border-emerald-500 p-4 rounded-[2rem] shadow-[0_20px_50px_rgba(16,185,129,0.3)] z-[100] flex flex-col items-center gap-4"
          >
            <div className="flex items-center gap-3 text-emerald-600">
              <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                <CheckCircle2 size={24} />
              </div>
              <span className="font-black text-lg">{successMessage}</span>
            </div>
            
            {lastTransaction && (
              <div className="flex gap-2 w-full">
                <button 
                  onClick={() => handlePrint(lastTransaction)}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl font-black hover:bg-emerald-700 transition-all active:scale-95 shadow-lg shadow-emerald-200"
                >
                  <Printer size={20} />
                  প্রিন্ট ভাউচার
                </button>
                <button 
                  onClick={() => setSuccessMessage('')}
                  className="px-4 py-3 bg-slate-100 text-slate-500 rounded-xl font-bold hover:bg-slate-200 transition-all"
                >
                  <X size={20} />
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Generate File Modal */}
      <AnimatePresence>
        {showGenerateModal && generateFormData && (
          <div className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+64px)] bottom-[calc(env(safe-area-inset-bottom)+64px)] z-40 bg-slate-100 flex flex-col pt-0">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="flex-1 overflow-y-auto bg-slate-50"
            >
              {/* Header */}
              <div className="bg-[#003366] px-6 py-4 flex justify-between items-center shadow-xl text-white">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 text-white rounded-xl flex items-center justify-center">
                    <FileText size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black tracking-tight">জেনারেট ফাইল - তথ্য আপডেট করুন</h3>
                    <p className="text-xs font-bold text-white/70">প্রিন্ট করার আগে তথ্যগুলো যাচাই এবং আপডেট করে নিন</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => handleGenerateFile(generateFormData)}
                    className="flex items-center gap-2 px-6 py-3 bg-emerald-500 text-white rounded-xl font-black hover:bg-emerald-600 transition-all active:scale-95 shadow-lg shadow-emerald-900/20"
                  >
                    <Download size={20} />
                    <span className="hidden md:inline">জেনারেট করুন</span>
                  </button>
                  <button 
                    onClick={() => setShowGenerateModal(false)}
                    className="p-3 hover:bg-white/10 rounded-xl transition-colors text-white/60"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              {/* Form Content */}
              <div className="px-6 py-8">
                <div className="max-w-4xl mx-auto space-y-8">
                  
                  {/* Section 1: Personal Info */}
                  <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-6">
                    <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                      <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
                        <User size={18} />
                      </div>
                      <h4 className="text-lg font-black text-slate-800">ব্যক্তিগত তথ্যঃ</h4>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                      {[
                        { label: 'নামঃ', key: 'name' },
                        { label: 'পিতা/স্বামীর নামঃ', key: 'fatherName' },
                        { label: 'মাতাঃ', key: 'motherName' },
                        { label: 'জাতীয় পরিচয়পত্রঃ', key: 'nid' },
                        { label: 'জন্ম তারিখঃ', key: 'dob', type: 'date' },
                        { label: 'মোবাইল নম্বরঃ', key: 'mobile' },
                        { label: 'পেশাঃ', key: 'profession' },
                        { label: 'মাসিক আয়ঃ', key: 'monthlyIncome' },
                        { label: 'বর্তমান ঠিকানাঃ', key: 'presentAddress' },
                        { label: 'স্থায়ী ঠিকানাঃ', key: 'permanentAddress' },
                      ].map((field) => (
                        <div key={field.key} className="flex flex-col md:flex-row md:items-center gap-2 md:grid md:grid-cols-4">
                          <label className="text-sm font-bold text-slate-700 md:col-span-1">{field.label}</label>
                          <input 
                            type={field.type || 'text'}
                            value={generateFormData[field.key]}
                            onChange={(e) => setGenerateFormData({...generateFormData, [field.key]: e.target.value})}
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-bold text-slate-700 transition-all md:col-span-3"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Section 2: Business Info */}
                  <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-6">
                    <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                      <div className="w-8 h-8 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center">
                        <Package size={18} />
                      </div>
                      <h4 className="text-lg font-black text-slate-800">ব্যবসার তথ্যঃ</h4>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                      <div className="flex flex-col md:flex-row md:items-center gap-2 md:grid md:grid-cols-4">
                        <label className="text-sm font-bold text-slate-700 md:col-span-1">ব্যবসার নামঃ</label>
                        <input 
                          type="text"
                          value={generateFormData.businessName}
                          onChange={(e) => setGenerateFormData({...generateFormData, businessName: e.target.value})}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none font-bold text-slate-700 transition-all md:col-span-3"
                        />
                      </div>
                      <div className="flex flex-col md:flex-row md:items-center gap-2 md:grid md:grid-cols-4">
                        <label className="text-sm font-bold text-slate-700 md:col-span-1">ব্যবসায় আনুমানিক মূলধনঃ</label>
                        <input 
                          type="text"
                          value={generateFormData.businessCapital}
                          onChange={(e) => setGenerateFormData({...generateFormData, businessCapital: e.target.value})}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none font-bold text-slate-700 transition-all md:col-span-3"
                        />
                      </div>
                      <div className="flex flex-col md:flex-row md:items-center gap-2 md:grid md:grid-cols-4">
                        <label className="text-sm font-bold text-slate-700 md:col-span-1">ব্যবসার ঠিকানাঃ</label>
                        <input 
                          type="text"
                          value={generateFormData.businessAddress}
                          onChange={(e) => setGenerateFormData({...generateFormData, businessAddress: e.target.value})}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none font-bold text-slate-700 transition-all md:col-span-3"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Section 3: Investment Info */}
                  <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-6">
                    <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                      <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
                        <DollarSign size={18} />
                      </div>
                      <h4 className="text-lg font-black text-slate-800">বিনিয়োগের তথ্যঃ</h4>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                      {[
                        { label: 'বিনিয়োগের পরিমাণঃ', key: 'investmentAmount' },
                        { label: 'মেয়াদ (মাস)ঃ', key: 'duration' },
                        { label: 'মুনাফাঃ', key: 'profit' },
                        { label: 'মোট পরিশোধযোগ্যঃ', key: 'totalAmount' },
                        { label: 'কিস্তির সংখ্যাঃ', key: 'installmentCount' },
                        { label: 'প্রতি কিস্তিঃ', key: 'perInstallment' },
                        { label: 'তারিখঃ', key: 'date', type: 'date' },
                      ].map((field) => (
                        <div key={field.key} className="flex flex-col md:flex-row md:items-center gap-2 md:grid md:grid-cols-4">
                          <label className="text-sm font-bold text-slate-700 md:col-span-1">{field.label}</label>
                          <input 
                            type={field.type || 'text'}
                            value={generateFormData[field.key]}
                            onChange={(e) => setGenerateFormData({...generateFormData, [field.key]: e.target.value})}
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none font-bold text-slate-700 transition-all md:col-span-3"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Section 4: Bank Info */}
                  <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-6">
                    <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                      <div className="w-8 h-8 bg-purple-50 text-purple-600 rounded-lg flex items-center justify-center">
                        <Receipt size={18} />
                      </div>
                      <h4 className="text-lg font-black text-slate-800">ব্যাংক ও চেক তথ্যঃ</h4>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                      <div className="flex flex-col md:flex-row md:items-center gap-2 md:grid md:grid-cols-4">
                        <label className="text-sm font-bold text-slate-700 md:col-span-1">একাউন্টের ধরনঃ</label>
                        <select 
                          value={generateFormData.bankAccountType}
                          onChange={(e) => setGenerateFormData({...generateFormData, bankAccountType: e.target.value})}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none font-bold text-slate-700 transition-all md:col-span-3"
                        >
                          <option value="Savings">সঞ্চয়ী (Savings)</option>
                          <option value="Current">চলতি (Current)</option>
                          <option value="MTDR">এমটিডিআর (MTDR)</option>
                        </select>
                      </div>
                      {[
                        { label: 'ব্যাংকের নামঃ', key: 'bankName' },
                        { label: 'শাখাঃ', key: 'bankBranch' },
                        { label: 'রাউটিং নাম্বারঃ', key: 'routingNumber' },
                        { label: 'একাউন্ট নামঃ', key: 'bankAccountName' },
                        { label: 'একাউন্ট নম্বরঃ', key: 'bankAccountNumber' },
                        { label: 'MTDR একাউন্ট নম্বরঃ', key: 'mtdrAccountNumber', condition: generateFormData.bankAccountType === 'MTDR' },
                        { label: 'চেক নম্বরঃ', key: 'checkNumber' },
                        { label: 'টাকার পরিমাণঃ', key: 'bankAmount', condition: generateFormData.bankAccountType === 'MTDR' || generateFormData.bankAmount > 0 },
                      ].filter(f => f.condition !== false).map((field) => (
                        <div key={field.key} className="flex flex-col md:flex-row md:items-center gap-2 md:grid md:grid-cols-4">
                          <label className="text-sm font-bold text-slate-700 md:col-span-1">{field.label}</label>
                          <input 
                            type="text"
                            value={generateFormData[field.key] || ''}
                            onChange={(e) => setGenerateFormData({...generateFormData, [field.key]: e.target.value})}
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none font-bold text-slate-700 transition-all md:col-span-3"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Section 5: Guarantors */}
                  <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-6">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center">
                          <ShieldCheck size={18} />
                        </div>
                        <h4 className="text-lg font-black text-slate-800">জামিনদারের তথ্যঃ</h4>
                      </div>
                    </div>
                    <div className="space-y-8">
                      {generateFormData.guarantors.map((g: any, idx: number) => (
                        <div key={idx} className="p-6 bg-slate-50 rounded-3xl border border-slate-200 relative group">
                          <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-indigo-600 font-black shadow-sm">
                              {toBengaliNumber(idx + 1)}
                            </div>
                            <span className="font-black text-slate-700">জামিনদার {toBengaliNumber(idx + 1)} এর তথ্য</span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                            {[
                              { label: 'নামঃ', key: 'name' },
                              { label: 'মোবাইলঃ', key: 'mobile' },
                              { label: 'সম্পর্কঃ', key: 'relationship' },
                              { label: 'পিতার নামঃ', key: 'fatherName' },
                              { label: 'মাতার নামঃ', key: 'motherName' },
                              { label: 'এনআইডিঃ', key: 'nid' },
                              { label: 'জন্ম তারিখঃ', key: 'dob' },
                            ].map((field) => (
                              <div key={field.key} className="flex flex-col md:flex-row md:items-center gap-2 md:grid md:grid-cols-4">
                                <label className="text-sm font-bold text-slate-700 md:col-span-1">{field.label}</label>
                                <input 
                                  type={field.key === 'dob' ? 'date' : 'text'}
                                  value={g[field.key] || ''}
                                  onChange={(e) => {
                                    const newGuarantors = [...generateFormData.guarantors];
                                    newGuarantors[idx] = { ...newGuarantors[idx], [field.key]: e.target.value };
                                    setGenerateFormData({ ...generateFormData, guarantors: newGuarantors });
                                  }}
                                  className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none font-bold text-slate-700 transition-all md:col-span-3 shadow-sm"
                                />
                              </div>
                            ))}
                            <div className="flex flex-col md:flex-row md:items-center gap-2 md:grid md:grid-cols-4 md:col-span-2">
                              <label className="text-sm font-bold text-slate-700 md:col-span-1">ঠিকানাঃ</label>
                              <textarea 
                                value={typeof g.address === 'string' ? g.address : formatAddressInternal(g.address)}
                                onChange={(e) => {
                                  const newGuarantors = [...generateFormData.guarantors];
                                  newGuarantors[idx] = { ...newGuarantors[idx], address: e.target.value };
                                  setGenerateFormData({ ...generateFormData, guarantors: newGuarantors });
                                }}
                                className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none font-bold text-slate-700 transition-all md:col-span-3 shadow-sm min-h-[60px]"
                                placeholder="গ্রাম/মহল্লা, ডাকঘর, থানা, জেলা"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                      {generateFormData.guarantors.length === 0 && (
                        <div className="text-center py-12 bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl">
                          <p className="font-bold text-slate-400 italic">কোন জামিনদারের তথ্য যোগ করা হয়নি</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Section 6: Institution Representative */}
                  <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-6">
                    <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                      <div className="w-8 h-8 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center">
                        <Users size={18} />
                      </div>
                      <h4 className="text-lg font-black text-slate-800">প্রতিষ্ঠান প্রতিনিধিঃ</h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-2">
                        <label className="text-sm font-bold text-slate-700">নামঃ</label>
                        <input 
                          type="text"
                          value={generateFormData.representativeName}
                          onChange={(e) => setGenerateFormData({...generateFormData, representativeName: e.target.value})}
                          placeholder="প্রতিনিধির নাম লিখুন"
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none font-bold text-slate-700 transition-all"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-sm font-bold text-slate-700">তারিখঃ</label>
                        <input 
                          type="date"
                          value={generateFormData.representativeDate}
                          onChange={(e) => setGenerateFormData({...generateFormData, representativeDate: e.target.value})}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none font-bold text-slate-700 transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Final Action */}
                  <div className="flex justify-center pb-20">
                    <button 
                      onClick={() => handleGenerateFile(generateFormData)}
                      className="flex items-center gap-4 px-12 py-5 bg-emerald-600 text-white rounded-3xl font-black text-xl hover:bg-emerald-700 transition-all active:scale-95 shadow-2xl shadow-emerald-200 group"
                    >
                      <Download size={24} className="group-hover:translate-y-1 transition-transform" />
                      <span>সব ঠিক আছে, ফাইল জেনারেট করুন</span>
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Investment Details Modal */}
      <AnimatePresence>
        {showDetailsModal && selectedInvestment && (
          <div className="fixed inset-0 z-40 bg-white overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full min-h-full flex flex-col pt-16 md:pt-20"
            >
              {/* Header */}
              <div className="bg-white px-6 py-4 flex justify-between items-center border-b border-slate-100 shrink-0">
                <h3 className="text-xl font-black text-slate-900">বিনিয়োগের বিস্তারিত তথ্য</h3>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => handlePrintInvestment(selectedInvestment)}
                    className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-full transition-colors"
                    title="প্রিন্ট করুন"
                  >
                    <Printer size={24} />
                  </button>
                  <button 
                    onClick={() => setShowDetailsModal(false)} 
                    className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"
                  >
                    <X size={28} />
                  </button>
                </div>
              </div>

              <div className="flex-1 flex flex-col bg-white overflow-y-auto pb-32">
                {/* Top Section: Info Tables and Photo (Matching New Investment Page) */}
                {selectedCustomer && (
                  <div className="p-0 grid grid-cols-1 lg:grid-cols-12 gap-0 border-b border-slate-200 shrink-0">
                    {/* Primary Info Table */}
                    <div className="lg:col-span-4 border border-slate-200 rounded-lg overflow-hidden">
                      <div className="bg-[#8ba4d9] text-black px-4 py-2 font-bold text-lg">প্রাথমিক তথ্য</div>
                      <table className="w-full text-sm">
                        <tbody className="divide-y divide-slate-100">
                          <tr>
                            <td className="bg-white px-4 py-2 font-bold w-1/3 border-r border-slate-100">হিসাব নম্বর</td>
                            <td className="px-4 py-2 font-bold text-slate-700">{toBengaliNumber(selectedCustomer.accountNumber)}</td>
                          </tr>
                          <tr>
                            <td className="bg-white px-4 py-2 font-bold w-1/3 border-r border-slate-100">নাম</td>
                            <td className="px-4 py-2 font-bold text-slate-700">{selectedCustomer.name}</td>
                          </tr>
                          <tr>
                            <td className="bg-white px-4 py-2 font-bold w-1/3 border-r border-slate-100">এরিয়া</td>
                            <td className="px-4 py-2 font-bold text-slate-700">{selectedCustomer.area || selectedCustomer.presentAddress?.village || '---'}</td>
                          </tr>
                          <tr>
                            <td className="bg-white px-4 py-2 font-bold w-1/3 border-r border-slate-100">সদস্যের পিতা-মাতা</td>
                            <td className="px-4 py-2 font-bold text-slate-700">{selectedCustomer.fatherName} / {selectedCustomer.motherName}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Contact Info Table */}
                    <div className="lg:col-span-5 border border-slate-200 rounded-lg overflow-hidden">
                      <div className="bg-[#c2e0b4] text-black px-4 py-2 font-bold text-lg">যোগাযোগ ও অন্যান্য তথ্য</div>
                      <table className="w-full text-sm">
                        <tbody className="divide-y divide-slate-100">
                          <tr>
                            <td className="bg-white px-4 py-2 font-bold w-1/3 border-r border-slate-100">স্ত্রী</td>
                            <td className="px-4 py-2 font-bold text-slate-700">{selectedCustomer.spouseName || '---'}</td>
                          </tr>
                          <tr>
                            <td className="bg-white px-4 py-2 font-bold w-1/3 border-r border-slate-100">ঠিকানা</td>
                            <td className="px-4 py-2 font-bold text-slate-700">{selectedCustomer.presentAddress?.village}, {selectedCustomer.presentAddress?.thana}</td>
                          </tr>
                          <tr>
                            <td className="bg-white px-4 py-2 font-bold w-1/3 border-r border-slate-100">মোবাইল নং</td>
                            <td className="px-4 py-2 font-bold text-slate-700">{toBengaliNumber(selectedCustomer.mobile)}</td>
                          </tr>
                          <tr>
                            <td className="bg-white px-4 py-2 font-bold w-1/3 border-r border-slate-100">সদস্যের ধরণ</td>
                            <td className="px-4 py-2 font-bold text-slate-700">{selectedCustomer.memberType || 'মাসিক'}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Photo Section */}
                    <div className="lg:col-span-3 border border-slate-200 rounded-lg overflow-hidden">
                      <div className="bg-[#f4ccb4] text-black px-4 py-2 font-bold text-lg">ছবি</div>
                      <div className="p-4 flex justify-center bg-white h-full min-h-[120px]">
                        {selectedCustomer.photoUrl ? (
                          <img 
                            src={getDirectDriveUrl(selectedCustomer.photoUrl)} 
                            alt="" 
                            className="w-32 h-32 object-cover rounded-lg border border-slate-200" 
                            referrerPolicy="no-referrer" 
                          />
                        ) : (
                          <div className="w-32 h-32 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400">
                            <User size={48} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Tabs (Matching New Investment Page) */}
                <div className="p-0 grid grid-cols-1 lg:grid-cols-12 gap-0">
                  <div className="lg:col-span-9 space-y-10 p-6">
                    {/* Investment Info Section */}
                    <section className="space-y-4">
                      <h5 className="text-xl font-bold text-[#3a5a9a] border-b border-slate-300 pb-2">বিনিয়োগের তথ্য</h5>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
                        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                          <label className="w-full md:w-32 text-sm font-bold text-slate-700">বিনিয়োগের ধরন</label>
                          <div className="w-full md:flex-1 h-10 px-3 border border-slate-400 rounded-lg bg-slate-50 flex items-center font-bold text-slate-600">
                            {selectedInvestment.investmentType}
                          </div>
                        </div>
                        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                          <label className="w-full md:w-32 text-sm font-bold text-slate-700">বিনিয়োগের পরিমাণ</label>
                          <div className="w-full md:flex-1 h-10 px-3 border border-slate-400 rounded-lg bg-slate-50 flex items-center font-bold text-slate-600">
                            {formatCurrency(selectedInvestment.amount)}
                          </div>
                        </div>
                        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                          <label className="w-full md:w-32 text-sm font-bold text-slate-700">সর্বমোট (মুনাফা সহ)</label>
                          <div className="w-full md:flex-1 h-10 px-3 border border-slate-400 rounded-lg bg-slate-50 flex items-center font-bold text-slate-600 text-emerald-600">
                            {formatCurrency(selectedInvestment.totalAmount)}
                          </div>
                        </div>
                        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                          <label className="w-full md:w-32 text-sm font-bold text-slate-700">মুনাফা %</label>
                          <div className="w-full md:flex-1 h-10 px-3 border border-slate-400 rounded-lg bg-slate-50 flex items-center font-bold text-slate-600">
                            {toBengaliNumber(selectedInvestment.profitPercent)}%
                          </div>
                        </div>
                        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                          <label className="w-full md:w-32 text-sm font-bold text-slate-700">মুনাফার পরিমাণ</label>
                          <div className="w-full md:flex-1 h-10 px-3 border border-slate-400 rounded-lg bg-slate-50 flex items-center font-bold text-slate-600">
                            {formatCurrency(selectedInvestment.profitAmount)}
                          </div>
                        </div>
                        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                          <label className="w-full md:w-32 text-sm font-bold text-slate-700">কিস্তির সংখ্যা</label>
                          <div className="w-full md:flex-1 h-10 px-3 border border-slate-400 rounded-lg bg-slate-50 flex items-center font-bold text-slate-600">
                            {toBengaliNumber(selectedInvestment.installmentCount)} টি
                          </div>
                        </div>
                        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                          <label className="w-full md:w-32 text-sm font-bold text-slate-700">প্রতি কিস্তি</label>
                          <div className="w-full md:flex-1 h-10 px-3 border border-slate-400 rounded-lg bg-slate-50 flex items-center font-bold text-slate-600">
                            {formatCurrency(selectedInvestment.perInstallment)}
                          </div>
                        </div>
                        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                          <label className="w-full md:w-32 text-sm font-bold text-slate-700">পণ্যের তথ্য</label>
                          <div className="w-full md:flex-1 h-10 px-3 border border-slate-400 rounded-lg bg-slate-50 flex items-center font-bold text-slate-600">
                            {selectedInvestment.productInfo || '---'}
                          </div>
                        </div>
                        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                          <label className="w-full md:w-32 text-sm font-bold text-slate-700">শুরুর তারিখ</label>
                          <div className="w-full md:flex-1 h-10 px-3 border border-slate-400 rounded-lg bg-slate-50 flex items-center font-bold text-slate-600">
                            {formatDate(selectedInvestment.startDate)}
                          </div>
                        </div>
                        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                          <label className="w-full md:w-32 text-sm font-bold text-slate-700">শেষের তারিখ</label>
                          <div className="w-full md:flex-1 h-10 px-3 border border-slate-400 rounded-lg bg-slate-50 flex items-center font-bold text-slate-600">
                            {formatDate(selectedInvestment.endDate)}
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* Bank Info Section */}
                    <section className="space-y-4">
                      <h5 className="text-xl font-bold text-[#10854e] border-b border-slate-300 pb-2">ব্যাংক ও চেক তথ্য</h5>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
                        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                          <label className="w-full md:w-32 text-sm font-bold text-slate-700">একাউন্টের ধরন</label>
                          <div className="w-full md:flex-1 h-10 px-3 border border-slate-400 rounded-lg bg-slate-50 flex items-center font-bold text-slate-600">
                            {selectedInvestment.bankAccountType}
                          </div>
                        </div>
                        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                          <label className="w-full md:w-32 text-sm font-bold text-slate-700">ব্যাংকের নাম</label>
                          <div className="w-full md:flex-1 h-10 px-3 border border-slate-400 rounded-lg bg-slate-50 flex items-center font-bold text-slate-600">
                            {selectedInvestment.bankName || '---'}
                          </div>
                        </div>
                        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                          <label className="w-full md:w-32 text-sm font-bold text-slate-700">চেক নম্বর</label>
                          <div className="w-full md:flex-1 h-10 px-3 border border-slate-400 rounded-lg bg-slate-50 flex items-center font-bold text-slate-600">
                            {selectedInvestment.checkNumber || '---'}
                          </div>
                        </div>
                        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                          <label className="w-full md:w-32 text-sm font-bold text-slate-700">ব্যাংক একাউন্ট নম্বর</label>
                          <div className="w-full md:flex-1 h-10 px-3 border border-slate-400 rounded-lg bg-slate-50 flex items-center font-bold text-slate-600">
                            {selectedInvestment.bankAccountNumber || '---'}
                          </div>
                        </div>
                        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                          <label className="w-full md:w-32 text-sm font-bold text-slate-700">MTDR একাউন্ট নম্বর</label>
                          <div className="w-full md:flex-1 h-10 px-3 border border-slate-400 rounded-lg bg-slate-50 flex items-center font-bold text-slate-600">
                            {selectedInvestment.mtdrAccountNumber || '---'}
                          </div>
                        </div>
                        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                          <label className="w-full md:w-32 text-sm font-bold text-slate-700">ব্যাংক ব্যালেন্স</label>
                          <div className="w-full md:flex-1 h-10 px-3 border border-slate-400 rounded-lg bg-slate-50 flex items-center font-bold text-slate-600">
                            {selectedInvestment.bankAmount ? formatCurrency(selectedInvestment.bankAmount) : '---'}
                          </div>
                        </div>
                      </div>
                    </section>
                  </div>

                  {/* Right Column: Reference Info */}
                  <div className="lg:col-span-3 bg-slate-50/50 p-6 border-l border-slate-200">
                    <section className="space-y-6">
                      <h5 className="text-xl font-bold text-slate-800 border-b border-slate-300 pb-2">রেফারেন্স তথ্য</h5>
                      <div className="space-y-4">
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-slate-500 uppercase">রেফারেন্স ধরন</label>
                          <div className="w-full h-10 px-3 border border-slate-400 rounded-lg bg-white flex items-center font-bold text-slate-700">
                            {selectedInvestment.referenceType === 'member' ? 'সদস্য' : 'অন্যান্য'}
                          </div>
                        </div>

                        {selectedInvestment.referenceType === 'member' && (
                          <div className="space-y-4">
                            <div className="space-y-1">
                              <label className="text-xs font-bold text-slate-500 uppercase">একাউন্ট নাম্বার</label>
                              <div className="w-full h-10 px-3 border border-slate-400 rounded-lg bg-white flex items-center font-bold text-blue-600">
                                {selectedInvestment.referenceAccountNumber}
                              </div>
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-bold text-slate-500 uppercase">নাম</label>
                              <div className="w-full h-10 px-3 border border-slate-400 rounded-lg bg-white flex items-center font-bold text-slate-700">
                                {(() => {
                                  let name = customerMap[selectedInvestment.referenceAccountNumber];
                                  if (!name && selectedInvestment.referenceAccountNumber && !isNaN(Number(selectedInvestment.referenceAccountNumber))) {
                                    name = customerMap[`100${selectedInvestment.referenceAccountNumber}`];
                                  }
                                  return name || '---';
                                })()}
                              </div>
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-bold text-slate-500 uppercase">সম্পর্ক</label>
                              <div className="w-full h-10 px-3 border border-slate-400 rounded-lg bg-white flex items-center font-bold text-slate-700">
                                {selectedInvestment.referenceRelationship || '---'}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </section>

                    {/* Guarantors Section */}
                    {selectedInvestment.referenceType !== 'member' && selectedInvestment.guarantors && selectedInvestment.guarantors.length > 0 && (
                      <section className="mt-10 space-y-6">
                        <h5 className="text-xl font-bold text-emerald-800 border-b border-slate-300 pb-2">জামিনদারের তথ্য</h5>
                        {selectedInvestment.guarantors.map((g: any, idx: number) => (
                          <div key={idx} className="bg-white p-4 rounded-xl border border-slate-200 space-y-3 shadow-sm">
                            <p className="text-sm font-bold text-emerald-700 border-b border-emerald-50 pb-1">জামিনদার {toBengaliNumber(idx + 1)}</p>
                            <div className="space-y-1">
                              <p className="text-[10px] font-bold text-slate-400 uppercase">নাম</p>
                              <p className="text-sm font-bold text-slate-700">{g.name}</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-[10px] font-bold text-slate-400 uppercase">মোবাইল</p>
                              <p className="text-sm font-bold text-slate-700">{toBengaliNumber(g.mobile)}</p>
                            </div>
                          </div>
                        ))}
                      </section>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* New Investment Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-white overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bg-white w-full h-full flex flex-col pt-24 md:pt-20"
            >
              {!foundCustomer ? (
                /* Search Phase */
                <div className="flex-1 flex flex-col">
                  <div className="bg-gradient-to-b from-[#1e40af] to-[#1e3a8a] p-6 text-center relative shrink-0">
                    <h3 className="text-xl font-black text-white uppercase tracking-wider">
                      Member Search
                    </h3>
                    <button 
                      onClick={() => {
                        setShowAddModal(false);
                        setFoundCustomer(null);
                        setSearchAccount('');
                      }} 
                      className="absolute right-6 top-1/2 -translate-y-1/2 p-2 hover:bg-white/10 text-white rounded-full transition-colors"
                    >
                      <X size={24} />
                    </button>
                  </div>
                  <div className="flex-1 p-8 bg-[#f0f7ff] flex justify-center items-start pt-20">
                    <div className="bg-white w-full max-w-lg p-8 rounded-3xl shadow-xl border border-slate-200 space-y-6">
                      <div className="space-y-4">
                        <div className="relative">
                          <input 
                            type="number" 
                            placeholder="Input AC Number"
                            className="w-full p-5 bg-white border-2 border-blue-600 rounded-2xl text-center text-2xl font-black text-[#003366] focus:ring-4 focus:ring-blue-500/10 focus:outline-none transition-all placeholder:text-slate-400"
                            value={searchAccount}
                            onChange={e => setSearchAccount(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSearchCustomer()}
                          />
                        </div>
                        
                        {searchError && (
                          <motion.p 
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-rose-500 font-bold bg-rose-50 py-2 rounded-xl text-center"
                          >
                            {searchError}
                          </motion.p>
                        )}

                        <button 
                          onClick={handleSearchCustomer}
                          disabled={isSearching || !searchAccount}
                          className="w-full py-5 bg-[#10854e] text-white text-2xl font-black rounded-2xl shadow-lg hover:bg-[#0d6e41] transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                        >
                          {isSearching ? (
                            <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                          ) : (
                            <span>Search</span>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Form Phase */
                <div className="flex-1 flex flex-col bg-white overflow-y-auto">
                  {/* Close Button for Form Phase */}
                  <button 
                    onClick={() => {
                      setShowAddModal(false);
                      setFoundCustomer(null);
                      setSearchAccount('');
                    }} 
                    className="fixed right-6 top-16 md:top-6 z-[60] p-2 bg-black/20 hover:bg-black/40 text-white rounded-full transition-colors"
                  >
                    <X size={24} />
                  </button>

                  {/* Top Section: Info Tables and Photo */}
                  <div className="p-0 grid grid-cols-1 lg:grid-cols-12 gap-0 border-b border-slate-200">
                    {/* Primary Info Table */}
                    <div className="lg:col-span-4 border border-slate-200 rounded-lg overflow-hidden">
                      <div className="bg-[#8ba4d9] text-black px-4 py-2 font-bold text-lg">প্রাথমিক তথ্য</div>
                      <table className="w-full text-sm">
                        <tbody className="divide-y divide-slate-100">
                          <tr>
                            <td className="bg-white px-4 py-2 font-bold w-1/3 border-r border-slate-100">হিসাব নম্বর</td>
                            <td className="px-4 py-2 font-bold text-slate-700">{toBengaliNumber(foundCustomer.accountNumber)}</td>
                          </tr>
                          <tr>
                            <td className="bg-white px-4 py-2 font-bold w-1/3 border-r border-slate-100">নাম</td>
                            <td className="px-4 py-2 font-bold text-slate-700">{foundCustomer.name}</td>
                          </tr>
                          <tr>
                            <td className="bg-white px-4 py-2 font-bold w-1/3 border-r border-slate-100">এরিয়া</td>
                            <td className="px-4 py-2 font-bold text-slate-700">{foundCustomer.area || foundCustomer.presentAddress?.village || '---'}</td>
                          </tr>
                          <tr>
                            <td className="bg-white px-4 py-2 font-bold w-1/3 border-r border-slate-100">সদস্যের পিতা-মাতা</td>
                            <td className="px-4 py-2 font-bold text-slate-700">{foundCustomer.fatherName} / {foundCustomer.motherName}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Contact Info Table */}
                    <div className="lg:col-span-5 border border-slate-200 rounded-lg overflow-hidden">
                      <div className="bg-[#c2e0b4] text-black px-4 py-2 font-bold text-lg">যোগাযোগ ও অন্যান্য তথ্য</div>
                      <table className="w-full text-sm">
                        <tbody className="divide-y divide-slate-100">
                          <tr>
                            <td className="bg-white px-4 py-2 font-bold w-1/3 border-r border-slate-100">স্ত্রী</td>
                            <td className="px-4 py-2 font-bold text-slate-700">{foundCustomer.spouseName || '---'}</td>
                          </tr>
                          <tr>
                            <td className="bg-white px-4 py-2 font-bold w-1/3 border-r border-slate-100">ঠিকানা</td>
                            <td className="px-4 py-2 font-bold text-slate-700">{foundCustomer.presentAddress?.village}, {foundCustomer.presentAddress?.thana}</td>
                          </tr>
                          <tr>
                            <td className="bg-white px-4 py-2 font-bold w-1/3 border-r border-slate-100">মোবাইল নং</td>
                            <td className="px-4 py-2 font-bold text-slate-700">{toBengaliNumber(foundCustomer.mobile)}</td>
                          </tr>
                          <tr>
                            <td className="bg-white px-4 py-2 font-bold w-1/3 border-r border-slate-100">সদস্যের ধরণ</td>
                            <td className="px-4 py-2 font-bold text-slate-700">{foundCustomer.memberType || 'মাসিক'}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Photo Section */}
                    <div className="lg:col-span-3 border border-slate-200 rounded-lg overflow-hidden">
                      <div className="bg-[#f4ccb4] text-black px-4 py-2 font-bold text-lg">ছবি</div>
                      <div className="p-4 flex justify-center bg-white h-full min-h-[120px]">
                        {foundCustomer.photoUrl ? (
                          <img 
                            src={getDirectDriveUrl(foundCustomer.photoUrl)} 
                            alt="" 
                            className="w-32 h-32 object-cover rounded-lg border border-slate-200" 
                            referrerPolicy="no-referrer" 
                          />
                        ) : (
                          <div className="w-32 h-32 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400">
                            <User size={48} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="p-0 grid grid-cols-1 lg:grid-cols-12 gap-0">
                    {/* Left Column: Investment and Bank Info */}
                    <div className="lg:col-span-9 space-y-10 p-6">
                      {/* Investment Info Section */}
                      <section className="space-y-4">
                        <h5 className="text-xl font-bold text-[#3a5a9a] border-b border-slate-300 pb-2">বিনিয়োগের তথ্য</h5>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
                          <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                            <label className="w-full md:w-32 text-sm font-bold text-slate-700">বিনিয়োগের ধরন</label>
                            <select 
                              className="w-full md:flex-1 h-10 px-3 border border-slate-400 rounded-lg focus:outline-none font-bold"
                              value={investmentData.investmentType}
                              onChange={e => setInvestmentData({...investmentData, investmentType: e.target.value})}
                            >
                              <option value="মাসিক">মাসিক</option>
                              <option value="সাপ্তাহিক">সাপ্তাহিক</option>
                              <option value="দৈনিক">দৈনিক</option>
                            </select>
                          </div>
                          <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                            <label className="w-full md:w-32 text-sm font-bold text-slate-700">বিনিয়োগের পরিমাণ</label>
                            <input 
                              type="number" 
                              className="w-full md:flex-1 h-10 px-3 border border-slate-400 rounded-lg focus:outline-none font-bold"
                              value={investmentData.amount}
                              step="any"
                              onChange={e => handleAmountChange(e.target.value)}
                            />
                          </div>
                          <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                            <label className="w-full md:w-32 text-sm font-bold text-slate-700">মুনাফা %</label>
                            <input 
                              type="number" 
                              className="w-full md:flex-1 h-10 px-3 border border-slate-400 rounded-lg focus:outline-none font-bold"
                              value={investmentData.profitPercent}
                              step="any"
                              onChange={e => calculateProfit('percent', e.target.value)}
                            />
                          </div>
                          <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                            <label className="w-full md:w-32 text-sm font-bold text-slate-700">মুনাফার পরিমাণ</label>
                            <input 
                              type="number" 
                              className="w-full md:flex-1 h-10 px-3 border border-slate-400 rounded-lg focus:outline-none font-bold"
                              value={investmentData.profitAmount}
                              step="any"
                              onChange={e => calculateProfit('amount', e.target.value)}
                            />
                          </div>
                          <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                            <label className="w-full md:w-32 text-sm font-bold text-slate-700">সর্বমোট (মুনাফা সহ)</label>
                            <div className="w-full md:flex-1 h-10 px-3 border border-slate-400 rounded-lg bg-slate-50 flex items-center font-bold text-slate-600">
                              {formatCurrency(investmentData.totalAmount)}
                            </div>
                          </div>
                          <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                            <label className="w-full md:w-32 text-sm font-bold text-slate-700">কিস্তির সংখ্যা</label>
                            <input 
                              type="number" 
                              className="w-full md:flex-1 h-10 px-3 border border-slate-400 rounded-lg focus:outline-none font-bold"
                              value={investmentData.installmentCount}
                              onChange={e => handleInstallmentChange(e.target.value)}
                            />
                          </div>
                          <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                            <label className="w-full md:w-32 text-sm font-bold text-slate-700">প্রতি কিস্তি</label>
                            <div className="w-full md:flex-1 h-10 px-3 border border-slate-400 rounded-lg bg-slate-50 flex items-center font-bold text-slate-600">
                              {formatCurrency(investmentData.perInstallment)}
                            </div>
                          </div>
                          <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                            <label className="w-full md:w-32 text-sm font-bold text-slate-700">পণ্যের তথ্য</label>
                            <input 
                              type="text" 
                              className="w-full md:flex-1 h-10 px-3 border border-slate-400 rounded-lg focus:outline-none font-bold"
                              value={investmentData.productInfo}
                              onChange={e => setInvestmentData({...investmentData, productInfo: e.target.value})}
                            />
                          </div>
                          <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                            <label className="w-full md:w-32 text-sm font-bold text-slate-700">শুরুর তারিখ</label>
                            <input 
                              type="date" 
                              className="w-full md:flex-1 h-10 px-3 border border-slate-400 rounded-lg focus:outline-none font-bold"
                              value={investmentData.startDate}
                              onChange={e => setInvestmentData({...investmentData, startDate: e.target.value})}
                            />
                          </div>
                          <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                            <label className="w-full md:w-32 text-sm font-bold text-slate-700">শেষের তারিখ</label>
                            <input 
                              type="date" 
                              className="w-full md:flex-1 h-10 px-3 border border-slate-400 rounded-lg focus:outline-none font-bold"
                              value={investmentData.endDate}
                              onChange={e => setInvestmentData({...investmentData, endDate: e.target.value})}
                            />
                          </div>
                        </div>
                      </section>

                      {/* Bank Check Section */}
                      <section className="space-y-4">
                        <h5 className="text-xl font-bold text-[#3a5a9a] border-b border-slate-300 pb-2">ব্যাংক চেক সংক্রান্ত</h5>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
                          <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 md:col-span-2">
                            <label className="w-full md:w-32 text-sm font-bold text-slate-700">একাউন্টের ধরন</label>
                            <select 
                              className="w-full md:flex-1 h-10 px-3 border border-slate-400 rounded-lg focus:outline-none font-bold"
                              value={investmentData.bankAccountType}
                              onChange={e => setInvestmentData({...investmentData, bankAccountType: e.target.value})}
                            >
                              <option value="MSD">MSD</option>
                              <option value="MTDR">MTDR</option>
                            </select>
                          </div>
                          <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                            <label className="w-full md:w-32 text-sm font-bold text-slate-700">ব্যাংকের নাম</label>
                            <input 
                              type="text" 
                              className="w-full md:flex-1 h-10 px-3 border border-slate-400 rounded-lg focus:outline-none font-bold"
                              value={investmentData.bankName}
                              onChange={e => setInvestmentData({...investmentData, bankName: e.target.value})}
                            />
                          </div>
                          <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                            <label className="w-full md:w-32 text-sm font-bold text-slate-700">শাখা</label>
                            <input 
                              type="text" 
                              className="w-full md:flex-1 h-10 px-3 border border-slate-400 rounded-lg focus:outline-none font-bold"
                              value={investmentData.bankBranch}
                              onChange={e => setInvestmentData({...investmentData, bankBranch: e.target.value})}
                            />
                          </div>
                          <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                            <label className="w-full md:w-32 text-sm font-bold text-slate-700">রাউটিং নাম্বার</label>
                            <input 
                              type="text" 
                              className="w-full md:flex-1 h-10 px-3 border border-slate-400 rounded-lg focus:outline-none font-bold"
                              value={investmentData.routingNumber}
                              onChange={e => setInvestmentData({...investmentData, routingNumber: e.target.value})}
                            />
                          </div>
                          <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                            <label className="w-full md:w-32 text-sm font-bold text-slate-700">একাউন্ট নাম</label>
                            <input 
                              type="text" 
                              className="w-full md:flex-1 h-10 px-3 border border-slate-400 rounded-lg focus:outline-none font-bold"
                              value={investmentData.bankAccountName}
                              onChange={e => setInvestmentData({...investmentData, bankAccountName: e.target.value})}
                            />
                          </div>
                          <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                            <label className="w-full md:w-32 text-sm font-bold text-slate-700">একাউন্ট নাম্বার</label>
                            <input 
                              type="text" 
                              className="w-full md:flex-1 h-10 px-3 border border-slate-400 rounded-lg focus:outline-none font-bold"
                              value={investmentData.bankAccountNumber}
                              onChange={e => setInvestmentData({...investmentData, bankAccountNumber: e.target.value})}
                            />
                          </div>
                          {investmentData.bankAccountType === 'MTDR' && (
                            <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                              <label className="w-full md:w-32 text-sm font-bold text-slate-700">MTDR একাউন্ট নাম্বার</label>
                              <input 
                                type="text" 
                                className="w-full md:flex-1 h-10 px-3 border border-slate-400 rounded-lg focus:outline-none font-bold"
                                value={investmentData.mtdrAccountNumber}
                                onChange={e => setInvestmentData({...investmentData, mtdrAccountNumber: e.target.value})}
                              />
                            </div>
                          )}
                          <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                            <label className="w-full md:w-32 text-sm font-bold text-slate-700">চেক নং</label>
                            <input 
                              type="text" 
                              className="w-full md:flex-1 h-10 px-3 border border-slate-400 rounded-lg focus:outline-none font-bold"
                              value={investmentData.checkNumber}
                              onChange={e => setInvestmentData({...investmentData, checkNumber: e.target.value})}
                            />
                          </div>
                          {investmentData.bankAccountType === 'MTDR' && (
                            <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                              <label className="w-full md:w-32 text-sm font-bold text-slate-700">টাকার পরিমাণ</label>
                              <input 
                                type="text" 
                                className="w-full md:flex-1 h-10 px-3 border border-slate-400 rounded-lg focus:outline-none font-bold"
                                value={investmentData.bankAmount}
                                onChange={e => setInvestmentData({...investmentData, bankAmount: e.target.value})}
                              />
                            </div>
                          )}
                        </div>
                      </section>
                    </div>

                    {/* Right Column: Reference Box */}
                    <div className="lg:col-span-3 p-6">
                      <div className="bg-[#fce4d6] border-2 border-slate-300 rounded-3xl p-6 shadow-[5px_5px_15px_rgba(0,0,0,0.1)] sticky top-6">
                        <h5 className="text-center text-xl font-bold text-black border-b border-slate-400 pb-2 mb-6">রেফারেন্স</h5>
                        
                        <div className="grid grid-cols-2 gap-4 mb-6">
                          <button 
                            onClick={() => setInvestmentData({...investmentData, referenceType: 'member'})}
                            className={cn(
                              "flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all gap-2",
                              investmentData.referenceType === 'member' ? "bg-white border-blue-600 shadow-lg" : "bg-white/50 border-slate-300 hover:border-slate-400"
                            )}
                          >
                            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center">
                              <User size={24} className="text-slate-700" />
                            </div>
                            <span className="font-bold text-lg">সদস্য</span>
                          </button>
                          <button 
                            onClick={() => {
                              setInvestmentData({...investmentData, referenceType: 'other'});
                              setShowGuarantorPopup(true);
                            }}
                            className={cn(
                              "flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all gap-2",
                              investmentData.referenceType === 'other' ? "bg-white border-blue-600 shadow-lg" : "bg-white/50 border-slate-300 hover:border-slate-400"
                            )}
                          >
                            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center">
                              <Plus size={24} className="text-slate-700" />
                            </div>
                            <span className="font-bold text-lg">অন্যান্য</span>
                          </button>
                        </div>

                        {investmentData.referenceType === 'member' && (
                          <motion.div 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="space-y-4 bg-white/40 p-4 rounded-2xl border border-slate-300"
                          >
                            <div className="space-y-1">
                              <label className="text-xs font-bold text-slate-600">একাউন্ট নাম্বার</label>
                              <input 
                                type="text" 
                                className="w-full h-10 px-3 border border-slate-400 rounded-lg focus:outline-none font-bold"
                                value={investmentData.referenceAccountNumber}
                                onChange={e => setInvestmentData({...investmentData, referenceAccountNumber: e.target.value})}
                              />
                              {investmentData.referenceAccountNumber && (
                                <p className="text-xs font-bold text-blue-600 mt-1">
                                  {(() => {
                                    let name = customerMap[investmentData.referenceAccountNumber];
                                    if (!name && !isNaN(Number(investmentData.referenceAccountNumber))) {
                                      name = customerMap[`100${investmentData.referenceAccountNumber}`];
                                    }
                                    return name ? `নামঃ ${name}` : 'গ্রাহক পাওয়া যায়নি';
                                  })()}
                                </p>
                              )}
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs font-bold text-slate-600">সম্পর্ক</label>
                              <input 
                                type="text" 
                                className="w-full h-10 px-3 border border-slate-400 rounded-lg focus:outline-none font-bold"
                                value={investmentData.referenceRelationship}
                                onChange={e => setInvestmentData({...investmentData, referenceRelationship: e.target.value})}
                              />
                            </div>
                            <button 
                              className="w-full py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition-colors shadow-md"
                              onClick={() => setSuccessMessage('রেফারেন্স তথ্য সেভ করা হয়েছে')}
                            >
                              সেভ
                            </button>
                          </motion.div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Submit Button at the very bottom */}
                  <div className="p-6 pb-32 bg-slate-50 border-t border-slate-200 mt-auto">
                    <button 
                      id="investment-submit-btn"
                      disabled={isSubmitting}
                      onClick={handleSubmit}
                      className="w-full py-5 bg-slate-900 text-white text-2xl font-black rounded-2xl shadow-2xl hover:bg-slate-800 transition-all flex items-center justify-center gap-3 disabled:opacity-50 active:scale-[0.98]"
                    >
                      {isSubmitting ? (
                        <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <span>বিনিয়োগ সংরক্ষণ করুন</span>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>

            {/* Guarantor Popup (Separate Modal as requested) */}
            <AnimatePresence>
              {showGuarantorPopup && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center sm:p-4 bg-white sm:bg-black/60 sm:backdrop-blur-sm">
                  <motion.div 
                    initial={{ y: '100%', opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: '100%', opacity: 0 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    className="bg-white w-full h-full sm:h-auto sm:max-w-5xl sm:rounded-[3rem] shadow-2xl overflow-y-auto sm:max-h-[92vh] scroll-smooth"
                  >
                    <div className="bg-[#1e3a8a] p-6 pt-24 sm:pt-6 flex justify-between items-center text-white relative shadow-md">
                      <h3 className="text-xl font-bold flex items-center gap-2">
                        <ShieldCheck size={24} className="text-emerald-400" />
                        জামিনদারের তথ্য পূরণ করুন
                      </h3>
                      <button onClick={() => setShowGuarantorPopup(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <X size={24} />
                      </button>
                    </div>
                    
                    <div className="p-4 md:p-8 space-y-8">
                      <div className="space-y-8">
                      {guarantors.map((g, idx) => (
                        <div key={idx} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6 relative">
                          <div className="flex justify-between items-center border-b border-slate-200 pb-4">
                            <h4 className="text-lg font-bold text-[#1e3a8a] flex items-center gap-2">
                              <User size={20} /> জামিনদার {toBengaliNumber(idx + 1)} এর তথ্য
                            </h4>
                            {idx > 0 && (
                              <button 
                                onClick={() => setGuarantors(guarantors.filter((_, i) => i !== idx))}
                                className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-full transition-all"
                              >
                                <Trash2 size={20} />
                              </button>
                            )}
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
                            <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                              <label className="w-full md:w-32 text-sm font-bold text-slate-700">সম্পূর্ণ নাম</label>
                              <input 
                                className="w-full md:flex-1 h-10 px-3 bg-white border border-slate-400 rounded-lg focus:outline-none font-bold" 
                                value={g.name} 
                                onChange={e => updateGuarantor(idx, 'name', e.target.value)} 
                              />
                            </div>
                            <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                              <label className="w-full md:w-32 text-sm font-bold text-slate-700">মোবাইল</label>
                              <input 
                                className="w-full md:flex-1 h-10 px-3 bg-white border border-slate-400 rounded-lg focus:outline-none font-bold" 
                                value={g.mobile} 
                                onChange={e => updateGuarantor(idx, 'mobile', e.target.value)} 
                              />
                            </div>
                            <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                              <label className="w-full md:w-32 text-sm font-bold text-slate-700">সম্পর্ক</label>
                              <input 
                                className="w-full md:flex-1 h-10 px-3 bg-white border border-slate-400 rounded-lg focus:outline-none font-bold" 
                                value={g.relationship} 
                                onChange={e => updateGuarantor(idx, 'relationship', e.target.value)} 
                              />
                            </div>
                            <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                              <label className="w-full md:w-32 text-sm font-bold text-slate-700">পিতার নাম</label>
                              <input 
                                className="w-full md:flex-1 h-10 px-3 bg-white border border-slate-400 rounded-lg focus:outline-none font-bold" 
                                value={g.fatherName} 
                                onChange={e => updateGuarantor(idx, 'fatherName', e.target.value)} 
                              />
                            </div>
                            <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                              <label className="w-full md:w-32 text-sm font-bold text-slate-700">মাতার নাম</label>
                              <input 
                                className="w-full md:flex-1 h-10 px-3 bg-white border border-slate-400 rounded-lg focus:outline-none font-bold" 
                                value={g.motherName} 
                                onChange={e => updateGuarantor(idx, 'motherName', e.target.value)} 
                              />
                            </div>
                            <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                              <label className="w-full md:w-32 text-sm font-bold text-slate-700">এনআইডি নম্বর</label>
                              <input 
                                className="w-full md:flex-1 h-10 px-3 bg-white border border-slate-400 rounded-lg focus:outline-none font-bold" 
                                value={g.nid} 
                                onChange={e => updateGuarantor(idx, 'nid', e.target.value)} 
                              />
                            </div>
                            <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                              <label className="w-full md:w-32 text-sm font-bold text-slate-700">জন্ম তারিখ</label>
                              <input 
                                type="date" 
                                className="w-full md:flex-1 h-10 px-3 bg-white border border-slate-400 rounded-lg focus:outline-none font-bold" 
                                value={g.dob} 
                                onChange={e => updateGuarantor(idx, 'dob', e.target.value)} 
                              />
                            </div>
                            <div className="flex flex-col md:flex-row md:items-start gap-2 md:gap-4 md:col-span-2">
                              <label className="w-full md:w-32 text-sm font-bold text-slate-700 md:mt-2">ঠিকানা</label>
                              <textarea 
                                className="w-full md:flex-1 h-20 p-3 bg-white border border-slate-400 rounded-lg focus:outline-none font-bold resize-none" 
                                value={g.address.village} 
                                onChange={e => updateGuarantor(idx, 'address', {...g.address, village: e.target.value})} 
                              />
                            </div>
                          </div>
                        </div>
                      ))}

                      <div className="flex justify-center">
                        <button 
                          onClick={handleAddGuarantor}
                          className="flex items-center gap-2 px-8 py-4 bg-emerald-50 text-emerald-600 border-2 border-dashed border-emerald-200 rounded-2xl hover:bg-emerald-100 transition-all font-bold group"
                        >
                          <Plus size={24} className="group-hover:rotate-90 transition-transform" />
                          <span>আরো জামিনদার এড করুন</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 pb-32 md:pb-8 md:p-8 bg-slate-50 border-t border-slate-200">
                      <button 
                        onClick={() => setShowGuarantorPopup(false)}
                        className="w-full py-5 bg-[#1e3a8a] text-white text-xl font-black rounded-2xl shadow-xl hover:bg-[#1e40af] transition-all active:scale-[0.98]"
                      >
                        সম্পন্ন করুন
                      </button>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
          </div>
        )}
      </AnimatePresence>

      {/* Transactions Modal */}
      <AnimatePresence>
        {showTransactionsModal && selectedInvestment && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-6xl rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="bg-[#003366] p-6 flex justify-between items-center text-white shrink-0">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <FileText size={24} className="text-emerald-400" />
                  লেনদেনের তালিকা - {selectedInvestment.customerName} ({toBengaliNumber(selectedInvestment.customerAccountNumber)})
                </h3>
                <button onClick={() => setShowTransactionsModal(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <X size={24} />
                </button>
              </div>
              
              <div className="p-6 bg-slate-50 border-b flex justify-between items-center shrink-0">
                <div className="flex gap-4">
                  <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">মোট বিনিয়োগ</p>
                    <p className="text-lg font-black text-slate-800">{formatCurrency(selectedInvestment.totalAmount)}</p>
                  </div>
                  <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">পরিশোধিত</p>
                    <p className="text-lg font-black text-emerald-600">{formatCurrency(selectedInvestment.paidAmount)}</p>
                  </div>
                  <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">বকেয়া</p>
                    <p className="text-lg font-black text-rose-600">{formatCurrency(selectedInvestment.dueAmount)}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => window.print()}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors text-sm font-bold"
                  >
                    <Printer size={16} /> প্রিন্ট
                  </button>
                  <button className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors text-sm font-bold">
                    <Download size={16} /> ডাউনলোড
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-auto">
                <DataTable 
                  columns={investmentTransactionColumns} 
                  data={transactions} 
                  keyExtractor={(tr) => tr.id} 
                  emptyMessage="কোন লেনদেন পাওয়া যায়নি"
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Guarantors Modal */}
      <AnimatePresence>
        {showGuarantorsModal && selectedInvestment && (
          <div className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+64px)] bottom-[calc(env(safe-area-inset-bottom)+64px)] z-40 bg-white overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, x: '100%' }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-full min-h-full flex flex-col pt-16 md:pt-20"
            >
              {/* Header */}
              <div className="bg-white px-6 py-6 flex justify-between items-center border-b border-slate-100">
                <h3 className="text-2xl font-bold text-slate-900">জামিনদারের বিবরণ</h3>
                <button 
                  onClick={() => setShowGuarantorsModal(false)} 
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"
                >
                  <X size={28} />
                </button>
              </div>

              <div className="p-6 md:p-10 space-y-12 pb-40">
                {selectedInvestment.guarantors && selectedInvestment.guarantors.length > 0 ? (
                  selectedInvestment.guarantors.map((g: any, idx: number) => (
                    <div key={idx} className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both" style={{ animationDelay: `${idx * 150}ms` }}>
                      <div className="flex items-center gap-4 border-b-2 border-slate-900 pb-2">
                        <div className="w-10 h-10 bg-slate-900 text-white rounded-lg flex items-center justify-center text-lg font-bold">
                          {toBengaliNumber(idx + 1)}
                        </div>
                        <h4 className="text-2xl font-bold text-slate-900">জামিনদার {toBengaliNumber(idx + 1)}</h4>
                      </div>

                      {/* Primary Info section */}
                      <section className="space-y-6">
                        <h5 className="text-lg font-bold text-slate-900 border-l-4 border-slate-900 pl-3">প্রাথমিক তথ্য</h5>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          <DetailItem label="নাম" value={g.name} />
                          <DetailItem label="মোবাইল নম্বর" value={toBengaliNumber(g.mobile)} />
                          <DetailItem label="সম্পর্ক" value={g.relationship} />
                          <DetailItem label="পিতার নাম" value={g.fatherName} />
                          <DetailItem label="মাতার নাম" value={g.motherName} />
                          <DetailItem label="এনআইডি নম্বর" value={toBengaliNumber(g.nid)} />
                          <DetailItem label="জন্ম তারিখ" value={g.dob ? toBengaliNumber(g.dob.split('-').reverse().join('-')) : '---'} />
                          <DetailItem label="পেশা" value={g.profession} />
                        </div>
                      </section>

                      {/* Address Info section */}
                      <section className="space-y-6">
                        <h5 className="text-lg font-bold text-slate-900 border-l-4 border-emerald-600 pl-3">ঠিকানা</h5>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          <DetailItem label="গ্রাম" value={g.address?.village} />
                          <DetailItem label="ডাকঘর" value={g.address?.postOffice} />
                          <DetailItem label="থানা" value={g.address?.thana} />
                          <DetailItem label="জেলা" value={g.address?.district} />
                        </div>
                      </section>

                      {idx < selectedInvestment.guarantors.length - 1 && (
                        <div className="h-4 bg-slate-50 rounded-full border border-slate-100" />
                      )}
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-24 text-slate-300 space-y-4">
                    <ShieldCheck size={80} strokeWidth={1} />
                    <p className="text-xl font-bold">কোন জামিনদারের তথ্য পাওয়া যায়নি</p>
                  </div>
                )}
              </div>

              {/* Bottom Sticky Action */}
              <div className="fixed bottom-0 left-0 right-0 p-6 bg-white/80 backdrop-blur-xl border-t border-slate-100 flex justify-center z-[210]">
                <button 
                  onClick={() => setShowGuarantorsModal(false)}
                  className="w-full max-w-sm py-4 bg-slate-900 text-white text-lg font-bold rounded-xl shadow-xl hover:bg-slate-800 transition-all active:scale-[0.98]"
                >
                  বন্ধ করুন
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Payment Modal */}
      <AnimatePresence>
        {showPaymentModal && selectedInvestment && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden"
            >
              <div className="bg-emerald-600 p-6 flex justify-between items-center text-white">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <DollarSign size={24} />
                  কিস্তি আদায় করুন
                </h3>
                <button onClick={() => setShowPaymentModal(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <X size={24} />
                </button>
              </div>
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  handlePayment(
                    parseFloat(formData.get('amount') as string),
                    parseFloat(formData.get('fine') as string) || 0,
                    formData.get('date') as string,
                    formData.get('description') as string
                  );
                }}
                className="p-8 space-y-4"
              >
                <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-emerald-700 font-bold">মোট বকেয়া:</span>
                    <span className="text-lg font-black text-emerald-800">{formatCurrency(selectedInvestment.dueAmount)}</span>
                  </div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-emerald-700 font-bold">প্রতি কিস্তি:</span>
                    <span className="text-lg font-black text-emerald-800">{formatCurrency(selectedInvestment.perInstallment)}</span>
                  </div>
                  <div className="pt-2 border-t border-emerald-200 flex justify-between items-center">
                    <span className="text-sm text-emerald-700 font-bold uppercase">জরিমানা সহ মোট:</span>
                    <span className="text-xl font-black text-emerald-900">{formatCurrency(paymentAmount + fineAmount)}</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 ml-1">জমার পরিমাণ</label>
                  <input 
                    name="amount"
                    type="number"
                    required
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 ml-1">জরিমানা</label>
                  <input 
                    name="fine"
                    type="number"
                    value={fineAmount}
                    onChange={(e) => setFineAmount(parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-bold text-rose-600"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 ml-1">তারিখ</label>
                  <input 
                    name="date"
                    type="date"
                    required
                    defaultValue={new Date().toISOString().split('T')[0]}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 ml-1">বিবরণ (ঐচ্ছিক)</label>
                  <input 
                    name="description"
                    type="text"
                    placeholder="কিস্তি আদায়"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-bold"
                  />
                </div>
                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setShowPaymentModal(false)}
                    className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors"
                  >
                    বাতিল
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all active:scale-95"
                  >
                    জমা করুন
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

// End of components
