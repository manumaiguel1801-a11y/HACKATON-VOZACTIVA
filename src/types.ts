import React from 'react';

export type Tab = 'inicio' | 'finanzas' | 'camara' | 'inventario' | 'pasaporte' | 'perfil';

export interface Transaction {
  id: string;
  title: string;
  amount: number;
  time: string;
  type: 'income' | 'expense';
  icon: React.ReactNode;
  color: string;
}

export interface SaleItem {
  product: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  regularUnitPrice?: number; // precio de inventario cuando se vendió con descuento
}

export interface Sale {
  id: string;
  items?: SaleItem[];
  total: number;
  createdAt: any;
  source?: 'manual' | 'chat' | 'telegram' | 'whatsapp' | 'camara';
  concept?: string; // used for simple income entries (préstamos, etc.)
  // legacy fields for old single-product sales
  product?: string;
  quantity?: number;
  unitPrice?: number;
}

export function getSaleLabel(sale: Sale): string {
  if (sale.items?.length) {
    if (sale.items.length === 1) return sale.items[0].product;
    return `${sale.items[0].product} y ${sale.items.length - 1} más`;
  }
  return sale.concept ?? sale.product ?? 'Ingreso';
}

export function getSaleQtyLabel(sale: Sale): string {
  if ((sale.items?.length ?? 0) > 1) return `${sale.items!.length} productos`;
  const qty = sale.items?.[0]?.quantity ?? sale.quantity ?? 1;
  return qty > 1 ? `×${qty}` : '';
}

export interface ExpenseItem {
  product: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface Expense {
  id: string;
  concept: string;
  amount: number;
  createdAt: any;
  items?: ExpenseItem[];
  source?: 'manual' | 'chat' | 'telegram' | 'whatsapp' | 'camara';
}

export interface Debt {
  id: string;
  name: string;      // nombre del deudor o acreedor
  concept: string;
  amount: number;
  type: 'me-deben' | 'debo';
  status?: 'pendiente' | 'parcial' | 'pagada';
  amountPaid?: number;  // acumulado de abonos
  paidAt?: any;
  createdAt: any;
}

export interface InventoryProduct {
  id: string;
  nombre: string;
  cantidad: number;
  precioCompra: number;
  precioVenta: number;
  valorUnitario?: number; // legacy — kept for backward compat
  createdAt: any;
  updatedAt?: any;
}

export function getPrecioVenta(p: InventoryProduct): number {
  return p.precioVenta || p.valorUnitario || 0;
}

export function getPrecioCompra(p: InventoryProduct): number {
  return p.precioCompra || 0;
}

export function getMargen(p: InventoryProduct): number | null {
  const compra = getPrecioCompra(p);
  const venta = getPrecioVenta(p);
  if (!compra || !venta) return null;
  return Math.round(((venta - compra) / compra) * 100);
}

export interface ScoreHistoryEntry {
  id?: string;
  score: number;
  weekKey: string;
  recordedAt: any;
}

export interface UserProfile {
  firstName: string;
  lastName: string;
  idNumber: string;
  phone: string;
  birthDate: string;
  email?: string;
  photoURL?: string;
  createdAt: any; // Timestamp
  telegramChatId?: string;
  whatsappPhone?: string;
  linkCode?: { code: string; expiresAt: any };
  lastScoreCategory?: string;
  verificationCode?: { code: string; expiresAt: any };
}
