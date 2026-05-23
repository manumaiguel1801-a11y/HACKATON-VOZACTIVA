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
      {/* Floating Button */}
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "fixed bottom-28 right-6 z-[70] w-16 h-16 rounded-full shadow-2xl flex items-center justify-center transition-colors",
          isOpen 
            ? "bg-red-500 text-white" 
            : "bg-gradient-to-br from-[#B8860B] to-[#FFD700] text-black"
        )}
      >
        {isOpen ? <X className="w-8 h-8" /> : <MessageCircle className="w-8 h-8" />}
      </motion.button>

      {/* Chat Window Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.8 }}
            className={cn(
              "fixed inset-0 z-[65] flex flex-col pt-20 pb-44 px-4 backdrop-blur-md",
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
        )}
      </AnimatePresence>
    </>
  );
};
