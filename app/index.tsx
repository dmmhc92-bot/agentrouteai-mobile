import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter, useRootNavigationState } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../src/contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, isLoading } = useAuth();
  
  // Check if navigation is ready
  const rootNavigationState = useRootNavigationState();

  // Helper function to get the correct route based on role
  // ALL users go to dashboard first - they can access Command Center from there
  const getRouteForRole = (role: string): string => {
    // All roles go to dashboard as the primary entry point
    return '/(tabs)/dashboard';
  };

  // Auto-redirect when navigation is ready AND user is authenticated
  useEffect(() => {
    if (!rootNavigationState?.key) return;
    
    if (!isLoading && user) {
      // Small delay to ensure layout is fully mounted
      const timer = setTimeout(() => {
        const route = getRouteForRole(user.role);
        router.replace(route as any);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [user, isLoading, rootNavigationState?.key]);

  // Show loading spinner while checking authentication
  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <Ionicons name="briefcase" size={60} color="#3B82F6" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <View style={styles.iconCircle}>
            <Ionicons name="briefcase" size={50} color="#FFFFFF" />
          </View>
          <Text style={styles.title}>AgentRoute AI</Text>
          <Text style={styles.subtitle}>Your AI-Powered Sales Companion</Text>
        </View>

        <View style={styles.features}>
          <FeatureItem icon="people" text="Manage Leads Efficiently" />
          <FeatureItem icon="calendar" text="Schedule Appointments" />
          <FeatureItem icon="document-text" text="Smart Pipeline" />
          <FeatureItem icon="scan" text="Scan Business Cards" />
          <FeatureItem icon="chatbubbles" text="AI Sales Coach" />
        </View>
      </View>

      <View style={styles.buttonContainer}>
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && { opacity: 0.7 }
          ]}
          onPress={() => router.push('/(auth)/signin')}
        >
          <Text style={styles.primaryButtonText}>Sign In</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && { opacity: 0.7 }
          ]}
          onPress={() => router.push('/(auth)/onboarding')}
        >
          <Text style={styles.secondaryButtonText}>Get Started</Text>
        </Pressable>
      </View>
    </View>
  );
}

function FeatureItem({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.featureItem}>
      <Ionicons name={icon as any} size={24} color="#3B82F6" />
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 16,
    fontSize: 16,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 48,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#94A3B8',
  },
  features: {
    gap: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1E293B',
    padding: 16,
    borderRadius: 12,
  },
  featureText: {
    color: '#E2E8F0',
    fontSize: 16,
  },
  buttonContainer: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  secondaryButtonText: {
    color: '#3B82F6',
    fontSize: 18,
    fontWeight: '600',
  },
});
