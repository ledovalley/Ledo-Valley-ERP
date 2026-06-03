"use client";

import React, { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import Image from 'next/image';
import { Lock, User, Key, ArrowRight, ShieldAlert, Eye, EyeOff } from 'lucide-react';
import { SystemUser } from '@/types';

export default function Login() {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showBootstrap, setShowBootstrap] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const pseudoEmail = `${userId.toLowerCase()}@ledovalley.erp`;
      await signInWithEmailAndPassword(auth, pseudoEmail, password);
    } catch (err: any) {
      console.error(err);
      setError('Invalid User ID or Password. Please contact your administrator.');
      // If auth fails due to no users existing, we might want to show bootstrap
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
         // Optionally reveal bootstrap if someone types 'admin-setup'
         if (userId === 'admin-setup') setShowBootstrap(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBootstrap = async () => {
    setLoading(true);
    setError('');
    try {
      const email = 'superadmin@ledovalley.erp';
      const defaultPassword = 'superpassword123';
      
      const cred = await createUserWithEmailAndPassword(auth, email, defaultPassword);
      
      const newAdmin: SystemUser = {
        uid: cred.user.uid,
        userId: 'superadmin',
        name: 'Super Administrator',
        number: '0000000000',
        role: 'super_admin',
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'artifacts', 'ledo-valley-erp', 'users', cred.user.uid), newAdmin);
      
      setError('Success! Logged in as superadmin / superpassword123');
      setTimeout(() => window.location.reload(), 2000);

    } catch (err: any) {
      console.error(err);
      setError('Failed to bootstrap: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F0F5F9] relative overflow-hidden">
      {/* Abstract Background Design */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-[#009965]/10 blur-3xl" />
        <div className="absolute bottom-[10%] -right-[10%] w-[40%] h-[60%] rounded-full bg-[#FFFEE2]/40 blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10 px-4">
        <div className="bg-white p-8 rounded-2xl border border-[#0B172B]/10 shadow-[0_10px_30px_rgba(11,23,43,0.06)]">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-[#009965] rounded-2xl flex items-center justify-center mb-4 shadow-[0_10px_25px_rgba(0,153,101,0.25)]">
              <Image src="/symbolLogo.svg" alt="Logo" width={32} height={32} className="w-8 h-8 drop-shadow" />
            </div>
            <h1 className="text-2xl font-bold text-[#0B172B] tracking-tight">Ledo Valley ERP</h1>
            <p className="text-sm text-[#0B172B]/55 font-medium mt-1">Enterprise Resource Planning</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 text-red-600 text-sm font-medium rounded-lg border border-red-100 text-center">
                {error}
              </div>
            )}
            
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#0B172B]/70 uppercase tracking-wider ml-1">User ID</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#0B172B]/40">
                  <User size={18} />
                </div>
                <input
                  type="text"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-[#F0F5F9]/50 border border-[#0B172B]/10 rounded-xl focus:ring-2 focus:ring-[#009965]/20 focus:border-[#009965] outline-none transition-all text-[#0B172B] font-medium"
                  placeholder="e.g. jdoe123"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-[#0B172B]/70 uppercase tracking-wider ml-1">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#0B172B]/40">
                  <Key size={18} />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-12 py-3 bg-[#F0F5F9]/50 border border-[#0B172B]/10 rounded-xl focus:ring-2 focus:ring-[#009965]/20 focus:border-[#009965] outline-none transition-all text-[#0B172B] font-medium"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#0B172B]/40 hover:text-[#009965] focus:outline-none"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#0B172B] hover:bg-[#009965] text-white font-semibold py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2 mt-2 disabled:opacity-70 shadow-[0_10px_20px_rgba(11,23,43,0.15)]"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Secure Login <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          {showBootstrap && (
            <div className="mt-8 pt-6 border-t border-slate-100">
              <div className="bg-orange-50 border border-orange-200 p-4 rounded-xl flex items-start gap-3">
                <ShieldAlert className="text-orange-600 shrink-0 mt-0.5" size={20} />
                <div>
                  <h4 className="text-sm font-bold text-orange-800">System Initialization</h4>
                  <p className="text-xs text-orange-700 mt-1 mb-3 leading-relaxed">
                    No super administrator account exists. Click below to initialize the system.
                  </p>
                  <button 
                    onClick={handleBootstrap}
                    disabled={loading}
                    className="bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold py-2 px-4 rounded-lg transition-colors"
                  >
                    Create Super Admin
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
        
        <p className="text-center text-xs text-[#0B172B]/40 font-medium mt-6">
          © {new Date().getFullYear()} Ledo Valley. All rights reserved.
        </p>
      </div>
    </div>
  );
}
