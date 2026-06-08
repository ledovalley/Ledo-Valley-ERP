export interface CatalogProduct {
  id: string;
  name: string;
  unit: string;
  size: number;
  stock: number;
  hsnCode?: string;
  gstRate?: number;
}

export interface LooseLot {
  id: string;
  lotNumber: string;
  grade: string;
  mark: string;
  bags: number;
  weightPerBag: number;
  weight: number;
  date: string;
  labels: string[];
}

export interface BlendProcess {
  id: string;
  blendName: string;
  batchNo: string;
  date: string;
  lotsUsed: {
    lotId: string;
    lotNumber: string;
    mark: string;
    grade?: string;
    labels?: string[];
    bagsUsed: number | string;
    weightUsed: number;
  }[];
  totalQuantity: number;
  status: 'PENDING' | 'PACKED';
}

export interface HistoryRecord {
  id: string;
  type: string;
  desc: string;
  timestamp: string;
  userId?: string;
  userName?: string;
  details?: any;
}

export type Role = 'super_admin' | 'manager' | 'user';

export interface SystemUser {
  uid: string; // Firebase Auth UID
  userId: string; // Auto-generated ID (e.g. monish-123)
  name: string;
  number: string;
  role: Role;
  createdAt: string;
}
