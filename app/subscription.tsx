/**
 * Subscription/Paywall Screen for AgentRoute AI CRM
 * PRODUCTION-READY - Full Error Handling & Diagnostics
 * 
 * Configuration:
 * - Bundle ID: app.emergent.agentrouteai2dd9b4e9
 * - Product ID: agentroute.monthly
 * - Price: $30/month (loaded from App Store)
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSubscription } from '../src/contexts/SubscriptionContext';

const FEATURES = [
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
  {
    icon: 'git-branch-outline' as const,
    title: 'Sales Pipeline',
    description: 'Track leads through every stage of your pipeline',
  },
  {
    icon: 'calendar-outline' as const,
    title: 'Smart Scheduling',
    description: 'Optimized route planning and appointments',
  },
];

export default function SubscriptionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    isLoading,
    isPremium,
    monthlyPackage,
    purchaseMonthly,
    restorePurchases,
    subscriptionStatus,
    error,
    diagnostics,
    retryInitialization,
  } = useSubscription();

  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Auto-retry on mount if no package loaded
  useEffect(() => {
    if (!monthlyPackage && !isLoading && !error) {
      retryInitialization();
    }
  }, []);

  // Get price from package or show default
  const priceString = monthlyPackage?.product?.priceString || '$29.99';
  const productTitle = monthlyPackage?.product?.title || 'AgentRoute Premium';

  // Determine UI state
  const productsLoaded = monthlyPackage !== null;
  const showError = !isLoading && !productsLoaded && error;
  const showRetry = !isLoading && !productsLoaded && !isPremium;

  const handlePurchase = async () => {
    if (!monthlyPackage) {
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

  const handleRestore = async () => {
    setIsRestoring(true);
    try {
      const success = await restorePurchases();
      if (success) {
        router.back();
      }
    } finally {
      setIsRestoring(false);
    }
  };

  const handleRetry = async () => {
    await retryInitialization();
  };

  // If user is already premium, show success state
  if (isPremium && !isLoading) {
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

        {/* Features List */}
        <View style={styles.featuresSection}>
          <Text style={styles.featuresTitle}>Everything you need to succeed</Text>
          {FEATURES.map((feature, index) => (
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
            <View style={styles.pricingBadge}>
              <Text style={styles.pricingBadgeText}>BEST VALUE</Text>
            </View>
            <Text style={styles.planName}>{productTitle}</Text>
            <View style={styles.priceContainer}>
              <Text style={styles.priceAmount}>{priceString}</Text>
              <Text style={styles.pricePeriod}>/month</Text>
            </View>
            <Text style={styles.priceNote}>Billed monthly. Cancel anytime.</Text>
            {!productsLoaded && !isLoading && (
              <Text style={styles.priceLoadingNote}>
                Price shown is default. Actual price loading...
              </Text>
            )}
          </View>
        </View>

        {/* Error Display */}
        {showError && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={24} color="#EF4444" />
            <View style={styles.errorTextContainer}>
              <Text style={styles.errorTitle}>Connection Issue</Text>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          </View>
        )}

        {/* Retry Section */}
        {showRetry && (
          <View style={styles.retryContainer}>
            <Ionicons name="cloud-offline-outline" size={48} color="#64748B" />
            <Text style={styles.retryTitle}>Unable to Load Products</Text>
            <Text style={styles.retryText}>
              We couldn't connect to the App Store. Please check your internet connection and try again.
            </Text>
            <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
              <Ionicons name="refresh-outline" size={20} color="#FFFFFF" />
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>

            {/* Diagnostics Toggle */}
            <TouchableOpacity
              style={styles.diagnosticsToggle}
              onPress={() => setShowDiagnostics(!showDiagnostics)}
            >
              <Text style={styles.diagnosticsToggleText}>
                {showDiagnostics ? 'Hide Details' : 'Show Technical Details'}
              </Text>
            </TouchableOpacity>

            {/* Diagnostics Panel */}
            {showDiagnostics && diagnostics && (
              <View style={styles.diagnosticsPanel}>
                <Text style={styles.diagnosticsTitle}>Diagnostics</Text>
                <Text style={styles.diagnosticsItem}>
                  Platform: {diagnostics.platform}
                </Text>
                <Text style={styles.diagnosticsItem}>
                  SDK Initialized: {diagnostics.isInitialized ? 'Yes' : 'No'}
                </Text>
                <Text style={styles.diagnosticsItem}>
                  API Key Set: {diagnostics.apiKeySet ? 'Yes' : 'No'}
                </Text>
                <Text style={styles.diagnosticsItem}>
                  Offerings Available: {diagnostics.offeringsAvailable ? 'Yes' : 'No'}
                </Text>
                <Text style={styles.diagnosticsItem}>
                  Current Offering: {diagnostics.currentOfferingId || 'None'}
                </Text>
                <Text style={styles.diagnosticsItem}>
                  Packages Count: {diagnostics.packagesCount}
                </Text>
                <Text style={styles.diagnosticsItem}>
                  Monthly Package Found: {diagnostics.monthlyPackageFound ? 'Yes' : 'No'}
                </Text>
                {diagnostics.lastError && (
                  <Text style={styles.diagnosticsError}>
                    Error: {diagnostics.lastError}
                  </Text>
                )}
              </View>
            )}
          </View>
        )}

        {/* Subscribe Button */}
        <TouchableOpacity
          style={[
            styles.subscribeButton,
            (isLoading || isPurchasing || !monthlyPackage) && styles.subscribeButtonDisabled,
          ]}
          onPress={handlePurchase}
          disabled={isLoading || isPurchasing || !monthlyPackage}
        >
          {isPurchasing ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : isLoading ? (
            <>
              <ActivityIndicator color="#FFFFFF" size="small" style={{ marginRight: 8 }} />
              <Text style={styles.subscribeButtonText}>Loading...</Text>
            </>
          ) : (
            <>
              <Ionicons name="card-outline" size={20} color="#FFFFFF" style={styles.buttonIcon} />
              <Text style={styles.subscribeButtonText}>
                {monthlyPackage ? `Subscribe for ${priceString}/month` : 'Subscription Unavailable'}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {/* Restore Purchases */}
        <TouchableOpacity
          style={styles.restoreButton}
          onPress={handleRestore}
          disabled={isLoading || isRestoring}
        >
          {isRestoring ? (
            <ActivityIndicator color="#3B82F6" size="small" />
          ) : (
            <Text style={styles.restoreButtonText}>Restore Purchases</Text>
          )}
        </TouchableOpacity>

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
          <Text style={styles.legalDisclaimer}>
            Payment will be charged to your Apple ID account at confirmation of purchase.
            Subscription automatically renews unless canceled at least 24 hours before the end of the current period.
            You can manage and cancel your subscription in your App Store account settings.
          </Text>
        </View>
      </ScrollView>

      {/* Loading Overlay - Only show during initial load */}
      {isLoading && !monthlyPackage && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading subscription options...</Text>
        </View>
      )}
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
  heroSection: {
    alignItems: 'center',
    marginBottom: 32,
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
  featuresSection: {
    marginBottom: 32,
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
  pricingBadge: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 12,
  },
  pricingBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
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
  priceLoadingNote: {
    fontSize: 12,
    color: '#F59E0B',
    marginTop: 8,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#EF444420',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  errorTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  errorTitle: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 14,
    lineHeight: 20,
  },
  subscribeButton: {
    flexDirection: 'row',
    backgroundColor: '#3B82F6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  subscribeButtonDisabled: {
    backgroundColor: '#3B82F680',
  },
  buttonIcon: {
    marginRight: 8,
  },
  subscribeButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  restoreButton: {
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 24,
  },
  restoreButtonText: {
    color: '#3B82F6',
    fontSize: 16,
    fontWeight: '500',
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
    marginBottom: 12,
  },
  legalLink: {
    color: '#3B82F6',
    textDecorationLine: 'underline',
  },
  legalDisclaimer: {
    fontSize: 11,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 16,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#FFFFFF',
    marginTop: 12,
    fontSize: 16,
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
  retryContainer: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  retryTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 16,
    marginBottom: 8,
  },
  retryText: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  retryButton: {
    flexDirection: 'row',
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  diagnosticsToggle: {
    marginTop: 16,
    padding: 8,
  },
  diagnosticsToggleText: {
    color: '#64748B',
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  diagnosticsPanel: {
    marginTop: 16,
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 16,
    width: '100%',
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
});
