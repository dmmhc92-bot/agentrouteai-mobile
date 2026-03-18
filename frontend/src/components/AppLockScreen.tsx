/**
 * App Lock Screen
 * 
 * CRITICAL: This is an OVERLAY, not a blocking screen.
 * It provides a "Skip" option to ensure users are NEVER locked out.
 */

import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppLock } from '../contexts/AppLockContext';

export function AppLockScreen() {
  const {
    isLocked,
    biometricType,
    isCheckingBiometric,
    unlockWithBiometric,
    skipLock,
  } = useAppLock();

  // Auto-trigger biometric on mount
  useEffect(() => {
    if (isLocked && !isCheckingBiometric) {
      // Small delay to ensure UI is ready
      const timer = setTimeout(() => {
        unlockWithBiometric();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isLocked]);

  if (!isLocked) {
    return null;
  }

  const getBiometricIcon = () => {
    if (biometricType === 'Face ID') {
      return 'scan-outline';
    }
    return 'finger-print-outline';
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* App Logo/Icon */}
        <View style={styles.logoContainer}>
          <Ionicons name="briefcase" size={60} color="#3B82F6" />
        </View>
        
        <Text style={styles.title}>AgentRoute AI</Text>
        <Text style={styles.subtitle}>Locked</Text>

        {/* Biometric Button */}
        <TouchableOpacity
          style={styles.biometricButton}
          onPress={unlockWithBiometric}
          disabled={isCheckingBiometric}
          activeOpacity={0.7}
        >
          {isCheckingBiometric ? (
            <ActivityIndicator size="large" color="#3B82F6" />
          ) : (
            <>
              <Ionicons
                name={getBiometricIcon()}
                size={48}
                color="#3B82F6"
              />
              <Text style={styles.biometricText}>
                Unlock with {biometricType || 'Biometric'}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {/* Skip Button - CRITICAL for fallback */}
        <TouchableOpacity
          style={styles.skipButton}
          onPress={skipLock}
          activeOpacity={0.7}
        >
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          You can disable this in Settings
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  logoContainer: {
    width: 100,
    height: 100,
    borderRadius: 24,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#94A3B8',
    marginBottom: 48,
  },
  biometricButton: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    minHeight: 120,
  },
  biometricText: {
    fontSize: 16,
    color: '#3B82F6',
    marginTop: 12,
    fontWeight: '600',
  },
  skipButton: {
    marginTop: 32,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  skipText: {
    fontSize: 16,
    color: '#64748B',
    fontWeight: '500',
  },
  disclaimer: {
    fontSize: 12,
    color: '#475569',
    marginTop: 48,
    textAlign: 'center',
  },
});
