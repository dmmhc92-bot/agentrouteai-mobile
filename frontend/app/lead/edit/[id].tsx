import React, { useState, useEffect } from 'react';
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
import { api } from '../../../src/services/api';
import { useNetwork } from '../../../src/contexts/NetworkContext';
import { offlineStorage } from '../../../src/services/offlineStorage';
import SyncStatusIndicator from '../../../src/components/SyncStatusIndicator';

export default function EditLeadScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isOnline } = useNetwork();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [leadLoaded, setLeadLoaded] = useState(false);
  const [savedOffline, setSavedOffline] = useState(false);

  useEffect(() => {
    loadLead();
  }, [id]);

  const loadLead = async () => {
    try {
      const lead = await api.getLead(id!);
      setName(lead.name);
      setPhone(lead.phone || '');
      setEmail(lead.email || '');
      setAddress(lead.address || '');
      setNotes(lead.notes || '');
      setLeadLoaded(true);
    } catch (error) {
      Alert.alert('Error', 'Failed to load lead. Please try again when online.');
      router.back();
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a name');
      return;
    }

    // Only allow offline edit if lead was already loaded
    if (!isOnline && !leadLoaded) {
      Alert.alert('Error', 'Cannot edit lead offline - please reconnect and try again.');
      return;
    }

    setIsSaving(true);
    
    const updateData = {
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      address: address.trim(),
      notes: notes.trim(),
    };

    try {
      if (isOnline) {
        // Online mode - update directly on server
        await api.updateLead(id!, updateData);
        router.back();
      } else {
        // Offline mode - save locally and queue for sync
        await offlineStorage.queueLeadUpdate(id!, updateData);
        setSavedOffline(true);
        
        Alert.alert(
          'Saved Locally',
          'Changes have been saved to your device. They will sync automatically when you\'re back online.',
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
      if (leadLoaded && (error.message?.includes('Network') || error.code === 'ERR_NETWORK')) {
        try {
          await offlineStorage.queueLeadUpdate(id!, updateData);
          setSavedOffline(true);
          Alert.alert(
            'Saved Locally',
            'Network unavailable. Changes saved locally and will sync when online.',
            [{ text: 'OK', onPress: () => router.back() }]
          );
          return;
        } catch (offlineError) {
          console.error('Failed to save offline:', offlineError);
        }
      }
      
      const message = error.response?.data?.detail || 'Failed to update lead';
      Alert.alert('Error', message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

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
          <Text style={styles.title}>Edit Lead</Text>
          {!isOnline && leadLoaded && (
            <SyncStatusIndicator status="pending" compact />
          )}
        </View>
        <TouchableOpacity
          style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>
              {isOnline ? 'Save' : 'Save Offline'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

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
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
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
});
