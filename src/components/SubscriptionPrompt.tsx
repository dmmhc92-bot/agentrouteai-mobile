/**
 * Subscription Prompt Modal
 * 
 * Non-blocking modal that appears after free usage limit is reached.
 * User can dismiss and continue using the app.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  Alert,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useUsage, FREE_USES_LIMIT, BYPASS_CODE } from '../contexts/UsageContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useRouter } from 'expo-router';

const { width } = Dimensions.get('window');

interface SubscriptionPromptProps {
  visible: boolean;
  onDismiss: () => void;
}

export default function SubscriptionPrompt({ visible, onDismiss }: SubscriptionPromptProps) {
  const router = useRouter();
  const { applyBypassCode, usageCount } = useUsage();
  const { purchaseMonthly, isLoading } = useSubscription();
  const [showBypassInput, setShowBypassInput] = useState(false);
  const [bypassCode, setBypassCode] = useState('');

  const handleSubscribe = () => {
    onDismiss();
    router.push('/subscription');
  };

  const handleBypassSubmit = () => {
    if (applyBypassCode(bypassCode.trim().toUpperCase())) {
      Alert.alert('Success', 'Unlimited access granted!');
      setShowBypassInput(false);
      setBypassCode('');
      onDismiss();
    } else {
      Alert.alert('Invalid Code', 'The code you entered is not valid.');
    }
  };

  const handleContinueFree = () => {
    onDismiss();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Close Button */}
          <TouchableOpacity style={styles.closeButton} onPress={onDismiss}>
            <Ionicons name="close" size={24} color="#94A3B8" />
          </TouchableOpacity>

          {/* Icon */}
          <View style={styles.iconContainer}>
            <Ionicons name="star" size={40} color="#F59E0B" />
          </View>

          {/* Title */}
          <Text style={styles.title}>You're Loving AgentRoute!</Text>
          
          {/* Subtitle */}
          <Text style={styles.subtitle}>
            You've used {usageCount} of your {FREE_USES_LIMIT} free sessions.
            Upgrade to Premium for unlimited access to all features.
          </Text>

          {/* Features */}
          <View style={styles.features}>
            <FeatureItem icon="infinite" text="Unlimited lead management" />
            <FeatureItem icon="analytics" text="Advanced pipeline analytics" />
            <FeatureItem icon="chatbubbles" text="AI Sales Coach" />
            <FeatureItem icon="people" text="Team collaboration" />
          </View>

          {/* Buttons */}
          <TouchableOpacity
            style={styles.subscribeButton}
            onPress={handleSubscribe}
            disabled={isLoading}
          >
            <Ionicons name="star" size={20} color="#FFFFFF" />
            <Text style={styles.subscribeButtonText}>
              {isLoading ? 'Processing...' : 'Upgrade to Premium'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.continueButton}
            onPress={handleContinueFree}
          >
            <Text style={styles.continueButtonText}>Continue with Free</Text>
          </TouchableOpacity>

          {/* Bypass Code (for Apple Reviewers) */}
          {!showBypassInput ? (
            <TouchableOpacity
              style={styles.bypassLink}
              onPress={() => setShowBypassInput(true)}
            >
              <Text style={styles.bypassLinkText}>Have a promo code?</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.bypassContainer}>
              <TextInput
                style={styles.bypassInput}
                placeholder="Enter code"
                placeholderTextColor="#64748B"
                value={bypassCode}
                onChangeText={setBypassCode}
                autoCapitalize="characters"
              />
              <TouchableOpacity
                style={styles.bypassSubmit}
                onPress={handleBypassSubmit}
              >
                <Text style={styles.bypassSubmitText}>Apply</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function FeatureItem({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.featureItem}>
      <Ionicons name={icon as any} size={20} color="#3B82F6" />
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    width: width - 40,
    maxWidth: 400,
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 4,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  features: {
    width: '100%',
    marginBottom: 24,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  featureText: {
    fontSize: 14,
    color: '#E2E8F0',
    marginLeft: 12,
  },
  subscribeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: '100%',
    marginBottom: 12,
  },
  subscribeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  continueButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    width: '100%',
    alignItems: 'center',
  },
  continueButtonText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '500',
  },
  bypassLink: {
    marginTop: 8,
    padding: 8,
  },
  bypassLinkText: {
    color: '#64748B',
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  bypassContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    width: '100%',
  },
  bypassInput: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 12,
    color: '#FFFFFF',
    fontSize: 14,
    marginRight: 8,
  },
  bypassSubmit: {
    backgroundColor: '#22C55E',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  bypassSubmitText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
