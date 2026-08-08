const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const appId = "ledo-valley-erp";

async function check() {
  const histSnap = await getDocs(collection(db, 'artifacts', appId, 'historyList'));
  histSnap.forEach(d => {
    const data = d.data();
    if(data.details && data.details.blendName && data.details.blendName.includes('SL-')) {
       console.log('HISTORY:', d.id, data.details.blendName);
    }
  });

  const procSnap = await getDocs(collection(db, 'artifacts', appId, 'process'));
  procSnap.forEach(d => {
    const data = d.data();
    if(data.blendName && data.blendName.includes('SL-')) {
       console.log('PROCESS:', d.id, data.blendName);
    }
  });
}
check();
