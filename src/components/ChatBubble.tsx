import React, { useState } from 'react';
import { MessageCircle, X, Send, Mic } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { Chat } from './Chat';
import { Debt, InventoryProduct } from '../types';

export const ChatBubble = ({ isDarkMode, userId, debts, inventory }: { isDarkMode: boolean; userId: string; debts: Debt[]; inventory: InventoryProduct[] }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Floating Button — above bottom nav on mobile, near corner on desktop */}
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "fixed bottom-28 md:bottom-6 right-6 z-[70] w-16 h-16 rounded-full shadow-2xl flex items-center justify-center transition-colors",
          isOpen
            ? "bg-red-500 text-white"
            : "bg-gradient-to-br from-[#B8860B] to-[#FFD700] text-black"
        )}
      >
        {isOpen ? <X className="w-8 h-8" /> : <MessageCircle className="w-8 h-8" />}
      </motion.button>

      {/* Chat Window — full-screen overlay on mobile, floating panel on desktop */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Mobile: full-screen overlay */}
            <motion.div
              initial={{ opacity: 0, y: 100, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 100, scale: 0.8 }}
              className={cn(
                "md:hidden fixed inset-0 z-[65] flex flex-col pt-20 pb-44 px-4 backdrop-blur-md",
                isDarkMode ? "bg-black/90" : "bg-[#FDFBF0]/90"
              )}
            >
              <div className="max-w-md mx-auto w-full h-full flex flex-col bg-transparent">
                <div className="flex justify-between items-center mb-6 px-2">
                  <div>
                    <h2 className="text-2xl font-black text-[#B8860B] font-['Plus_Jakarta_Sans']">Asistente IA</h2>
                    <p className="text-xs opacity-50 font-bold uppercase tracking-widest">En línea ahora</p>
                  </div>
                  <div className="w-12 h-12 bg-gradient-to-br from-[#B8860B] to-[#FFD700] rounded-2xl flex items-center justify-center text-black shadow-lg">
                    <MessageCircle className="w-6 h-6" />
                  </div>
                </div>
                <div className="flex-1 overflow-hidden px-2">
                  <Chat isDarkMode={isDarkMode} userId={userId} debts={debts} inventory={inventory} />
                </div>
              </div>
            </motion.div>

            {/* Desktop: floating panel */}
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className={cn(
                "hidden md:flex flex-col fixed bottom-24 right-6 z-[65] w-[400px] h-[560px] rounded-2xl shadow-2xl overflow-hidden border",
                isDarkMode
                  ? "bg-[#0D0D0D] border-white/10"
                  : "bg-[#FDFBF0] border-black/10"
              )}
            >
              <div className={cn(
                "flex items-center justify-between px-5 py-4 border-b flex-shrink-0",
                isDarkMode ? "border-white/5" : "border-black/5"
              )}>
                <div>
                  <h2 className="text-lg font-black text-[#B8860B] font-['Plus_Jakarta_Sans']">Asistente IA</h2>
                  <p className="text-[10px] opacity-50 font-bold uppercase tracking-widest">En línea ahora</p>
                </div>
                <div className="w-10 h-10 bg-gradient-to-br from-[#B8860B] to-[#FFD700] rounded-xl flex items-center justify-center text-black shadow-md">
                  <MessageCircle className="w-5 h-5" />
                </div>
              </div>
              <div className="flex-1 overflow-hidden">
                <Chat isDarkMode={isDarkMode} userId={userId} debts={debts} inventory={inventory} />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
