/**
 * Usage Tracking Context for AgentRoute AI
 * 
 * Implements the "3-Use Rule":
 * - Every new user gets 3 free uses of core tools
 * - On the 4th use, a non-blocking subscription prompt appears
 * - Apple Reviewers and test accounts bypass all limits
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';

const USAGE_STORAGE_KEY = '@agentroute_usage_count';
const FREE_USES_LIMIT = 3;

// Apple Reviewer and Test Account Bypass Emails
const BYPASS_EMAILS = [
  // Apple Review Test Accounts
  'appstore_admin@agentroute.com',
  'appstore_manager@agentroute.com',
  'appstore_agent@agentroute.com',
  'apple@example.com',
  'review@apple.com',
  // Owner/Developer accounts
  'dmmhc92@gmail.com',
  // Generic test patterns
  'test@apple.com',
  'sandbox@apple.com',
];

// Bypass code for manual override (Apple reviewers can enter this)
const BYPASS_CODE = 'APPLE2026';

interface UsageContextType {
  // State
  usageCount: number;
  hasReachedLimit: boolean;
  isBypassUser: boolean;
  showSubscriptionPrompt: boolean;
  
  // Actions
  incrementUsage: () => Promise<void>;
  resetUsage: () => Promise<void>;
  dismissPrompt: () => void;
  applyBypassCode: (code: string) => boolean;
  checkAndPrompt: () => boolean; // Returns true if should show prompt
}

const UsageContext = createContext<UsageContextType | undefined>(undefined);

export function UsageProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [usageCount, setUsageCount] = useState(0);
  const [showSubscriptionPrompt, setShowSubscriptionPrompt] = useState(false);
  const [manualBypass, setManualBypass] = useState(false);

  // Check if user is a bypass user (Apple tester, developer, etc.)
  const isBypassUser = React.useMemo(() => {
    if (manualBypass) return true;
    if (!user?.email) return false;
    
    const userEmail = user.email.toLowerCase();
    
    // Check exact matches
    if (BYPASS_EMAILS.some(email => email.toLowerCase() === userEmail)) {
      return true;
    }
    
    // Check patterns (emails containing 'apple' or 'review')
    if (userEmail.includes('apple') || userEmail.includes('review')) {
      return true;
    }
    
    // Check for sandbox/test indicators
    if (userEmail.includes('sandbox') || userEmail.endsWith('@test.com')) {
      return true;
    }
    
    return false;
  }, [user?.email, manualBypass]);

  // Has reached the free usage limit
  const hasReachedLimit = usageCount >= FREE_USES_LIMIT && !isBypassUser;

  // Load usage count from storage
  useEffect(() => {
    const loadUsage = async () => {
      try {
        if (!user?.id) return;
        
        const key = `${USAGE_STORAGE_KEY}_${user.id}`;
        const stored = await AsyncStorage.getItem(key);
        if (stored) {
          setUsageCount(parseInt(stored, 10));
        }
      } catch (error) {
        console.error('[Usage] Error loading usage count:', error);
      }
    };
    
    loadUsage();
  }, [user?.id]);

  /**
   * Increment usage count (call this when user uses a core feature)
   */
  const incrementUsage = useCallback(async () => {
    if (isBypassUser) {
      console.log('[Usage] Bypass user - not tracking usage');
      return;
    }
    
    try {
      const newCount = usageCount + 1;
      setUsageCount(newCount);
      
      if (user?.id) {
        const key = `${USAGE_STORAGE_KEY}_${user.id}`;
        await AsyncStorage.setItem(key, newCount.toString());
      }
      
      console.log(`[Usage] Usage count: ${newCount}/${FREE_USES_LIMIT}`);
      
      // Show prompt after reaching limit
      if (newCount > FREE_USES_LIMIT) {
        setShowSubscriptionPrompt(true);
      }
    } catch (error) {
      console.error('[Usage] Error incrementing usage:', error);
    }
  }, [usageCount, user?.id, isBypassUser]);

  /**
   * Reset usage count (for testing or after subscription)
   */
  const resetUsage = useCallback(async () => {
    try {
      setUsageCount(0);
      setShowSubscriptionPrompt(false);
      
      if (user?.id) {
        const key = `${USAGE_STORAGE_KEY}_${user.id}`;
        await AsyncStorage.removeItem(key);
      }
    } catch (error) {
      console.error('[Usage] Error resetting usage:', error);
    }
  }, [user?.id]);

  /**
   * Dismiss the subscription prompt (non-blocking)
   */
  const dismissPrompt = useCallback(() => {
    setShowSubscriptionPrompt(false);
  }, []);

  /**
   * Apply bypass code for manual override
   */
  const applyBypassCode = useCallback((code: string): boolean => {
    if (code === BYPASS_CODE) {
      setManualBypass(true);
      setShowSubscriptionPrompt(false);
      console.log('[Usage] Bypass code accepted - unlimited access granted');
      return true;
    }
    return false;
  }, []);

  /**
   * Check if should show prompt and return true if so
   */
  const checkAndPrompt = useCallback((): boolean => {
    if (isBypassUser) return false;
    
    if (usageCount >= FREE_USES_LIMIT) {
      setShowSubscriptionPrompt(true);
      return true;
    }
    return false;
  }, [usageCount, isBypassUser]);

  const value: UsageContextType = {
    usageCount,
    hasReachedLimit,
    isBypassUser,
    showSubscriptionPrompt,
    incrementUsage,
    resetUsage,
    dismissPrompt,
    applyBypassCode,
    checkAndPrompt,
  };

  return (
    <UsageContext.Provider value={value}>
      {children}
    </UsageContext.Provider>
  );
}

export function useUsage() {
  const context = useContext(UsageContext);
  if (context === undefined) {
    throw new Error('useUsage must be used within a UsageProvider');
  }
  return context;
}

export { FREE_USES_LIMIT, BYPASS_CODE };
export default UsageContext;
