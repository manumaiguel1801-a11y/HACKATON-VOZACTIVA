import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import emailjs from '@emailjs/browser';
import { X, Send, CheckCircle2, Lightbulb, Star, Frown, ClipboardList } from 'lucide-react';
import { cn } from '../lib/utils';

// EmailJS credentials (public keys — safe for client-side use)
const EMAILJS_SERVICE_ID  = 'service_p86nwbu';
const EMAILJS_TEMPLATE_ID = 'template_210j03u';
const EMAILJS_PUBLIC_KEY  = 'g_NCNr3wr9cwKRT5a';

type PQRSType = 'Sugerencia' | 'Felicitación' | 'Queja' | 'Reclamo';

const TYPES: { value: PQRSType; emoji: React.ReactNode; color: string; bg: string; bgDark: string }[] = [
  {
    value: 'Sugerencia',
    emoji: <Lightbulb className="w-4 h-4" />,
    color: 'text-amber-500',
    bg: 'bg-amber-50 border-amber-200',
    bgDark: 'bg-amber-500/10 border-amber-500/20',
  },
  {
    value: 'Felicitación',
    emoji: <Star className="w-4 h-4" />,
    color: 'text-[#B8860B]',
    bg: 'bg-[#FFF8DC] border-[#DAA520]/30',
    bgDark: 'bg-[#B8860B]/10 border-[#B8860B]/20',
  },
  {
    value: 'Queja',
    emoji: <Frown className="w-4 h-4" />,
    color: 'text-red-500',
    bg: 'bg-red-50 border-red-200',
    bgDark: 'bg-red-500/10 border-red-500/20',
  },
  {
    value: 'Reclamo',
    emoji: <ClipboardList className="w-4 h-4" />,
    color: 'text-orange-500',
    bg: 'bg-orange-50 border-orange-200',
    bgDark: 'bg-orange-500/10 border-orange-500/20',
  },
];

interface Props {
  isDarkMode: boolean;
  fromName?: string;
  onClose: () => void;
}

export const SuggestionsModal = ({ isDarkMode, fromName = '', onClose }: Props) => {
  const [type, setType] = useState<PQRSType>('Sugerencia');
  const [name, setName] = useState(fromName);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const isValid = message.trim().length > 10;

  const handleSend = async () => {
    if (!isValid || sending) return;
    setError('');
    setSending(true);
    try {
      await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        {
          from_name: name.trim() || 'Anónimo',
          type,
          message: message.trim(),
        },
        EMAILJS_PUBLIC_KEY
      );
      setSent(true);
      setTimeout(onClose, 2200);
    } catch (e) {
      console.error(e);
      setError('No se pudo enviar. Verifica tu conexión e intenta de nuevo.');
      setSending(false);
    }
  };

  const selectedType = TYPES.find((t) => t.value === type)!;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={!sending ? onClose : undefined}
        />

        <motion.div
          className={cn(
            'relative w-full max-w-sm rounded-2xl shadow-2xl z-10 overflow-hidden flex flex-col',
            isDarkMode ? 'bg-[#1A1A1A] text-[#FDFBF0]' : 'bg-white text-[#0D0D0D]'
          )}
          initial={{ opacity: 0, scale: 0.88, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.88, y: 24 }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        >
          {/* Gold top accent */}
          <div className="h-1 w-full bg-gradient-to-r from-[#B8860B] to-[#FFD700]" />

          <AnimatePresence mode="wait">
            {sent ? (
              /* ── Success state ── */
              <motion.div
                key="success"
                className="flex flex-col items-center justify-center py-12 px-6 gap-4"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', damping: 20, stiffness: 300 }}
              >
                <div className="w-20 h-20 rounded-full bg-green-500/15 flex items-center justify-center">
                  <CheckCircle2 className="w-10 h-10 text-green-500" />
                </div>
                <h3 className="text-xl font-black text-center">¡Mensaje enviado!</h3>
                <p className={cn('text-sm font-medium text-center leading-relaxed', isDarkMode ? 'text-white/50' : 'text-black/50')}>
                  Gracias por tu {type.toLowerCase()}. La leeremos con mucho cuidado.
                </p>
              </motion.div>
            ) : (
              /* ── Form state ── */
              <motion.div key="form" initial={{ opacity: 1 }}>
                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-5 pb-4">
                  <div>
                    <h2 className="font-black text-lg leading-tight">PQRS</h2>
                    <p className={cn('text-[11px] font-bold uppercase tracking-widest', isDarkMode ? 'text-white/30' : 'text-black/30')}>
                      Buzón de sugerencias
                    </p>
                  </div>
                  <button
                    onClick={onClose}
                    className={cn('w-9 h-9 rounded-full flex items-center justify-center', isDarkMode ? 'bg-white/10' : 'bg-black/5')}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="px-5 pb-5 space-y-4">
                  {/* Type selector */}
                  <div className="grid grid-cols-4 gap-2">
                    {TYPES.map((t) => (
                      <button
                        key={t.value}
                        onClick={() => setType(t.value)}
                        className={cn(
                          'flex flex-col items-center gap-1.5 py-2.5 px-1 rounded-xl transition-all text-center',
                          type === t.value
                            ? cn(isDarkMode ? t.bgDark : t.bg, 'border', t.color)
                            : isDarkMode ? 'bg-[#2A2A2A] text-white/40' : 'bg-[#f4f4f0] text-black/40'
                        )}
                      >
                        {t.emoji}
                        <span className="text-[9px] font-black leading-tight">{t.value}</span>
                      </button>
                    ))}
                  </div>

                  {/* Name field */}
                  <div>
                    <label className={cn('text-[10px] font-black uppercase tracking-widest mb-1.5 block', isDarkMode ? 'text-white/30' : 'text-black/30')}>
                      Tu nombre (opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="¿Cómo te llamamos?"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={cn(
                        'w-full h-11 px-4 rounded-xl text-sm font-medium outline-none border-0',
                        isDarkMode ? 'bg-[#2A2A2A] text-[#FDFBF0] placeholder:text-white/20' : 'bg-[#f4f4f0] placeholder:text-black/25'
                      )}
                    />
                  </div>

                  {/* Message field */}
                  <div>
                    <label className={cn('text-[10px] font-black uppercase tracking-widest mb-1.5 block', isDarkMode ? 'text-white/30' : 'text-black/30')}>
                      Tu mensaje *
                    </label>
                    <textarea
                      placeholder={
                        type === 'Sugerencia' ? 'Cuéntanos tu idea para mejorar Voz Activa...' :
                        type === 'Felicitación' ? 'Comparte lo que más te ha gustado...' :
                        type === 'Queja' ? 'Cuéntanos qué salió mal y cómo podemos mejorar...' :
                        'Describe tu reclamo con el mayor detalle posible...'
                      }
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={4}
                      className={cn(
                        'w-full px-4 py-3 rounded-xl text-sm font-medium outline-none border-0 resize-none leading-relaxed',
                        isDarkMode ? 'bg-[#2A2A2A] text-[#FDFBF0] placeholder:text-white/20' : 'bg-[#f4f4f0] placeholder:text-black/25'
                      )}
                    />
                    <p className={cn('text-[10px] font-medium mt-1 text-right', message.length < 10 ? 'text-red-400' : isDarkMode ? 'text-white/20' : 'text-black/20')}>
                      {message.trim().length}/10 mín.
                    </p>
                  </div>

                  {error && (
                    <p className="text-red-500 text-xs font-medium bg-red-500/10 p-3 rounded-xl">{error}</p>
                  )}

                  {/* Send button */}
                  <button
                    onClick={handleSend}
                    disabled={!isValid || sending}
                    className={cn(
                      'w-full h-12 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all duration-300',
                      isValid
                        ? `bg-gradient-to-r from-[#B8860B] to-[#FFD700] text-black shadow-lg active:scale-[0.98]`
                        : isDarkMode ? 'bg-white/8 text-white/25 cursor-not-allowed' : 'bg-black/8 text-black/25 cursor-not-allowed'
                    )}
                  >
                    {sending ? (
                      <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Enviar {type}
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
