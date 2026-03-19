import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
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
      {/* Header - only show if navigated from app */}
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
        <Text style={styles.title}>AgentRoute AI Privacy Policy</Text>
        <Text style={styles.lastUpdated}>Last Updated: March 18, 2026</Text>

        <Text style={styles.sectionTitle}>1. Information We Collect</Text>
        <Text style={styles.paragraph}>AgentRoute AI collects the following types of information:</Text>
        <View style={styles.bulletList}>
          <Text style={styles.bulletItem}>• <Text style={styles.bold}>Account Information:</Text> Name, email address, phone number, and password</Text>
          <Text style={styles.bulletItem}>• <Text style={styles.bold}>Profile Photos:</Text> Profile images you upload for identification within the app</Text>
          <Text style={styles.bulletItem}>• <Text style={styles.bold}>Lead & Customer Data:</Text> Contact information, notes, appointments, and other data you enter about your leads and customers</Text>
          <Text style={styles.bulletItem}>• <Text style={styles.bold}>Location Data:</Text> GPS coordinates for route optimization (with your explicit permission)</Text>
          <Text style={styles.bulletItem}>• <Text style={styles.bold}>Usage Analytics:</Text> App interaction data, feature usage patterns, and crash reports to improve our services</Text>
          <Text style={styles.bulletItem}>• <Text style={styles.bold}>Device Information:</Text> Device type, operating system, and app version for troubleshooting</Text>
          <Text style={styles.bulletItem}>• <Text style={styles.bold}>Organization Data:</Text> Team membership, hierarchy position, and role information when connected to a team</Text>
        </View>

        <Text style={styles.sectionTitle}>2. Profile Photos</Text>
        <Text style={styles.paragraph}>When you upload a profile photo:</Text>
        <View style={styles.bulletList}>
          <Text style={styles.bulletItem}>• Your profile image is securely stored and encrypted in our database</Text>
          <Text style={styles.bulletItem}>• Profile photos are used solely for user identification within the app</Text>
          <Text style={styles.bulletItem}>• Your photo may be visible to team members if you are connected to an organization</Text>
          <Text style={styles.bulletItem}>• You can update or remove your profile photo at any time from the Settings screen</Text>
          <Text style={styles.bulletItem}>• When you delete your account, your profile photo is permanently deleted</Text>
        </View>

        <Text style={styles.sectionTitle}>3. Account Modes</Text>
        <Text style={styles.paragraph}>AgentRoute AI supports two account modes:</Text>
        <View style={styles.highlightBox}>
          <Text style={styles.highlightText}><Text style={styles.bold}>Solo Mode:</Text> You operate independently. All your data is private and only accessible to you.</Text>
          <Text style={[styles.highlightText, { marginTop: 10 }]}><Text style={styles.bold}>Team/Hierarchy Mode:</Text> When connected to an organization, certain data may be visible to your Admin, Manager, or Upline according to their role permissions.</Text>
        </View>

        <Text style={styles.sectionTitle}>4. Role-Based Data Access</Text>
        <Text style={styles.paragraph}>When you join a team or organization, data visibility is determined by role:</Text>
        <View style={styles.bulletList}>
          <Text style={styles.bulletItem}>• <Text style={styles.bold}>Admins:</Text> Can view all team member activity, leads, performance metrics, and team management data</Text>
          <Text style={styles.bulletItem}>• <Text style={styles.bold}>Managers:</Text> Can view data for agents directly under their supervision, including leads, appointments, and activity</Text>
          <Text style={styles.bulletItem}>• <Text style={styles.bold}>Agents:</Text> Can only view their own records unless explicit sharing is enabled</Text>
          <Text style={styles.bulletItem}>• Your personal profile information (email, password) remains private regardless of role</Text>
          <Text style={styles.bulletItem}>• Profile photos are visible to team members within the same organization</Text>
        </View>

        <Text style={styles.sectionTitle}>5. Offline Data Handling</Text>
        <Text style={styles.paragraph}>AgentRoute AI includes offline functionality:</Text>
        <View style={styles.bulletList}>
          <Text style={styles.bulletItem}>• When you lose internet connectivity, certain data may be temporarily stored locally on your device</Text>
          <Text style={styles.bulletItem}>• Offline-created leads and edits are saved securely on your device</Text>
          <Text style={styles.bulletItem}>• When internet connectivity is restored, your offline data automatically syncs with our servers</Text>
          <Text style={styles.bulletItem}>• Local offline data is encrypted and deleted from your device after successful synchronization</Text>
          <Text style={styles.bulletItem}>• You can view sync status in the app to know if data is pending upload</Text>
        </View>

        <Text style={styles.sectionTitle}>6. Data Ownership & Portability</Text>
        <View style={styles.bulletList}>
          <Text style={styles.bulletItem}>• Records you create as an agent are owned by you</Text>
          <Text style={styles.bulletItem}>• If you leave a team, your agent-owned records remain with you</Text>
          <Text style={styles.bulletItem}>• Your former team loses access to your records immediately upon separation</Text>
          <Text style={styles.bulletItem}>• Only records explicitly marked as team-owned remain with the organization</Text>
          <Text style={styles.bulletItem}>• You can export your data at any time</Text>
        </View>

        <Text style={styles.sectionTitle}>7. Invitation Tokens</Text>
        <Text style={styles.paragraph}>When joining a team via invitation:</Text>
        <View style={styles.bulletList}>
          <Text style={styles.bulletItem}>• Invitation tokens are system-generated and unique</Text>
          <Text style={styles.bulletItem}>• Tokens contain encrypted organization and role information</Text>
          <Text style={styles.bulletItem}>• Tokens expire after 7 days</Text>
          <Text style={styles.bulletItem}>• Used or revoked tokens cannot be reused</Text>
        </View>

        <Text style={styles.sectionTitle}>8. How We Use Your Data</Text>
        <View style={styles.bulletList}>
          <Text style={styles.bulletItem}>• Provide and improve app functionality</Text>
          <Text style={styles.bulletItem}>• Power AI-driven features and recommendations (using OpenAI and Google AI services)</Text>
          <Text style={styles.bulletItem}>• Send push notifications, reminders, and important updates</Text>
          <Text style={styles.bulletItem}>• Analyze usage patterns to enhance user experience</Text>
          <Text style={styles.bulletItem}>• Facilitate team collaboration when in hierarchy mode</Text>
          <Text style={styles.bulletItem}>• Generate compliance documents (SOA forms)</Text>
          <Text style={styles.bulletItem}>• Optimize route planning and scheduling</Text>
        </View>

        <Text style={styles.sectionTitle}>9. Data Storage & Security</Text>
        <View style={styles.bulletList}>
          <Text style={styles.bulletItem}>• All data is stored in encrypted databases</Text>
          <Text style={styles.bulletItem}>• Passwords are securely hashed using bcrypt (never stored in plain text)</Text>
          <Text style={styles.bulletItem}>• We use industry-standard HTTPS encryption for all data transmission</Text>
          <Text style={styles.bulletItem}>• We implement role-based access control to protect team data boundaries</Text>
          <Text style={styles.bulletItem}>• Profile images are stored as encrypted base64 data</Text>
          <Text style={styles.bulletItem}>• We conduct regular security audits and updates</Text>
          <Text style={styles.bulletItem}>• We never sell your personal data to third parties</Text>
        </View>

        <Text style={styles.sectionTitle}>10. Your Rights</Text>
        <View style={styles.bulletList}>
          <Text style={styles.bulletItem}>• Access and export your data at any time</Text>
          <Text style={styles.bulletItem}>• Request deletion of your account and all associated data</Text>
          <Text style={styles.bulletItem}>• Opt out of marketing communications</Text>
          <Text style={styles.bulletItem}>• Update or correct your personal information and profile photo</Text>
          <Text style={styles.bulletItem}>• Switch between Solo and Team modes at any time</Text>
          <Text style={styles.bulletItem}>• Leave a team without deleting your account</Text>
          <Text style={styles.bulletItem}>• Control push notification preferences</Text>
        </View>

        <Text style={styles.sectionTitle}>11. Account Deletion</Text>
        <Text style={styles.paragraph}>You can delete your account at any time through the Settings screen in the app. When you delete your account:</Text>
        <View style={styles.bulletList}>
          <Text style={styles.bulletItem}>• Your personal information will be permanently removed</Text>
          <Text style={styles.bulletItem}>• Your profile photo will be permanently deleted</Text>
          <Text style={styles.bulletItem}>• Your leads, appointments, and documents will be deleted</Text>
          <Text style={styles.bulletItem}>• Any locally stored offline data will be cleared</Text>
          <Text style={styles.bulletItem}>• This action cannot be undone</Text>
          <Text style={styles.bulletItem}>• Note: Leaving a team does NOT delete your account</Text>
        </View>

        <Text style={styles.sectionTitle}>12. Third-Party Services</Text>
        <Text style={styles.paragraph}>We use the following third-party services:</Text>
        <View style={styles.bulletList}>
          <Text style={styles.bulletItem}>• <Text style={styles.bold}>AI Processing:</Text> OpenAI GPT and Google Gemini for AI coaching and document analysis</Text>
          <Text style={styles.bulletItem}>• <Text style={styles.bold}>Analytics:</Text> Usage analytics to improve app performance</Text>
          <Text style={styles.bulletItem}>• <Text style={styles.bold}>Push Notifications:</Text> Expo notification services for alerts and reminders</Text>
          <Text style={styles.bulletItem}>• <Text style={styles.bold}>Maps & Geocoding:</Text> Location services for route optimization</Text>
        </View>
        <Text style={styles.paragraph}>These services have their own privacy policies and data handling practices.</Text>

        <Text style={styles.sectionTitle}>13. Children's Privacy</Text>
        <Text style={styles.paragraph}>AgentRoute AI is not intended for users under 18 years of age. We do not knowingly collect personal information from children.</Text>

        <Text style={styles.sectionTitle}>14. Changes to This Policy</Text>
        <Text style={styles.paragraph}>We may update this Privacy Policy from time to time. We will notify you of significant changes through the app or via email.</Text>

        <View style={styles.contactBox}>
          <Text style={styles.contactTitle}>Contact Us</Text>
          <Text style={styles.contactText}>For privacy-related questions, data requests, or concerns:</Text>
          <Text style={styles.contactEmail}>Email: agentrouteai@gmail.com</Text>
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
    marginBottom: 8,
  },
  lastUpdated: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: 30,
    marginBottom: 15,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  paragraph: {
    fontSize: 16,
    color: '#CBD5E1',
    lineHeight: 24,
    marginBottom: 12,
  },
  bulletList: {
    marginLeft: 8,
  },
  bulletItem: {
    fontSize: 16,
    color: '#CBD5E1',
    lineHeight: 26,
    marginBottom: 8,
  },
  bold: {
    fontWeight: '600',
    color: '#E2E8F0',
  },
  highlightBox: {
    backgroundColor: '#1E293B',
    padding: 16,
    borderRadius: 8,
    marginVertical: 12,
  },
  highlightText: {
    fontSize: 16,
    color: '#CBD5E1',
    lineHeight: 24,
  },
  contactBox: {
    marginTop: 40,
    padding: 20,
    backgroundColor: '#1E293B',
    borderRadius: 12,
  },
  contactTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#3B82F6',
    marginBottom: 12,
  },
  contactText: {
    fontSize: 16,
    color: '#CBD5E1',
    marginBottom: 8,
  },
  contactEmail: {
    fontSize: 16,
    color: '#3B82F6',
  },
  copyright: {
    marginTop: 40,
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
  },
});
