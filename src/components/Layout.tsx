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
  X,
  FileText,
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
  const [showNotifications, setShowNotifications] = React.useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = React.useState(false);

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
    { tab: 'reporte',    icon: <FileText />,   label: 'Reporte' },
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

      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowLogoutConfirm(false)} />
          <div className={cn(
            'relative w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden z-10',
            isDarkMode ? 'bg-[#1A1A1A] text-[#FDFBF0]' : 'bg-white text-[#2e2f2d]'
          )}>
            <div className="h-1 w-full bg-gradient-to-r from-[#B8860B] to-[#FFD700]" />
            <div className="px-6 py-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', isDarkMode ? 'bg-white/8' : 'bg-black/5')}>
                  <LogOut className="w-5 h-5 text-[#B8860B]" />
                </div>
                <div>
                  <p className="font-black text-base">¿Cerrar sesión?</p>
                  <p className={cn('text-xs', isDarkMode ? 'text-white/50' : 'text-black/40')}>Tendrás que volver a iniciar sesión</p>
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className={cn(
                    'flex-1 h-11 rounded-xl font-bold text-sm transition-colors',
                    isDarkMode ? 'bg-white/8 hover:bg-white/12 text-white/70' : 'bg-black/5 hover:bg-black/10 text-black/60'
                  )}
                >
                  Cancelar
                </button>
                <button
                  onClick={() => { setShowLogoutConfirm(false); signOut(auth); }}
                  className="flex-1 h-11 rounded-xl font-black text-sm bg-gradient-to-r from-[#B8860B] to-[#FFD700] text-black shadow-md hover:opacity-90 transition-opacity"
                >
                  Cerrar sesión
                </button>
              </div>
            </div>
          </div>
        </div>
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

        {/* Nav items */}
        <nav className="flex-1 px-3 py-4 space-y-1">
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

        {/* Bottom: utility icons + profile + logout */}
        <div className={cn('border-t', isDarkMode ? 'border-white/5' : 'border-black/5')}>
          {/* Compact utility row */}
          <div className={cn('flex items-center gap-1 px-3 py-2 border-b', isDarkMode ? 'border-white/5' : 'border-black/5')}>
            <button
              onClick={() => setShowSuggestions(true)}
              title="Sugerencias"
              className={cn('flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium transition-colors', isDarkMode ? 'text-white/40 hover:bg-white/5 hover:text-white/70' : 'text-black/40 hover:bg-black/5 hover:text-black/70')}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Sugerencias
            </button>
            <button
              onClick={() => setShowManual(true)}
              title="Ayuda"
              className={cn('flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium transition-colors', isDarkMode ? 'text-white/40 hover:bg-white/5 hover:text-white/70' : 'text-black/40 hover:bg-black/5 hover:text-black/70')}
            >
              <HelpCircle className="w-3.5 h-3.5" />
              Ayuda
            </button>
            <button
              onClick={toggleDarkMode}
              title={isDarkMode ? 'Modo claro' : 'Modo oscuro'}
              className={cn('w-8 h-8 flex items-center justify-center rounded-xl transition-colors', isDarkMode ? 'text-white/40 hover:bg-white/5 hover:text-white/70' : 'text-black/40 hover:bg-black/5 hover:text-black/70')}
            >
              {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>

          {/* Profile + logout */}
          <div className="flex items-center gap-3 px-4 py-4">
            <button
              onClick={() => setActiveTab('perfil')}
              className="flex items-center gap-3 flex-1 min-w-0 group"
            >
              <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-[#D4AF37] flex-shrink-0">
                <Avatar
                  photoURL={profilePhotoURL}
                  firstName={profileFirstName}
                  lastName={profileLastName}
                  size="sm"
                  isDarkMode={isDarkMode}
                />
              </div>
              <div className="min-w-0 text-left">
                <p className={cn('font-bold text-sm truncate transition-colors', isDarkMode ? 'text-white/80 group-hover:text-[#FFD700]' : 'text-[#2e2f2d] group-hover:text-[#B8860B]')}>{cleanName}</p>
                <p className={cn('text-[10px] truncate', isDarkMode ? 'text-white/30' : 'text-black/30')}>Vendedor activo</p>
              </div>
            </button>
            <button
              onClick={() => setShowLogoutConfirm(true)}
              title="Cerrar sesión"
              className={cn('w-9 h-9 flex items-center justify-center rounded-xl flex-shrink-0 transition-colors', isDarkMode ? 'text-white/30 hover:bg-red-500/15 hover:text-red-400' : 'text-black/30 hover:bg-red-50 hover:text-red-500')}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
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
            <div className="relative">
              <button
                onClick={() => setShowNotifications(v => !v)}
                className="relative text-gray-400 hover:text-gray-600 cursor-pointer transition-colors"
                title="Notificaciones"
              >
                <Bell className="w-5 h-5" />
                {(debts.filter(d => d.status !== 'pagada').length > 0 || inventory.filter(p => (p.cantidad ?? 0) < 5).length > 0) && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#B8860B]" />
                )}
              </button>
              {showNotifications && (
                <div
                  className={cn(
                    'absolute right-0 top-8 w-72 rounded-2xl shadow-2xl border z-50 overflow-hidden',
                    isDarkMode ? 'bg-[#1A1A1A] border-white/10' : 'bg-white border-black/5'
                  )}
                  onClick={e => e.stopPropagation()}
                >
                  <div className={cn('flex items-center justify-between px-4 py-3 border-b', isDarkMode ? 'border-white/8' : 'border-black/5')}>
                    <p className="font-bold text-sm">Notificaciones</p>
                    <button onClick={() => setShowNotifications(false)} className="opacity-40 hover:opacity-70 transition-opacity">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {debts.filter(d => d.status !== 'pagada').slice(0, 3).map(d => (
                      <div key={d.id} className={cn('flex items-start gap-3 px-4 py-3 border-b', isDarkMode ? 'border-white/5' : 'border-black/3')}>
                        <span className="text-lg flex-shrink-0">💰</span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold truncate">{d.name}</p>
                          <p className={cn('text-[11px]', isDarkMode ? 'text-white/50' : 'text-black/50')}>
                            {d.type === 'me-deben' ? 'Te debe' : 'Debes'} ${(d.amount - (d.amountPaid ?? 0)).toLocaleString('es-CO')}
                          </p>
                        </div>
                      </div>
                    ))}
                    {inventory.filter(p => (p.cantidad ?? 0) < 5).slice(0, 3).map(p => (
                      <div key={p.id} className={cn('flex items-start gap-3 px-4 py-3 border-b', isDarkMode ? 'border-white/5' : 'border-black/3')}>
                        <span className="text-lg flex-shrink-0">📦</span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold truncate">{p.nombre}</p>
                          <p className={cn('text-[11px] text-amber-500')}>Stock bajo: {p.cantidad ?? 0} unidades</p>
                        </div>
                      </div>
                    ))}
                    {debts.filter(d => d.status !== 'pagada').length === 0 && inventory.filter(p => (p.cantidad ?? 0) < 5).length === 0 && (
                      <div className="px-4 py-6 text-center">
                        <p className={cn('text-sm', isDarkMode ? 'text-white/40' : 'text-black/40')}>Todo en orden 🎉</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
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
