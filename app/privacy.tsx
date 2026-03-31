import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export default function PrivacyPolicyPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const canGoBack = router.canGoBack?.() ?? false;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {canGoBack && (
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Privacy Policy</Text>
          <View style={styles.headerRight} />
        </View>
      )}

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={true}
      >
        <Text style={styles.title}>PRIVACY POLICY for AgentRoute AI</Text>
        <Text style={styles.effectiveDate}>Effective Date: March 31, 2026</Text>

        <Text style={styles.paragraph}>
          AgentRoute AI ("we," "us," or "our") respects your privacy. This policy explains how we collect and use your data.
        </Text>

        <Text style={styles.sectionTitle}>Data Collection</Text>
        <Text style={styles.paragraph}>
          We collect location data to provide route optimization and camera access for document scanning.
        </Text>

        <Text style={styles.sectionTitle}>Lead Data</Text>
        <Text style={styles.paragraph}>
          All insurance lead information entered into the CRM is encrypted and owned by the user. We do not sell or share your lead data with third parties.
        </Text>

        <Text style={styles.sectionTitle}>Security</Text>
        <Text style={styles.paragraph}>
          We use industry-standard encryption to protect your data.
        </Text>

        <Text style={styles.sectionTitle}>Contact</Text>
        <Text style={styles.paragraph}>
          For privacy inquiries, contact support@agentrouteai.com.
        </Text>
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
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  effectiveDate: {
    fontSize: 14,
    color: '#94A3B8',
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#3B82F6',
    marginTop: 20,
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 16,
    color: '#CBD5E1',
    lineHeight: 24,
  },
});
