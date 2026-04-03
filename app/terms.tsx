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

export default function TermsOfServicePage() {
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
          <Text style={styles.headerTitle}>Terms of Service</Text>
          <View style={styles.headerRight} />
        </View>
      )}

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={true}
      >
        <Text style={styles.title}>AgentRoute AI Terms of Service</Text>
        <Text style={styles.lastUpdated}>Last Updated: March 18, 2026</Text>

        <Text style={styles.paragraph}>Welcome to AgentRoute AI. By accessing or using our mobile application and services, you agree to be bound by these Terms of Service.</Text>

        <Text style={styles.sectionTitle}>1. Acceptance of Terms</Text>
        <Text style={styles.paragraph}>By downloading, installing, or using AgentRoute AI, you acknowledge that you have read, understood, and agree to be bound by these Terms. If you do not agree to these Terms, do not use the Service.</Text>

        <Text style={styles.sectionTitle}>2. Description of Service</Text>
        <Text style={styles.paragraph}>AgentRoute AI is a mobile application designed to help insurance sales agents:</Text>
        <View style={styles.bulletList}>
          <Text style={styles.bulletItem}>• Manage leads and customer relationships</Text>
          <Text style={styles.bulletItem}>• Schedule and track appointments</Text>
          <Text style={styles.bulletItem}>• Track sales pipeline and progress</Text>
          <Text style={styles.bulletItem}>• Optimize sales routes and planning</Text>
          <Text style={styles.bulletItem}>• Access AI-powered sales coaching and assistance</Text>
          <Text style={styles.bulletItem}>• Track commissions and sales performance</Text>
        </View>

        <Text style={styles.sectionTitle}>3. User Accounts</Text>
        <Text style={styles.subSectionTitle}>3.1 Registration</Text>
        <Text style={styles.paragraph}>To use certain features of the Service, you must create an account. You agree to provide accurate, current, and complete information during registration.</Text>
        
        <Text style={styles.subSectionTitle}>3.2 Account Security</Text>
        <Text style={styles.paragraph}>You are responsible for:</Text>
        <View style={styles.bulletList}>
          <Text style={styles.bulletItem}>• Maintaining the confidentiality of your account credentials</Text>
          <Text style={styles.bulletItem}>• All activities that occur under your account</Text>
          <Text style={styles.bulletItem}>• Notifying us immediately of any unauthorized access</Text>
        </View>

        <Text style={styles.sectionTitle}>4. Subscription and Payment</Text>
        <View style={styles.highlightBox}>
          <Text style={styles.highlightText}><Text style={styles.bold}>Free Trial:</Text> New users receive a 30-day free trial with full access to all features.</Text>
          <Text style={[styles.highlightText, { marginTop: 10 }]}><Text style={styles.bold}>Subscription:</Text> After the trial period, continued access requires a paid subscription at $30/month.</Text>
          <Text style={[styles.highlightText, { marginTop: 10 }]}><Text style={styles.bold}>Cancellation:</Text> You may cancel your subscription at any time. Access will continue until the end of the current billing period.</Text>
        </View>

        <Text style={styles.sectionTitle}>5. User Responsibilities</Text>
        <Text style={styles.paragraph}>As a user of AgentRoute AI, you agree to:</Text>
        <View style={styles.bulletList}>
          <Text style={styles.bulletItem}>• Comply with all applicable insurance laws and regulations</Text>
          <Text style={styles.bulletItem}>• Provide accurate and truthful information to clients</Text>
          <Text style={styles.bulletItem}>• Maintain proper licensing for insurance sales activities</Text>
          <Text style={styles.bulletItem}>• Use the Service only for lawful purposes</Text>
          <Text style={styles.bulletItem}>• Not share your account with others</Text>
          <Text style={styles.bulletItem}>• Respect the privacy of your clients and leads</Text>
        </View>

        <Text style={styles.subSectionTitle}>5.1 Data Accuracy Responsibility</Text>
        <Text style={styles.paragraph}><Text style={styles.bold}>You are solely responsible for the accuracy, completeness, and legality of all data you enter into AgentRoute AI.</Text> This includes but is not limited to:</Text>
        <View style={styles.bulletList}>
          <Text style={styles.bulletItem}>• Lead and customer contact information</Text>
          <Text style={styles.bulletItem}>• Appointment details and scheduling information</Text>
          <Text style={styles.bulletItem}>• Notes, comments, and communication records</Text>
          <Text style={styles.bulletItem}>• Pipeline and sales stage information</Text>
          <Text style={styles.bulletItem}>• Any other data entered through the Service</Text>
        </View>
        <Text style={styles.paragraph}>AgentRoute AI does not verify the accuracy of user-entered data and is not liable for any consequences arising from inaccurate or incomplete information.</Text>

        <Text style={styles.sectionTitle}>6. Acceptable Use Policy</Text>
        <Text style={styles.paragraph}>You agree NOT to use AgentRoute AI to:</Text>
        <View style={styles.bulletList}>
          <Text style={styles.bulletItem}>• Violate any applicable laws, regulations, or third-party rights</Text>
          <Text style={styles.bulletItem}>• Access, collect, or store personal data about others without their consent</Text>
          <Text style={styles.bulletItem}>• Attempt unauthorized access to other users' accounts or data</Text>
          <Text style={styles.bulletItem}>• Misuse customer information for purposes other than legitimate business activities</Text>
          <Text style={styles.bulletItem}>• Transmit malicious code, viruses, or harmful content</Text>
          <Text style={styles.bulletItem}>• Interfere with or disrupt the Service or servers</Text>
          <Text style={styles.bulletItem}>• Reverse engineer, decompile, or attempt to extract source code</Text>
          <Text style={styles.bulletItem}>• Share, transfer, or sell your account credentials</Text>
          <Text style={styles.bulletItem}>• Use automated means to access the Service without authorization</Text>
          <Text style={styles.bulletItem}>• Harass, abuse, or harm other users</Text>
        </View>
        <Text style={styles.paragraph}>Violation of this Acceptable Use Policy may result in immediate account suspension or termination.</Text>

        <Text style={styles.sectionTitle}>7. Intellectual Property</Text>
        <Text style={styles.paragraph}>The Service, including its content, features, and functionality, is owned by AgentRoute AI and is protected by copyright, trademark, and other intellectual property laws.</Text>

        <Text style={styles.sectionTitle}>8. Data and Privacy</Text>
        <Text style={styles.paragraph}>Your use of the Service is also governed by our Privacy Policy. By using the Service, you consent to the collection and use of your information as described in our Privacy Policy.</Text>

        <Text style={styles.sectionTitle}>9. Disclaimers</Text>
        <View style={styles.bulletList}>
          <Text style={styles.bulletItem}>• AgentRoute AI is a productivity tool and does not provide insurance, legal, or financial advice</Text>
          <Text style={styles.bulletItem}>• The Service is provided "as is" without warranties of any kind</Text>
          <Text style={styles.bulletItem}>• We do not guarantee that the Service will be uninterrupted or error-free</Text>
          <Text style={styles.bulletItem}>• AI-generated content is for assistance only and should be reviewed before use</Text>
        </View>

        <Text style={styles.sectionTitle}>10. Limitation of Liability</Text>
        <View style={styles.highlightBox}>
          <Text style={styles.highlightText}><Text style={styles.bold}>IMPORTANT:</Text> AgentRoute AI is a productivity and CRM tool designed to assist with lead management and sales activities. <Text style={styles.bold}>The app does not guarantee any specific business outcomes, sales results, or revenue.</Text></Text>
        </View>
        <Text style={styles.paragraph}>To the maximum extent permitted by law:</Text>
        <View style={styles.bulletList}>
          <Text style={styles.bulletItem}>• AgentRoute AI shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Service</Text>
          <Text style={styles.bulletItem}>• We are not responsible for any lost sales, missed opportunities, or business losses resulting from use of the Service</Text>
          <Text style={styles.bulletItem}>• We are not liable for any errors in AI-generated content or suggestions</Text>
          <Text style={styles.bulletItem}>• We are not responsible for data loss resulting from device failure, user error, or service interruptions</Text>
          <Text style={styles.bulletItem}>• Our total liability shall not exceed the amount you paid for the Service in the 12 months preceding the claim</Text>
        </View>

        <Text style={styles.sectionTitle}>11. Account Modes and Team Membership</Text>
        <View style={styles.highlightBox}>
          <Text style={styles.highlightText}><Text style={styles.bold}>Solo Mode:</Text> You may use AgentRoute AI as an independent agent with full ownership of your data.</Text>
          <Text style={[styles.highlightText, { marginTop: 10 }]}><Text style={styles.bold}>Team/Hierarchy Mode:</Text> You may join an organization or team using an invitation token/link provided by an Admin or Manager.</Text>
        </View>

        <Text style={styles.subSectionTitle}>11.1 Joining a Team</Text>
        <View style={styles.bulletList}>
          <Text style={styles.bulletItem}>• You can join a team during signup or later from Settings</Text>
          <Text style={styles.bulletItem}>• Your role (Admin, Manager, or Agent) is assigned by the inviting party, not self-selected</Text>
          <Text style={styles.bulletItem}>• Joining a team grants your Admin/Manager visibility into your activity according to their role permissions</Text>
        </View>

        <Text style={styles.subSectionTitle}>11.2 Leaving a Team</Text>
        <View style={styles.bulletList}>
          <Text style={styles.bulletItem}>• You may leave a team at any time from Settings</Text>
          <Text style={styles.bulletItem}>• Leaving a team does NOT delete your account</Text>
          <Text style={styles.bulletItem}>• Your agent-owned records (leads, appointments, notes) remain with you</Text>
          <Text style={styles.bulletItem}>• Your former team immediately loses access to your records upon separation</Text>
        </View>

        <Text style={styles.subSectionTitle}>11.3 Data Ownership in Teams</Text>
        <View style={styles.bulletList}>
          <Text style={styles.bulletItem}>• Records you create as an agent are owned by you</Text>
          <Text style={styles.bulletItem}>• While connected to a team, your Admin/Manager may view your records per their role</Text>
          <Text style={styles.bulletItem}>• When you leave, your agent-owned data moves with you into Solo mode</Text>
          <Text style={styles.bulletItem}>• Only explicitly shared or team-owned records remain with the organization</Text>
        </View>

        <Text style={styles.sectionTitle}>12. Invitation Tokens</Text>
        <View style={styles.bulletList}>
          <Text style={styles.bulletItem}>• Invitation tokens are generated by authorized Admins and Managers</Text>
          <Text style={styles.bulletItem}>• Tokens contain organization and role assignment information</Text>
          <Text style={styles.bulletItem}>• Users cannot self-select Admin or Manager roles through signup</Text>
          <Text style={styles.bulletItem}>• Tokens expire after 7 days and cannot be reused after acceptance</Text>
          <Text style={styles.bulletItem}>• Sharing invitation tokens is the responsibility of the inviting party</Text>
        </View>

        <Text style={styles.sectionTitle}>13. Account Termination</Text>
        <Text style={styles.paragraph}>We reserve the right to suspend or terminate your account if you:</Text>
        <View style={styles.bulletList}>
          <Text style={styles.bulletItem}>• Violate these Terms of Service</Text>
          <Text style={styles.bulletItem}>• Engage in fraudulent or illegal activities</Text>
          <Text style={styles.bulletItem}>• Fail to pay subscription fees when due</Text>
        </View>
        <Text style={styles.paragraph}>You may also delete your account at any time through the app's Settings.</Text>

        <Text style={styles.sectionTitle}>14. Changes to Terms</Text>
        <Text style={styles.paragraph}>We may update these Terms from time to time. We will notify you of any material changes by posting the new Terms in the app or sending you an email.</Text>

        <Text style={styles.sectionTitle}>15. Governing Law</Text>
        <Text style={styles.paragraph}>These Terms shall be governed by and construed in accordance with the laws of the United States, without regard to its conflict of law provisions.</Text>

        <View style={styles.contactBox}>
          <Text style={styles.contactTitle}>Contact Us</Text>
          <Text style={styles.contactText}>If you have any questions about these Terms, please contact us:</Text>
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
  subSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: 20,
    marginBottom: 10,
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
