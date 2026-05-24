import React, { useState, useRef } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { Chat } from './Chat';
import { Debt, InventoryProduct } from '../types';

const MIN_W = 280;
const MIN_H = 320;
const INIT_W = 340;
const INIT_H = 490;

function getInitialPos() {
  const vw = typeof window !== 'undefined' ? window.innerWidth  : 400;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 700;
  return {
    x: Math.max(8, vw - INIT_W - 16),
    y: Math.max(8, vh - INIT_H - 110),
    w: INIT_W,
    h: INIT_H,
  };
}

export const ChatBubble = ({
  isDarkMode,
  userId,
  debts,
  inventory,
}: {
  isDarkMode: boolean;
  userId: string;
  debts: Debt[];
  inventory: InventoryProduct[];
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [pos, setPos] = useState(getInitialPos);

  // ── Drag ──────────────────────────────────────────────────────────────────
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  const onDragDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, ox: pos.x, oy: pos.y };
  };
  const onDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const dx = e.clientX - drag.current.px;
    const dy = e.clientY - drag.current.py;
    setPos(p => ({
      ...p,
      x: Math.max(0, Math.min(vw - p.w, drag.current!.ox + dx)),
      y: Math.max(0, Math.min(vh - p.h, drag.current!.oy + dy)),
    }));
  };
  const onDragUp = () => { drag.current = null; };

  // ── Resize ─────────────────────────────────────────────────────────────────
  const rsz = useRef<{ px: number; py: number; ow: number; oh: number } | null>(null);

  const onRszDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    rsz.current = { px: e.clientX, py: e.clientY, ow: pos.w, oh: pos.h };
  };
  const onRszMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!rsz.current) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const dx = e.clientX - rsz.current.px;
    const dy = e.clientY - rsz.current.py;
    setPos(p => ({
      ...p,
      w: Math.max(MIN_W, Math.min(vw - p.x, rsz.current!.ow + dx)),
      h: Math.max(MIN_H, Math.min(vh - p.y, rsz.current!.oh + dy)),
    }));
  };
  const onRszUp = () => { rsz.current = null; };

  return (
    <>
      {/* Floating button */}
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setIsOpen(v => !v)}
        className={cn(
          'fixed bottom-24 md:bottom-8 right-4 z-[70] w-14 h-14 rounded-2xl shadow-xl flex items-center justify-center transition-all duration-300',
          isOpen
            ? isDarkMode ? 'bg-[#1A1A1A] text-white border border-white/10' : 'bg-white text-[#2e2f2d] border border-black/10'
            : 'bg-gradient-to-br from-[#B8860B] to-[#FFD700] text-black'
        )}
      >
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.div key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <X className="w-6 h-6" />
            </motion.div>
          ) : (
            <motion.div key="msg" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <MessageCircle className="w-6 h-6" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Floating draggable + resizable window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="chat-window"
            initial={{ opacity: 0, scale: 0.88 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.88 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className={cn(
              'fixed z-[65] flex flex-col rounded-2xl shadow-2xl overflow-hidden border select-none',
              isDarkMode ? 'bg-[#0D0D0D] border-white/10' : 'bg-[#FDFBF0] border-black/10'
            )}
            style={{
              left: pos.x,
              top: pos.y,
              width: pos.w,
              height: pos.h,
            }}
          >
            {/* ── Drag handle / header ──────────────────────────────────────── */}
            <div
              className={cn(
                'flex items-center gap-3 px-4 py-3 border-b flex-shrink-0 cursor-grab active:cursor-grabbing touch-none',
                isDarkMode ? 'border-white/5' : 'border-black/5'
              )}
              onPointerDown={onDragDown}
              onPointerMove={onDragMove}
              onPointerUp={onDragUp}
              onPointerCancel={onDragUp}
            >
              <div className="w-8 h-8 bg-gradient-to-br from-[#B8860B] to-[#FFD700] rounded-xl flex items-center justify-center text-black flex-shrink-0">
                <MessageCircle className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-black text-[#B8860B] font-['Plus_Jakarta_Sans'] leading-tight">Asistente IA</h2>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                  <p className={cn('text-[9px] font-bold uppercase tracking-widest', isDarkMode ? 'text-white/40' : 'text-black/40')}>En línea</p>
                </div>
              </div>
              <button
                onPointerDown={e => e.stopPropagation()}
                onClick={() => setIsOpen(false)}
                className={cn(
                  'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors',
                  isDarkMode ? 'bg-white/8 text-white/50 hover:bg-white/15' : 'bg-black/5 text-black/40 hover:bg-black/10'
                )}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* ── Chat content ─────────────────────────────────────────────── */}
            <div className="flex-1 overflow-hidden px-2 pt-1 pb-1">
              <Chat isDarkMode={isDarkMode} userId={userId} debts={debts} inventory={inventory} />
            </div>

            {/* ── Resize handle (bottom-right corner) ──────────────────────── */}
            <div
              className="absolute bottom-0 right-0 w-7 h-7 cursor-se-resize touch-none flex items-end justify-end p-1.5"
              onPointerDown={onRszDown}
              onPointerMove={onRszMove}
              onPointerUp={onRszUp}
              onPointerCancel={onRszUp}
            >
              {/* Three diagonal dots = resize grip */}
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"
                className={isDarkMode ? 'text-white/25' : 'text-black/20'}
              >
                <circle cx="10" cy="2" r="1.2" />
                <circle cx="6"  cy="6" r="1.2" />
                <circle cx="10" cy="6" r="1.2" />
                <circle cx="2"  cy="10" r="1.2" />
                <circle cx="6"  cy="10" r="1.2" />
                <circle cx="10" cy="10" r="1.2" />
              </svg>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
