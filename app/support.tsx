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

export default function SupportPage() {
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
          <Text style={styles.headerTitle}>Terms & Support</Text>
          <View style={styles.headerRight} />
        </View>
      )}

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={true}
      >
        <Text style={styles.title}>TERMS OF SERVICE & SUPPORT</Text>
        <Text style={styles.effectiveDate}>Effective Date: March 31, 2026</Text>

        <Text style={styles.paragraph}>
          By using AgentRoute AI, you agree to these terms:
        </Text>

        <Text style={styles.sectionTitle}>Subscription</Text>
        <Text style={styles.paragraph}>
          Monthly access is billed to your Apple Account. You may cancel at any time in your Apple Account settings.
        </Text>

        <Text style={styles.sectionTitle}>Usage</Text>
        <Text style={styles.paragraph}>
          Users are responsible for ensuring lead data collection complies with local insurance regulations.
        </Text>

        <Text style={styles.sectionTitle}>Support</Text>
        <Text style={styles.paragraph}>
          For technical assistance, bug reports, or account issues, please email our support team at support@agentrouteai.com. We respond to all inquiries within 24 hours.
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
