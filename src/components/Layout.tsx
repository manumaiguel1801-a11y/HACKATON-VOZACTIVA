import React from 'react';
import {
  Home,
  Wallet,
  User,
  Moon,
  Sun,
  TrendingUp,
  Package,
  HelpCircle,
  MessageSquare,
  Users,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Tab, Debt, InventoryProduct } from '../types';
import { ChatBubble } from './ChatBubble';
import { OnboardingManual } from './OnboardingManual';
import { SuggestionsModal } from './SuggestionsModal';
import { Avatar } from './ProfileView';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  userName?: string;
  userId: string;
  debts: Debt[];
  inventory: InventoryProduct[];
  profilePhotoURL?: string;
  profileFirstName?: string;
  profileLastName?: string;
}

export const Layout = ({
  children,
  activeTab,
  setActiveTab,
  isDarkMode,
  toggleDarkMode,
  userName = 'Bienvenido',
  userId,
  debts,
  inventory,
  profilePhotoURL,
  profileFirstName = '',
  profileLastName = '',
}: LayoutProps) => {
  const [showManual, setShowManual] = React.useState(false);
  const [showSuggestions, setShowSuggestions] = React.useState(false);

  // Derive a clean name from "Hola, Juan" → "Juan"
  const cleanName = userName.startsWith('Hola, ') ? userName.replace('Hola, ', '') : userName;

  // Auto-show manual on first visit (using localStorage)
  React.useEffect(() => {
    const hasSeenManual = localStorage.getItem('hasSeenManual');
    if (!hasSeenManual) {
      setShowManual(true);
      localStorage.setItem('hasSeenManual', 'true');
    }
  }, []);

  return (
    <div className={cn(
      "min-h-screen font-['Be_Vietnam_Pro'] pb-32 transition-colors duration-500",
      isDarkMode ? "bg-[#0D0D0D] text-[#FDFBF0]" : "bg-[#FDFBF0] text-[#2e2f2d]"
    )}>
      {/* Onboarding Manual */}
      <OnboardingManual
        isOpen={showManual}
        onClose={() => setShowManual(false)}
        isDarkMode={isDarkMode}
      />

      {/* Suggestions / PQRS Modal */}
      {showSuggestions && (
        <SuggestionsModal
          isDarkMode={isDarkMode}
          fromName={cleanName}
          onClose={() => setShowSuggestions(false)}
        />
      )}

      {/* Top Bar */}
      <header className={cn(
        "fixed top-0 left-0 w-full z-50 backdrop-blur-xl flex justify-between items-center px-6 py-4 transition-colors duration-500",
        isDarkMode ? "bg-[#0D0D0D]/85" : "bg-[#FDFBF0]/85"
      )}>
        {/* Izquierda: avatar + saludo */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-[#D4AF37] flex-shrink-0">
            <Avatar
              photoURL={profilePhotoURL}
              firstName={profileFirstName}
              lastName={profileLastName}
              size="sm"
              isDarkMode={isDarkMode}
            />
          </div>
          <h1 className="font-['Plus_Jakarta_Sans'] font-bold text-2xl tracking-tight text-[#B8860B]">
            {userName}
          </h1>
        </div>

        {/* Derecha: mensajes, ayuda, luna/sol, logo, perfil */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowSuggestions(true)}
            className={cn(
              "w-10 h-10 flex items-center justify-center rounded-full transition-colors",
              isDarkMode ? "hover:bg-white/10 text-[#FFD700]" : "hover:bg-black/5 text-[#B8860B]"
            )}
            title="Buzón de sugerencias"
          >
            <MessageSquare className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowManual(true)}
            className={cn(
              "w-10 h-10 flex items-center justify-center rounded-full transition-colors",
              isDarkMode ? "hover:bg-white/10 text-[#FFD700]" : "hover:bg-black/5 text-[#B8860B]"
            )}
            title="Ayuda"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
          <button
            onClick={toggleDarkMode}
            className={cn(
              "w-10 h-10 flex items-center justify-center rounded-full transition-colors",
              isDarkMode ? "hover:bg-white/10 text-[#FFD700]" : "hover:bg-black/5 text-[#B8860B]"
            )}
          >
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <button
            onClick={() => setActiveTab('perfil')}
            className={cn(
              "w-10 h-10 flex items-center justify-center rounded-full transition-colors",
              activeTab === 'perfil'
                ? (isDarkMode ? "bg-[#FFD700]/10 text-[#FFD700]" : "bg-[#FFD700]/20 text-[#B8860B]")
                : (isDarkMode ? "hover:bg-white/10 text-[#FFD700]" : "hover:bg-black/5 text-[#B8860B]")
            )}
          >
            <User className="w-6 h-6" />
          </button>
          <img src="/logoapp.png" alt="Voz-Activa" className="w-10 h-10 object-contain" />
        </div>
      </header>

      <main className="pt-24 px-4 sm:px-6 max-w-md mx-auto w-full">
        {children}
      </main>

      {/* Floating Chat Bubble */}
      <ChatBubble isDarkMode={isDarkMode} userId={userId} debts={debts} inventory={inventory} />

      {/* Bottom Nav */}
      <nav className={cn(
        "fixed bottom-0 left-0 w-full z-50 backdrop-blur-2xl flex justify-around items-center px-4 pb-4 h-[88px] rounded-t-[3rem] shadow-[0_-8px_32px_rgba(0,0,0,0.1)] transition-colors duration-500",
        isDarkMode ? "bg-[#1A1A1A]/90" : "bg-white/90"
      )}>
        <NavButton 
          active={activeTab === 'inicio'} 
          onClick={() => setActiveTab('inicio')} 
          icon={<Home />} 
          label="Inicio" 
          isDarkMode={isDarkMode}
        />
        <NavButton 
          active={activeTab === 'finanzas'} 
          onClick={() => setActiveTab('finanzas')} 
          icon={<TrendingUp />} 
          label="Finanzas" 
          isDarkMode={isDarkMode}
        />
        <NavButton
          active={activeTab === 'camara'}
          onClick={() => setActiveTab('camara')}
          icon={<Users />}
          label="Deudas"
          isDarkMode={isDarkMode}
        />
        <NavButton 
          active={activeTab === 'inventario'} 
          onClick={() => setActiveTab('inventario')} 
          icon={<Package />} 
          label="Inventario" 
          isDarkMode={isDarkMode}
        />
        <NavButton 
          active={activeTab === 'pasaporte'} 
          onClick={() => setActiveTab('pasaporte')} 
          icon={<Wallet />} 
          label="Pasaporte" 
          isDarkMode={isDarkMode}
        />
      </nav>
    </div>
  );
};

const NavButton = ({ 
  active, 
  onClick, 
  icon, 
  label, 
  isDarkMode 
}: { 
  active: boolean, 
  onClick: () => void, 
  icon: React.ReactNode, 
  label: string,
  isDarkMode: boolean
}) => (
  <button 
    onClick={onClick}
    className={cn(
      "flex flex-col items-center justify-center px-3 py-2 rounded-full transition-all duration-300 ease-out",
      active 
        ? (isDarkMode ? "bg-[#FFD700]/10 text-[#FFD700]" : "bg-[#FFD700]/20 text-[#B8860B]") 
        : (isDarkMode ? "text-[#FDFBF0]/40 hover:bg-white/5" : "text-[#2e2f2d]/60 hover:bg-[#f1f1ee]")
    )}
  >
    {React.cloneElement(icon as React.ReactElement, { 
      className: cn("w-6 h-6", active && "fill-current") 
    })}
    <span className="font-medium text-[10px] mt-1">{label}</span>
  </button>
);
