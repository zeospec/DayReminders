// Firebase Authentication Module
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  getIdToken
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { firebaseConfig } from './firebase-config.js';

// Validate Firebase config before initialization
if (!firebaseConfig) {
  throw new Error('Firebase config is not defined. Please check firebase-config.js');
}

if (!firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.projectId) {
  throw new Error('Firebase config is missing required fields. Please check firebase-config.js');
}

// Initialize Firebase
let app;
let auth;
let googleProvider;

try {
  // Check if Firebase modules are loaded
  if (typeof initializeApp === 'undefined') {
    throw new Error('Firebase app module not loaded');
  }
  if (typeof getAuth === 'undefined') {
    throw new Error('Firebase auth module not loaded');
  }
  
  // Initialize Firebase app
  app = initializeApp(firebaseConfig);
  
  if (!app) {
    throw new Error('Failed to initialize Firebase app - app is null/undefined');
  }
  
  // Verify app object structure
  if (typeof app !== 'object' || app === null) {
    throw new Error(`Firebase app is not a valid object: ${typeof app}`);
  }
  
  // Initialize Firebase Auth
  try {
    auth = getAuth(app);
    
    if (!auth) {
      throw new Error('Failed to initialize Firebase auth - auth is null/undefined');
    }
    
    // Verify auth object structure
    if (typeof auth !== 'object' || auth === null) {
      throw new Error(`Firebase auth is not a valid object: ${typeof auth}`);
    }
  } catch (authError) {
    console.error('Error in getAuth:', authError);
    console.error('Auth error details:', {
      name: authError?.name,
      message: authError?.message,
      code: authError?.code,
      stack: authError?.stack
    });
    console.error('App object type:', typeof app);
    console.error('App object keys:', app ? Object.keys(app) : 'app is null');
    throw new Error(`Failed to initialize Firebase auth: ${authError.message}`);
  }
  
  // Create Google Auth Provider
  try {
    if (typeof GoogleAuthProvider === 'undefined') {
      throw new Error('GoogleAuthProvider is not available');
    }
    
    googleProvider = new GoogleAuthProvider();
    
    if (!googleProvider) {
      throw new Error('Failed to create Google auth provider - provider is null/undefined');
    }
    
    // Set custom parameters to avoid COOP issues
    googleProvider.setCustomParameters({
      prompt: 'select_account'
    });
    
  } catch (providerError) {
    console.error('Error creating GoogleAuthProvider:', providerError);
    console.error('Provider error details:', {
      name: providerError?.name,
      message: providerError?.message,
      stack: providerError?.stack
    });
    throw new Error(`Failed to create Google auth provider: ${providerError.message}`);
  }
} catch (error) {
  console.error('Error initializing Firebase:', error);
  console.error('Error name:', error.name);
  console.error('Error message:', error.message);
  console.error('Error code:', error.code);
  console.error('Error stack:', error.stack);
  console.error('Firebase config provided:', {
    hasApiKey: !!firebaseConfig?.apiKey,
    hasAuthDomain: !!firebaseConfig?.authDomain,
    hasProjectId: !!firebaseConfig?.projectId,
    apiKeyLength: firebaseConfig?.apiKey?.length,
    authDomain: firebaseConfig?.authDomain,
    projectId: firebaseConfig?.projectId
  });
  console.error('Available Firebase functions:', {
    hasInitializeApp: typeof initializeApp !== 'undefined',
    hasGetAuth: typeof getAuth !== 'undefined',
    hasGoogleAuthProvider: typeof GoogleAuthProvider !== 'undefined'
  });
  throw error;
}

// Add Google OAuth scopes if needed
if (googleProvider) {
  googleProvider.addScope('email');
  googleProvider.addScope('profile');
} else {
  console.error('Google provider not initialized - cannot add scopes');
}

/**
 * Initialize authentication and set up state listener
 * @param {Function} callback - Function to call when auth state changes
 */
export function initAuth(callback) {
  
  if (!auth) {
    console.error('Auth not initialized!');
    console.error('Auth object:', auth);
    console.error('App object:', app);
    throw new Error('Firebase Auth not initialized');
  }
  
  // Verify auth object is valid
  if (typeof auth !== 'object' || auth === null) {
    console.error('Auth is not a valid object:', typeof auth, auth);
    throw new Error('Firebase Auth object is invalid');
  }
  
  // Wait for auth to be ready (Firebase persists auth state)
  // onAuthStateChanged fires immediately with current user (or null)
  // and then again whenever auth state changes
  
  let firstCall = true;
  const unsubscribe = firebaseOnAuthStateChanged(auth, (user) => {
    if (firstCall) {
      firstCall = false;
      
      // On first call, if user is null, wait a bit for Firebase to restore from persistence
      if (!user) {
        const fromLogin = sessionStorage.getItem('fromLogin') === 'true';
        if (fromLogin) {
          // Wait and check again - Firebase might still be restoring auth state
          setTimeout(() => {
            const restoredUser = auth.currentUser;
            if (restoredUser) {
            }
            callback(restoredUser);
          }, 300);
          return;
        }
      }
    } else {
    }
    
    if (user) {
      // User authenticated
    }
    
    callback(user);
  });

  // Return unsubscribe function in case it's needed
  return unsubscribe;
}

/**
 * Sign in with Google OAuth
 * @returns {Promise<User>} Firebase user object
 */
export async function signInWithGoogle() {
  if (!auth) {
    throw new Error('Firebase auth is not initialized');
  }
  if (!googleProvider) {
    throw new Error('Google auth provider is not initialized');
  }
  
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error('Error signing in with Google:', error);
    throw error;
  }
}

/**
 * Sign out the current user
 */
export async function signOut() {
  if (!auth) {
    throw new Error('Firebase auth is not initialized');
  }
  
  try {
    await firebaseSignOut(auth);
  } catch (error) {
    console.error('Error signing out:', error);
    throw error;
  }
}

/**
 * Get the current authenticated user
 * @returns {User|null} Current user or null if not authenticated
 */
export function getCurrentUser() {
  if (!auth) {
    console.error('Firebase auth is not initialized');
    return null;
  }
  return auth.currentUser;
}

/**
 * Get Firebase ID token for API authentication
 * @param {boolean} forceRefresh - Force token refresh
 * @returns {Promise<string>} Firebase ID token
 */
export async function getAuthToken(forceRefresh = false) {
  const user = getCurrentUser();
  if (!user) {
    throw new Error('No authenticated user');
  }
  
  try {
    const token = await getIdToken(user, forceRefresh);
    return token;
  } catch (error) {
    console.error('Error getting auth token:', error);
    throw error;
  }
}

/**
 * Listen to authentication state changes
 * @param {Function} callback - Function to call when auth state changes
 * @returns {Function} Unsubscribe function
 */
export function onAuthStateChanged(callback) {
  if (!auth) {
    throw new Error('Firebase auth is not initialized');
  }
  return firebaseOnAuthStateChanged(auth, callback);
}

// Export auth instance for direct access if needed
export { auth };
