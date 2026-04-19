import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { db, auth, handleFirestoreError, OperationType } from './firebase';
import { doc } from 'firebase/firestore';

interface AuthContextType {
  user: any | null;
  role: 'super_admin' | 'admin' | 'director' | null;
  directorId: string | null;
  userId: string | null;
  loading: boolean;
  logout: () => void;
  appSettings: {
    loadingLogoUrl: string;
    loadingTitle: string;
    loadingSubtitle: string;
    appName?: string;
    logoText?: string;
    logoUrl?: string;
  };
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  directorId: null,
  userId: null,
  loading: true,
  logout: () => {},
  appSettings: {
    loadingLogoUrl: '',
    loadingTitle: 'Sarder Credit Union',
    loadingSubtitle: 'হালাল আয়ে, সুন্দর আগামীর পথে',
    appName: 'Sarder Credit Union',
    logoText: 'Sarder Credit Union'
  }
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any | null>(() => {
    const saved = localStorage.getItem('auth_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [role, setRole] = useState<'super_admin' | 'admin' | 'director' | null>(() => {
    return localStorage.getItem('auth_role') as any || null;
  });
  const [directorId, setDirectorId] = useState<string | null>(() => {
    return localStorage.getItem('auth_directorId');
  });
  const [userId, setUserId] = useState<string | null>(() => {
    return localStorage.getItem('auth_userId');
  });
  const [appSettings, setAppSettings] = useState({
    loadingLogoUrl: '',
    loadingTitle: 'Sarder Credit Union',
    loadingSubtitle: 'হালাল আয়ে, সুন্দর আগামীর পথে'
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubDoc: (() => void) | null = null;
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      console.log("AuthContext: onAuthStateChanged", firebaseUser?.email);
      if (unsubDoc) {
        unsubDoc();
        unsubDoc = null;
      }

      if (firebaseUser) {
        // Use email query for better reliability across potential UID mismatches
        const userEmail = firebaseUser.email?.toLowerCase().trim();
        const q = query(collection(db, 'users'), where('email', '==', userEmail));
        
        unsubDoc = onSnapshot(q, (snap) => {
          console.log("AuthContext: User doc snapshot empty?", snap.empty, "for email:", userEmail);
          if (!snap.empty) {
            // If multiple docs found (shouldn't happen), use the one that matches UID if possible
            const userDoc = snap.docs.find(d => d.id === firebaseUser.uid) || snap.docs[0];
            const userData = userDoc.data();
            const fullUser = { ...firebaseUser, ...userData, id: userDoc.id };
            setUser(fullUser);
            localStorage.setItem('auth_user', JSON.stringify(fullUser));
            
            let userRole: any = userData.role;
            // Hardcoded fallback for the main admin email
            if (userEmail === "aspsbazar@gmail.com") {
              userRole = 'super_admin';
            }
            
            console.log("AuthContext: Identified role as", userRole, "for", userEmail);
            setRole(userRole);
            localStorage.setItem('auth_role', userRole || '');
            
            setDirectorId(userData.directorId || null);
            localStorage.setItem('auth_directorId', userData.directorId || '');
            
            setUserId(userData.userId || null);
            localStorage.setItem('auth_userId', userData.userId || '');
          } else {
            console.log("AuthContext: No user doc found for email", userEmail);
            setUser(firebaseUser);
            localStorage.setItem('auth_user', JSON.stringify(firebaseUser));
            if (userEmail === "aspsbazar@gmail.com") {
              setRole('super_admin');
              localStorage.setItem('auth_role', 'super_admin');
            } else {
              setRole(null);
              localStorage.setItem('auth_role', '');
            }
          }
          setLoading(false);
        }, (error) => {
          console.error("Auth Firestore error:", error);
          if (firebaseUser.email?.toLowerCase().trim() === "aspsbazar@gmail.com") {
            setRole('super_admin');
            setUser(firebaseUser);
          }
          setLoading(false);
        });
      } else {
        console.log("AuthContext: No firebaseUser");
        setUser(null);
        setRole(null);
        setDirectorId(null);
        setUserId(null);
        setLoading(false);
        localStorage.removeItem('auth_user');
        localStorage.removeItem('auth_role');
        localStorage.removeItem('auth_directorId');
        localStorage.removeItem('auth_userId');
      }
    });

    return () => {
      unsubscribe();
      if (unsubDoc) unsubDoc();
    };
  }, []);

  useEffect(() => {
    const unsubSettings = onSnapshot(doc(db, 'app_settings', 'loading_screen'), (docSnap) => {
      if (docSnap.exists()) {
        setAppSettings(docSnap.data() as any);
      }
    }, (error) => {
      console.warn("App settings snapshot error (likely permissions):", error);
      // Fallback to default settings is already handled by state initialization
    });
    return () => unsubSettings();
  }, []);

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, role, directorId, userId, loading, logout, appSettings }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
