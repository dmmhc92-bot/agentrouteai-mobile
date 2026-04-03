/**
 * RevenueCat Service for AgentRoute AI CRM
 * PRODUCTION-READY - Full Error Handling
 * 
 * Configuration:
 * - Bundle ID: app.emergent.agentrouteai2dd9b4e9
 * - Product ID: agentroute.monthly
 * - Entitlement ID: premium
 * - Offering ID: default
 */

import Purchases, {
  PurchasesOffering,
  PurchasesPackage,
  CustomerInfo,
  LOG_LEVEL,
} from 'react-native-purchases';
import { Platform } from 'react-native';

// RevenueCat Configuration - PRODUCTION
const REVENUECAT_API_KEY_IOS = 'appl_CQgM11NfshsgSfUtCGgmlFpKEzw';
const REVENUECAT_API_KEY_ANDROID = 'goog_YOUR_REVENUECAT_ANDROID_API_KEY';

// Product Configuration - MUST MATCH App Store Connect & RevenueCat Dashboard
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

// Diagnostic info for debugging
export interface RevenueCatDiagnostics {
  isInitialized: boolean;
  platform: string;
  apiKeySet: boolean;
  offeringsAvailable: boolean;
  currentOfferingId: string | null;
  packagesCount: number;
  monthlyPackageFound: boolean;
  lastError: string | null;
}

class RevenueCatService {
  private isInitialized = false;
  private currentOffering: PurchasesOffering | null = null;
  private lastError: string | null = null;
  private initPromise: Promise<boolean> | null = null;

  /**
   * Initialize RevenueCat SDK
   * Uses singleton pattern to prevent double initialization
   */
  async initialize(userId?: string): Promise<boolean> {
    // Return existing promise if initialization is in progress
    if (this.initPromise) {
      return this.initPromise;
    }

    // Already initialized
    if (this.isInitialized) {
      console.log('[RevenueCat] Already initialized');
      return true;
    }

    this.initPromise = this._doInitialize(userId);
    const result = await this.initPromise;
    this.initPromise = null;
    return result;
  }

  private async _doInitialize(userId?: string): Promise<boolean> {
    try {
      // Set log level - DEBUG for development, WARN for production
      Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN);

      // Get platform-specific API key
      const apiKey = Platform.OS === 'ios' ? REVENUECAT_API_KEY_IOS : REVENUECAT_API_KEY_ANDROID;

      if (!apiKey || apiKey.includes('YOUR_REVENUECAT')) {
        this.lastError = `API key not configured for ${Platform.OS}`;
        console.error('[RevenueCat]', this.lastError);
        return false;
      }

      console.log('[RevenueCat] Configuring SDK for', Platform.OS);
      console.log('[RevenueCat] API Key prefix:', apiKey.substring(0, 10) + '...');

      // Configure RevenueCat
      await Purchases.configure({ apiKey });

      // Identify user if provided
      if (userId) {
        try {
          await Purchases.logIn(userId);
          console.log('[RevenueCat] User identified:', userId);
        } catch (loginError: any) {
          // Non-fatal - continue without user identification
          console.warn('[RevenueCat] User identification failed:', loginError.message);
        }
      }

      this.isInitialized = true;
      this.lastError = null;
      console.log('[RevenueCat] SDK initialized successfully');
      return true;
    } catch (error: any) {
      this.lastError = error.message || 'Unknown initialization error';
      console.error('[RevenueCat] Initialization failed:', this.lastError);
      this.isInitialized = false;
      return false;
    }
  }

  /**
   * Identify user (call after login)
   */
  async identifyUser(userId: string): Promise<boolean> {
    if (!this.isInitialized) {
      console.warn('[RevenueCat] SDK not initialized, attempting initialization...');
      const initialized = await this.initialize(userId);
      if (!initialized) return false;
    }

    try {
      await Purchases.logIn(userId);
      console.log('[RevenueCat] User identified:', userId);
      return true;
    } catch (error: any) {
      this.lastError = error.message || 'User identification failed';
      console.error('[RevenueCat] Error identifying user:', this.lastError);
      return false;
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
    } catch (error: any) {
      console.error('[RevenueCat] Error logging out:', error.message);
    }
  }

  /**
   * Get available offerings/products
   * This is the critical function for loading subscription options
   */
  async getOfferings(): Promise<PurchasesOffering | null> {
    if (!this.isInitialized) {
      this.lastError = 'SDK not initialized - cannot fetch offerings';
      console.error('[RevenueCat]', this.lastError);
      return null;
    }

    try {
      console.log('[RevenueCat] Fetching offerings...');
      const offerings = await Purchases.getOfferings();

      console.log('[RevenueCat] Offerings response:', {
        hasOfferings: !!offerings,
        currentId: offerings?.current?.identifier || 'none',
        allOfferingsCount: Object.keys(offerings?.all || {}).length,
      });

      if (offerings.current) {
        this.currentOffering = offerings.current;
        console.log('[RevenueCat] Current offering:', offerings.current.identifier);
        console.log('[RevenueCat] Available packages:', offerings.current.availablePackages.length);
        
        // Log each package for debugging
        offerings.current.availablePackages.forEach((pkg, i) => {
          console.log(`[RevenueCat] Package ${i + 1}:`, {
            identifier: pkg.identifier,
            productId: pkg.product.identifier,
            price: pkg.product.priceString,
            type: pkg.packageType,
          });
        });

        this.lastError = null;
        return offerings.current;
      }

      // No current offering - check if there are any offerings at all
      const allOfferingKeys = Object.keys(offerings.all || {});
      if (allOfferingKeys.length > 0) {
        this.lastError = `No "current" offering set. Available offerings: ${allOfferingKeys.join(', ')}. Set one as current in RevenueCat dashboard.`;
      } else {
        this.lastError = 'No offerings configured in RevenueCat. Create an offering with products in the dashboard.';
      }
      
      console.error('[RevenueCat]', this.lastError);
      return null;
    } catch (error: any) {
      this.lastError = error.message || 'Failed to fetch offerings';
      console.error('[RevenueCat] Error getting offerings:', this.lastError);
      return null;
    }
  }

  /**
   * Get the monthly subscription package
   */
  async getMonthlyPackage(): Promise<PurchasesPackage | null> {
    const offering = this.currentOffering || await this.getOfferings();
    if (!offering) {
      return null;
    }

    // Try multiple ways to find the monthly package
    // 1. Direct monthly property
    if (offering.monthly) {
      console.log('[RevenueCat] Found monthly package via .monthly property');
      return offering.monthly;
    }

    // 2. Find by product ID
    const byProductId = offering.availablePackages.find(
      p => p.product.identifier === PRODUCT_ID
    );
    if (byProductId) {
      console.log('[RevenueCat] Found monthly package via product ID:', PRODUCT_ID);
      return byProductId;
    }

    // 3. Find by package type
    const byType = offering.availablePackages.find(
      p => p.packageType === 'MONTHLY'
    );
    if (byType) {
      console.log('[RevenueCat] Found monthly package via MONTHLY type');
      return byType;
    }

    // 4. If only one package exists, use it
    if (offering.availablePackages.length === 1) {
      console.log('[RevenueCat] Using only available package');
      return offering.availablePackages[0];
    }

    this.lastError = `Monthly package not found. Product ID "${PRODUCT_ID}" not in offering. Available: ${offering.availablePackages.map(p => p.product.identifier).join(', ') || 'none'}`;
    console.error('[RevenueCat]', this.lastError);
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
      console.log('[RevenueCat] Active entitlements:', Object.keys(customerInfo.entitlements.active));

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
    } catch (error: any) {
      console.error('[RevenueCat] Error getting subscription status:', error.message);
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
    } catch (error: any) {
      console.error('[RevenueCat] Error checking premium status:', error.message);
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
    } catch (error: any) {
      console.error('[RevenueCat] Error getting customer info:', error.message);
      return null;
    }
  }

  /**
   * Check if SDK is ready
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Get diagnostics for debugging
   */
  getDiagnostics(): RevenueCatDiagnostics {
    return {
      isInitialized: this.isInitialized,
      platform: Platform.OS,
      apiKeySet: Platform.OS === 'ios' 
        ? !REVENUECAT_API_KEY_IOS.includes('YOUR_REVENUECAT')
        : !REVENUECAT_API_KEY_ANDROID.includes('YOUR_REVENUECAT'),
      offeringsAvailable: this.currentOffering !== null,
      currentOfferingId: this.currentOffering?.identifier || null,
      packagesCount: this.currentOffering?.availablePackages.length || 0,
      monthlyPackageFound: this.currentOffering?.monthly !== null || 
        (this.currentOffering?.availablePackages.some(p => 
          p.product.identifier === PRODUCT_ID || p.packageType === 'MONTHLY'
        ) ?? false),
      lastError: this.lastError,
    };
  }

  /**
   * Get last error message
   */
  getLastError(): string | null {
    return this.lastError;
  }
}

// Export singleton instance
export const revenueCatService = new RevenueCatService();
export default revenueCatService;
