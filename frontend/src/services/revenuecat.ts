/**
 * RevenueCat Service for AgentRoute AI CRM
 * 
 * Configuration:
 * - Bundle ID: app.emergent.agentrouteai2dd9b4e9
 * - Product ID: agentroute.monthly
 * - Subscription Group: AgentRoute premium
 * - Price: $30/month
 */

import Purchases, {
  PurchasesOffering,
  PurchasesPackage,
  CustomerInfo,
  LOG_LEVEL,
  PurchasesEntitlementInfo,
} from 'react-native-purchases';
import { Platform } from 'react-native';

// RevenueCat Configuration
// Bundle ID: app.emergent.agentrouteai2dd9b4e9
// Product ID: agentroute.monthly
// Subscription Group: AgentRoute premium
const REVENUECAT_API_KEY_IOS = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS || 'appl_CQgM11NfsHsgSfUtCGgmiFpKEzw';
const REVENUECAT_API_KEY_ANDROID = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID || 'goog_YOUR_REVENUECAT_ANDROID_API_KEY';

// Entitlement and Product IDs - DO NOT CHANGE
export const ENTITLEMENT_ID = 'premium';
export const PRODUCT_ID = 'agentroute.monthly';
export const OFFERING_ID = 'default';

// Subscription status type
export interface SubscriptionStatus {
  isSubscribed: boolean;
  expirationDate: string | null;
  productId: string | null;
  willRenew: boolean;
  isInTrial: boolean;
  isActive: boolean;
}

class RevenueCatService {
  private isInitialized = false;
  private currentOffering: PurchasesOffering | null = null;

  /**
   * Initialize RevenueCat SDK
   * Call this once when app starts
   */
  async initialize(userId?: string): Promise<boolean> {
    if (this.isInitialized) {
      console.log('[RevenueCat] Already initialized');
      return true;
    }

    try {
      // Set log level for debugging (change to WARN in production)
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);

      // Get the appropriate API key based on platform
      const apiKey = Platform.OS === 'ios' ? REVENUECAT_API_KEY_IOS : REVENUECAT_API_KEY_ANDROID;

      if (!apiKey || apiKey.includes('YOUR_REVENUECAT')) {
        console.warn('[RevenueCat] API key not configured. Please add your RevenueCat API key.');
        // Return true to allow app to function without subscription
        return false;
      }

      // Configure RevenueCat
      await Purchases.configure({ apiKey });

      // If we have a user ID, identify them
      if (userId) {
        await Purchases.logIn(userId);
        console.log('[RevenueCat] User identified:', userId);
      }

      this.isInitialized = true;
      console.log('[RevenueCat] SDK initialized successfully');
      return true;
    } catch (error) {
      console.error('[RevenueCat] Initialization error:', error);
      return false;
    }
  }

  /**
   * Identify user (call after login)
   */
  async identifyUser(userId: string): Promise<void> {
    if (!this.isInitialized) {
      console.warn('[RevenueCat] SDK not initialized, cannot identify user');
      return;
    }

    try {
      await Purchases.logIn(userId);
      console.log('[RevenueCat] User identified:', userId);
    } catch (error) {
      console.error('[RevenueCat] Error identifying user:', error);
    }
  }

  /**
   * Logout user (call after signout)
   */
  async logoutUser(): Promise<void> {
    if (!this.isInitialized) return;

    try {
      await Purchases.logOut();
      console.log('[RevenueCat] User logged out');
    } catch (error) {
      console.error('[RevenueCat] Error logging out:', error);
    }
  }

  /**
   * Get available offerings/products
   */
  async getOfferings(): Promise<PurchasesOffering | null> {
    if (!this.isInitialized) {
      console.warn('[RevenueCat] SDK not initialized');
      return null;
    }

    try {
      const offerings = await Purchases.getOfferings();
      
      if (offerings.current) {
        this.currentOffering = offerings.current;
        console.log('[RevenueCat] Current offering:', offerings.current.identifier);
        console.log('[RevenueCat] Available packages:', offerings.current.availablePackages.length);
        return offerings.current;
      }

      console.warn('[RevenueCat] No current offering available');
      return null;
    } catch (error) {
      console.error('[RevenueCat] Error getting offerings:', error);
      return null;
    }
  }

  /**
   * Get the monthly subscription package
   */
  async getMonthlyPackage(): Promise<PurchasesPackage | null> {
    const offering = await this.getOfferings();
    if (!offering) return null;

    // Look for monthly package
    const monthlyPackage = offering.monthly || 
                          offering.availablePackages.find(p => 
                            p.product.identifier === PRODUCT_ID ||
                            p.packageType === 'MONTHLY'
                          );

    if (monthlyPackage) {
      console.log('[RevenueCat] Monthly package found:', monthlyPackage.product.identifier);
      console.log('[RevenueCat] Price:', monthlyPackage.product.priceString);
      return monthlyPackage;
    }

    console.warn('[RevenueCat] Monthly package not found');
    return null;
  }

  /**
   * Purchase a subscription package
   */
  async purchasePackage(pkg: PurchasesPackage): Promise<{ success: boolean; customerInfo?: CustomerInfo; error?: string }> {
    if (!this.isInitialized) {
      return { success: false, error: 'RevenueCat not initialized' };
    }

    try {
      console.log('[RevenueCat] Starting purchase for:', pkg.product.identifier);
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      
      // Check if the purchase granted the entitlement
      const isPremium = customerInfo.entitlements.active[ENTITLEMENT_ID]?.isActive ?? false;
      
      console.log('[RevenueCat] Purchase completed. Premium:', isPremium);
      return { success: isPremium, customerInfo };
    } catch (error: any) {
      // Handle user cancellation separately
      if (error.userCancelled) {
        console.log('[RevenueCat] User cancelled purchase');
        return { success: false, error: 'cancelled' };
      }

      console.error('[RevenueCat] Purchase error:', error);
      return { success: false, error: error.message || 'Purchase failed' };
    }
  }

  /**
   * Restore previous purchases
   */
  async restorePurchases(): Promise<{ success: boolean; customerInfo?: CustomerInfo; error?: string }> {
    if (!this.isInitialized) {
      return { success: false, error: 'RevenueCat not initialized' };
    }

    try {
      console.log('[RevenueCat] Restoring purchases...');
      const customerInfo = await Purchases.restorePurchases();
      
      const isPremium = customerInfo.entitlements.active[ENTITLEMENT_ID]?.isActive ?? false;
      
      console.log('[RevenueCat] Restore completed. Premium:', isPremium);
      return { success: isPremium, customerInfo };
    } catch (error: any) {
      console.error('[RevenueCat] Restore error:', error);
      return { success: false, error: error.message || 'Restore failed' };
    }
  }

  /**
   * Get current subscription status
   */
  async getSubscriptionStatus(): Promise<SubscriptionStatus> {
    const defaultStatus: SubscriptionStatus = {
      isSubscribed: false,
      expirationDate: null,
      productId: null,
      willRenew: false,
      isInTrial: false,
      isActive: false,
    };

    if (!this.isInitialized) {
      return defaultStatus;
    }

    try {
      const customerInfo = await Purchases.getCustomerInfo();
      const entitlement = customerInfo.entitlements.active[ENTITLEMENT_ID];

      if (entitlement && entitlement.isActive) {
        return {
          isSubscribed: true,
          expirationDate: entitlement.expirationDate,
          productId: entitlement.productIdentifier,
          willRenew: entitlement.willRenew,
          isInTrial: entitlement.periodType === 'TRIAL',
          isActive: true,
        };
      }

      return defaultStatus;
    } catch (error) {
      console.error('[RevenueCat] Error getting subscription status:', error);
      return defaultStatus;
    }
  }

  /**
   * Check if user has premium access
   */
  async isPremium(): Promise<boolean> {
    if (!this.isInitialized) return false;

    try {
      const customerInfo = await Purchases.getCustomerInfo();
      return customerInfo.entitlements.active[ENTITLEMENT_ID]?.isActive ?? false;
    } catch (error) {
      console.error('[RevenueCat] Error checking premium status:', error);
      return false;
    }
  }

  /**
   * Get customer info
   */
  async getCustomerInfo(): Promise<CustomerInfo | null> {
    if (!this.isInitialized) return null;

    try {
      return await Purchases.getCustomerInfo();
    } catch (error) {
      console.error('[RevenueCat] Error getting customer info:', error);
      return null;
    }
  }

  /**
   * Check if SDK is ready
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}

// Export singleton instance
export const revenueCatService = new RevenueCatService();
export default revenueCatService;
