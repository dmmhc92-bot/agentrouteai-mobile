import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export default function SupportPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const canGoBack = router.canGoBack?.() ?? false;

  const handleEmailPress = () => {
    Linking.openURL('mailto:agentrouteai@gmail.com');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header - only show if navigated from app */}
      {canGoBack && (
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Support</Text>
          <View style={styles.headerRight} />
        </View>
      )}

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={true}
      >
        <Text style={styles.title}>AgentRoute AI Support</Text>
        <Text style={styles.subtitle}>We're here to help you succeed with AgentRoute AI. Below you'll find ways to get support and answers to common questions.</Text>

        {/* Contact Support Card */}
        <View style={styles.contactCard}>
          <View style={styles.contactHeader}>
            <Text style={styles.contactTitle}>Contact Support</Text>
            <View style={styles.responseTimeBadge}>
              <Text style={styles.responseTimeText}>Response within 24 hours</Text>
            </View>
          </View>
          <TouchableOpacity onPress={handleEmailPress}>
            <Text style={styles.emailText}>Email: agentrouteai@gmail.com</Text>
          </TouchableOpacity>
          <Text style={styles.contactInfo}>For the fastest response, please include:</Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>• Your account email address</Text>
            <Text style={styles.bulletItem}>• Device type and iOS version</Text>
            <Text style={styles.bulletItem}>• Description of the issue or question</Text>
            <Text style={styles.bulletItem}>• Screenshots if applicable</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>

        <View style={styles.faqItem}>
          <Text style={styles.faqQuestion}>How do I reset my password?</Text>
          <Text style={styles.faqAnswer}>Tap "Forgot Password" on the login screen and enter your email address. You'll receive a password reset link within minutes.</Text>
        </View>

        <View style={styles.faqItem}>
          <Text style={styles.faqQuestion}>How do I delete my account?</Text>
          <Text style={styles.faqAnswer}>Go to Settings → scroll to the bottom → tap "Delete Account". This will permanently delete your account and all associated data.</Text>
        </View>

        <View style={styles.faqItem}>
          <Text style={styles.faqQuestion}>How do I cancel my subscription?</Text>
          <Text style={styles.faqAnswer}>Subscriptions are managed through the App Store. Go to your iPhone Settings → Apple ID → Subscriptions → AgentRoute AI → Cancel Subscription.</Text>
        </View>

        <View style={styles.faqItem}>
          <Text style={styles.faqQuestion}>How does offline mode work?</Text>
          <Text style={styles.faqAnswer}>AgentRoute AI saves your work locally when you're offline. When you reconnect to the internet, your data automatically syncs to the cloud. Look for the sync indicator in the app to see pending uploads.</Text>
        </View>

        <View style={styles.faqItem}>
          <Text style={styles.faqQuestion}>Can I use AgentRoute AI on multiple devices?</Text>
          <Text style={styles.faqAnswer}>Yes! Sign in with the same account on any device. Your data syncs across all devices in real-time.</Text>
        </View>

        <View style={styles.faqItem}>
          <Text style={styles.faqQuestion}>How do I scan a business card?</Text>
          <Text style={styles.faqAnswer}>From the Dashboard, tap "Scan Card". Point your camera at the business card and tap capture. The AI will automatically extract contact information.</Text>
        </View>

        <View style={styles.faqItem}>
          <Text style={styles.faqQuestion}>How do I join my team/agency?</Text>
          <Text style={styles.faqAnswer}>Ask your Admin or Manager for an invitation link or code. Go to Settings → Account Mode → "Join Team / Connect to Upline" and enter the invitation details.</Text>
        </View>

        <Text style={styles.sectionTitle}>Technical Requirements</Text>
        <View style={styles.bulletList}>
          <Text style={styles.bulletItem}>• iOS 13.0 or later</Text>
          <Text style={styles.bulletItem}>• iPhone, iPad, or iPod touch</Text>
          <Text style={styles.bulletItem}>• Internet connection required for sync (offline mode available)</Text>
          <Text style={styles.bulletItem}>• Camera access required for business card scanning</Text>
        </View>

        <Text style={styles.sectionTitle}>Additional Resources</Text>
        <TouchableOpacity onPress={() => router.push('/privacy')}>
          <Text style={styles.linkText}>Privacy Policy</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/terms')}>
          <Text style={styles.linkText}>Terms of Service</Text>
        </TouchableOpacity>

        {/* Bug Report Card */}
        <View style={[styles.contactCard, { borderLeftColor: '#F59E0B' }]}>
          <Text style={[styles.contactTitle, { color: '#F59E0B' }]}>Report a Bug or Issue</Text>
          <Text style={styles.contactInfo}>Found a bug or experiencing technical issues? Please email us at agentrouteai@gmail.com with:</Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>• Steps to reproduce the issue</Text>
            <Text style={styles.bulletItem}>• What you expected to happen</Text>
            <Text style={styles.bulletItem}>• What actually happened</Text>
            <Text style={styles.bulletItem}>• Screenshots or screen recordings if possible</Text>
          </View>
        </View>

        <Text style={styles.copyright}>© 2026 AgentRoute AI. All rights reserved.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  headerRight: {
    width: 44,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#3B82F6',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: '#CBD5E1',
    lineHeight: 24,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: 30,
    marginBottom: 15,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  contactCard: {
    backgroundColor: '#1E293B',
    padding: 20,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
    marginBottom: 20,
  },
  contactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 12,
    gap: 10,
  },
  contactTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#3B82F6',
  },
  responseTimeBadge: {
    backgroundColor: '#22C55E',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  responseTimeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
  },
  emailText: {
    fontSize: 16,
    color: '#3B82F6',
    marginBottom: 12,
  },
  contactInfo: {
    fontSize: 16,
    color: '#CBD5E1',
    marginBottom: 8,
  },
  bulletList: {
    marginLeft: 8,
  },
  bulletItem: {
    fontSize: 16,
    color: '#CBD5E1',
    lineHeight: 26,
    marginBottom: 4,
  },
  faqItem: {
    backgroundColor: '#1E293B',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  faqQuestion: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F8FAFC',
    marginBottom: 8,
  },
  faqAnswer: {
    fontSize: 15,
    color: '#CBD5E1',
    lineHeight: 22,
  },
  linkText: {
    fontSize: 16,
    color: '#3B82F6',
    marginBottom: 12,
  },
  copyright: {
    marginTop: 40,
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
  },
});
