"use client";

import React, { useState, useEffect } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Shield, Plus, Key, User, Trash2, Search, History } from 'lucide-react';
import { SystemUser, Role, HistoryRecord } from '@/types';

// We need a secondary firebase app to create users without logging out the current admin
const SECONDARY_APP_NAME = 'SecondaryApp';
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export default function UserManagementModule({ triggerToast, historyList = [] }: { triggerToast: any, historyList: HistoryRecord[] }) {
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [role, setRole] = useState<Role>('user');
  const [loading, setLoading] = useState(false);
  const [generatedCreds, setGeneratedCreds] = useState<{ id: string, pass: string } | null>(null);

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'artifacts', 'ledo-valley-erp', 'users'), (snapshot) => {
      const u: SystemUser[] = [];
      snapshot.forEach((d) => u.push(d.data() as SystemUser));
      setUsers(u);
    });
    return () => unsubscribe();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setGeneratedCreds(null);
    try {
      const apps = getApps();
      let secondaryApp = apps.find(a => a.name === SECONDARY_APP_NAME);
      if (!secondaryApp) {
        secondaryApp = initializeApp(firebaseConfig, SECONDARY_APP_NAME);
      }
      const secondaryAuth = getAuth(secondaryApp);

      const rawId = name.toLowerCase().replace(/[^a-z0-9]/g, '') + Math.floor(100 + Math.random() * 900);
      const email = `${rawId}@ledovalley.erp`;
      const pass = Math.random().toString(36).slice(-8) + Math.floor(Math.random() * 10); // simple 9 char pass

      const cred = await createUserWithEmailAndPassword(secondaryAuth, email, pass);
      
      const newUser: SystemUser = {
        uid: cred.user.uid,
        userId: rawId,
        name: name,
        number: number,
        role: role,
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'artifacts', 'ledo-valley-erp', 'users', cred.user.uid), newUser);
      
      setGeneratedCreds({ id: rawId, pass: pass });
      setName('');
      setNumber('');
      setRole('user');
      triggerToast('User created successfully!');
    } catch (err: any) {
      console.error(err);
      triggerToast('Error creating user: ' + err.message, 'error');
    } finally {
      setLoading(false);
      import('firebase/auth').then(m => {
          const apps = getApps();
          const secondaryApp = apps.find(a => a.name === SECONDARY_APP_NAME);
          if (secondaryApp) {
              m.signOut(getAuth(secondaryApp));
          }
      });
    }
  };

  const handleDeleteUser = async (uid: string) => {
    if (confirm('Remove this user? Their history will remain intact, but they will not be able to log in. Note: To permanently delete auth, use Firebase Console.')) {
      await deleteDoc(doc(db, 'artifacts', 'ledo-valley-erp', 'users', uid));
      triggerToast('User access revoked.');
    }
  };

  const userHistory = historyList.filter(h => h.userId === selectedUserId);
  const selectedUser = users.find(u => u.userId === selectedUserId);

  const [showCreateModal, setShowCreateModal] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[#0B172B] tracking-tight">User Management</h2>
          <p className="text-sm text-[#0B172B]/55 mt-1">Create accounts and manage access privileges</p>
        </div>
        <button 
          onClick={() => { setShowCreateModal(true); setGeneratedCreds(null); }}
          className="bg-[#0B172B] text-white font-bold px-5 py-3 rounded-xl hover:bg-[#009965] shadow-[0_5px_15px_rgba(11,23,43,0.1)] transition-all text-sm flex items-center gap-2"
        >
          <Plus size={18} /> Register New User
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-[#0B172B]/8 shadow-[0_10px_30px_rgba(11,23,43,0.04)] overflow-hidden">
        <div className="p-5 border-b border-[#0B172B]/8 bg-[#F0F5F9]/50 flex justify-between items-center">
          <h3 className="font-bold text-[#0B172B] flex items-center gap-2"><User size={18} className="text-[#009965]" /> Active Users List</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white">
                <th className="p-4 text-xs font-bold text-[#0B172B]/55 uppercase tracking-wider border-b border-[#0B172B]/8">User</th>
                <th className="p-4 text-xs font-bold text-[#0B172B]/55 uppercase tracking-wider border-b border-[#0B172B]/8">Role</th>
                <th className="p-4 text-xs font-bold text-[#0B172B]/55 uppercase tracking-wider border-b border-[#0B172B]/8 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#0B172B]/5">
              {users.map(u => (
                <tr key={u.uid} className={`hover:bg-[#F0F5F9]/50 transition-colors ${selectedUserId === u.userId ? 'bg-[#F0F5F9]' : ''}`}>
                  <td className="p-4">
                    <div className="font-semibold text-[#0B172B]">{u.name}</div>
                    <div className="text-xs text-[#0B172B]/55 font-mono mt-0.5">{u.userId} • {u.number}</div>
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wide border ${
                      u.role === 'super_admin' ? 'bg-[#0B172B]/10 text-[#0B172B] border-[#0B172B]/20' :
                      u.role === 'manager' ? 'bg-[#009965]/10 text-[#009965] border-[#009965]/20' :
                      'bg-[#F0F5F9] text-[#0B172B]/55 border-[#0B172B]/10'
                    }`}>
                      {u.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="p-4 text-right space-x-2">
                    <button onClick={() => setSelectedUserId(u.userId)} className="p-2 text-[#0B172B]/40 hover:text-[#009965] bg-white border border-[#0B172B]/10 rounded-lg shadow-sm transition-colors" title="View User Details & History">
                      <History size={16} />
                    </button>
                    {u.role !== 'super_admin' && (
                      <button onClick={() => handleDeleteUser(u.uid)} className="p-2 text-[#0B172B]/40 hover:text-red-600 bg-white border border-[#0B172B]/10 rounded-lg shadow-sm transition-colors" title="Delete User">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-[#0B172B]/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-[0_24px_80px_rgba(11,23,43,0.2)]">
            <div className="p-6 border-b border-[#0B172B]/8 bg-[#F0F5F9]/50 flex justify-between items-center">
              <h3 className="font-bold text-[#0B172B] flex items-center gap-2"><Plus size={18} className="text-[#009965]" /> Register User</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-[#0B172B]/40 hover:text-[#0B172B] bg-white p-1 rounded shadow-sm">✕</button>
            </div>
            
            <div className="p-6">
              <form onSubmit={handleCreateUser} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-[#0B172B]/70 uppercase">Full Name</label>
                  <input required type="text" value={name} onChange={e => setName(e.target.value)} className="w-full mt-1 px-4 py-3 border border-[#0B172B]/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#009965]/30 text-sm text-[#0B172B] bg-[#F0F5F9]/50 focus:bg-white" placeholder="John Doe" />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#0B172B]/70 uppercase">Phone Number</label>
                  <input required type="tel" value={number} onChange={e => setNumber(e.target.value)} className="w-full mt-1 px-4 py-3 border border-[#0B172B]/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#009965]/30 text-sm text-[#0B172B] bg-[#F0F5F9]/50 focus:bg-white" placeholder="9876543210" />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#0B172B]/70 uppercase">Role</label>
                  <select value={role} onChange={e => setRole(e.target.value as Role)} className="w-full mt-1 px-4 py-3 border border-[#0B172B]/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#009965]/30 text-sm capitalize text-[#0B172B] bg-[#F0F5F9]/50 focus:bg-white">
                    <option value="user">User (View Only)</option>
                    <option value="manager">Manager (Modify Catalog)</option>
                    <option value="super_admin">Super Admin (All Access)</option>
                  </select>
                </div>
                <button disabled={loading} type="submit" className="w-full bg-[#0B172B] text-white font-bold py-3.5 mt-2 rounded-xl hover:bg-[#009965] shadow-[0_5px_15px_rgba(11,23,43,0.1)] transition-all text-sm">
                  {loading ? 'Creating...' : 'Generate Account'}
                </button>
              </form>

              {generatedCreds && (
                <div className="mt-6 p-5 bg-[#FFFEE2]/50 border border-[#009965]/20 rounded-xl">
                  <p className="text-xs font-bold text-[#004825] uppercase tracking-wide mb-3">Credentials Generated</p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm items-center">
                      <span className="text-[#004825]">User ID:</span>
                      <span className="font-mono font-bold text-[#0B172B] select-all bg-white px-2 py-1 border border-[#009965]/20 rounded">{generatedCreds.id}</span>
                    </div>
                    <div className="flex justify-between text-sm items-center">
                      <span className="text-[#004825]">Password:</span>
                      <span className="font-mono font-bold text-[#0B172B] select-all bg-white px-2 py-1 border border-[#009965]/20 rounded">{generatedCreds.pass}</span>
                    </div>
                  </div>
                  <p className="text-xs font-medium text-[#009965] mt-3">Copy these immediately. The password cannot be recovered later.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedUserId && selectedUser && (
        <div className="fixed inset-0 bg-[#0B172B]/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-[0_24px_80px_rgba(11,23,43,0.2)] flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-[#0B172B]/8 bg-[#F0F5F9]/50 flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-bold text-[#0B172B] text-xl flex items-center gap-2">User Details & Audit Trail</h3>
              </div>
              <button onClick={() => setSelectedUserId(null)} className="text-[#0B172B]/40 hover:text-[#0B172B] bg-white p-2 rounded-xl shadow-sm">✕</button>
            </div>
            
            <div className="p-6 shrink-0 border-b border-[#0B172B]/5">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-bold text-lg text-[#0B172B]">{selectedUser.name}</h4>
                  <div className="text-sm text-[#0B172B]/55 font-mono mt-1">{selectedUser.userId} • {selectedUser.number}</div>
                </div>
                <span className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide border ${
                  selectedUser.role === 'super_admin' ? 'bg-[#0B172B]/10 text-[#0B172B] border-[#0B172B]/20' :
                  selectedUser.role === 'manager' ? 'bg-[#009965]/10 text-[#009965] border-[#009965]/20' :
                  'bg-[#F0F5F9] text-[#0B172B]/55 border-[#0B172B]/10'
                }`}>
                  {selectedUser.role.replace('_', ' ')}
                </span>
              </div>
            </div>

            <div className="overflow-y-auto p-6 bg-[#F0F5F9]/30 flex-1">
              <h4 className="text-xs font-bold text-[#0B172B]/55 uppercase tracking-widest mb-4">Activity Records ({userHistory.length})</h4>
              <div className="space-y-3">
                {userHistory.length === 0 ? (
                  <div className="text-center text-sm text-[#0B172B]/40 py-8 bg-white rounded-xl border border-[#0B172B]/5">No actions recorded for this user yet.</div>
                ) : (
                  userHistory.map(record => (
                    <div key={record.id} className="flex gap-4 p-4 bg-white rounded-xl border border-[#0B172B]/8 shadow-sm">
                      <div className="shrink-0 pt-1">
                        <div className="w-2.5 h-2.5 rounded-full bg-[#009965] ring-4 ring-[#009965]/10" />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <p className="font-medium text-[#0B172B] text-sm leading-relaxed">{record.desc}</p>
                        </div>
                        <div className="flex justify-between items-center mt-2 pt-2 border-t border-[#0B172B]/5">
                          <span className="inline-block px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-[#F0F5F9] text-[#0B172B]/55 border border-[#0B172B]/10">
                            {record.type}
                          </span>
                          <span className="text-xs text-[#0B172B]/40 font-mono">
                            {new Date(record.timestamp).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
