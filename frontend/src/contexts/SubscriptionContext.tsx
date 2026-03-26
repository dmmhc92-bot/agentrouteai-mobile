/**
 * Subscription Context for AgentRoute AI CRM
 * 
 * Manages subscription state across the app using RevenueCat
 * 
 * Configuration:
 * - Bundle ID: app.emergent.agentrouteai2dd9b4e9
 * - Product ID: agentroute.monthly
 * - Entitlement: premium
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Alert, Platform } from 'react-native';
import { PurchasesPackage, PurchasesOffering } from 'react-native-purchases';
import { revenueCatService, SubscriptionStatus, ENTITLEMENT_ID, PRODUCT_ID } from '../services/revenuecat';
import { useAuth } from './AuthContext';

interface SubscriptionContextType {
  // State
  isLoading: boolean;
  isPremium: boolean;
  isAppleTester: boolean;
  hasFullAccess: boolean; // isPremium OR isAppleTester
  subscriptionStatus: SubscriptionStatus | null;
  currentOffering: PurchasesOffering | null;
  monthlyPackage: PurchasesPackage | null;
  error: string | null;

  // Actions
  purchaseMonthly: () => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  refreshStatus: () => Promise<void>;
  initializeRevenueCat: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  
  const [isLoading, setIsLoading] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [isAppleTester, setIsAppleTester] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null);
  const [currentOffering, setCurrentOffering] = useState<PurchasesOffering | null>(null);
  const [monthlyPackage, setMonthlyPackage] = useState<PurchasesPackage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Apple Tester emails - these get full access for App Store review
  const APPLE_TESTER_EMAILS = [
    'appstore_admin@agentroute.com',
    'appstore_manager@agentroute.com', 
    'appstore_agent@agentroute.com',
    'apple@example.com',
    'review@apple.com',
  ];

  // Check if current user is an Apple tester
  useEffect(() => {
    if (user?.email) {
      const isTester = APPLE_TESTER_EMAILS.some(
        testerEmail => user.email.toLowerCase() === testerEmail.toLowerCase()
      );
      setIsAppleTester(isTester);
      if (isTester) {
        console.log('[Subscription] Apple Tester detected - granting full access');
      }
    }
  }, [user?.email]);

  // Full access = subscribed OR Apple tester
  const hasFullAccess = isPremium || isAppleTester;

  /**
   * Initialize RevenueCat SDK
   */
  const initializeRevenueCat = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const userId = user?.id || undefined;
      const success = await revenueCatService.initialize(userId);
      
      if (!success) {
        console.log('[Subscription] RevenueCat not configured, running in free mode');
        setIsInitialized(false);
        setIsLoading(false);
        return;
      }

      setIsInitialized(true);

      // Load offerings and status
      await loadOfferings();
      await refreshStatus();
    } catch (err: any) {
      console.error('[Subscription] Initialization error:', err);
      setError(err.message || 'Failed to initialize subscriptions');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  /**
   * Load available offerings from RevenueCat
   */
  const loadOfferings = async () => {
    try {
      const offering = await revenueCatService.getOfferings();
      setCurrentOffering(offering);

      if (offering) {
        const monthly = await revenueCatService.getMonthlyPackage();
        setMonthlyPackage(monthly);
      }
    } catch (err: any) {
      console.error('[Subscription] Error loading offerings:', err);
    }
  };

  /**
   * Refresh subscription status
   */
  const refreshStatus = useCallback(async () => {
    if (!isInitialized) {
      setIsPremium(false);
      setSubscriptionStatus(null);
      return;
    }

    try {
      const status = await revenueCatService.getSubscriptionStatus();
      setSubscriptionStatus(status);
      setIsPremium(status.isActive);
      console.log('[Subscription] Status refreshed:', status.isActive ? 'Premium' : 'Free');
    } catch (err: any) {
      console.error('[Subscription] Error refreshing status:', err);
    }
  }, [isInitialized]);

  /**
   * Purchase monthly subscription
   */
  const purchaseMonthly = useCallback(async (): Promise<boolean> => {
    if (!monthlyPackage) {
      Alert.alert('Error', 'Subscription not available. Please try again later.');
      return false;
    }

    try {
      setIsLoading(true);
      setError(null);

      const result = await revenueCatService.purchasePackage(monthlyPackage);

      if (result.error === 'cancelled') {
        // User cancelled - no alert needed
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
    if (user?.id) {
      initializeRevenueCat();
    }
  }, [user?.id]);

  // Identify user when they log in
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
    purchaseMonthly,
    restorePurchases,
    refreshStatus,
    initializeRevenueCat,
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
