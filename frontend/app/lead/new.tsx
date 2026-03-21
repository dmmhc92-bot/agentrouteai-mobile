import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import { useNetwork } from '../../src/contexts/NetworkContext';
import { offlineStorage } from '../../src/services/offlineStorage';
import { syncService } from '../../src/services/syncService';
import SyncStatusIndicator from '../../src/components/SyncStatusIndicator';

// Stage configuration for display labels
const STAGE_LABELS: Record<string, string> = {
  new_lead: 'New Lead',
  new: 'New',
  contacted: 'Contacted',
  follow_up: 'Follow Up',
  appointment_set: 'Appointment Set',
  appointment_scheduled: 'Appointment Set',
  soa_completed: 'SOA Completed',
  policy_submitted: 'Policy Submitted',
  application_submitted: 'Application Submitted',
  underwriting_review: 'Underwriting',
  additional_requirements: 'Requirements',
  approved: 'Approved',
  closed_won: 'Closed Won',
  policy_issued: 'Policy Issued',
  policy_placed: 'Policy Placed',
  commission_pending: 'Commission Pending',
  commission_paid: 'Commission Paid',
  closed_lost: 'Closed Lost',
};

export default function NewLeadScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isOnline } = useNetwork();
  
  // Get stage from URL params - this enables stage-aware lead creation
  const { stage: stageParam } = useLocalSearchParams<{ stage?: string }>();
  const targetStage = stageParam && STAGE_LABELS[stageParam] ? stageParam : null;
  const stageLabel = targetStage ? STAGE_LABELS[targetStage] : null;

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [savedOffline, setSavedOffline] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a name');
      return;
    }

    setIsLoading(true);
    
    // Build lead data - include stage if creating from a specific category
    const leadData: any = {
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      address: address.trim(),
      notes: notes.trim(),
    };
    
    // CRITICAL: Include stage if creating from a specific pipeline category
    if (targetStage) {
      leadData.stage = targetStage;
      console.log(`[NewLead] Creating lead in stage: ${targetStage} (${stageLabel})`);
    }

    try {
      if (isOnline) {
        // Online mode - create directly on server
        const lead = await api.createLead(leadData);
        
        // VALIDATE: Ensure lead was saved with correct stage
        if (!lead || !lead.id) {
          throw new Error('Lead creation failed - no ID returned');
        }
        
        // Verify stage was correctly set
        if (targetStage && lead.stage !== targetStage) {
          console.warn(`[NewLead] Stage mismatch! Expected: ${targetStage}, Got: ${lead.stage}`);
        } else {
          console.log(`[NewLead] Lead created successfully with stage: ${lead.stage}`);
        }
        
        // Navigate back to the stage detail screen to see the new lead
        if (targetStage) {
          router.replace(`/stage/${targetStage}`);
        } else {
          router.replace(`/lead/${lead.id}`);
        }
      } else {
        // Offline mode - save locally and queue for sync
        await offlineStorage.queueLeadCreate(leadData);
        setSavedOffline(true);
        
        Alert.alert(
          'Saved Locally',
          'Lead has been saved to your device. It will sync automatically when you\'re back online.',
          [
            {
              text: 'OK',
              onPress: () => router.back(),
            }
          ]
        );
      }
    } catch (error: any) {
      // If online request fails, try saving offline
      if (error.message?.includes('Network') || error.code === 'ERR_NETWORK') {
        try {
          await offlineStorage.queueLeadCreate(leadData);
          setSavedOffline(true);
          Alert.alert(
            'Saved Locally',
            'Network unavailable. Lead saved locally and will sync when online.',
            [{ text: 'OK', onPress: () => router.back() }]
          );
          return;
        } catch (offlineError) {
          console.error('Failed to save offline:', offlineError);
        }
      }
      
      const message = error.response?.data?.detail || 'Failed to create lead';
      Alert.alert('Error', message);
    } finally {
      setIsLoading(false);
    }
  };

  // Dynamic title based on whether creating into a specific stage
  const screenTitle = targetStage 
    ? `New Lead - ${stageLabel}` 
    : 'New Lead';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="close" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.titleContainer}>
          <Text style={styles.title} numberOfLines={1}>{screenTitle}</Text>
          {!isOnline && (
            <SyncStatusIndicator status="pending" compact />
          )}
        </View>
        <TouchableOpacity
          style={[styles.saveButton, isLoading && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>
              {isOnline ? 'Save' : 'Save Offline'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Stage indicator banner when creating into specific category */}
      {targetStage && (
        <View style={styles.stageBanner}>
          <Ionicons name="layers" size={16} color="#3B82F6" />
          <Text style={styles.stageBannerText}>
            Creating in: <Text style={styles.stageBannerStage}>{stageLabel}</Text>
          </Text>
        </View>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Name *</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="person-outline" size={20} color="#64748B" />
              <TextInput
                style={styles.input}
                placeholder="Full name"
                placeholderTextColor="#64748B"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Phone</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="call-outline" size={20} color="#64748B" />
              <TextInput
                style={styles.input}
                placeholder="Phone number"
                placeholderTextColor="#64748B"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="mail-outline" size={20} color="#64748B" />
              <TextInput
                style={styles.input}
                placeholder="Email address"
                placeholderTextColor="#64748B"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Address</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="location-outline" size={20} color="#64748B" />
              <TextInput
                style={styles.input}
                placeholder="Street address"
                placeholderTextColor="#64748B"
                value={address}
                onChangeText={setAddress}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Notes</Text>
            <View style={[styles.inputContainer, styles.textAreaContainer]}>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Add notes about this lead..."
                placeholderTextColor="#64748B"
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  saveButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  form: {
    gap: 20,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '500',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 56,
    gap: 12,
  },
  textAreaContainer: {
    height: 120,
    alignItems: 'flex-start',
    paddingVertical: 12,
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
  },
  textArea: {
    height: '100%',
  },
  stageBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E3A5F',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  stageBannerText: {
    color: '#94A3B8',
    fontSize: 14,
  },
  stageBannerStage: {
    color: '#3B82F6',
    fontWeight: '600',
  },
});
