/**
 * Subscription/Paywall Screen for AgentRoute AI CRM
 * Uses RevenueCat for native purchases
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
import Purchases from 'react-native-purchases';
import { useSubscription } from '../src/contexts/SubscriptionContext';
import { useAuth } from '../src/contexts/AuthContext';
import { LinearGradient } from 'expo-linear-gradient';

// Features to display
const PREMIUM_FEATURES = [
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
    icon: 'calendar-outline' as const,
    title: 'Smart Scheduling',
    description: 'Intelligent appointment management',
  },
  {
    icon: 'shield-checkmark-outline' as const,
    title: 'Priority Support',
    description: '24/7 premium customer support',
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
    initializeRevenueCat,
  } = useSubscription();

  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [initAttempted, setInitAttempted] = useState(false);

  // Initialize subscription on mount
  useEffect(() => {
    const init = async () => {
      if (!initAttempted) {
        setInitAttempted(true);
        await initializeRevenueCat();
      }
    };
    init();
  }, [initAttempted, initializeRevenueCat]);

  // Handle purchase
  const handlePurchase = async () => {
    if (!monthlyPackage) {
      Alert.alert(
        'Subscription Unavailable',
        'Unable to load subscription options. Please try again later.',
        [
          { text: 'Retry', onPress: () => retryInitialization() },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
      return;
    }

    setIsPurchasing(true);
    try {
      const success = await purchaseMonthly();
      if (success) {
        Alert.alert('Success!', 'Welcome to AgentRoute Premium!', [
          { text: 'OK', onPress: () => router.back() }
        ]);
      }
    } catch (error: any) {
      Alert.alert('Purchase Failed', error.message || 'Please try again.');
    } finally {
      setIsPurchasing(false);
    }
  };

  // Handle restore
  const handleRestore = async () => {
    setIsRestoring(true);
    try {
      const customerInfo = await Purchases.restorePurchases();
      const hasPremium = customerInfo.entitlements.active['premium']?.isActive ?? false;
      
      if (hasPremium) {
        await refreshStatus();
        Alert.alert('Success!', 'Your subscription has been restored!', [
          { text: 'OK', onPress: () => router.back() }
        ]);
      } else {
        Alert.alert('No Subscription Found', 'No active subscription was found to restore.');
      }
    } catch (error: any) {
      Alert.alert('Restore Failed', error.message || 'Please try again.');
    } finally {
      setIsRestoring(false);
    }
  };

  // If user is already premium
  if (isPremium) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <View style={styles.premiumContainer}>
          <LinearGradient
            colors={['#22C55E', '#16A34A']}
            style={styles.premiumBadge}
          >
            <Ionicons name="checkmark-circle" size={48} color="#FFFFFF" />
          </LinearGradient>
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

  const priceString = monthlyPackage?.product?.priceString || '$29.99';
  const isProductsLoaded = monthlyPackage !== null;

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
          <LinearGradient
            colors={['#3B82F6', '#2563EB']}
            style={styles.iconContainer}
          >
            <Ionicons name="star" size={36} color="#FFFFFF" />
          </LinearGradient>
          <Text style={styles.heroTitle}>Upgrade to Premium</Text>
          <Text style={styles.heroSubtitle}>
            Unlock the full potential of AgentRoute AI
          </Text>
        </View>

        {/* Loading indicator if still loading */}
        {contextLoading && !isProductsLoaded && (
          <View style={styles.loadingSection}>
            <ActivityIndicator size="small" color="#3B82F6" />
            <Text style={styles.loadingText}>Loading subscription options...</Text>
          </View>
        )}

        {/* Error Message */}
        {contextError && !isProductsLoaded && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={24} color="#F59E0B" />
            <View style={styles.errorTextContainer}>
              <Text style={styles.errorTitle}>Unable to Load Products</Text>
              <Text style={styles.errorText}>{contextError}</Text>
            </View>
            <TouchableOpacity style={styles.retrySmallButton} onPress={() => retryInitialization()}>
              <Ionicons name="refresh" size={18} color="#3B82F6" />
            </TouchableOpacity>
          </View>
        )}

        {/* Features List */}
        <View style={styles.featuresSection}>
          <Text style={styles.sectionTitle}>Premium Features</Text>
          {PREMIUM_FEATURES.map((feature, index) => (
            <View key={index} style={styles.featureItem}>
              <View style={styles.featureIconContainer}>
                <Ionicons name={feature.icon} size={22} color="#3B82F6" />
              </View>
              <View style={styles.featureTextContainer}>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureDescription}>{feature.description}</Text>
              </View>
              <Ionicons name="checkmark-circle" size={20} color="#22C55E" />
            </View>
          ))}
        </View>

        {/* Pricing Card */}
        <View style={styles.pricingCard}>
          <View style={styles.pricingBadge}>
            <Text style={styles.pricingBadgeText}>BEST VALUE</Text>
          </View>
          <Text style={styles.planName}>AgentRoute Premium</Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceAmount}>{priceString}</Text>
            <Text style={styles.pricePeriod}>/month</Text>
          </View>
          <Text style={styles.priceNote}>Cancel anytime • No commitment</Text>
        </View>

        {/* Purchase Button */}
        <TouchableOpacity
          style={[styles.purchaseButton, (!isProductsLoaded || isPurchasing) && styles.buttonDisabled]}
          onPress={handlePurchase}
          disabled={!isProductsLoaded || isPurchasing}
        >
          {isPurchasing ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="diamond" size={20} color="#FFFFFF" style={styles.buttonIcon} />
              <Text style={styles.purchaseButtonText}>
                {isProductsLoaded ? `Subscribe for ${priceString}/month` : 'Loading...'}
              </Text>
            </>
          )}
        </TouchableOpacity>

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

        {/* Diagnostics Toggle (for debugging) */}
        {__DEV__ && (
          <>
            <TouchableOpacity
              style={styles.diagnosticsToggle}
              onPress={() => setShowDiagnostics(!showDiagnostics)}
            >
              <Text style={styles.diagnosticsToggleText}>
                {showDiagnostics ? 'Hide' : 'Show'} Debug Info
              </Text>
            </TouchableOpacity>

            {showDiagnostics && diagnostics && (
              <View style={styles.diagnosticsPanel}>
                <Text style={styles.diagnosticsTitle}>Diagnostics</Text>
                <Text style={styles.diagnosticsItem}>Platform: {diagnostics.platform}</Text>
                <Text style={styles.diagnosticsItem}>SDK Ready: {diagnostics.isInitialized ? 'Yes' : 'No'}</Text>
                <Text style={styles.diagnosticsItem}>API Key: {diagnostics.apiKeySet ? 'Set' : 'Missing'}</Text>
                <Text style={styles.diagnosticsItem}>Offerings: {diagnostics.offeringsAvailable ? 'Yes' : 'No'}</Text>
                <Text style={styles.diagnosticsItem}>Offering ID: {diagnostics.currentOfferingId || 'None'}</Text>
                <Text style={styles.diagnosticsItem}>Packages: {diagnostics.packagesCount}</Text>
                <Text style={styles.diagnosticsItem}>Monthly Found: {diagnostics.monthlyPackageFound ? 'Yes' : 'No'}</Text>
                {diagnostics.lastError && (
                  <Text style={styles.diagnosticsError}>Error: {diagnostics.lastError}</Text>
                )}
              </View>
            )}
          </>
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
          <Text style={styles.legalDisclaimer}>
            Payment will be charged to your Apple ID account. Subscription automatically renews unless canceled at least 24 hours before the end of the current period.
          </Text>
        </View>
      </ScrollView>
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
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
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
  loadingSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E293B',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    gap: 12,
  },
  loadingText: {
    color: '#94A3B8',
    fontSize: 14,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F59E0B15',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    gap: 12,
  },
  errorTextContainer: {
    flex: 1,
  },
  errorTitle: {
    color: '#F59E0B',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  errorText: {
    color: '#FCD34D',
    fontSize: 13,
    lineHeight: 18,
  },
  retrySmallButton: {
    padding: 8,
    backgroundColor: '#1E293B',
    borderRadius: 8,
  },
  featuresSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
  },
  featureIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#3B82F615',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  featureTextContainer: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  featureDescription: {
    fontSize: 13,
    color: '#94A3B8',
  },
  pricingCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#3B82F6',
    position: 'relative',
    overflow: 'hidden',
  },
  pricingBadge: {
    position: 'absolute',
    top: 12,
    right: -32,
    backgroundColor: '#22C55E',
    paddingHorizontal: 32,
    paddingVertical: 4,
    transform: [{ rotate: '45deg' }],
  },
  pricingBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  planName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  priceAmount: {
    fontSize: 44,
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
  purchaseButton: {
    flexDirection: 'row',
    backgroundColor: '#3B82F6',
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  purchaseButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  buttonIcon: {
    marginRight: 10,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  restoreButton: {
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 24,
  },
  restoreButtonText: {
    color: '#3B82F6',
    fontSize: 16,
    fontWeight: '500',
  },
  diagnosticsToggle: {
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 12,
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
    marginBottom: 12,
  },
  legalLink: {
    color: '#3B82F6',
  },
  legalDisclaimer: {
    fontSize: 11,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 16,
  },
  premiumContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  premiumBadge: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
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
