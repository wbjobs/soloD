import { initializeApp } from 'firebase/app';
import { getFirestore, enableNetwork, disableNetwork } from 'firebase/firestore';

const firebaseConfig = {
	apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'demo-api-key',
	authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'demo-auth-domain',
	projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'demo-project-id',
	storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'demo-storage-bucket',
	messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || 'demo-sender-id',
	appId: import.meta.env.VITE_FIREBASE_APP_ID || 'demo-app-id'
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export async function enableFirebaseNetwork(): Promise<void> {
	try {
		await enableNetwork(db);
	} catch (e) {
		console.error('Error enabling network:', e);
	}
}

export async function disableFirebaseNetwork(): Promise<void> {
	try {
		await disableNetwork(db);
	} catch (e) {
		console.error('Error disabling network:', e);
	}
}
