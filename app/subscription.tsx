/**
 * Subscription/Paywall Screen for AgentRoute AI CRM
 * Uses RevenueCat Paywalls UI for native paywall experience
 * 
 * Configuration:
 * - Bundle ID: app.emergent.agentrouteai2dd9b4e9
 * - Product ID: agentroute.monthly
 * - Entitlement: premium
 * - Offering: default
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  Platform,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';
import Purchases from 'react-native-purchases';
import { useSubscription } from '../src/contexts/SubscriptionContext';
import { useAuth } from '../src/contexts/AuthContext';

// Features to display if RevenueCat paywall fails
const FALLBACK_FEATURES = [
  {
    icon: 'infinite-outline' as const,
    title: 'Unlimited Leads',
    description: 'Manage unlimited leads and prospects',
  },
  {
    icon: 'analytics-outline' as const,
    title: 'Advanced Analytics',
    description: 'Deep insights into your sales performance',
  },
  {
    icon: 'people-outline' as const,
    title: 'Team Collaboration',
    description: 'Full team management and hierarchy',
  },
  {
    icon: 'chatbubbles-outline' as const,
    title: 'AI Sales Coach',
    description: 'Personalized AI coaching for better results',
  },
];

export default function SubscriptionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const {
    isLoading: contextLoading,
    isPremium,
    monthlyPackage,
    purchaseMonthly,
    restorePurchases,
    subscriptionStatus,
    error: contextError,
    diagnostics,
    retryInitialization,
    refreshStatus,
  } = useSubscription();

  const [isShowingPaywall, setIsShowingPaywall] = useState(false);
  const [paywallError, setPaywallError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [showFallback, setShowFallback] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Try to show RevenueCat paywall on mount
  useEffect(() => {
    const showPaywall = async () => {
      setIsInitializing(true);
      setPaywallError(null);
      
      try {
        console.log('[Subscription] Attempting to show RevenueCat paywall...');
        
        // Present paywall if user doesn't have premium entitlement
        const result = await RevenueCatUI.presentPaywallIfNeeded({
          requiredEntitlementIdentifier: 'premium',
        });

        console.log('[Subscription] Paywall result:', result);

        switch (result) {
          case PAYWALL_RESULT.PURCHASED:
            console.log('[Subscription] Purchase completed via paywall');
            await refreshStatus();
            router.back();
            break;
          case PAYWALL_RESULT.RESTORED:
            console.log('[Subscription] Purchases restored via paywall');
            await refreshStatus();
            router.back();
            break;
          case PAYWALL_RESULT.NOT_PRESENTED:
            // User already has entitlement
            console.log('[Subscription] Paywall not presented - user is premium');
            router.back();
            break;
          case PAYWALL_RESULT.CANCELLED:
            console.log('[Subscription] Paywall dismissed by user');
            // Stay on screen, show fallback
            setShowFallback(true);
            break;
          case PAYWALL_RESULT.ERROR:
            console.log('[Subscription] Paywall error');
            setPaywallError('Unable to load subscription options');
            setShowFallback(true);
            break;
          default:
            setShowFallback(true);
        }
      } catch (error: any) {
        console.error('[Subscription] Paywall error:', error);
        
        // Check if it's a "no paywall configured" error
        if (error.message?.includes('no paywall') || 
            error.message?.includes('No current offering') ||
            error.code === 'CONFIGURATION_ERROR') {
          setPaywallError('Paywall not configured in RevenueCat dashboard');
        } else {
          setPaywallError(error.message || 'Failed to load paywall');
        }
        setShowFallback(true);
      } finally {
        setIsInitializing(false);
      }
    };

    // Small delay to ensure SDK is configured
    const timer = setTimeout(showPaywall, 500);
    return () => clearTimeout(timer);
  }, []);

  // Manual paywall trigger
  const handleShowPaywall = async () => {
    setIsShowingPaywall(true);
    try {
      const result = await RevenueCatUI.presentPaywall();
      
      if (result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED) {
        await refreshStatus();
        router.back();
      }
    } catch (error: any) {
      console.error('[Subscription] Manual paywall error:', error);
      Alert.alert('Error', error.message || 'Failed to show subscription options');
    } finally {
      setIsShowingPaywall(false);
    }
  };

  // Fallback purchase using our custom flow
  const handleFallbackPurchase = async () => {
    if (!monthlyPackage) {
      Alert.alert(
        'Subscription Unavailable',
        'Unable to load subscription options. Please try again later.'
      );
      return;
    }

    setIsPurchasing(true);
    try {
      const success = await purchaseMonthly();
      if (success) {
        router.back();
      }
    } finally {
      setIsPurchasing(false);
    }
  };

  // Restore purchases
  const handleRestore = async () => {
    setIsRestoring(true);
    try {
      const customerInfo = await Purchases.restorePurchases();
      const hasPremium = customerInfo.entitlements.active['premium']?.isActive ?? false;
      
      if (hasPremium) {
        await refreshStatus();
        Alert.alert('Success', 'Your subscription has been restored!');
        router.back();
      } else {
        Alert.alert('No Subscription Found', 'No active subscription was found to restore.');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to restore purchases');
    } finally {
      setIsRestoring(false);
    }
  };

  // Retry initialization
  const handleRetry = async () => {
    setPaywallError(null);
    setShowFallback(false);
    setIsInitializing(true);
    
    try {
      await retryInitialization();
      
      // Try paywall again
      const result = await RevenueCatUI.presentPaywallIfNeeded({
        requiredEntitlementIdentifier: 'premium',
      });
      
      if (result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED) {
        await refreshStatus();
        router.back();
      } else {
        setShowFallback(true);
      }
    } catch (error: any) {
      setPaywallError(error.message || 'Failed to load paywall');
      setShowFallback(true);
    } finally {
      setIsInitializing(false);
    }
  };

  // If user is already premium, show success state
  if (isPremium && !isInitializing) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <View style={styles.premiumContainer}>
          <View style={styles.premiumIconContainer}>
            <Ionicons name="checkmark-circle" size={80} color="#22C55E" />
          </View>
          <Text style={styles.premiumTitle}>You're Premium!</Text>
          <Text style={styles.premiumSubtitle}>
            You have full access to all AgentRoute features.
          </Text>
          {subscriptionStatus?.expirationDate && (
            <Text style={styles.expirationText}>
              {subscriptionStatus.willRenew ? 'Renews' : 'Expires'}: {new Date(subscriptionStatus.expirationDate).toLocaleDateString()}
            </Text>
          )}
          <TouchableOpacity
            style={styles.doneButton}
            onPress={() => router.back()}
          >
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Loading state
  if (isInitializing) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading subscription options...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Fallback UI when RevenueCat paywall fails
  if (showFallback) {
    const priceString = monthlyPackage?.product?.priceString || '$29.99';
    const productsLoaded = monthlyPackage !== null;

    return (
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero Section */}
          <View style={styles.heroSection}>
            <View style={styles.iconContainer}>
              <Ionicons name="star" size={40} color="#3B82F6" />
            </View>
            <Text style={styles.heroTitle}>Upgrade to Premium</Text>
            <Text style={styles.heroSubtitle}>
              Unlock the full potential of AgentRoute AI
            </Text>
          </View>

          {/* Error Message */}
          {paywallError && (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={24} color="#F59E0B" />
              <View style={styles.errorTextContainer}>
                <Text style={styles.errorTitle}>Native Paywall Unavailable</Text>
                <Text style={styles.errorText}>{paywallError}</Text>
              </View>
            </View>
          )}

          {/* Features List */}
          <View style={styles.featuresSection}>
            <Text style={styles.featuresTitle}>Premium Features</Text>
            {FALLBACK_FEATURES.map((feature, index) => (
              <View key={index} style={styles.featureItem}>
                <View style={styles.featureIconContainer}>
                  <Ionicons name={feature.icon} size={24} color="#3B82F6" />
                </View>
                <View style={styles.featureTextContainer}>
                  <Text style={styles.featureTitle}>{feature.title}</Text>
                  <Text style={styles.featureDescription}>{feature.description}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Pricing Card */}
          <View style={styles.pricingSection}>
            <View style={styles.pricingCard}>
              <Text style={styles.planName}>AgentRoute Premium</Text>
              <View style={styles.priceContainer}>
                <Text style={styles.priceAmount}>{priceString}</Text>
                <Text style={styles.pricePeriod}>/month</Text>
              </View>
              <Text style={styles.priceNote}>Cancel anytime</Text>
            </View>
          </View>

          {/* Try RevenueCat Paywall Button */}
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleShowPaywall}
            disabled={isShowingPaywall}
          >
            {isShowingPaywall ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="card-outline" size={20} color="#FFFFFF" style={styles.buttonIcon} />
                <Text style={styles.primaryButtonText}>Show Subscription Options</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Fallback Purchase Button (if products loaded) */}
          {productsLoaded && (
            <TouchableOpacity
              style={[styles.secondaryButton, isPurchasing && styles.buttonDisabled]}
              onPress={handleFallbackPurchase}
              disabled={isPurchasing}
            >
              {isPurchasing ? (
                <ActivityIndicator color="#3B82F6" />
              ) : (
                <Text style={styles.secondaryButtonText}>
                  Subscribe for {priceString}/month
                </Text>
              )}
            </TouchableOpacity>
          )}

          {/* Restore Purchases */}
          <TouchableOpacity
            style={styles.restoreButton}
            onPress={handleRestore}
            disabled={isRestoring}
          >
            {isRestoring ? (
              <ActivityIndicator color="#3B82F6" size="small" />
            ) : (
              <Text style={styles.restoreButtonText}>Restore Purchases</Text>
            )}
          </TouchableOpacity>

          {/* Retry Button */}
          <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
            <Ionicons name="refresh-outline" size={16} color="#64748B" />
            <Text style={styles.retryButtonText}>Retry Loading Paywall</Text>
          </TouchableOpacity>

          {/* Diagnostics Toggle */}
          <TouchableOpacity
            style={styles.diagnosticsToggle}
            onPress={() => setShowDiagnostics(!showDiagnostics)}
          >
            <Text style={styles.diagnosticsToggleText}>
              {showDiagnostics ? 'Hide Technical Details' : 'Show Technical Details'}
            </Text>
          </TouchableOpacity>

          {/* Diagnostics Panel */}
          {showDiagnostics && diagnostics && (
            <View style={styles.diagnosticsPanel}>
              <Text style={styles.diagnosticsTitle}>Diagnostics</Text>
              <Text style={styles.diagnosticsItem}>Platform: {diagnostics.platform}</Text>
              <Text style={styles.diagnosticsItem}>SDK Initialized: {diagnostics.isInitialized ? 'Yes' : 'No'}</Text>
              <Text style={styles.diagnosticsItem}>API Key Set: {diagnostics.apiKeySet ? 'Yes' : 'No'}</Text>
              <Text style={styles.diagnosticsItem}>Offerings Available: {diagnostics.offeringsAvailable ? 'Yes' : 'No'}</Text>
              <Text style={styles.diagnosticsItem}>Current Offering: {diagnostics.currentOfferingId || 'None'}</Text>
              <Text style={styles.diagnosticsItem}>Packages Count: {diagnostics.packagesCount}</Text>
              <Text style={styles.diagnosticsItem}>Monthly Package: {diagnostics.monthlyPackageFound ? 'Found' : 'Not Found'}</Text>
              {diagnostics.lastError && (
                <Text style={styles.diagnosticsError}>Error: {diagnostics.lastError}</Text>
              )}
            </View>
          )}

          {/* Legal Links */}
          <View style={styles.legalSection}>
            <Text style={styles.legalText}>
              By subscribing, you agree to our{' '}
              <Text style={styles.legalLink} onPress={() => router.push('/legal/terms')}>
                Terms of Service
              </Text>
              {' '}and{' '}
              <Text style={styles.legalLink} onPress={() => router.push('/legal/privacy')}>
                Privacy Policy
              </Text>
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Default: empty state while waiting
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={28} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  closeButton: {
    padding: 8,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#FFFFFF',
    marginTop: 16,
    fontSize: 16,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#3B82F620',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: 16,
    color: '#94A3B8',
    textAlign: 'center',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F59E0B20',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  errorTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  errorTitle: {
    color: '#F59E0B',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  errorText: {
    color: '#FCD34D',
    fontSize: 14,
    lineHeight: 20,
  },
  featuresSection: {
    marginBottom: 24,
  },
  featuresTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  featureIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#3B82F615',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  featureTextContainer: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  featureDescription: {
    fontSize: 14,
    color: '#94A3B8',
  },
  pricingSection: {
    marginBottom: 24,
  },
  pricingCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#3B82F6',
  },
  planName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  priceAmount: {
    fontSize: 40,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  pricePeriod: {
    fontSize: 18,
    color: '#94A3B8',
    marginLeft: 4,
  },
  priceNote: {
    fontSize: 14,
    color: '#64748B',
  },
  primaryButton: {
    flexDirection: 'row',
    backgroundColor: '#3B82F6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  buttonIcon: {
    marginRight: 8,
  },
  secondaryButton: {
    backgroundColor: '#1E293B',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  secondaryButtonText: {
    color: '#3B82F6',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  restoreButton: {
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  restoreButtonText: {
    color: '#3B82F6',
    fontSize: 16,
    fontWeight: '500',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginBottom: 16,
  },
  retryButtonText: {
    color: '#64748B',
    fontSize: 14,
    marginLeft: 6,
  },
  diagnosticsToggle: {
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 16,
  },
  diagnosticsToggleText: {
    color: '#64748B',
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  diagnosticsPanel: {
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  diagnosticsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 12,
  },
  diagnosticsItem: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  diagnosticsError: {
    fontSize: 12,
    color: '#EF4444',
    marginTop: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  legalSection: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  legalText: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
  },
  legalLink: {
    color: '#3B82F6',
    textDecorationLine: 'underline',
  },
  premiumContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  premiumIconContainer: {
    marginBottom: 24,
  },
  premiumTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  premiumSubtitle: {
    fontSize: 16,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 8,
  },
  expirationText: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 32,
  },
  doneButton: {
    backgroundColor: '#22C55E',
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 12,
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
});
