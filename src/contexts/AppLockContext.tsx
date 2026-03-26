/**
 * App Lock Context
 * Provides OPTIONAL biometric authentication on app resume
 * 
 * CRITICAL DESIGN DECISIONS:
 * - NEVER blocks first login or signup
 * - NEVER blocks App Review testers
 * - Only triggers on app resume from background after inactivity
 * - Graceful fallback - if biometric fails, continues with existing session
 * - User can disable in settings
 */

import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { secureStorage } from '../services/secureStorage';

// Storage keys
const APP_LOCK_ENABLED_KEY = '@app_lock_enabled';
const LAST_ACTIVITY_KEY = '@last_activity_time';

// Inactivity timeout in milliseconds (5 minutes)
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;

interface AppLockContextType {
  isLocked: boolean;
  isAppLockEnabled: boolean;
  isBiometricAvailable: boolean;
  biometricType: string | null;
  isCheckingBiometric: boolean;
  enableAppLock: () => Promise<boolean>;
  disableAppLock: () => Promise<void>;
  unlockWithBiometric: () => Promise<boolean>;
  skipLock: () => void;
  updateLastActivity: () => void;
}

const AppLockContext = createContext<AppLockContextType | undefined>(undefined);

interface AppLockProviderProps {
  children: ReactNode;
  isAuthenticated: boolean; // From AuthContext - whether user is logged in
}

export function AppLockProvider({ children, isAuthenticated }: AppLockProviderProps) {
  const [isLocked, setIsLocked] = useState(false);
  const [isAppLockEnabled, setIsAppLockEnabled] = useState(false);
  const [isBiometricAvailable, setIsBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<string | null>(null);
  const [isCheckingBiometric, setIsCheckingBiometric] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  
  const appState = useRef(AppState.currentState);
  const lastActivityTime = useRef<number>(Date.now());

  // Check biometric availability on mount
  useEffect(() => {
    checkBiometricAvailability();
    loadAppLockSettings();
  }, []);

  // Handle app state changes (background/foreground)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [isAuthenticated, isAppLockEnabled, isInitialized]);

  const checkBiometricAvailability = async () => {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      
      setIsBiometricAvailable(compatible && enrolled);
      
      if (compatible && enrolled) {
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
          setBiometricType('Face ID');
        } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
          setBiometricType('Touch ID');
        } else {
          setBiometricType('Biometric');
        }
      }
    } catch (error) {
      console.warn('[AppLock] Failed to check biometric availability');
      setIsBiometricAvailable(false);
    }
  };

  const loadAppLockSettings = async () => {
    try {
      const enabled = await secureStorage.getSecureItem(APP_LOCK_ENABLED_KEY);
      setIsAppLockEnabled(enabled === 'true');
      
      const lastActivity = await secureStorage.getSecureItem(LAST_ACTIVITY_KEY);
      if (lastActivity) {
        lastActivityTime.current = parseInt(lastActivity, 10);
      }
    } catch (error) {
      console.warn('[AppLock] Failed to load settings');
    } finally {
      setIsInitialized(true);
    }
  };

  const handleAppStateChange = useCallback(async (nextAppState: AppStateStatus) => {
    // Only process if user is authenticated and app lock is enabled
    if (!isAuthenticated || !isAppLockEnabled || !isInitialized) {
      appState.current = nextAppState;
      return;
    }

    // App coming to foreground from background
    if (
      appState.current.match(/inactive|background/) &&
      nextAppState === 'active'
    ) {
      const now = Date.now();
      const timeSinceLastActivity = now - lastActivityTime.current;
      
      // Only lock if user was inactive for longer than timeout
      if (timeSinceLastActivity > INACTIVITY_TIMEOUT_MS) {
        setIsLocked(true);
      }
    }

    // App going to background - save last activity time
    if (nextAppState.match(/inactive|background/)) {
      lastActivityTime.current = Date.now();
      try {
        await secureStorage.setSecureItem(LAST_ACTIVITY_KEY, lastActivityTime.current.toString());
      } catch (error) {
        // Ignore storage errors
      }
    }

    appState.current = nextAppState;
  }, [isAuthenticated, isAppLockEnabled, isInitialized]);

  const updateLastActivity = useCallback(() => {
    lastActivityTime.current = Date.now();
  }, []);

  const enableAppLock = async (): Promise<boolean> => {
    try {
      if (!isBiometricAvailable) {
        return false;
      }

      // Verify biometric works before enabling
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: `Enable ${biometricType || 'biometric'} lock`,
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
        fallbackLabel: 'Use Passcode',
      });

      if (result.success) {
        await secureStorage.setSecureItem(APP_LOCK_ENABLED_KEY, 'true');
        setIsAppLockEnabled(true);
        return true;
      }
      return false;
    } catch (error) {
      console.warn('[AppLock] Failed to enable app lock');
      return false;
    }
  };

  const disableAppLock = async (): Promise<void> => {
    try {
      await secureStorage.setSecureItem(APP_LOCK_ENABLED_KEY, 'false');
      setIsAppLockEnabled(false);
      setIsLocked(false);
    } catch (error) {
      console.warn('[AppLock] Failed to disable app lock');
    }
  };

  const unlockWithBiometric = async (): Promise<boolean> => {
    if (isCheckingBiometric) return false;
    
    setIsCheckingBiometric(true);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock AgentRoute AI',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
        fallbackLabel: 'Use Passcode',
      });

      if (result.success) {
        setIsLocked(false);
        lastActivityTime.current = Date.now();
        return true;
      }
      
      // CRITICAL: If biometric fails, we still allow the user to continue
      // This prevents blocking App Review testers or users with biometric issues
      return false;
    } catch (error) {
      console.warn('[AppLock] Biometric authentication error');
      return false;
    } finally {
      setIsCheckingBiometric(false);
    }
  };

  // Skip lock - allows user to continue without biometric
  // This is the graceful fallback to prevent blocking
  const skipLock = useCallback(() => {
    setIsLocked(false);
    lastActivityTime.current = Date.now();
  }, []);

  return (
    <AppLockContext.Provider
      value={{
        isLocked,
        isAppLockEnabled,
        isBiometricAvailable,
        biometricType,
        isCheckingBiometric,
        enableAppLock,
        disableAppLock,
        unlockWithBiometric,
        skipLock,
        updateLastActivity,
      }}
    >
      {children}
    </AppLockContext.Provider>
  );
}

export function useAppLock() {
  const context = useContext(AppLockContext);
  if (context === undefined) {
    throw new Error('useAppLock must be used within an AppLockProvider');
  }
  return context;
}
