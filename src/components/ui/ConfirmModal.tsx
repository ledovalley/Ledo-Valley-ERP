import React from 'react';
import { HelpCircle, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
}

export default function ConfirmModal({ isOpen, onClose, onConfirm, title, message, confirmText = "Confirm", cancelText = "Cancel" }: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden transform animate-in zoom-in-95 duration-200 border border-slate-200">
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center ring-4 ring-emerald-50">
              <HelpCircle size={24} />
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 p-2 rounded-full transition-colors">
              <X size={16} />
            </button>
          </div>
          
          <h3 className="text-lg font-black text-slate-800 mb-2">{title}</h3>
          <p className="text-slate-500 text-sm leading-relaxed mb-8">{message}</p>

          <div className="flex justify-end gap-3">
            <button onClick={onClose} className="px-5 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-colors">
              {cancelText}
            </button>
            <button onClick={() => { onConfirm(); onClose(); }} className="px-5 py-2.5 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-600/20 transition-transform transform hover:-translate-y-0.5">
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
