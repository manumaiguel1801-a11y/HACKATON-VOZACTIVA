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
  MessageCircle,
  Bell,
  LogOut,
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
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

  const cleanName = userName.startsWith('Hola, ') ? userName.replace('Hola, ', '') : userName;

  React.useEffect(() => {
    const hasSeenManual = localStorage.getItem('hasSeenManual');
    if (!hasSeenManual) {
      setShowManual(true);
      localStorage.setItem('hasSeenManual', 'true');
    }
  }, []);

  const navItems: { tab: Tab; icon: React.ReactNode; label: string }[] = [
    { tab: 'inicio',     icon: <Home />,      label: 'Inicio' },
    { tab: 'finanzas',   icon: <TrendingUp />, label: 'Finanzas' },
    { tab: 'camara',     icon: <Users />,      label: 'Deudas' },
    { tab: 'inventario', icon: <Package />,    label: 'Inventario' },
    { tab: 'pasaporte',  icon: <Wallet />,     label: 'Pasaporte' },
  ];

  return (
    <div className={cn(
      "min-h-screen overflow-x-hidden font-['Be_Vietnam_Pro'] pb-32 md:pb-0 transition-colors duration-500",
      isDarkMode ? "bg-[#0D0D0D] text-[#FDFBF0]" : "bg-[#FDFBF0] text-[#2e2f2d]"
    )}>
      <OnboardingManual
        isOpen={showManual}
        onClose={() => setShowManual(false)}
        isDarkMode={isDarkMode}
      />

      {showSuggestions && (
        <SuggestionsModal
          isDarkMode={isDarkMode}
          fromName={cleanName}
          onClose={() => setShowSuggestions(false)}
        />
      )}

      {/* ── Desktop sidebar ── */}
      <aside className={cn(
        'hidden md:flex flex-col fixed left-0 top-0 h-screen w-60 z-50 border-r overflow-hidden transition-colors duration-500',
        isDarkMode ? 'bg-[#0D0D0D] border-white/5' : 'bg-white border-black/5'
      )}>
        {/* Logo */}
        <div className={cn(
          'flex items-center gap-3 px-5 py-5 border-b',
          isDarkMode ? 'border-white/5' : 'border-black/5'
        )}>
          <img src="/logoapp.png" alt="Voz-Activa" className="w-9 h-9 object-contain" />
          <span className="font-['Plus_Jakarta_Sans'] font-black text-lg text-[#B8860B]">Voz-Activa</span>
        </div>

        {/* User info */}
        <div className={cn(
          'flex items-center gap-3 px-5 py-4 border-b',
          isDarkMode ? 'border-white/5' : 'border-black/5'
        )}>
          <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-[#D4AF37] flex-shrink-0">
            <Avatar
              photoURL={profilePhotoURL}
              firstName={profileFirstName}
              lastName={profileLastName}
              size="sm"
              isDarkMode={isDarkMode}
            />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm truncate text-[#B8860B]">{cleanName}</p>
            <p className={cn('text-[10px] truncate', isDarkMode ? 'text-white/40' : 'text-black/40')}>
              Vendedor activo
            </p>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ tab, icon, label }) => (
            <React.Fragment key={tab}>
              <SidebarButton
                active={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                icon={icon}
                label={label}
                isDarkMode={isDarkMode}
              />
            </React.Fragment>
          ))}
          <SidebarButton
            active={activeTab === 'perfil'}
            onClick={() => setActiveTab('perfil')}
            icon={<User />}
            label="Perfil"
            isDarkMode={isDarkMode}
          />
        </nav>

        {/* Bottom actions */}
        <div className={cn(
          'px-3 py-4 border-t space-y-1',
          isDarkMode ? 'border-white/5' : 'border-black/5'
        )}>
          <button
            onClick={() => setShowSuggestions(true)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
              isDarkMode ? 'text-white/50 hover:bg-white/5 hover:text-white/80' : 'text-black/50 hover:bg-black/5 hover:text-black/80'
            )}
          >
            <MessageSquare className="w-4 h-4" />
            Sugerencias
          </button>
          <button
            onClick={() => setShowManual(true)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
              isDarkMode ? 'text-white/50 hover:bg-white/5 hover:text-white/80' : 'text-black/50 hover:bg-black/5 hover:text-black/80'
            )}
          >
            <HelpCircle className="w-4 h-4" />
            Ayuda
          </button>
          <button
            onClick={toggleDarkMode}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
              isDarkMode ? 'text-white/50 hover:bg-white/5 hover:text-white/80' : 'text-black/50 hover:bg-black/5 hover:text-black/80'
            )}
          >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {isDarkMode ? 'Modo claro' : 'Modo oscuro'}
          </button>
        </div>
      </aside>

      {/* ── Top Bar ── */}
      <header className={cn(
        'fixed top-0 left-0 md:left-60 right-0 z-50 backdrop-blur-xl flex justify-between items-center px-6 py-4 transition-colors duration-500',
        isDarkMode ? 'bg-[#0D0D0D]/85' : 'bg-[#FDFBF0]/85'
      )}>
        {/* Left: avatar + greeting (mobile only — desktop shows in sidebar) */}
        <div className="flex items-center gap-3 md:hidden">
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

        {/* Left: page title on desktop */}
        <div className="hidden md:block">
          <h1 className="font-['Plus_Jakarta_Sans'] font-bold text-xl tracking-tight text-[#B8860B]">
            {userName}
          </h1>
          {activeTab === 'finanzas' && (
            <p className="text-sm text-gray-400 mt-0.5">Resumen de tus finanzas</p>
          )}
        </div>

        {/* Right: action buttons */}
        <div className="flex items-center gap-1">
          {/* Desktop-only icons */}
          <div className="hidden md:flex items-center gap-3 mr-2">
            <button onClick={() => setShowSuggestions(true)} className="w-5 h-5 text-gray-400 hover:text-gray-600 cursor-pointer transition-colors">
              <MessageCircle className="w-5 h-5" />
            </button>
            <button onClick={() => setShowManual(true)} className="w-5 h-5 text-gray-400 hover:text-gray-600 cursor-pointer transition-colors">
              <HelpCircle className="w-5 h-5" />
            </button>
            <button className="relative text-gray-400 hover:text-gray-600 cursor-pointer transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#B8860B]" />
            </button>
            <button onClick={() => signOut(auth)} className="text-gray-400 hover:text-gray-600 cursor-pointer transition-colors">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
          <button
            onClick={() => setShowSuggestions(true)}
            className={cn(
              'md:hidden w-10 h-10 flex items-center justify-center rounded-full transition-colors',
              isDarkMode ? 'hover:bg-white/10 text-[#FFD700]' : 'hover:bg-black/5 text-[#B8860B]'
            )}
            title="Buzón de sugerencias"
          >
            <MessageSquare className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowManual(true)}
            className={cn(
              'md:hidden w-10 h-10 flex items-center justify-center rounded-full transition-colors',
              isDarkMode ? 'hover:bg-white/10 text-[#FFD700]' : 'hover:bg-black/5 text-[#B8860B]'
            )}
            title="Ayuda"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
          <button
            onClick={toggleDarkMode}
            className={cn(
              'md:hidden w-10 h-10 flex items-center justify-center rounded-full transition-colors',
              isDarkMode ? 'hover:bg-white/10 text-[#FFD700]' : 'hover:bg-black/5 text-[#B8860B]'
            )}
          >
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <button
            onClick={() => setActiveTab('perfil')}
            className={cn(
              'md:hidden w-10 h-10 flex items-center justify-center rounded-full transition-colors',
              activeTab === 'perfil'
                ? (isDarkMode ? 'bg-[#FFD700]/10 text-[#FFD700]' : 'bg-[#FFD700]/20 text-[#B8860B]')
                : (isDarkMode ? 'hover:bg-white/10 text-[#FFD700]' : 'hover:bg-black/5 text-[#B8860B]')
            )}
          >
            <User className="w-6 h-6" />
          </button>
          <img src="/logoapp.png" alt="Voz-Activa" className="w-10 h-10 object-contain md:hidden" />
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="pt-24 pb-4 px-4 sm:px-6 max-w-md mx-auto w-full md:max-w-none md:mx-0 md:w-auto md:ml-60 md:px-8 md:pt-24 md:pb-10">
        {children}
      </main>

      {/* Floating Chat Bubble */}
      <ChatBubble isDarkMode={isDarkMode} userId={userId} debts={debts} inventory={inventory} />

      {/* ── Bottom Nav (mobile only) ── */}
      <nav className={cn(
        'md:hidden fixed bottom-0 left-0 w-full z-50 backdrop-blur-2xl flex justify-around items-center px-4 pb-4 h-[88px] rounded-t-[3rem] shadow-[0_-8px_32px_rgba(0,0,0,0.1)] transition-colors duration-500',
        isDarkMode ? 'bg-[#1A1A1A]/90' : 'bg-white/90'
      )}>
        {navItems.map(({ tab, icon, label }) => (
          <React.Fragment key={tab}>
            <NavButton
              active={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              icon={icon}
              label={label}
              isDarkMode={isDarkMode}
            />
          </React.Fragment>
        ))}
      </nav>
    </div>
  );
};

const SidebarButton = ({
  active,
  onClick,
  icon,
  label,
  isDarkMode,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  isDarkMode: boolean;
}) => (
  <button
    onClick={onClick}
    className={cn(
      'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all duration-200',
      active
        ? isDarkMode
          ? 'bg-[#FFD700]/10 text-[#FFD700]'
          : 'bg-[#FFD700]/20 text-[#B8860B]'
        : isDarkMode
          ? 'text-white/50 hover:bg-white/5 hover:text-white/80'
          : 'text-black/50 hover:bg-black/5 hover:text-black/80'
    )}
  >
    {React.cloneElement(icon as React.ReactElement, {
      className: cn('w-5 h-5 flex-shrink-0', active && 'fill-current'),
    })}
    {label}
  </button>
);

const NavButton = ({
  active,
  onClick,
  icon,
  label,
  isDarkMode,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  isDarkMode: boolean;
}) => (
  <button
    onClick={onClick}
    className={cn(
      'flex flex-col items-center justify-center px-3 py-2 rounded-full transition-all duration-300 ease-out',
      active
        ? isDarkMode ? 'bg-[#FFD700]/10 text-[#FFD700]' : 'bg-[#FFD700]/20 text-[#B8860B]'
        : isDarkMode ? 'text-[#FDFBF0]/40 hover:bg-white/5' : 'text-[#2e2f2d]/60 hover:bg-[#f1f1ee]'
    )}
  >
    {React.cloneElement(icon as React.ReactElement, {
      className: cn('w-6 h-6', active && 'fill-current'),
    })}
    <span className="font-medium text-[10px] mt-1">{label}</span>
  </button>
);
