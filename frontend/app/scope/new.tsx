import React, { useState, useRef } from 'react';
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
import SignatureCanvas from 'react-native-signature-canvas';
import { api } from '../../src/services/api';

export default function NewScopeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { leadId } = useLocalSearchParams<{ leadId: string }>();
  const signatureRef = useRef<any>(null);

  const [typedName, setTypedName] = useState('');
  const [signature, setSignature] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showSignature, setShowSignature] = useState(false);

  // Form fields
  const [formFields, setFormFields] = useState({
    beneficiary_name: '',
    beneficiary_phone: '',
    agent_name: '',
    agent_license: '',
    products_discussed: '',
    medicare_advantage: false,
    medicare_supplement: false,
    prescription_drug: false,
    dental_vision: false,
    other_products: '',
    consent_given: false,
    date_of_meeting: new Date().toISOString().split('T')[0],
  });

  const updateFormField = (field: string, value: any) => {
    setFormFields((prev) => ({ ...prev, [field]: value }));
  };

  const handleSignatureEnd = () => {
    signatureRef.current?.readSignature();
  };

  const handleSignatureOK = (sig: string) => {
    setSignature(sig);
    setShowSignature(false);
  };

  const handleClearSignature = () => {
    signatureRef.current?.clearSignature();
    setSignature('');
  };

  const handleSave = async () => {
    if (!typedName.trim()) {
      Alert.alert('Error', 'Please type your name to sign');
      return;
    }

    if (!signature) {
      Alert.alert('Error', 'Please provide your signature');
      return;
    }

    if (!formFields.consent_given) {
      Alert.alert('Error', 'Please confirm consent to proceed');
      return;
    }

    setIsSaving(true);
    try {
      const scope = await api.createScope({
        lead_id: leadId!,
        form_fields: formFields,
        typed_name: typedName.trim(),
        signature: signature,
      });
      Alert.alert('Success', 'Scope of Appointment saved', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Failed to save scope';
      Alert.alert('Error', message);
    } finally {
      setIsSaving(false);
    }
  };

  if (showSignature) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.signatureHeader}>
          <TouchableOpacity onPress={() => setShowSignature(false)}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.signatureTitle}>Sign Here</Text>
          <TouchableOpacity onPress={handleClearSignature}>
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.signatureWrapper}>
          <SignatureCanvas
            ref={signatureRef}
            onEnd={handleSignatureEnd}
            onOK={handleSignatureOK}
            webStyle={`
              .m-signature-pad { box-shadow: none; border: none; }
              .m-signature-pad--body { border: none; }
              .m-signature-pad--footer { display: none; }
              body, html { background-color: #1E293B; }
              canvas { background-color: #FFFFFF; border-radius: 12px; }
            `}
            backgroundColor="#FFFFFF"
            penColor="#000000"
          />
        </View>
        <TouchableOpacity
          style={styles.doneButton}
          onPress={() => signatureRef.current?.readSignature()}
        >
          <Text style={styles.doneButtonText}>Done</Text>
        </TouchableOpacity>
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
        <Text style={styles.title}>Scope of Appointment</Text>
        <TouchableOpacity
          style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header Info */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={24} color="#3B82F6" />
          <Text style={styles.infoText}>
            This document confirms the products and services to be discussed during your appointment.
          </Text>
        </View>

        {/* Beneficiary Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Beneficiary Information</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Beneficiary's full name"
              placeholderTextColor="#64748B"
              value={formFields.beneficiary_name}
              onChangeText={(v) => updateFormField('beneficiary_name', v)}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Phone</Text>
            <TextInput
              style={styles.input}
              placeholder="Phone number"
              placeholderTextColor="#64748B"
              value={formFields.beneficiary_phone}
              onChangeText={(v) => updateFormField('beneficiary_phone', v)}
              keyboardType="phone-pad"
            />
          </View>
        </View>

        {/* Agent Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Agent Information</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Agent Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Agent's full name"
              placeholderTextColor="#64748B"
              value={formFields.agent_name}
              onChangeText={(v) => updateFormField('agent_name', v)}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>License Number</Text>
            <TextInput
              style={styles.input}
              placeholder="License number"
              placeholderTextColor="#64748B"
              value={formFields.agent_license}
              onChangeText={(v) => updateFormField('agent_license', v)}
            />
          </View>
        </View>

        {/* Products to Discuss */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Products to be Discussed</Text>
          <Text style={styles.sectionSubtitle}>
            Select all products the beneficiary would like information about:
          </Text>

          <CheckboxItem
            label="Medicare Advantage Plans (Part C)"
            checked={formFields.medicare_advantage}
            onToggle={() => updateFormField('medicare_advantage', !formFields.medicare_advantage)}
          />
          <CheckboxItem
            label="Medicare Supplement (Medigap) Insurance"
            checked={formFields.medicare_supplement}
            onToggle={() => updateFormField('medicare_supplement', !formFields.medicare_supplement)}
          />
          <CheckboxItem
            label="Prescription Drug Plans (Part D)"
            checked={formFields.prescription_drug}
            onToggle={() => updateFormField('prescription_drug', !formFields.prescription_drug)}
          />
          <CheckboxItem
            label="Dental/Vision/Hearing Products"
            checked={formFields.dental_vision}
            onToggle={() => updateFormField('dental_vision', !formFields.dental_vision)}
          />

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Other Products</Text>
            <TextInput
              style={styles.input}
              placeholder="List any other products"
              placeholderTextColor="#64748B"
              value={formFields.other_products}
              onChangeText={(v) => updateFormField('other_products', v)}
            />
          </View>
        </View>

        {/* Consent */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Consent</Text>
          <View style={styles.consentBox}>
            <Text style={styles.consentText}>
              By signing below, I confirm that the agent may only discuss the products I have selected above. 
              I understand that I am under no obligation to enroll in any plan discussed.
            </Text>
          </View>
          <CheckboxItem
            label="I agree to the above terms"
            checked={formFields.consent_given}
            onToggle={() => updateFormField('consent_given', !formFields.consent_given)}
          />
        </View>

        {/* Signature Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Signature</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Type Your Full Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="Your full legal name"
              placeholderTextColor="#64748B"
              value={typedName}
              onChangeText={setTypedName}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Signature *</Text>
            <TouchableOpacity
              style={styles.signatureBox}
              onPress={() => setShowSignature(true)}
            >
              {signature ? (
                <View style={styles.signaturePreview}>
                  <Text style={styles.signedText}>Signature captured</Text>
                  <Ionicons name="checkmark-circle" size={24} color="#22C55E" />
                </View>
              ) : (
                <View style={styles.signaturePlaceholder}>
                  <Ionicons name="create-outline" size={32} color="#64748B" />
                  <Text style={styles.signaturePlaceholderText}>Tap to sign</Text>
                </View>
              )}
            </TouchableOpacity>
            {signature && (
              <TouchableOpacity
                style={styles.resignButton}
                onPress={() => {
                  setSignature('');
                  setShowSignature(true);
                }}
              >
                <Text style={styles.resignButtonText}>Re-sign</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Date</Text>
            <View style={styles.dateDisplay}>
              <Ionicons name="calendar-outline" size={20} color="#64748B" />
              <Text style={styles.dateText}>{formFields.date_of_meeting}</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function CheckboxItem({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <TouchableOpacity style={styles.checkboxItem} onPress={onToggle}>
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
      </View>
      <Text style={styles.checkboxLabel}>{label}</Text>
    </TouchableOpacity>
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
    paddingBottom: 40,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    gap: 12,
  },
  infoText: {
    flex: 1,
    color: '#94A3B8',
    fontSize: 14,
    lineHeight: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  sectionSubtitle: {
    color: '#94A3B8',
    fontSize: 14,
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 52,
    color: '#FFFFFF',
    fontSize: 16,
  },
  checkboxItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  checkboxLabel: {
    flex: 1,
    color: '#E2E8F0',
    fontSize: 15,
  },
  consentBox: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  consentText: {
    color: '#94A3B8',
    fontSize: 14,
    lineHeight: 22,
  },
  signatureBox: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  signaturePlaceholder: {
    alignItems: 'center',
    gap: 8,
  },
  signaturePlaceholderText: {
    color: '#64748B',
    fontSize: 14,
  },
  signaturePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  signedText: {
    color: '#22C55E',
    fontSize: 16,
    fontWeight: '500',
  },
  resignButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  resignButtonText: {
    color: '#3B82F6',
    fontSize: 14,
  },
  dateDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 52,
    gap: 12,
  },
  dateText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  // Signature Screen Styles
  signatureHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  signatureTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  cancelText: {
    color: '#EF4444',
    fontSize: 16,
  },
  clearText: {
    color: '#3B82F6',
    fontSize: 16,
  },
  signatureWrapper: {
    flex: 1,
    margin: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  doneButton: {
    backgroundColor: '#3B82F6',
    marginHorizontal: 16,
    marginBottom: 32,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
});
