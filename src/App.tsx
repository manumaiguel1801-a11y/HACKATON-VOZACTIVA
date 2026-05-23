import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, collection, query, orderBy } from 'firebase/firestore';
import { auth, db } from './firebase';
import { Tab, UserProfile, Sale, Expense, Debt, InventoryProduct } from './types';

import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { FinanceView } from './components/FinanceView';
import { CameraView } from './components/CameraView';
import { InventorySalesView } from './components/InventorySalesView';
import { PassportView } from './components/PassportView';
import { ProfileView } from './components/ProfileView';
import { Auth } from './components/Auth';
import { VerificationView } from './components/VerificationView';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [inventory, setInventory] = useState<InventoryProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('inicio');
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);

  const toggleDarkMode = () => setIsDarkMode(!isDarkMode);
  const verifyCode = React.useMemo(() => {
    const pathMatch = window.location.pathname.match(/^\/verificar\/(.+)$/);
    if (pathMatch) return pathMatch[1];
    return new URLSearchParams(window.location.search).get('verificar');
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setProfile(null);
        setSales([]);
        setExpenses([]);
        setDebts([]);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Profile
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      if (snap.exists()) setProfile(snap.data() as UserProfile);
      setLoading(false);
    }, (err) => { console.error(err); setLoading(false); });
    return unsub;
  }, [user]);

  // Sales
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'users', user.uid, 'sales'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      setSales(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Sale)));
    }, console.error);
  }, [user]);

  // Expenses
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'users', user.uid, 'expenses'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      setExpenses(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Expense)));
    }, console.error);
  }, [user]);

  // Debts
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'users', user.uid, 'debts'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      setDebts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Debt)));
    }, console.error);
  }, [user]);

  // Inventory
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'users', user.uid, 'inventario'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      setInventory(snap.docs.map((d) => ({ id: d.id, ...d.data() } as InventoryProduct)));
    }, console.error);
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FDFBF0]">
        <div className="w-16 h-16 border-4 border-[#B8860B] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (verifyCode) return <VerificationView code={verifyCode} isDarkMode={isDarkMode} />;
  if (!user) return <Auth isDarkMode={isDarkMode} />;

  return (
    <Layout
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      isDarkMode={isDarkMode}
      toggleDarkMode={toggleDarkMode}
      userName={profile ? `Hola, ${profile.firstName}` : 'Bienvenido'}
      userId={user.uid}
      debts={debts}
      inventory={inventory}
      profilePhotoURL={profile?.photoURL}
      profileFirstName={profile?.firstName}
      profileLastName={profile?.lastName}
    >
      <AnimatePresence mode="wait">
        {activeTab === 'inicio' && (
          <motion.div key="dashboard" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <Dashboard isDarkMode={isDarkMode} userId={user.uid} sales={sales} expenses={expenses} />
          </motion.div>
        )}
        {activeTab === 'finanzas' && (
          <motion.div key="finanzas" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <FinanceView isDarkMode={isDarkMode} sales={sales} expenses={expenses} />
          </motion.div>
        )}
        {activeTab === 'camara' && (
          <motion.div key="camera" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <CameraView isDarkMode={isDarkMode} debts={debts} userId={user.uid} inventory={inventory} />
          </motion.div>
        )}
        {activeTab === 'inventario' && (
          <motion.div key="inventario" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <InventorySalesView isDarkMode={isDarkMode} sales={sales} inventory={inventory} userId={user.uid} />
          </motion.div>
        )}
        {activeTab === 'pasaporte' && (
          <motion.div key="passport" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <PassportView isDarkMode={isDarkMode} sales={sales} expenses={expenses} debts={debts} profile={profile} userId={user.uid} />
          </motion.div>
        )}
        {activeTab === 'perfil' && profile && (
          <motion.div key="profile" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <ProfileView
              isDarkMode={isDarkMode}
              profile={profile}
              onUpdate={(updated) => setProfile({ ...profile, ...updated })}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </Layout>
  );
}
