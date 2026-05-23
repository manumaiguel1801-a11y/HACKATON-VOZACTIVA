import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Mail,
  Lock,
  User,
  Phone,
  IdCard,
  Calendar,
  ArrowRight,
  ChevronLeft,
  Copy,
  CheckCircle2,
  X,
  AlertCircle,
  Eye,
  EyeOff
} from 'lucide-react';
import { cn } from '../lib/utils';
import { auth, db } from '../firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

interface AuthProps {
  isDarkMode: boolean;
}

function mensajeError(codigo: string): string {
  const errores: Record<string, string> = {
    'auth/wrong-password': '¡Uy! La contraseña no es correcta. ¿La olvidaste?',
    'auth/invalid-credential': '¡Uy! El correo o la contraseña no son correctos.',
    'auth/user-not-found': 'No encontramos una cuenta con ese correo. ¿Ya te registraste?',
    'auth/email-already-in-use': 'Ese correo ya tiene una cuenta. Intenta iniciar sesión.',
    'auth/weak-password': 'La contraseña debe tener mínimo 6 caracteres.',
    'auth/invalid-email': 'Ese correo no parece válido. Revísalo.',
    'auth/too-many-requests': 'Demasiados intentos. Espera un momento y vuelve a intentarlo.',
    'auth/network-request-failed': 'Sin conexión a internet. Verifica tu red.',
    'auth/user-disabled': 'Esta cuenta fue desactivada. Contacta soporte.',
    'auth/operation-not-allowed': 'Este método de acceso no está habilitado.',
    'auth/popup-closed-by-user': 'Cerraste la ventana antes de terminar. Intenta de nuevo.',
  };
  return errores[codigo] ?? 'Ocurrió un error inesperado. Intenta de nuevo.';
}

export const Auth = ({ isDarkMode }: AuthProps) => {
  const [isLogin, setIsLogin] = useState(true);
  const [noEmail, setNoEmail] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [generatedEmail, setGeneratedEmail] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');

  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!isLogin) {
      const reqs = getPasswordRequirements(password);
      if (!reqs.every(r => r.met)) {
        setError('La contraseña no cumple todos los requisitos de seguridad.');
        setLoading(false);
        return;
      }
      if (password !== confirmPassword) {
        setError('Las contraseñas no coinciden. Verifica e intenta de nuevo.');
        setLoading(false);
        return;
      }
    }

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const finalEmail = noEmail ? `${idNumber}@vozactiva.com` : email;

        const userCredential = await createUserWithEmailAndPassword(auth, finalEmail, password);
        const user = userCredential.user;

        await setDoc(doc(db, 'users', user.uid), {
          firstName,
          lastName,
          idNumber,
          phone,
          birthDate,
          email: noEmail ? null : email,
          createdAt: serverTimestamp()
        });

        if (noEmail) {
          setGeneratedEmail(finalEmail);
          setLoading(false);
          return;
        }
      }
    } catch (err: any) {
      setError(mensajeError(err.code ?? ''));
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!generatedEmail) return;
    navigator.clipboard.writeText(generatedEmail).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
    {/* Generated-email popup for manual registration */}
    <AnimatePresence>
      {generatedEmail && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <motion.div
            className={cn(
              'relative w-full max-w-sm rounded-2xl shadow-2xl z-10 overflow-hidden',
              isDarkMode ? 'bg-[#1A1A1A] text-[#FDFBF0]' : 'bg-white text-[#0D0D0D]'
            )}
            initial={{ opacity: 0, scale: 0.88, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.88, y: 24 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          >
            {/* Gold top bar */}
            <div className="h-1.5 w-full bg-gradient-to-r from-[#B8860B] to-[#FFD700]" />

            <div className="px-6 pt-6 pb-7 space-y-5">
              {/* Icon + title */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-[#B8860B]/15 flex items-center justify-center">
                    <Mail className="w-5 h-5 text-[#B8860B]" />
                  </div>
                  <div>
                    <h2 className="font-black text-lg leading-tight">¡Cuenta creada!</h2>
                    <p className="text-[11px] font-bold uppercase tracking-widest opacity-40">Tu correo de acceso</p>
                  </div>
                </div>
              </div>

              {/* Explanation */}
              <p className={cn('text-sm font-medium leading-relaxed', isDarkMode ? 'text-white/70' : 'text-black/60')}>
                Como te registraste sin correo, generamos uno automáticamente con tu número de cédula. Úsalo para iniciar sesión en el futuro:
              </p>

              {/* Email pill */}
              <button
                onClick={handleCopy}
                className={cn(
                  'w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl transition-all active:scale-[0.98]',
                  isDarkMode ? 'bg-[#2A2A2A]' : 'bg-[#f4f4f0]'
                )}
              >
                <span className="font-black text-[#B8860B] text-sm truncate">{generatedEmail}</span>
                {copied
                  ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                  : <Copy className="w-4 h-4 opacity-40 flex-shrink-0" />}
              </button>

              <p className={cn('text-[11px] font-medium text-center', isDarkMode ? 'text-white/30' : 'text-black/30')}>
                Toca el correo para copiarlo. También lo encontrarás en tu perfil.
              </p>

              {/* CTA */}
              <button
                onClick={() => setGeneratedEmail(null)}
                className="w-full h-13 py-3.5 rounded-xl font-black text-base bg-gradient-to-r from-[#B8860B] to-[#FFD700] text-black shadow-lg active:scale-[0.98] transition-all"
              >
                Entendido, ¡vamos!
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

    <div className={cn(
      "min-h-screen flex flex-col px-6 py-12 transition-colors duration-500",
      isDarkMode ? "bg-[#0D0D0D] text-[#FDFBF0]" : "bg-[#FDFBF0] text-[#2e2f2d]"
    )}>
      <div className="max-w-md mx-auto w-full flex-1 flex flex-col">
        {/* Logo/Header */}
        <div className="mb-12 text-center">
          <img
            src="/logoapp.png"
            alt="Voz-Activa"
            className="w-36 h-36 mx-auto mb-6 object-contain"
          />
          <h1 className="text-4xl font-black font-['Plus_Jakarta_Sans'] text-[#B8860B] tracking-tight">
            Voz-Activa
          </h1>
          <p className="opacity-60 mt-2 font-medium">Inclusión financiera para todos</p>
        </div>

        {/* Form */}
        <form onSubmit={handleAuth} className="space-y-5 flex-1">
          <h2 className="text-2xl font-bold mb-6">
            {isLogin ? 'Iniciar Sesión' : 'Crear Cuenta'}
          </h2>

          {!isLogin && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="grid grid-cols-2 gap-4">
                <Input 
                  icon={<User />} 
                  placeholder="Nombres" 
                  value={firstName} 
                  onChange={setFirstName} 
                  isDarkMode={isDarkMode}
                  required
                />
                <Input 
                  icon={<User />} 
                  placeholder="Apellidos" 
                  value={lastName} 
                  onChange={setLastName} 
                  isDarkMode={isDarkMode}
                  required
                />
              </div>
              <Input 
                icon={<IdCard />} 
                placeholder="Número de Identificación" 
                value={idNumber} 
                onChange={setIdNumber} 
                isDarkMode={isDarkMode}
                required
              />
              <Input 
                icon={<Phone />} 
                placeholder="Teléfono" 
                value={phone} 
                onChange={setPhone} 
                isDarkMode={isDarkMode}
                required
              />
              <div className="space-y-1.5">
                <p className={cn('text-xs font-semibold px-1', isDarkMode ? 'text-white/40' : 'text-black/40')}>
                  Fecha de nacimiento
                </p>
                <Input
                  icon={<Calendar />}
                  placeholder="Fecha de Nacimiento"
                  type="date"
                  value={birthDate}
                  onChange={setBirthDate}
                  isDarkMode={isDarkMode}
                  required
                />
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <Input
                icon={<Mail />}
                placeholder="Correo Electrónico"
                type="email"
                value={email}
                onChange={setEmail}
                isDarkMode={isDarkMode}
                required={!noEmail}
                disabled={noEmail}
              />
              {!isLogin && (
                <label className="flex items-center gap-2.5 px-1 cursor-pointer select-none w-fit">
                  <div
                    onClick={() => { setNoEmail(v => !v); setEmail(''); }}
                    className={cn(
                      'w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all flex-shrink-0',
                      noEmail
                        ? 'bg-[#B8860B] border-[#B8860B]'
                        : isDarkMode ? 'border-white/30 bg-transparent' : 'border-black/20 bg-white'
                    )}
                  >
                    {noEmail && <X className="w-3 h-3 text-black" strokeWidth={3} />}
                  </div>
                  <span className={cn('text-xs font-medium', isDarkMode ? 'text-white/60' : 'text-black/50')}>
                    No tengo correo electrónico
                  </span>
                </label>
              )}
            </div>
            <Input
              icon={<Lock />}
              placeholder="Contraseña"
              type="password"
              value={password}
              onChange={setPassword}
              isDarkMode={isDarkMode}
              required
              showToggle
              showValue={showPassword}
              onToggle={() => setShowPassword(v => !v)}
            />
            {!isLogin && password.length > 0 && (
              <PasswordRequirements password={password} isDarkMode={isDarkMode} />
            )}
            {!isLogin && (
              <Input
                icon={<Lock />}
                placeholder="Confirmar Contraseña"
                type="password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                isDarkMode={isDarkMode}
                required
                showToggle
                showValue={showConfirmPassword}
                onToggle={() => setShowConfirmPassword(v => !v)}
              />
            )}
          </div>

          {error && (
            <div className="flex items-start gap-3 bg-[#FEE2E2] text-[#991B1B] px-4 py-3 rounded-xl">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <p className="text-sm font-medium leading-snug">{error}</p>
            </div>
          )}

          <button 
            type="submit"
            disabled={loading}
            className="w-full h-16 bg-gradient-to-r from-[#B8860B] to-[#FFD700] text-black rounded-2xl font-bold text-lg flex items-center justify-center gap-3 shadow-xl active:scale-[0.98] transition-all disabled:opacity-50 mt-8"
          >
            {loading ? 'Procesando...' : (isLogin ? 'Entrar' : 'Registrarse')}
            {!loading && <ArrowRight className="w-5 h-5" />}
          </button>
        </form>

        {/* Footer Links */}
        <div className="mt-8 space-y-4 text-center">
          {isLogin ? (
            <>
              <p className="opacity-60 font-medium">¿No tienes cuenta?</p>
              <button
                onClick={() => { setIsLogin(false); setNoEmail(false); setConfirmPassword(''); setShowPassword(false); setShowConfirmPassword(false); }}
                className="text-[#B8860B] font-bold hover:underline"
              >
                Crear Cuenta
              </button>
            </>
          ) : (
            <button
              onClick={() => { setIsLogin(true); setConfirmPassword(''); setShowPassword(false); setShowConfirmPassword(false); }}
              className="flex items-center justify-center gap-2 text-[#B8860B] font-bold mx-auto hover:underline"
            >
              <ChevronLeft className="w-5 h-5" />
              Volver al Inicio de Sesión
            </button>
          )}
        </div>
      </div>
    </div>
    </>
  );
};

type PasswordReq = { label: string; met: boolean };

function getPasswordRequirements(password: string): PasswordReq[] {
  return [
    { label: 'Mínimo 8 caracteres',         met: password.length >= 8 },
    { label: 'Al menos 1 letra mayúscula',   met: /[A-Z]/.test(password) },
    { label: 'Al menos 1 letra minúscula',   met: /[a-z]/.test(password) },
    { label: 'Al menos 1 número',            met: /[0-9]/.test(password) },
    { label: 'Al menos 1 carácter especial', met: /[^A-Za-z0-9]/.test(password) },
  ];
}

function getStrength(reqs: PasswordReq[]): { level: number; label: string; color: string } {
  const met = reqs.filter(r => r.met).length;
  if (met <= 1) return { level: 1, label: 'Muy débil',  color: '#ef4444' };
  if (met === 2) return { level: 2, label: 'Débil',     color: '#f97316' };
  if (met === 3) return { level: 3, label: 'Regular',   color: '#eab308' };
  if (met === 4) return { level: 4, label: 'Fuerte',    color: '#22c55e' };
  return              { level: 5, label: '¡Excelente!', color: '#16a34a' };
}

const PasswordRequirements = ({ password, isDarkMode }: { password: string; isDarkMode: boolean }) => {
  const reqs = getPasswordRequirements(password);
  const strength = getStrength(reqs);
  const segments = 5;

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'rounded-xl px-4 py-3.5 space-y-3',
        isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white shadow-sm'
      )}
    >
      {/* Barra de fuerza */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <span className={cn('text-[11px] font-semibold uppercase tracking-wider', isDarkMode ? 'text-white/40' : 'text-black/40')}>
            Seguridad
          </span>
          <span className="text-[11px] font-bold" style={{ color: strength.color }}>
            {strength.label}
          </span>
        </div>
        <div className="flex gap-1">
          {Array.from({ length: segments }).map((_, i) => (
            <div
              key={i}
              className="h-1.5 flex-1 rounded-full transition-all duration-300"
              style={{
                backgroundColor: i < strength.level ? strength.color : isDarkMode ? '#333' : '#e5e7eb',
              }}
            />
          ))}
        </div>
      </div>

      {/* Checklist */}
      <ul className="space-y-1.5">
        {reqs.map((req) => (
          <li key={req.label} className="flex items-center gap-2">
            <div className={cn(
              'w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300',
              req.met ? 'bg-green-500' : isDarkMode ? 'bg-white/10' : 'bg-black/8'
            )}>
              {req.met
                ? <CheckCircle2 className="w-3 h-3 text-white" />
                : <X className="w-2.5 h-2.5 text-red-400" strokeWidth={3} />}
            </div>
            <span className={cn(
              'text-xs font-medium transition-colors duration-300',
              req.met
                ? 'text-green-500'
                : isDarkMode ? 'text-white/50' : 'text-black/50'
            )}>
              {req.label}
            </span>
          </li>
        ))}
      </ul>
    </motion.div>
  );
};

const Input = ({
  icon,
  placeholder,
  value,
  onChange,
  type = "text",
  isDarkMode,
  required = false,
  disabled = false,
  showToggle = false,
  showValue = false,
  onToggle,
}: {
  icon: React.ReactNode,
  placeholder: string,
  value: string,
  onChange: (v: string) => void,
  type?: string,
  isDarkMode: boolean,
  required?: boolean,
  disabled?: boolean,
  showToggle?: boolean,
  showValue?: boolean,
  onToggle?: () => void,
}) => (
  <div className={cn(
    "relative flex items-center h-14 rounded-xl transition-all duration-300",
    isDarkMode ? "bg-[#1A1A1A]" : "bg-white shadow-sm",
    disabled && "opacity-40"
  )}>
    <div className="pl-4 text-[#B8860B]">
      {React.cloneElement(icon as React.ReactElement, { className: "w-5 h-5" })}
    </div>
    <input
      type={showToggle ? (showValue ? "text" : "password") : type}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      disabled={disabled}
      className={cn(
        "flex-1 bg-transparent border-none outline-none focus:ring-0 px-4 font-medium",
        isDarkMode ? "text-[#FDFBF0] placeholder:text-[#FDFBF0]/30" : "text-[#2e2f2d] placeholder:text-[#5b5c5a]/50"
      )}
    />
    {showToggle && (
      <button
        type="button"
        onClick={onToggle}
        className="pr-4 text-[#B8860B]/50 hover:text-[#B8860B] transition-colors"
        tabIndex={-1}
      >
        {showValue
          ? <EyeOff className="w-5 h-5" />
          : <Eye className="w-5 h-5" />}
      </button>
    )}
  </div>
);
