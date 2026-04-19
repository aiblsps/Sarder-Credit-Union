import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, serverTimestamp, query, orderBy, limit, getDocs, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { useAuth } from './AuthContext';
import { generateId, getDirectDriveUrl, toBengaliNumber, cn } from './lib/utils';
import { Plus, Search, MoreVertical, Edit2, Trash2, X, Eye, CheckCircle2, List, ChevronDown, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DataTable } from './components/DataTable';

export const Customers = () => {
  const { role } = useAuth();
  const [customers, setCustomers] = useState<any[]>(() => {
    const saved = localStorage.getItem('cache_customers');
    return saved ? JSON.parse(saved) : [];
  });
  const [showAddModal, setShowAddModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 20;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const search = params.get('search');
    if (search) {
      setSearchTerm(search);
      // Clean up URL
      const newUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, '', newUrl);
    }
  }, []);
  const [activeActionMenu, setActiveActionMenu] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [sameAsPresent, setSameAsPresent] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorModal, setErrorModal] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  
  const initialFormData = {
    name: '',
    nameEnglish: '',
    mobile: '',
    altMobile: '',
    fatherName: '',
    motherName: '',
    nid: '',
    gender: 'Male',
    email: '',
    profession: '',
    religion: 'Islam',
    businessName: '',
    dob: '',
    education: '',
    maritalStatus: 'No',
    spouseName: '',
    spouseFatherName: '',
    spouseMotherName: '',
    spouseNid: '',
    spouseDob: '',
    spouseAddress: '',
    photoUrl: '',
    area: '',
    presentAddress: { village: '', postOffice: '', thana: '', district: '' },
    permanentAddress: { village: '', postOffice: '', thana: '', district: '' },
    bloodGroup: 'O+',
    joiningDate: new Date().toISOString().split('T')[0],
    status: 'active'
  };

  const [formData, setFormData] = useState(initialFormData);

  useEffect(() => {
    const onBack = (e: Event) => {
      if (showViewModal) {
        e.preventDefault();
        setShowViewModal(null);
      } else if (showAddModal) {
        e.preventDefault();
        setShowAddModal(false);
        setEditingId(null);
        setFormData(initialFormData);
      }
    };
    window.addEventListener('app:back', onBack);
    return () => window.removeEventListener('app:back', onBack);
  }, [showViewModal, showAddModal]);

  useEffect(() => {
    if (!role) return;
    const q = query(collection(db, 'customers'), orderBy('accountNumberInt', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCustomers(docs);
      // Use setTimeout to make caching non-blocking
      setTimeout(() => {
        try {
          localStorage.setItem('cache_customers', JSON.stringify(docs));
        } catch (e) {
          console.warn('Failed to cache customers:', e);
        }
      }, 0);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'customers');
    });
    return unsub;
  }, [role]);

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(''), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (role !== 'super_admin' && role !== 'admin') return;
    setIsSubmitting(true);

    try {
      const { id, ...dataToSave } = formData as any;
      const finalData = {
        ...dataToSave,
        photoUrl: getDirectDriveUrl(formData.photoUrl),
        updatedAt: serverTimestamp()
      };

      if (editingId) {
        await updateDoc(doc(db, 'customers', editingId), finalData);
      } else {
        // Generate unique account number (1, 2, 3...)
        const q = query(collection(db, 'customers'), orderBy('accountNumberInt', 'desc'), limit(1));
        const querySnapshot = await getDocs(q);
        let nextAccNum = 1;
        if (!querySnapshot.empty) {
          const lastCustomer = querySnapshot.docs[0].data();
          nextAccNum = (lastCustomer.accountNumberInt || 0) + 1;
        }

        await addDoc(collection(db, 'customers'), {
          ...finalData,
          accountNumber: `100${nextAccNum}`,
          accountNumberInt: nextAccNum,
          createdAt: serverTimestamp()
        });
      }
      
      const msg = editingId ? 'গ্রাহকের তথ্য আপডেট করা হয়েছে' : 'নতুন গ্রাহক সফলভাবে নিবন্ধিত হয়েছে';
      setShowAddModal(false);
      setEditingId(null);
      setFormData(initialFormData);
      setSameAsPresent(false);
      setSuccessMessage(msg);
    } catch (error) {
      console.error("Error saving customer:", error);
      setErrorModal("গ্রাহকের তথ্য সংরক্ষণ করতে সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।");
      // Don't throw here so the finally block and state updates work correctly
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (customer: any) => {
    setFormData({
      ...initialFormData,
      ...customer,
      presentAddress: customer.presentAddress || initialFormData.presentAddress,
      permanentAddress: customer.permanentAddress || initialFormData.permanentAddress,
    });
    setEditingId(customer.id);
    setShowAddModal(true);
    setActiveActionMenu(null);
  };

  const handleDelete = async (id: string) => {
    if (!id) return;
    setIsDeleting(true);
    try {
      // Check if customer has any ongoing investments
      const q = query(collection(db, 'investments'), where('customerId', '==', id), where('status', '==', 'চলমান'));
      const snap = await getDocs(q);
      
      if (!snap.empty) {
        setErrorModal('গ্রাহকের বকেয়া বা চলমান বিনিয়োগ থাকলে ডিলিট করা যাবে না।');
        setShowDeleteConfirm(null);
        return;
      }

      await deleteDoc(doc(db, 'customers', id));
      setShowDeleteConfirm(null);
      setActiveActionMenu(null);
      setSuccessMessage('গ্রাহক সফলভাবে মুছে ফেলা হয়েছে');
    } catch (error) {
      console.error("Error deleting customer:", error);
      setErrorModal("গ্রাহক ডিলিট করতে সমস্যা হয়েছে");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSameAsPresent = (checked: boolean) => {
    setSameAsPresent(checked);
    if (checked) {
      setFormData({
        ...formData,
        permanentAddress: { ...formData.presentAddress }
      });
    }
  };

  const filtered = customers.filter(c => {
    const matchesSearch = (c.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || 
                         (c.accountNumber?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                         (c.mobile?.toLowerCase() || '').includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginatedData = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handlePageChange = (p: number) => {
    setCurrentPage(p);
    window.scrollTo({ top: 300, behavior: 'smooth' });
  };

  const columns = [
    {
      header: 'ক্রমিক',
      render: (_: any, index: number) => toBengaliNumber((currentPage - 1) * PAGE_SIZE + index + 1),
      className: "text-center font-bold text-slate-500",
      headerClassName: "text-center"
    },
    {
      header: 'একশন',
      render: (customer: any) => (
        <div className="flex items-center justify-center gap-2">
          <button 
            onClick={() => setShowViewModal(customer)}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-blue-100"
            title="বিস্তারিত দেখুন"
          >
            <Eye size={18} />
          </button>
          {role === 'super_admin' && (
            <div className="relative">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  setMenuPosition({
                    top: rect.bottom + window.scrollY + 4,
                    left: rect.right + window.scrollX - 128
                  });
                  setActiveActionMenu(activeActionMenu === customer.id ? null : customer.id);
                }}
                className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors text-slate-700"
              >
                <List size={18} />
                <ChevronDown size={14} className={cn("transition-transform", activeActionMenu === customer.id && "rotate-180")} />
              </button>
            </div>
          )}
        </div>
      ),
      headerClassName: "text-center"
    },
    {
      header: 'ছবি',
      render: (customer: any) => (
        <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-100 border border-slate-200">
          {customer.photoUrl ? (
            <img 
              src={getDirectDriveUrl(customer.photoUrl)} 
              alt="" 
              className="w-full h-full object-cover" 
              referrerPolicy="no-referrer" 
              loading="lazy" 
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">No Pic</div>
          )}
        </div>
      )
    },
    { header: 'হিসাব নং', accessor: 'accountNumber', className: "font-mono font-bold text-emerald-700" },
    { header: 'সদস্যের নাম', accessor: 'name', className: "font-bold text-slate-800" },
    { 
      header: 'মোবাইল নং', 
      render: (customer: any) => (
        <a 
          href={`tel:${customer.mobile}`}
          className="font-mono text-emerald-600 hover:text-emerald-700 hover:underline transition-colors"
        >
          {customer.mobile}
        </a>
      )
    },
    { 
      header: 'যোগদানের তারিখ', 
      render: (c: any) => c.joiningDate ? toBengaliNumber(c.joiningDate.split('-').reverse().join('-')) : '-' 
    },
    { header: 'রক্তের গ্রুপ', accessor: 'bloodGroup' },
    { header: 'সদস্যের পেশা', accessor: 'profession' }
  ];

  return (
    <div className="space-y-6">
      {/* Success Message */}
      <AnimatePresence>
        {successMessage && (
          <motion.div 
            initial={{ opacity: 0, y: -20, x: 20 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, y: -20, x: 20 }}
            className="fixed top-6 right-6 z-[100] bg-emerald-600 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 font-bold border border-white/20 backdrop-blur-sm"
          >
            <div className="bg-white/20 p-1 rounded-full">
              <CheckCircle2 size={20} />
            </div>
            <span>{successMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex justify-between items-center border-b-2 border-slate-100 pb-4">
        <h2 className="text-2xl md:text-3xl font-black text-slate-900 uppercase tracking-tight">সকল গ্রাহক</h2>
        {role === 'super_admin' && (
          <button 
            onClick={() => setShowAddModal(true)}
            className="bg-slate-900 text-white flex items-center gap-2 px-4 md:px-6 py-2.5 md:py-3 rounded-xl hover:bg-slate-800 transition-all font-bold shadow-lg shadow-slate-200 active:scale-95 text-sm md:text-base"
          >
            <Plus size={20} />
            <span className="hidden md:inline">নতুন গ্রাহক</span>
            <span className="md:hidden">নতুন</span>
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="py-6">
        <div className="relative w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input 
            type="text" 
            placeholder="নাম, একাউন্ট বা মোবাইল নম্বর দিয়ে খুঁজুন..."
            className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="relative">
        <DataTable 
          columns={columns} 
          data={paginatedData} 
          keyExtractor={(c) => c.id} 
          className="mb-0"
        />

        {totalPages > 1 && (
          <div className="flex justify-start items-center gap-2 mt-2 mb-20 overflow-x-auto pb-2">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => handlePageChange(p)}
                className={cn(
                  "min-w-[40px] h-10 px-2 rounded-xl font-bold transition-all active:scale-95 shadow-sm border",
                  currentPage === p 
                    ? "bg-[#003366] text-white border-[#003366]" 
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                )}
              >
                {toBengaliNumber(p)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Action Menu Portal */}
      <AnimatePresence>
        {activeActionMenu && (
          <>
            <div className="fixed inset-0 z-[1000]" onClick={() => setActiveActionMenu(null)}></div>
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              style={{ 
                position: 'absolute',
                top: menuPosition.top,
                left: menuPosition.left,
              }}
              className="w-32 bg-white rounded-xl shadow-2xl border border-slate-100 z-[1001] py-2 overflow-hidden"
            >
              <button 
                onClick={() => {
                  const customer = customers.find(c => c.id === activeActionMenu);
                  handleEdit(customer);
                  setActiveActionMenu(null);
                }}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <Edit2 size={14} />
                <span>এডিট</span>
              </button>
              <button 
                onClick={() => {
                  setShowDeleteConfirm(activeActionMenu);
                  setActiveActionMenu(null);
                }}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-rose-600 hover:bg-rose-50 transition-colors"
              >
                <Trash2 size={14} />
                <span>ডিলিট</span>
              </button>
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

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+64px)] bottom-[calc(env(safe-area-inset-bottom)+64px)] z-40 bg-white overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full min-h-full flex flex-col pt-0"
            >
              {/* Header */}
              <div className="bg-white px-6 py-4 flex justify-between items-center border-b border-slate-100">
                <h3 className="text-xl font-bold text-slate-900">
                  {editingId ? 'গ্রাহক তথ্য পরিবর্তন' : 'নতুন গ্রাহক নিবন্ধন'}
                </h3>
                <button 
                  onClick={() => { setShowAddModal(false); setEditingId(null); setFormData(initialFormData); }} 
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"
                >
                  <X size={28} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-10">
                {/* Primary Info */}
                <section className="space-y-6">
                  <h4 className="text-xl font-bold text-slate-900">প্রাথমিক তথ্য</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">সদস্যের নাম (বাংলা)</label>
                      <input required placeholder="সদস্যের নাম বাংলায় লিখুন" className="w-full h-12 px-4 border border-slate-900 rounded-lg focus:outline-none" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">সদস্যের নাম (English)</label>
                      <input placeholder="Member Name in English" className="w-full h-12 px-4 border border-slate-900 rounded-lg focus:outline-none" value={formData.nameEnglish} onChange={e => setFormData({...formData, nameEnglish: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">পিতার নাম</label>
                      <input required placeholder="পিতার নাম লিখুন" className="w-full h-12 px-4 border border-slate-900 rounded-lg focus:outline-none" value={formData.fatherName} onChange={e => setFormData({...formData, fatherName: e.target.value})} />
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">মাতার নাম</label>
                      <input required placeholder="মাতার নাম লিখুন" className="w-full h-12 px-4 border border-slate-900 rounded-lg focus:outline-none" value={formData.motherName} onChange={e => setFormData({...formData, motherName: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">স্বামী / স্ত্রী</label>
                      <input placeholder="স্বামী বা স্ত্রীর নাম লিখুন (যদি থাকে)" className="w-full h-12 px-4 border border-slate-900 rounded-lg focus:outline-none" value={formData.spouseName} onChange={e => setFormData({...formData, spouseName: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">মোবাইল নম্বর</label>
                      <input required placeholder="১১ ডিজিটের মোবাইল নম্বর" className="w-full h-12 px-4 border border-slate-900 rounded-lg focus:outline-none" value={formData.mobile} onChange={e => setFormData({...formData, mobile: e.target.value})} />
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">বিকল্প মোবাইল</label>
                      <input placeholder="বিকল্প মোবাইল নম্বর (যদি থাকে)" className="w-full h-12 px-4 border border-slate-900 rounded-lg focus:outline-none" value={formData.altMobile} onChange={e => setFormData({...formData, altMobile: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">এনআইডি নম্বর</label>
                      <input placeholder="জাতীয় পরিচয়পত্র নম্বর" className="w-full h-12 px-4 border border-slate-900 rounded-lg focus:outline-none" value={formData.nid} onChange={e => setFormData({...formData, nid: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">জন্ম তারিখ</label>
                      <input type="date" className="w-full h-12 px-4 border border-slate-900 rounded-lg focus:outline-none" value={formData.dob} onChange={e => setFormData({...formData, dob: e.target.value})} />
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">লিঙ্গ</label>
                      <select className="w-full h-12 px-4 border border-slate-900 rounded-lg focus:outline-none" value={formData.gender} onChange={e => setFormData({...formData, gender: e.target.value})}>
                        <option value="Male">পুরুষ</option>
                        <option value="Female">মহিলা</option>
                        <option value="Other">অন্যান্য</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">রক্তের গ্রুপ</label>
                      <select className="w-full h-12 px-4 border border-slate-900 rounded-lg focus:outline-none" value={formData.bloodGroup} onChange={e => setFormData({...formData, bloodGroup: e.target.value})}>
                        {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">পেশা</label>
                      <input placeholder="পেশার নাম লিখুন" className="w-full h-12 px-4 border border-slate-900 rounded-lg focus:outline-none" value={formData.profession} onChange={e => setFormData({...formData, profession: e.target.value})} />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">এরিয়া</label>
                      <input placeholder="এরিয়ার নাম লিখুন" className="w-full h-12 px-4 border border-slate-900 rounded-lg focus:outline-none" value={formData.area} onChange={e => setFormData({...formData, area: e.target.value})} />
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">ধর্ম</label>
                      <select className="w-full h-12 px-4 border border-slate-900 rounded-lg focus:outline-none" value={formData.religion} onChange={e => setFormData({...formData, religion: e.target.value})}>
                        <option value="Islam">ইসলাম</option>
                        <option value="Hindu">হিন্দু</option>
                        <option value="Christian">খ্রিস্টান</option>
                        <option value="Buddhist">বৌদ্ধ</option>
                      </select>
                    </div>
                  </div>
                </section>

                {/* Address Section */}
                <div className="space-y-10">
                  {/* Present Address */}
                  <section className="space-y-6">
                    <h4 className="text-xl font-bold text-slate-900">বর্তমান ঠিকানা</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">গ্রাম</label>
                        <input placeholder="গ্রামের নাম লিখুন" className="w-full h-12 px-4 border border-slate-900 rounded-lg focus:outline-none" value={formData.presentAddress.village} onChange={e => setFormData({...formData, presentAddress: {...formData.presentAddress, village: e.target.value}})} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">ডাকঘর</label>
                        <input placeholder="ডাকঘরের নাম লিখুন" className="w-full h-12 px-4 border border-slate-900 rounded-lg focus:outline-none" value={formData.presentAddress.postOffice} onChange={e => setFormData({...formData, presentAddress: {...formData.presentAddress, postOffice: e.target.value}})} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">থানা</label>
                        <input placeholder="থানার নাম লিখুন" className="w-full h-12 px-4 border border-slate-900 rounded-lg focus:outline-none" value={formData.presentAddress.thana} onChange={e => setFormData({...formData, presentAddress: {...formData.presentAddress, thana: e.target.value}})} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">জেলা</label>
                        <input placeholder="জেলার নাম লিখুন" className="w-full h-12 px-4 border border-slate-900 rounded-lg focus:outline-none" value={formData.presentAddress.district} onChange={e => setFormData({...formData, presentAddress: {...formData.presentAddress, district: e.target.value}})} />
                      </div>
                    </div>
                  </section>

                  {/* Permanent Address */}
                  <section className="space-y-6">
                    <div className="flex flex-col md:flex-row md:items-center gap-4">
                      <h4 className="text-xl font-bold text-slate-900">স্থায়ী ঠিকানা</h4>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={sameAsPresent} onChange={e => handleSameAsPresent(e.target.checked)} className="w-5 h-5 accent-slate-900" />
                        <span className="text-sm font-bold text-slate-600">( বর্তমান এবং স্থায়ী ঠিকানা একই হলে টিক দিন)</span>
                      </label>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">গ্রাম</label>
                        <input placeholder="গ্রামের নাম লিখুন" className="w-full h-12 px-4 border border-slate-900 rounded-lg focus:outline-none disabled:bg-slate-50" value={formData.permanentAddress.village} onChange={e => setFormData({...formData, permanentAddress: {...formData.permanentAddress, village: e.target.value}})} disabled={sameAsPresent} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">ডাকঘর</label>
                        <input placeholder="ডাকঘরের নাম লিখুন" className="w-full h-12 px-4 border border-slate-900 rounded-lg focus:outline-none disabled:bg-slate-50" value={formData.permanentAddress.postOffice} onChange={e => setFormData({...formData, permanentAddress: {...formData.permanentAddress, postOffice: e.target.value}})} disabled={sameAsPresent} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">থানা</label>
                        <input placeholder="থানার নাম লিখুন" className="w-full h-12 px-4 border border-slate-900 rounded-lg focus:outline-none disabled:bg-slate-50" value={formData.permanentAddress.thana} onChange={e => setFormData({...formData, permanentAddress: {...formData.permanentAddress, thana: e.target.value}})} disabled={sameAsPresent} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">জেলা</label>
                        <input placeholder="জেলার নাম লিখুন" className="w-full h-12 px-4 border border-slate-900 rounded-lg focus:outline-none disabled:bg-slate-50" value={formData.permanentAddress.district} onChange={e => setFormData({...formData, permanentAddress: {...formData.permanentAddress, district: e.target.value}})} disabled={sameAsPresent} />
                      </div>
                    </div>
                  </section>
                </div>

                {/* Photo URL */}
                <section className="space-y-4 pb-10">
                  <h4 className="text-xl font-bold text-slate-900">ছবি (Google Drive Link)</h4>
                  <input placeholder="গুগল ড্রাইভ লিংক দিন" className="w-full md:w-1/2 h-12 px-4 border border-slate-900 rounded-lg focus:outline-none" value={formData.photoUrl} onChange={e => setFormData({...formData, photoUrl: e.target.value})} />
                </section>
              </form>

              {/* Footer with Submit Button */}
              <div className="bg-white p-6 pb-24 border-t border-slate-100 mt-auto">
                <button 
                  type="submit"
                  onClick={(e) => {
                    e.preventDefault();
                    handleSubmit(e as any);
                  }}
                  disabled={isSubmitting}
                  className="w-full py-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors disabled:opacity-50 shadow-lg"
                >
                  {isSubmitting ? 'সংরক্ষণ হচ্ছে...' : (editingId ? 'তথ্য আপডেট করুন' : 'নিবন্ধন সম্পন্ন করুন')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* View Modal */}
      <AnimatePresence>
        {showViewModal && (
          <div className="fixed inset-0 z-40 bg-white overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full min-h-full flex flex-col pt-16 md:pt-20"
            >
              {/* Header */}
              <div className="bg-white px-6 py-6 flex justify-between items-center border-b border-slate-100">
                <h3 className="text-2xl font-bold text-slate-900">গ্রাহকের প্রফাইল</h3>
                <button 
                  onClick={() => setShowViewModal(null)} 
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"
                >
                  <X size={28} />
                </button>
              </div>

              <div className="p-6 space-y-10 pb-32">
                {/* Customer Photo */}
                <div className="flex justify-center md:justify-start">
                  {showViewModal.photoUrl ? (
                    <img 
                      src={getDirectDriveUrl(showViewModal.photoUrl)} 
                      alt={showViewModal.name}
                      className="max-w-full h-auto rounded-none"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-40 h-40 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400">
                      ছবি নেই
                    </div>
                  )}
                </div>

                {/* Primary Info */}
                <section className="space-y-6">
                  <h4 className="text-xl font-bold text-slate-900">প্রাথমিক তথ্য</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">সদস্যের নাম (বাংলা)</label>
                      <div className="w-full h-12 px-4 border border-slate-900 rounded-lg flex items-center bg-white text-slate-900 font-medium">
                        {showViewModal.name}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">সদস্যের নাম (English)</label>
                      <div className="w-full h-12 px-4 border border-slate-900 rounded-lg flex items-center bg-white text-slate-900 font-medium">
                        {showViewModal.nameEnglish || '---'}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">পিতার নাম</label>
                      <div className="w-full h-12 px-4 border border-slate-900 rounded-lg flex items-center bg-white text-slate-900 font-medium">
                        {showViewModal.fatherName}
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">মাতার নাম</label>
                      <div className="w-full h-12 px-4 border border-slate-900 rounded-lg flex items-center bg-white text-slate-900 font-medium">
                        {showViewModal.motherName}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">স্বামী / স্ত্রী</label>
                      <div className="w-full h-12 px-4 border border-slate-900 rounded-lg flex items-center bg-white text-slate-900 font-medium">
                        {showViewModal.spouseName || '---'}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">মোবাইল নম্বর</label>
                      <div className="w-full h-12 px-4 border border-slate-900 rounded-lg flex items-center bg-white text-slate-900 font-medium">
                        {showViewModal.mobile}
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">বিকল্প মোবাইল</label>
                      <div className="w-full h-12 px-4 border border-slate-900 rounded-lg flex items-center bg-white text-slate-900 font-medium">
                        {showViewModal.altMobile || '---'}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">এনআইডি নম্বর</label>
                      <div className="w-full h-12 px-4 border border-slate-900 rounded-lg flex items-center bg-white text-slate-900 font-medium">
                        {showViewModal.nid || '---'}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">জন্ম তারিখ</label>
                      <div className="w-full h-12 px-4 border border-slate-900 rounded-lg flex items-center bg-white text-slate-900 font-medium">
                        {showViewModal.dob ? toBengaliNumber(showViewModal.dob.split('-').reverse().join('-')) : '---'}
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">লিঙ্গ</label>
                      <div className="w-full h-12 px-4 border border-slate-900 rounded-lg flex items-center bg-white text-slate-900 font-medium">
                        {showViewModal.gender === 'Male' ? 'পুরুষ' : showViewModal.gender === 'Female' ? 'মহিলা' : 'অন্যান্য'}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">রক্তের গ্রুপ</label>
                      <div className="w-full h-12 px-4 border border-slate-900 rounded-lg flex items-center bg-white text-slate-900 font-medium">
                        {showViewModal.bloodGroup}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">পেশা</label>
                      <div className="w-full h-12 px-4 border border-slate-900 rounded-lg flex items-center bg-white text-slate-900 font-medium">
                        {showViewModal.profession || '---'}
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-slate-700">ধর্ম</label>
                      <div className="w-full h-12 px-4 border border-slate-900 rounded-lg flex items-center bg-white text-slate-900 font-medium">
                        {showViewModal.religion === 'Islam' ? 'ইসলাম' : showViewModal.religion === 'Hindu' ? 'হিন্দু' : showViewModal.religion === 'Christian' ? 'খ্রিস্টান' : 'বৌদ্ধ'}
                      </div>
                    </div>
                  </div>
                </section>

                {/* Address Section */}
                <div className="space-y-10">
                  {/* Present Address */}
                  <section className="space-y-6">
                    <h4 className="text-xl font-bold text-slate-900">বর্তমান ঠিকানা</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">গ্রাম</label>
                        <div className="w-full h-12 px-4 border border-slate-900 rounded-lg flex items-center bg-white text-slate-900 font-medium">
                          {showViewModal.presentAddress?.village || '---'}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">ডাকঘর</label>
                        <div className="w-full h-12 px-4 border border-slate-900 rounded-lg flex items-center bg-white text-slate-900 font-medium">
                          {showViewModal.presentAddress?.postOffice || '---'}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">থানা</label>
                        <div className="w-full h-12 px-4 border border-slate-900 rounded-lg flex items-center bg-white text-slate-900 font-medium">
                          {showViewModal.presentAddress?.thana || '---'}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">জেলা</label>
                        <div className="w-full h-12 px-4 border border-slate-900 rounded-lg flex items-center bg-white text-slate-900 font-medium">
                          {showViewModal.presentAddress?.district || '---'}
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Permanent Address */}
                  <section className="space-y-6">
                    <h4 className="text-xl font-bold text-slate-900">স্থায়ী ঠিকানা</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">গ্রাম</label>
                        <div className="w-full h-12 px-4 border border-slate-900 rounded-lg flex items-center bg-white text-slate-900 font-medium">
                          {showViewModal.permanentAddress?.village || '---'}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">ডাকঘর</label>
                        <div className="w-full h-12 px-4 border border-slate-900 rounded-lg flex items-center bg-white text-slate-900 font-medium">
                          {showViewModal.permanentAddress?.postOffice || '---'}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">থানা</label>
                        <div className="w-full h-12 px-4 border border-slate-900 rounded-lg flex items-center bg-white text-slate-900 font-medium">
                          {showViewModal.permanentAddress?.thana || '---'}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">জেলা</label>
                        <div className="w-full h-12 px-4 border border-slate-900 rounded-lg flex items-center bg-white text-slate-900 font-medium">
                          {showViewModal.permanentAddress?.district || '---'}
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-3xl p-8 text-center space-y-6"
            >
              <div className="w-20 h-20 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto">
                <Trash2 size={40} />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-slate-800">আপনি কি নিশ্চিত?</h3>
                <p className="text-slate-500">এই হিসাবটি ডিলিট করতে চান?</p>
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
                  onClick={() => handleDelete(showDeleteConfirm)}
                  className="flex-1 py-3 bg-rose-600 text-white font-bold rounded-xl shadow-lg shadow-rose-200 hover:bg-rose-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isDeleting ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    'হ্যাঁ, ডিলিট করুন'
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const DetailItem = ({ label, value }: { label: string, value: string }) => (
  <div className="flex flex-col border-b border-slate-50 py-3 group hover:bg-emerald-50/30 transition-all px-3 rounded-xl">
    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</span>
    <span className="text-sm font-bold text-slate-800">{value || '---'}</span>
  </div>
);

