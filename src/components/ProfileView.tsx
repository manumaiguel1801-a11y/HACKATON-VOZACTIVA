import React, { useState, useRef, useMemo } from 'react';
import {
  User,
  Phone,
  IdCard,
  Calendar,
  Mail,
  LogOut,
  Save,
  Edit2,
  MessageSquare,
  ChevronRight,
  Send,
  CheckCircle2,
  Copy,
  Check,
  Camera,
  ImagePlus,
  X,
  Loader2,
  Shield,
  MapPin,
  Bell,
  Globe,
  DollarSign,
  Clock,
  Smartphone,
  Wallet,
} from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { cn } from '../lib/utils';
import { UserProfile, Sale, Expense, Debt, Tab } from '../types';
import { auth, db, storage } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { SuggestionsModal } from './SuggestionsModal';
import { calculateScore } from '../services/scoringService';

interface ProfileViewProps {
  isDarkMode: boolean;
  profile: UserProfile;
  onUpdate: (updated: Partial<UserProfile>) => void;
  sales?: Sale[];
  expenses?: Expense[];
  debts?: Debt[];
  onNavigate?: (tab: Tab) => void;
}

// ─── Avatar: foto o iniciales ─────────────────────────────────────────────────

const Avatar = ({
  photoURL,
  firstName,
  lastName,
  size = 'lg',
  isDarkMode,
}: {
  photoURL?: string;
  firstName: string;
  lastName: string;
  size?: 'lg' | 'sm';
  isDarkMode: boolean;
}) => {
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  const sizeClasses = size === 'lg' ? 'w-32 h-32 text-4xl' : 'w-10 h-10 text-sm';

  if (photoURL) {
    return (
      <img
        src={photoURL}
        alt="Perfil"
        referrerPolicy="no-referrer"
        className={cn('rounded-full object-cover', sizeClasses)}
      />
    );
  }
  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center font-black select-none',
        'bg-gradient-to-br from-[#B8860B] to-[#DAA520]',
        isDarkMode ? 'text-[#0D0D0D]' : 'text-[#1A1A1A]',
        sizeClasses,
      )}
    >
      {initials || <User className={size === 'lg' ? 'w-12 h-12' : 'w-5 h-5'} />}
    </div>
  );
};

export { Avatar };

// ─── Desktop sub-components ───────────────────────────────────────────────────

function DesktopInfoRow({
  icon,
  label,
  value,
  badge,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  badge?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 py-3.5 border-b border-gray-100 last:border-0 hover:bg-[#FDFBF0] transition-colors text-left group px-1 -mx-1 rounded-lg"
    >
      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 text-gray-400">
        {React.cloneElement(icon as React.ReactElement, { className: 'w-4 h-4' })}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-0.5">{label}</p>
        <div className="flex items-center gap-2">
          <p className="font-semibold text-sm text-gray-800 truncate">{value || '—'}</p>
          {badge}
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400 flex-shrink-0 transition-colors" />
    </button>
  );
}

function DesktopPrefRow({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-3 py-3.5 border-b border-gray-100 last:border-0 hover:bg-[#FDFBF0] transition-colors cursor-pointer px-1 -mx-1 rounded-lg group">
      <div className="w-9 h-9 rounded-full bg-[#FFF8DC] flex items-center justify-center flex-shrink-0">
        {React.cloneElement(icon as React.ReactElement, { className: 'w-4 h-4 text-[#B8860B]' })}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-gray-800">{title}</p>
        <p className="text-xs text-gray-400 truncate">{description}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400 flex-shrink-0" />
    </div>
  );
}

// ─── ProfileView ──────────────────────────────────────────────────────────────

export const ProfileView = ({
  isDarkMode,
  profile,
  onUpdate,
  sales = [],
  expenses = [],
  debts = [],
  onNavigate,
}: ProfileViewProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [showDesktopEdit, setShowDesktopEdit] = useState(false);
  const [formData, setFormData] = useState(profile);
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [waLinkCode, setWaLinkCode] = useState<string | null>(null);
  const [waLinking, setWaLinking] = useState(false);
  const [waCopied, setWaCopied] = useState(false);

  // Photo states
  const [showPhotoOptions, setShowPhotoOptions] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoToast, setPhotoToast] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // ── Desktop computed values ────────────────────────────────────────────────
  const memberInfo = useMemo(() => {
    if (!profile.createdAt) return { since: '—', months: 0 };
    const created: Date = profile.createdAt.toDate
      ? profile.createdAt.toDate()
      : new Date(profile.createdAt);
    const now = new Date();
    const months =
      (now.getFullYear() - created.getFullYear()) * 12 +
      (now.getMonth() - created.getMonth());
    const since = created.toLocaleDateString('es-CO', {
      day: '2-digit', month: 'long', year: 'numeric',
    });
    return { since, months };
  }, [profile.createdAt]);

  const scoreData = useMemo(() => {
    const bd = calculateScore(sales, expenses, debts);
    return { score: bd.scoreFinal, hasData: bd.hasEnoughData };
  }, [sales, expenses, debts]);

  const lastLogin = useMemo(() => {
    const raw = auth.currentUser?.metadata.lastSignInTime;
    if (!raw) return 'No disponible';
    return new Date(raw).toLocaleString('es-CO', {
      weekday: 'short', day: '2-digit', month: 'short',
      year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }, []);

  const emailDisplay = profile.email || `${profile.idNumber}@vozactiva.com`;
  const birthFormatted = profile.birthDate
    ? new Date(profile.birthDate + 'T00:00:00').toLocaleDateString('es-CO', {
        day: '2-digit', month: 'long', year: 'numeric',
      })
    : '—';

  // ── Handlers ──────────────────────────────────────────────────────────────
  const showToast = (msg: string) => {
    setPhotoToast(msg);
    setTimeout(() => setPhotoToast(null), 3000);
  };

  const handlePhotoFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreviewFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setShowPhotoOptions(false);
    e.target.value = '';
  };

  const handleConfirmPhoto = async () => {
    if (!previewFile || !auth.currentUser) return;
    setUploadingPhoto(true);
    try {
      const storageRef = ref(storage, `users/${auth.currentUser.uid}/profile.jpg`);
      await uploadBytes(storageRef, previewFile, { contentType: previewFile.type });
      const downloadUrl = await getDownloadURL(storageRef);
      await updateDoc(doc(db, 'users', auth.currentUser.uid), { photoURL: downloadUrl });
      onUpdate({ photoURL: downloadUrl });
      setPreviewUrl(null);
      setPreviewFile(null);
      showToast('¡Foto actualizada!');
    } catch (err: any) {
      const msg = err?.code === 'storage/unauthorized'
        ? 'Sin permiso. Despliega las reglas de Storage.'
        : `Error: ${err?.code ?? err?.message ?? 'desconocido'}`;
      showToast(msg);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleCancelPhoto = () => {
    setPreviewUrl(null);
    setPreviewFile(null);
  };

  const generateLinkCode = async () => {
    if (!auth.currentUser) return;
    setLinking(true);
    try {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await updateDoc(doc(db, 'users', auth.currentUser.uid), { linkCode: { code, expiresAt } });
      setLinkCode(code);
    } catch (err) {
      console.error('Error generating link code:', err);
    } finally {
      setLinking(false);
    }
  };

  const copyCode = () => {
    if (!linkCode) return;
    navigator.clipboard.writeText(`/vincular ${linkCode}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const generateWaLinkCode = async () => {
    if (!auth.currentUser) return;
    setWaLinking(true);
    try {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await updateDoc(doc(db, 'users', auth.currentUser.uid), { linkCode: { code, expiresAt } });
      setWaLinkCode(code);
    } catch (err) {
      console.error('Error generating WA link code:', err);
    } finally {
      setWaLinking(false);
    }
  };

  const copyWaCode = () => {
    if (!waLinkCode) return;
    navigator.clipboard.writeText(`VINCULAR ${waLinkCode}`).then(() => {
      setWaCopied(true);
      setTimeout(() => setWaCopied(false), 2000);
    });
  };

  const handleSave = async () => {
    if (!auth.currentUser) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        firstName: formData.firstName,
        lastName: formData.lastName,
        phone: formData.phone,
        idNumber: formData.idNumber,
        birthDate: formData.birthDate,
      });
      onUpdate(formData);
      setIsEditing(false);
      setShowDesktopEdit(false);
    } catch (error) {
      console.error('Error updating profile:', error);
    } finally {
      setLoading(false);
    }
  };

  // ── Desktop render ─────────────────────────────────────────────────────────
  function renderDesktop() {
    const card = 'bg-white rounded-2xl shadow-sm p-6';

    return (
      <div className="space-y-4">

        {/* ── Fila 1: Tarjeta principal ── */}
        <div className={card}>
          <div className="flex items-start justify-between gap-6">

            {/* Avatar + info */}
            <div className="flex items-center gap-5">
              <button
                onClick={() => setShowPhotoOptions(true)}
                className="relative group flex-shrink-0"
                aria-label="Cambiar foto de perfil"
              >
                <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-[#B8860B] shadow-lg">
                  <Avatar
                    photoURL={profile.photoURL}
                    firstName={profile.firstName}
                    lastName={profile.lastName}
                    size="lg"
                    isDarkMode={isDarkMode}
                  />
                </div>
                <div className="absolute bottom-0.5 right-0.5 w-7 h-7 rounded-full bg-[#B8860B] flex items-center justify-center shadow border-2 border-white group-hover:scale-105 transition-transform">
                  <Camera className="w-3.5 h-3.5 text-black" />
                </div>
              </button>

              <div className="min-w-0">
                <h2 className="font-bold text-xl text-gray-900 leading-tight">
                  {profile.firstName} {profile.lastName}
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm text-gray-500">Vendedor activo</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-green-100 text-green-700">
                    ● Activo
                  </span>
                </div>
                <div className="mt-2.5 space-y-1">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{emailDisplay}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{profile.phone || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>Colombia</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Miembro desde + Rol */}
            <div className="hidden lg:flex items-start gap-10 flex-shrink-0">
              <div>
                <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-1.5">Miembro desde</p>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#B8860B]" />
                  <span className="font-semibold text-sm text-gray-800">{memberInfo.since}</span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5 ml-6">{memberInfo.months} meses en Voz-Activa</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-1.5">Rol en la plataforma</p>
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[#B8860B]" />
                  <span className="font-semibold text-sm text-gray-800">Vendedor</span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5 ml-6">Acceso completo</p>
              </div>
            </div>

            {/* Editar perfil */}
            <button
              onClick={() => { setFormData(profile); setShowDesktopEdit(true); }}
              className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#B8860B] text-[#B8860B] text-sm font-semibold hover:bg-[#B8860B]/5 transition-colors"
            >
              <Edit2 className="w-3.5 h-3.5" />
              Editar perfil
            </button>
          </div>
        </div>

        {/* ── Fila 2: Información personal + Preferencias ── */}
        <div className="grid grid-cols-2 gap-4">

          {/* Información personal */}
          <div className={card}>
            <h3 className="font-bold text-base text-gray-900 mb-1">Información personal</h3>
            <div className="mt-3">
              <DesktopInfoRow
                icon={<User />}
                label="Nombre completo"
                value={`${profile.firstName} ${profile.lastName}`}
                onClick={() => { setFormData(profile); setShowDesktopEdit(true); }}
              />
              <DesktopInfoRow
                icon={<Mail />}
                label="Correo electrónico"
                value={emailDisplay}
                badge={
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700">
                    <CheckCircle2 className="w-2.5 h-2.5" /> Verificado
                  </span>
                }
                onClick={() => { setFormData(profile); setShowDesktopEdit(true); }}
              />
              <DesktopInfoRow
                icon={<Phone />}
                label="Teléfono"
                value={profile.phone}
                onClick={() => { setFormData(profile); setShowDesktopEdit(true); }}
              />
              <DesktopInfoRow
                icon={<MapPin />}
                label="Ubicación"
                value="Colombia"
                onClick={() => { setFormData(profile); setShowDesktopEdit(true); }}
              />
              <DesktopInfoRow
                icon={<Calendar />}
                label="Fecha de nacimiento"
                value={birthFormatted}
                onClick={() => { setFormData(profile); setShowDesktopEdit(true); }}
              />
            </div>
          </div>

          {/* Preferencias */}
          <div className={card}>
            <h3 className="font-bold text-base text-gray-900 mb-1">Preferencias</h3>
            <div className="mt-3">
              <DesktopPrefRow icon={<Bell />} title="Notificaciones" description="Gestiona cómo y cuándo recibir notificaciones" />
              <DesktopPrefRow icon={<MessageSquare />} title="Alertas de negocio" description="Configura alertas y recordatorios importantes" />
              <DesktopPrefRow icon={<Shield />} title="Privacidad y seguridad" description="Configura tu contraseña y privacidad" />
              <DesktopPrefRow icon={<Globe />} title="Idioma y región" description="Español (Colombia)" />
              <DesktopPrefRow icon={<DollarSign />} title="Moneda" description="Peso colombiano (COP)" />
            </div>
          </div>
        </div>

        {/* ── Fila 3: Conexiones + Actividad ── */}
        <div className="grid grid-cols-2 gap-4">

          {/* Conexiones y cuentas */}
          <div className={card}>
            <h3 className="font-bold text-base text-gray-900 mb-3">Conexiones y cuentas</h3>

            {/* Pasaporte financiero */}
            <button
              onClick={() => onNavigate?.('pasaporte')}
              className="w-full flex items-center gap-3 py-3.5 border-b border-gray-100 hover:bg-[#FDFBF0] transition-colors text-left group px-1 -mx-1 rounded-lg"
            >
              <div className="w-9 h-9 rounded-full bg-[#FFF8DC] flex items-center justify-center flex-shrink-0">
                <Wallet className="w-4 h-4 text-[#B8860B]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-gray-800">Pasaporte financiero</p>
                <p className="text-xs text-gray-400">
                  {scoreData.hasData
                    ? `Score actual: ${scoreData.score}/950`
                    : 'Registra 5+ movimientos para calcular'}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400 flex-shrink-0" />
            </button>

            {/* WhatsApp */}
            <div className="py-3.5 border-b border-gray-100">
              <div className="flex items-center gap-3 px-1 -mx-1">
                <div className="w-9 h-9 rounded-full bg-[#dcfce7] flex items-center justify-center flex-shrink-0">
                  <MessageSquare className="w-4 h-4 text-[#25D366]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-gray-800">WhatsApp</p>
                  {profile.whatsappPhone ? (
                    <p className="text-xs text-green-600 font-medium">● Vinculado</p>
                  ) : waLinkCode ? (
                    <p className="text-xs text-gray-400 font-mono">VINCULAR {waLinkCode}</p>
                  ) : (
                    <p className="text-xs text-gray-400">No vinculado</p>
                  )}
                </div>
                {profile.whatsappPhone ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                ) : waLinkCode ? (
                  <button
                    onClick={copyWaCode}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors text-xs font-semibold text-gray-700"
                  >
                    {waCopied ? <><Check className="w-3.5 h-3.5 text-green-500" /> Copiado</> : <><Copy className="w-3.5 h-3.5" /> Copiar</>}
                  </button>
                ) : (
                  <button
                    onClick={generateWaLinkCode}
                    disabled={waLinking}
                    className="px-3 py-1.5 rounded-lg bg-[#25D366] hover:bg-[#128C7E] text-white text-xs font-bold transition-colors disabled:opacity-60"
                  >
                    {waLinking ? 'Generando...' : 'Vincular'}
                  </button>
                )}
              </div>
              {waLinkCode && !profile.whatsappPhone && (
                <p className="text-[11px] text-gray-400 mt-2 ml-12">
                  Envía ese texto a <span className="font-bold">+57 310 886 8970</span> en WhatsApp • Válido 10 min
                </p>
              )}
            </div>

            {/* Telegram */}
            <div className="py-3.5">
              <div className="flex items-center gap-3 px-1 -mx-1">
                <div className="w-9 h-9 rounded-full bg-[#e0f2fe] flex items-center justify-center flex-shrink-0">
                  <Send className="w-4 h-4 text-[#229ED9]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-gray-800">Telegram</p>
                  {profile.telegramChatId ? (
                    <p className="text-xs text-green-600 font-medium">● Vinculado</p>
                  ) : linkCode ? (
                    <p className="text-xs text-gray-400 font-mono">/vincular {linkCode}</p>
                  ) : (
                    <p className="text-xs text-gray-400">No vinculado</p>
                  )}
                </div>
                {profile.telegramChatId ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                ) : linkCode ? (
                  <button
                    onClick={copyCode}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors text-xs font-semibold text-gray-700"
                  >
                    {copied ? <><Check className="w-3.5 h-3.5 text-green-500" /> Copiado</> : <><Copy className="w-3.5 h-3.5" /> Copiar</>}
                  </button>
                ) : (
                  <button
                    onClick={generateLinkCode}
                    disabled={linking}
                    className="px-3 py-1.5 rounded-lg bg-[#229ED9] hover:bg-[#1a7fb5] text-white text-xs font-bold transition-colors disabled:opacity-60"
                  >
                    {linking ? 'Generando...' : 'Vincular'}
                  </button>
                )}
              </div>
              {linkCode && !profile.telegramChatId && (
                <p className="text-[11px] text-gray-400 mt-2 ml-12">
                  Envía ese comando a <span className="font-bold">@VozActivaBot</span> en Telegram • Válido 10 min
                </p>
              )}
            </div>
          </div>

          {/* Actividad de la cuenta */}
          <div className={card}>
            <h3 className="font-bold text-base text-gray-900 mb-3">Actividad de la cuenta</h3>
            <div className="space-y-0">
              {[
                {
                  icon: <Clock className="w-4 h-4 text-gray-400" />,
                  label: 'Último inicio de sesión',
                  value: lastLogin,
                  gold: false,
                },
                {
                  icon: <Smartphone className="w-4 h-4 text-gray-400" />,
                  label: 'Dispositivos activos',
                  value: '1 dispositivo',
                  gold: false,
                },
                {
                  icon: <IdCard className="w-4 h-4 text-gray-400" />,
                  label: 'Historial de actividad',
                  value: 'Ver actividad reciente',
                  gold: true,
                },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between py-4 border-b border-gray-100 last:border-0">
                  <div className="flex items-center gap-3">
                    {row.icon}
                    <span className="text-sm text-gray-600">{row.label}</span>
                  </div>
                  <span className={cn('text-sm font-semibold', row.gold ? 'text-[#B8860B] cursor-pointer hover:underline' : 'text-gray-700')}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Fila 4: Cerrar sesión ── */}
        <div className={cn(card, 'flex items-center justify-between')}>
          <div>
            <p className="font-bold text-red-600">Cerrar sesión</p>
            <p className="text-sm text-gray-400 mt-0.5">Sal de tu cuenta de Voz-Activa en este dispositivo</p>
          </div>
          <button
            onClick={() => signOut(auth)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 border-red-200 text-red-500 text-sm font-bold hover:bg-red-50 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Cerrar sesión
          </button>
        </div>

      </div>
    );
  }

  // ── Desktop edit modal ─────────────────────────────────────────────────────
  function renderEditModal() {
    if (!showDesktopEdit) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowDesktopEdit(false)} />
        <div className="relative bg-white rounded-2xl shadow-2xl p-7 w-full max-w-md animate-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-lg text-gray-900">Editar perfil</h3>
            <button onClick={() => setShowDesktopEdit(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
          <div className="space-y-4">
            {[
              { label: 'Nombre', key: 'firstName' as const, type: 'text' },
              { label: 'Apellido', key: 'lastName' as const, type: 'text' },
              { label: 'Teléfono', key: 'phone' as const, type: 'tel' },
              { label: 'Cédula', key: 'idNumber' as const, type: 'text' },
              { label: 'Fecha de nacimiento', key: 'birthDate' as const, type: 'date' },
            ].map((field) => (
              <div key={field.key}>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  {field.label}
                </label>
                <input
                  type={field.type}
                  value={(formData[field.key] as string) || ''}
                  onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#B8860B] focus:ring-2 focus:ring-[#B8860B]/10 focus:outline-none text-sm font-medium text-gray-800 transition-colors"
                />
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-6">
            <button
              onClick={() => setShowDesktopEdit(false)}
              className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[#B8860B] to-[#FFD700] text-black text-sm font-bold flex items-center justify-center gap-2 shadow hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</> : <><Save className="w-4 h-4" /> Guardar cambios</>}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Return ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Hidden file inputs (shared) */}
      {/* @ts-ignore — capture="user" is valid HTML */}
      <input ref={cameraInputRef} type="file" accept="image/*" capture="user" onChange={handlePhotoFileSelected} className="hidden" />
      <input ref={galleryInputRef} type="file" accept="image/*" onChange={handlePhotoFileSelected} className="hidden" />

      {/* ── Mobile layout ── */}
      <div className="md:hidden space-y-6 max-w-lg mx-auto">
        {/* Avatar section */}
        <div className="flex flex-col items-center py-6">
          <button onClick={() => setShowPhotoOptions(true)} className="relative group" aria-label="Cambiar foto de perfil">
            <div className="rounded-full overflow-hidden border-4 border-[#B8860B] shadow-xl w-32 h-32">
              <Avatar photoURL={profile.photoURL} firstName={profile.firstName} lastName={profile.lastName} size="lg" isDarkMode={isDarkMode} />
            </div>
            <div className="absolute bottom-0 right-0 w-9 h-9 rounded-full bg-[#B8860B] flex items-center justify-center shadow-lg border-2 border-[#FDFBF0] group-active:scale-90 transition-transform">
              <Camera className="w-4 h-4 text-black" />
            </div>
          </button>
          <h2 className="mt-4 text-2xl font-bold font-['Plus_Jakarta_Sans']">{profile.firstName} {profile.lastName}</h2>
          <p className={cn('text-sm opacity-60', isDarkMode ? 'text-[#FDFBF0]' : 'text-[#2e2f2d]')}>Vendedor Informal Verificado</p>
        </div>

        {/* Profile fields */}
        <div className={cn('rounded-2xl p-6 space-y-6 transition-colors duration-500', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white shadow-sm')}>
          <div className="space-y-4">
            <ProfileField icon={<User />} label="Nombres" value={formData.firstName} isEditing={isEditing} onChange={(v) => setFormData({ ...formData, firstName: v })} isDarkMode={isDarkMode} />
            <ProfileField icon={<User />} label="Apellidos" value={formData.lastName} isEditing={isEditing} onChange={(v) => setFormData({ ...formData, lastName: v })} isDarkMode={isDarkMode} />
            <ProfileField icon={<IdCard />} label="Identificación" value={formData.idNumber} isEditing={isEditing} onChange={(v) => setFormData({ ...formData, idNumber: v })} isDarkMode={isDarkMode} />
            <ProfileField icon={<Phone />} label="Teléfono" value={formData.phone} isEditing={isEditing} onChange={(v) => setFormData({ ...formData, phone: v })} isDarkMode={isDarkMode} />
            <ProfileField icon={<Calendar />} label="Fecha de Nacimiento" value={formData.birthDate} isEditing={isEditing} type="date" onChange={(v) => setFormData({ ...formData, birthDate: v })} isDarkMode={isDarkMode} />
            <ProfileField icon={<Mail />} label="Correo de acceso" value={emailDisplay} isEditing={false} isDarkMode={isDarkMode} isGenerated={!profile.email} />
          </div>
          <div className="pt-4 flex flex-col gap-3">
            {isEditing ? (
              <button onClick={handleSave} disabled={loading} className="w-full h-14 bg-gradient-to-r from-[#B8860B] to-[#FFD700] text-black rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all disabled:opacity-50">
                <Save className="w-5 h-5" />
                {loading ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            ) : (
              <button onClick={() => setIsEditing(true)} className={cn('w-full h-14 rounded-xl font-bold flex items-center justify-center gap-2 border-2 transition-all active:scale-95', isDarkMode ? 'border-[#B8860B] text-[#B8860B] hover:bg-[#B8860B]/10' : 'border-[#B8860B] text-[#B8860B] hover:bg-[#B8860B]/5')}>
                <Edit2 className="w-5 h-5" />
                Editar Perfil
              </button>
            )}
            <button onClick={() => signOut(auth)} className="w-full h-14 flex items-center justify-center gap-2 text-red-500 font-bold hover:bg-red-500/10 rounded-xl transition-colors">
              <LogOut className="w-5 h-5" />
              Cerrar Sesión
            </button>
          </div>
        </div>

        {/* Canales (mobile) */}
        <div className="space-y-2">
          <p className={cn('text-[10px] uppercase tracking-widest font-black px-1 opacity-40', isDarkMode ? 'text-white' : 'text-black')}>Canales de registro</p>

          {/* WhatsApp */}
          {profile.whatsappPhone ? (
            <div className={cn('flex items-center gap-4 p-4 rounded-2xl', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white shadow-sm')}>
              <div className="w-11 h-11 rounded-2xl bg-[#25D366] flex items-center justify-center flex-shrink-0"><MessageSquare className="w-5 h-5 text-white" /></div>
              <div className="flex-1 min-w-0"><p className="font-black text-sm">WhatsApp</p><p className="text-[11px] text-green-500 font-bold">● Vinculado — ya puedes registrar desde WhatsApp</p></div>
              <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
            </div>
          ) : waLinkCode ? (
            <div className="rounded-2xl overflow-hidden shadow-lg">
              <div className="bg-gradient-to-br from-[#25D366] to-[#128C7E] p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0"><MessageSquare className="w-5 h-5 text-white" /></div>
                  <div><p className="font-black text-white text-sm">¡Código listo!</p><p className="text-white/80 text-[11px] font-medium">Sigue estos pasos para terminar:</p></div>
                </div>
                <div className="space-y-2 mb-4">
                  {['Abre WhatsApp en tu celular','Busca el contacto de Voz-Activa','Copia el código de abajo y envíalo tal cual','¡Listo! Ya puedes registrar tus ventas por WhatsApp'].map((step, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <div className="w-5 h-5 rounded-full bg-white/30 flex items-center justify-center flex-shrink-0 mt-0.5"><span className="text-[10px] font-black text-white">{i + 1}</span></div>
                      <p className="text-white/90 text-xs font-medium leading-snug">{step}</p>
                    </div>
                  ))}
                </div>
                <button onClick={copyWaCode} className="w-full flex items-center justify-between px-4 py-3 rounded-xl font-mono text-sm font-bold bg-white/15 border border-white/30 text-white transition-all active:scale-95 mb-1">
                  <span>VINCULAR {waLinkCode}</span>
                  {waCopied ? <Check className="w-4 h-4 text-green-300" /> : <Copy className="w-4 h-4 opacity-70" />}
                </button>
                <p className="text-white/50 text-[10px] text-center font-medium">Código válido 10 minutos · Toca para copiar</p>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl overflow-hidden shadow-lg">
              <div className="bg-gradient-to-br from-[#25D366] to-[#128C7E] p-5">
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0"><MessageSquare className="w-7 h-7 text-white" /></div>
                  <div className="flex-1 min-w-0"><p className="font-black text-white text-base leading-tight">Registra desde WhatsApp</p><p className="text-white/80 text-xs font-medium mt-1 leading-snug">Escribe <i>"vendí 3 almuerzos a 12 mil"</i> por WhatsApp y lo anotamos al instante.</p></div>
                </div>
                <div className="space-y-2 mb-4">
                  {[
                    { text: 'Toca el botón de abajo para generar tu código' },
                    { text: 'Cópialo y envíalo a ', link: { href: 'https://wa.me/573108868970', label: 'este número' }, after: ' — agrégalo como Voz Activa Bot o como prefieras' },
                    { text: '¡Listo! Ya puedes registrar ventas y gastos por chat' },
                  ].map((step, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <div className="w-5 h-5 rounded-full bg-white/30 flex items-center justify-center flex-shrink-0 mt-0.5"><span className="text-[10px] font-black text-white">{i + 1}</span></div>
                      <p className="text-white/90 text-xs font-medium leading-snug">
                        {step.text}
                        {'link' in step && step.link && (<><a href={step.link.href} target="_blank" rel="noopener noreferrer" className="underline font-black text-white">{step.link.label}</a>{step.after}</>)}
                      </p>
                    </div>
                  ))}
                </div>
                <button onClick={generateWaLinkCode} disabled={waLinking} className="w-full h-11 bg-white text-[#128C7E] rounded-xl font-black text-sm flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-60 shadow-md">
                  <MessageSquare className="w-4 h-4" />
                  {waLinking ? 'Generando código...' : 'Vincular con WhatsApp'}
                </button>
              </div>
              <div className={cn('px-5 py-3 flex items-center gap-2', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-[#f0fdf4]')}>
                <div className="w-1.5 h-1.5 rounded-full bg-[#25D366]" />
                <p className={cn('text-[10px] font-bold', isDarkMode ? 'text-white/40' : 'text-[#25D366]/70')}>Gratis · Sin instalar nada extra · Funciona en Colombia</p>
              </div>
            </div>
          )}

          {/* Telegram */}
          {profile.telegramChatId ? (
            <div className={cn('flex items-center gap-4 p-4 rounded-2xl', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white shadow-sm')}>
              <div className="w-11 h-11 rounded-2xl bg-[#229ED9] flex items-center justify-center flex-shrink-0"><Send className="w-5 h-5 text-white" /></div>
              <div className="flex-1 min-w-0"><p className="font-black text-sm">Telegram</p><p className="text-[11px] text-green-500 font-bold">● Vinculado — ya puedes registrar desde Telegram</p></div>
              <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
            </div>
          ) : linkCode ? (
            <div className="rounded-2xl overflow-hidden shadow-lg">
              <div className="bg-gradient-to-br from-[#229ED9] to-[#1a7fb5] p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0"><Send className="w-5 h-5 text-white" /></div>
                  <div><p className="font-black text-white text-sm">¡Código listo!</p><p className="text-white/80 text-[11px] font-medium">Sigue estos pasos para terminar:</p></div>
                </div>
                <div className="space-y-2 mb-4">
                  {['Abre Telegram en tu celular','Busca el bot @VozActivaBot','Copia el código de abajo y envíalo tal cual','¡Listo! Ya puedes registrar tus ventas por Telegram'].map((step, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <div className="w-5 h-5 rounded-full bg-white/30 flex items-center justify-center flex-shrink-0 mt-0.5"><span className="text-[10px] font-black text-white">{i + 1}</span></div>
                      <p className="text-white/90 text-xs font-medium leading-snug">{step}</p>
                    </div>
                  ))}
                </div>
                <button onClick={copyCode} className="w-full flex items-center justify-between px-4 py-3 rounded-xl font-mono text-sm font-bold bg-white/15 border border-white/30 text-white transition-all active:scale-95 mb-1">
                  <span>/vincular {linkCode}</span>
                  {copied ? <Check className="w-4 h-4 text-green-300" /> : <Copy className="w-4 h-4 opacity-70" />}
                </button>
                <p className="text-white/50 text-[10px] text-center font-medium">Código válido 10 minutos · Toca para copiar</p>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl overflow-hidden shadow-lg">
              <div className="bg-gradient-to-br from-[#229ED9] to-[#1a7fb5] p-5">
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0"><Send className="w-7 h-7 text-white" /></div>
                  <div className="flex-1 min-w-0"><p className="font-black text-white text-base leading-tight">Registra desde Telegram</p><p className="text-white/80 text-xs font-medium mt-1 leading-snug">Escribe <i>"vendí 3 almuerzos a 12 mil"</i> en Telegram y lo anotamos al instante.</p></div>
                </div>
                <div className="space-y-2 mb-4">
                  {['Toca el botón de abajo para generar tu código','Abre Telegram y busca @VozActivaBot','Envía el código y ya quedas vinculado'].map((step, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <div className="w-5 h-5 rounded-full bg-white/30 flex items-center justify-center flex-shrink-0 mt-0.5"><span className="text-[10px] font-black text-white">{i + 1}</span></div>
                      <p className="text-white/90 text-xs font-medium leading-snug">{step}</p>
                    </div>
                  ))}
                </div>
                <button onClick={generateLinkCode} disabled={linking} className="w-full h-11 bg-white text-[#1a7fb5] rounded-xl font-black text-sm flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-60 shadow-md">
                  <Send className="w-4 h-4" />
                  {linking ? 'Generando código...' : 'Vincular con Telegram'}
                </button>
              </div>
              <div className={cn('px-5 py-3 flex items-center gap-2', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-[#f1f8fd]')}>
                <div className="w-1.5 h-1.5 rounded-full bg-[#229ED9]" />
                <p className={cn('text-[10px] font-bold', isDarkMode ? 'text-white/40' : 'text-[#229ED9]/70')}>Gratis · Sin instalar nada extra · Funciona en Colombia</p>
              </div>
            </div>
          )}
        </div>

        {/* PQRS */}
        <button onClick={() => setShowSuggestions(true)} className={cn('w-full flex items-center gap-4 p-4 rounded-2xl transition-all active:scale-[0.98]', isDarkMode ? 'bg-[#1A1A1A] hover:bg-[#222]' : 'bg-white shadow-sm hover:shadow-md')}>
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#B8860B] to-[#FFD700] flex items-center justify-center flex-shrink-0 shadow-md"><MessageSquare className="w-5 h-5 text-black" /></div>
          <div className="flex-1 text-left"><p className="font-black text-sm">PQRS · Contáctanos</p><p className={cn('text-[11px] font-medium', isDarkMode ? 'text-white/40' : 'text-black/40')}>Sugerencias, felicitaciones, quejas o reclamos</p></div>
          <ChevronRight className={cn('w-4 h-4 flex-shrink-0', isDarkMode ? 'text-white/20' : 'text-black/20')} />
        </button>
      </div>

      {/* ── Desktop layout ── */}
      <div className="hidden md:block">
        {renderDesktop()}
        {renderEditModal()}
      </div>

      {/* Shared modals */}
      {showSuggestions && (
        <SuggestionsModal isDarkMode={isDarkMode} fromName={`${profile.firstName} ${profile.lastName}`.trim()} onClose={() => setShowSuggestions(false)} />
      )}

      {showPhotoOptions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowPhotoOptions(false)} />
          <div className={cn('relative w-full max-w-xs rounded-3xl p-6 space-y-3 animate-in zoom-in-95 duration-300', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white')}>
            <div className="flex items-center justify-between mb-2">
              <p className="font-black text-[#B8860B] text-sm uppercase tracking-widest">Foto de perfil</p>
              <button onClick={() => setShowPhotoOptions(false)} className={cn('w-8 h-8 rounded-full flex items-center justify-center', isDarkMode ? 'bg-white/10' : 'bg-black/5')}><X className="w-4 h-4" /></button>
            </div>
            <button onClick={() => cameraInputRef.current?.click()} className={cn('w-full flex items-center gap-4 p-4 rounded-2xl font-bold text-sm transition-all active:scale-[0.98]', isDarkMode ? 'bg-[#2A2A2A] hover:bg-[#333]' : 'bg-[#FDFBF0] hover:bg-[#f1f1ee]')}>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#B8860B] to-[#FFD700] flex items-center justify-center flex-shrink-0"><Camera className="w-5 h-5 text-black" /></div>
              <span>Tomar foto</span>
            </button>
            <button onClick={() => galleryInputRef.current?.click()} className={cn('w-full flex items-center gap-4 p-4 rounded-2xl font-bold text-sm transition-all active:scale-[0.98]', isDarkMode ? 'bg-[#2A2A2A] hover:bg-[#333]' : 'bg-[#FDFBF0] hover:bg-[#f1f1ee]')}>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#B8860B] to-[#FFD700] flex items-center justify-center flex-shrink-0"><ImagePlus className="w-5 h-5 text-black" /></div>
              <span>Elegir de galería</span>
            </button>
          </div>
        </div>
      )}

      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleCancelPhoto} />
          <div className={cn('relative w-full max-w-xs rounded-3xl p-6 space-y-5 text-center animate-in zoom-in-95 duration-300', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white')}>
            <p className="font-black text-[#B8860B] text-sm uppercase tracking-widest">Vista previa</p>
            <div className="flex justify-center">
              <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-[#B8860B] shadow-xl">
                <img src={previewUrl} alt="Vista previa" className="w-full h-full object-cover" />
              </div>
            </div>
            <p className={cn('text-xs font-medium', isDarkMode ? 'text-white/40' : 'text-black/40')}>¿Se ve bien? Confirma para guardar.</p>
            <div className="flex gap-3">
              <button onClick={handleCancelPhoto} disabled={uploadingPhoto} className={cn('flex-1 h-12 rounded-xl font-bold text-sm border-2 transition-all active:scale-95', isDarkMode ? 'border-white/15 text-white/60' : 'border-black/15 text-black/60')}>Cancelar</button>
              <button onClick={handleConfirmPhoto} disabled={uploadingPhoto} className="flex-1 h-12 rounded-xl font-black text-sm bg-gradient-to-r from-[#B8860B] to-[#FFD700] text-black shadow-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-60">
                {uploadingPhoto ? <><Loader2 className="w-4 h-4 animate-spin" /> Subiendo...</> : <><Check className="w-4 h-4" /> Confirmar</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {photoToast && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-3 duration-300">
          <div className={cn('flex items-center gap-2 px-5 py-3 rounded-2xl shadow-2xl font-black text-sm whitespace-nowrap', isDarkMode ? 'bg-[#1A1A1A] text-[#FFD700] border border-[#B8860B]/30' : 'bg-white text-[#B8860B] border border-[#DAA520]/20')}>
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            {photoToast}
          </div>
        </div>
      )}
    </>
  );
};

// ─── ProfileField ─────────────────────────────────────────────────────────────

const ProfileField = ({
  icon,
  label,
  value,
  isEditing,
  onChange,
  type = 'text',
  isDarkMode,
  isGenerated = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  isEditing: boolean;
  onChange?: (v: string) => void;
  type?: string;
  isDarkMode: boolean;
  isGenerated?: boolean;
}) => (
  <div className="flex items-start gap-4">
    <div className={cn('w-10 h-10 rounded-full flex items-center justify-center transition-colors flex-shrink-0 mt-0.5', isDarkMode ? 'bg-[#2A2A2A] text-[#B8860B]' : 'bg-[#f1f1ee] text-[#B8860B]')}>
      {React.cloneElement(icon as React.ReactElement, { className: 'w-5 h-5' })}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-[10px] uppercase tracking-widest opacity-50 font-bold">{label}</p>
      {isEditing && onChange ? (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className={cn('w-full bg-transparent border-b border-[#B8860B] focus:outline-none py-1 font-medium', isDarkMode ? 'text-[#FDFBF0]' : 'text-[#2e2f2d]')} />
      ) : (
        <>
          <p className={cn('font-bold text-lg break-all', isGenerated ? 'text-[#B8860B]' : '')}>{value}</p>
          {isGenerated && <p className={cn('text-[10px] font-bold mt-0.5', isDarkMode ? 'text-white/30' : 'text-black/30')}>Generado automáticamente con tu cédula</p>}
        </>
      )}
    </div>
  </div>
);
