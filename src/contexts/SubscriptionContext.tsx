/**
 * Subscription Context for AgentRoute AI CRM
 * PRODUCTION-READY - Full Error Handling & Diagnostics
 * 
 * Configuration:
 * - Bundle ID: app.emergent.agentrouteai2dd9b4e9
 * - Product ID: agentroute.monthly
 * - Entitlement: premium
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Alert, Platform } from 'react-native';
import { PurchasesPackage, PurchasesOffering } from 'react-native-purchases';
import { 
  revenueCatService, 
  SubscriptionStatus, 
  RevenueCatDiagnostics,
  ENTITLEMENT_ID, 
  PRODUCT_ID 
} from '../services/revenuecat';
import { useAuth } from './AuthContext';

interface SubscriptionContextType {
  // State
  isLoading: boolean;
  isPremium: boolean;
  isAppleTester: boolean;
  hasFullAccess: boolean;
  subscriptionStatus: SubscriptionStatus | null;
  currentOffering: PurchasesOffering | null;
  monthlyPackage: PurchasesPackage | null;
  error: string | null;
  diagnostics: RevenueCatDiagnostics | null;

  // Actions
  purchaseMonthly: () => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  refreshStatus: () => Promise<void>;
  initializeRevenueCat: () => Promise<void>;
  retryInitialization: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

// Apple Test Accounts - for App Store Review
const APPLE_TESTER_EMAILS = [
  'appstore_admin@agentroute.com',
  'appstore_manager@agentroute.com',
  'appstore_agent@agentroute.com',
];

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [isLoading, setIsLoading] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [isAppleTester, setIsAppleTester] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null);
  const [currentOffering, setCurrentOffering] = useState<PurchasesOffering | null>(null);
  const [monthlyPackage, setMonthlyPackage] = useState<PurchasesPackage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<RevenueCatDiagnostics | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [initializationAttempted, setInitializationAttempted] = useState(false);

  // Check if current user is an Apple tester (for bypass only, not for blocking)
  useEffect(() => {
    if (user?.email) {
      const isTester = APPLE_TESTER_EMAILS.some(
        testerEmail => user.email.toLowerCase() === testerEmail.toLowerCase()
      );
      setIsAppleTester(isTester);
      if (isTester) {
        console.log('[Subscription] Apple Tester detected:', user.email);
      }
    } else {
      setIsAppleTester(false);
    }
  }, [user?.email]);

  // Full access = subscribed OR Apple tester
  const hasFullAccess = isPremium || isAppleTester;

  /**
   * Load available offerings from RevenueCat
   */
  const loadOfferings = useCallback(async (): Promise<boolean> => {
    console.log('[Subscription] Loading offerings...');
    try {
      const offering = await revenueCatService.getOfferings();
      setCurrentOffering(offering);

      if (offering) {
        const monthly = await revenueCatService.getMonthlyPackage();
        setMonthlyPackage(monthly);

        if (monthly) {
          console.log('[Subscription] Monthly package loaded:', monthly.product.priceString);
          return true;
        } else {
          const diag = revenueCatService.getDiagnostics();
          setError(diag.lastError || 'Monthly package not found in offerings');
          return false;
        }
      } else {
        const diag = revenueCatService.getDiagnostics();
        setError(diag.lastError || 'No offerings available');
        return false;
      }
    } catch (err: any) {
      console.error('[Subscription] Error loading offerings:', err);
      setError(err.message || 'Failed to load subscription options');
      return false;
    }
  }, []);

  /**
   * Refresh subscription status
   */
  const refreshStatus = useCallback(async () => {
    if (!revenueCatService.isReady()) {
      console.log('[Subscription] SDK not ready, skipping status refresh');
      return;
    }

    try {
      const status = await revenueCatService.getSubscriptionStatus();
      setSubscriptionStatus(status);
      setIsPremium(status.isActive);
      console.log('[Subscription] Status:', status.isActive ? 'Premium' : 'Free');
    } catch (err: any) {
      console.error('[Subscription] Error refreshing status:', err);
    }
  }, []);

  /**
   * Initialize RevenueCat SDK and load offerings
   * This is the main initialization function
   */
  const initializeRevenueCat = useCallback(async () => {
    if (isLoading) {
      console.log('[Subscription] Initialization already in progress');
      return;
    }

    console.log('[Subscription] Starting initialization...');
    setIsLoading(true);
    setError(null);

    try {
      const userId = user?.id || undefined;
      
      // Step 1: Initialize SDK
      console.log('[Subscription] Step 1: Initialize SDK');
      const sdkInitialized = await revenueCatService.initialize(userId);
      
      if (!sdkInitialized) {
        const diag = revenueCatService.getDiagnostics();
        setDiagnostics(diag);
        setError(diag.lastError || 'Failed to initialize RevenueCat SDK');
        setIsInitialized(false);
        setInitializationAttempted(true);
        console.error('[Subscription] SDK initialization failed');
        return;
      }

      setIsInitialized(true);
      console.log('[Subscription] SDK initialized successfully');

      // Step 2: Load offerings (products)
      console.log('[Subscription] Step 2: Load offerings');
      const offeringsLoaded = await loadOfferings();
      
      if (!offeringsLoaded) {
        console.warn('[Subscription] Offerings not loaded - subscription may not work');
        // Don't return early - still allow status refresh
      }

      // Step 3: Check subscription status
      console.log('[Subscription] Step 3: Check subscription status');
      await refreshStatus();

      // Update diagnostics
      setDiagnostics(revenueCatService.getDiagnostics());
      setInitializationAttempted(true);

      console.log('[Subscription] Initialization complete');
    } catch (err: any) {
      console.error('[Subscription] Initialization error:', err);
      setError(err.message || 'Failed to initialize subscriptions');
      setDiagnostics(revenueCatService.getDiagnostics());
    } finally {
      setIsLoading(false);
      setInitializationAttempted(true);
    }
  }, [user?.id, loadOfferings, refreshStatus, isLoading]);

  /**
   * Retry initialization (for manual retry button)
   */
  const retryInitialization = useCallback(async () => {
    setError(null);
    setInitializationAttempted(false);
    await initializeRevenueCat();
  }, [initializeRevenueCat]);

  /**
   * Purchase monthly subscription
   */
  const purchaseMonthly = useCallback(async (): Promise<boolean> => {
    if (!monthlyPackage) {
      const diag = revenueCatService.getDiagnostics();
      Alert.alert(
        'Subscription Not Available',
        diag.lastError || 'Unable to load subscription options. Please try again later.'
      );
      return false;
    }

    try {
      setIsLoading(true);
      setError(null);

      console.log('[Subscription] Starting purchase...');
      const result = await revenueCatService.purchasePackage(monthlyPackage);

      if (result.error === 'cancelled') {
        console.log('[Subscription] Purchase cancelled by user');
        return false;
      }

      if (result.success) {
        setIsPremium(true);
        await refreshStatus();
        Alert.alert(
          'Welcome to Premium!',
          'Thank you for subscribing to AgentRoute AI Premium. You now have full access to all features.'
        );
        return true;
      } else {
        const errorMsg = result.error || 'Purchase failed. Please try again.';
        Alert.alert('Purchase Failed', errorMsg);
        setError(errorMsg);
        return false;
      }
    } catch (err: any) {
      const errorMsg = err.message || 'An unexpected error occurred.';
      Alert.alert('Purchase Error', errorMsg);
      setError(errorMsg);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [monthlyPackage, refreshStatus]);

  /**
   * Restore previous purchases
   */
  const restorePurchases = useCallback(async (): Promise<boolean> => {
    try {
      setIsLoading(true);
      setError(null);

      console.log('[Subscription] Restoring purchases...');
      const result = await revenueCatService.restorePurchases();

      if (result.success) {
        setIsPremium(true);
        await refreshStatus();
        Alert.alert(
          'Purchases Restored',
          'Your premium subscription has been restored successfully.'
        );
        return true;
      } else {
        Alert.alert(
          'No Purchases Found',
          'No previous purchases were found to restore. If you believe this is an error, please contact support.'
        );
        return false;
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to restore purchases.';
      Alert.alert('Restore Failed', errorMsg);
      setError(errorMsg);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [refreshStatus]);

  // Initialize when user changes
  useEffect(() => {
    if (user?.id && !initializationAttempted) {
      initializeRevenueCat();
    }
  }, [user?.id, initializationAttempted, initializeRevenueCat]);

  // Identify user when SDK is ready
  useEffect(() => {
    if (isInitialized && user?.id) {
      revenueCatService.identifyUser(user.id);
    }
  }, [isInitialized, user?.id]);

  const value: SubscriptionContextType = {
    isLoading,
    isPremium,
    isAppleTester,
    hasFullAccess,
    subscriptionStatus,
    currentOffering,
    monthlyPackage,
    error,
    diagnostics,
    purchaseMonthly,
    restorePurchases,
    refreshStatus,
    initializeRevenueCat,
    retryInitialization,
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
}

export default SubscriptionContext;
