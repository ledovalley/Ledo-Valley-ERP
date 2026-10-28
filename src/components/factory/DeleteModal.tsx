import React from 'react';
import { Trash2, AlertTriangle, X } from 'lucide-react';

interface DeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  itemName?: string;
  warningText?: string;
}

export default function DeleteModal({ isOpen, onClose, onConfirm, title, itemName, warningText }: DeleteModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform animate-in zoom-in-95 duration-200 border border-rose-100">
        <div className="p-6 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mb-4 ring-8 ring-rose-50">
            <AlertTriangle size={32} />
          </div>
          
          <h3 className="text-xl font-black text-slate-800 mb-2">{title}</h3>
          
          <p className="text-slate-500 text-sm mb-6 leading-relaxed">
            Are you sure you want to delete <span className="font-bold text-slate-800">"{itemName}"</span>? 
            {warningText && <span className="block mt-2 text-rose-600 font-medium">{warningText}</span>}
          </p>

          <div className="flex gap-3 w-full">
            <button onClick={onClose} className="flex-1 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
              Keep it
            </button>
            <button onClick={() => { onConfirm(); onClose(); }} className="flex-1 py-3 rounded-xl font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-lg shadow-rose-600/20 transition-all transform hover:-translate-y-0.5 flex items-center justify-center gap-2">
              <Trash2 size={18} /> Delete Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
