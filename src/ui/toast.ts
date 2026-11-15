import { create } from 'zustand';

export interface ToastItem {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

export const useToasts = create<{ items: ToastItem[] }>(() => ({ items: [] }));
let seq = 0;

export function toast(text: string, action?: ToastItem['action'], ms = 2600) {
  const id = ++seq;
  useToasts.setState((s) => ({ items: [...s.items.slice(-2), { id, text, action }] }));
  setTimeout(() => dismissToast(id), ms);
}

export function dismissToast(id: number) {
  useToasts.setState((s) => ({ items: s.items.filter((t) => t.id !== id) }));
}
