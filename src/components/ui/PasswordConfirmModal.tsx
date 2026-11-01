"use client";

import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, Trash2, Loader2, X } from 'lucide-react';

interface PasswordConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  /**
   * Called with the password typed. Resolve to null when done (the dialog closes),
   * or to an error message to show it and keep the dialog open.
   */
  onConfirm: (password: string) => Promise<string | null>;
  onClose: () => void;
}

/** Confirmation dialog that asks for the delete password before deleting anything. */
export default function PasswordConfirmModal({
  isOpen, title, message, confirmText = 'Delete', onConfirm, onClose
}: PasswordConfirmModalProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setError(null);
      setWorking(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const submit = async () => {
    if (working) return;
    if (!password.trim()) {
      setError('Enter the delete password.');
      return;
    }
    setWorking(true);
    setError(null);
    try {
      const err = await onConfirm(password);
      if (err) {
        setError(err);
        setPassword('');
        inputRef.current?.focus();
      } else {
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Nothing was deleted.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md" onClick={() => !working && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-rose-100" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center ring-4 ring-rose-50">
              <AlertTriangle size={24} />
            </div>
            <button onClick={onClose} disabled={working} className="text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 p-2 rounded-full transition-colors">
              <X size={16} />
            </button>
          </div>

          <h3 className="text-lg font-black text-slate-800 mb-2">{title}</h3>
          <p className="text-slate-600 text-sm leading-relaxed mb-5">{message}</p>

          <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Delete password</label>
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(null); }}
            onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape' && !working) onClose(); }}
            disabled={working}
            className={`w-full px-4 py-3 border rounded-xl outline-none text-lg tracking-[0.4em] font-mono text-slate-900 focus:ring-2 ${error ? 'border-rose-400 focus:ring-rose-200' : 'border-slate-300 focus:ring-rose-100'}`}
            placeholder="••••"
          />
          {error && <p className="text-sm text-rose-600 font-semibold mt-2">{error}</p>}

          <div className="flex justify-end gap-3 mt-6">
            <button onClick={onClose} disabled={working} className="px-5 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-colors">
              Keep it
            </button>
            <button
              onClick={submit}
              disabled={working}
              className="px-5 py-2.5 rounded-xl font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-60 shadow-md shadow-rose-600/20 flex items-center gap-2"
            >
              {working ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
