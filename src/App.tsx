/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { Layout } from './Layout';
import { Login } from './Login';
import { Register } from './Register';
import { Dashboard } from './Dashboard';
import { Directors } from './Directors';
import { Banks } from './Banks';
import { Reports } from './Reports';
import { Transactions } from './Transactions';
import { Investments } from './Investments';
import { UserManagement } from './UserManagement';
import { Customers } from './Customers';
import { Profile } from './Profile';
import { TransactionMenu } from './TransactionMenu';
import { TransactionReport } from './TransactionReport';
import { ErrorBoundary } from './components/ErrorBoundary';
import { BackButtonHandler } from './components/BackButtonHandler';

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-500 font-bold">অপেক্ষা করুন...</p>
      </div>
    ); 
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Layout>{children}</Layout>;
};

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <BackButtonHandler />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            
            {/* Private Routes */}
            <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
            <Route path="/dashboard" element={<Navigate to="/" replace />} />
            <Route path="/directors" element={<PrivateRoute><Directors /></PrivateRoute>} />
            <Route path="/banks" element={<PrivateRoute><Banks /></PrivateRoute>} />
            <Route path="/reports" element={<PrivateRoute><Reports /></PrivateRoute>} />
            <Route path="/transactions" element={<PrivateRoute><Transactions /></PrivateRoute>} />
            <Route path="/investments" element={<PrivateRoute><Investments /></PrivateRoute>} />
            <Route path="/users" element={<PrivateRoute><UserManagement /></PrivateRoute>} />
            <Route path="/customers" element={<PrivateRoute><Customers /></PrivateRoute>} />
            <Route path="/profile" element={<PrivateRoute><Profile /></PrivateRoute>} />
            <Route path="/transaction-menu" element={<PrivateRoute><TransactionMenu /></PrivateRoute>} />
            <Route path="/transaction-report" element={<PrivateRoute><TransactionReport /></PrivateRoute>} />
            
            {/* 404 Redirect */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
