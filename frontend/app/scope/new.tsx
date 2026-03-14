import React, { useState, useRef, useEffect } from 'react';
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
import { useAuth } from '../../src/contexts/AuthContext';

type SignatureMode = 'beneficiary' | 'agent' | null;

export default function NewScopeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { leadId } = useLocalSearchParams<{ leadId: string }>();
  const { user } = useAuth();
  const signatureRef = useRef<any>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [signatureMode, setSignatureMode] = useState<SignatureMode>(null);
  
  // Lead data for prefill
  const [lead, setLead] = useState<any>(null);

  // Beneficiary signature
  const [beneficiaryTypedName, setBeneficiaryTypedName] = useState('');
  const [beneficiarySignature, setBeneficiarySignature] = useState('');
  
  // Agent signature
  const [agentTypedName, setAgentTypedName] = useState('');
  const [agentSignature, setAgentSignature] = useState('');

  // Form fields
  const [formFields, setFormFields] = useState({
    beneficiary_name: '',
    beneficiary_phone: '',
    beneficiary_address: '',
    agent_name: '',
    agent_license: '',
    agent_phone: '',
    agent_email: '',
    medicare_advantage: false,
    medicare_supplement: false,
    prescription_drug: false,
    dental_vision: false,
    other_products: '',
    consent_given: false,
    date_of_meeting: new Date().toISOString().split('T')[0],
  });

  // Load lead data for prefill
  useEffect(() => {
    loadLeadData();
  }, [leadId]);

  // Prefill agent info from user
  useEffect(() => {
    if (user) {
      setFormFields(prev => ({
        ...prev,
        agent_name: user.name || '',
        agent_email: user.email || '',
        agent_license: user.license_number || '',
      }));
      setAgentTypedName(user.name || '');
    }
  }, [user]);

  const loadLeadData = async () => {
    if (!leadId) {
      setIsLoading(false);
      return;
    }
    
    try {
      const leadData = await api.getLead(leadId);
      setLead(leadData);
      
      // Prefill beneficiary info from lead
      setFormFields(prev => ({
        ...prev,
        beneficiary_name: leadData.name || '',
        beneficiary_phone: leadData.phone || '',
        beneficiary_address: leadData.address || '',
      }));
      setBeneficiaryTypedName(leadData.name || '');
    } catch (error) {
      console.log('Error loading lead:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateFormField = (field: string, value: any) => {
    setFormFields((prev) => ({ ...prev, [field]: value }));
  };

  const handleSignatureEnd = () => {
    signatureRef.current?.readSignature();
  };

  const handleSignatureOK = (sig: string) => {
    if (signatureMode === 'beneficiary') {
      setBeneficiarySignature(sig);
    } else if (signatureMode === 'agent') {
      setAgentSignature(sig);
    }
    setSignatureMode(null);
  };

  const handleClearSignature = () => {
    signatureRef.current?.clearSignature();
  };

  const validateForm = (): boolean => {
    if (!formFields.beneficiary_name.trim()) {
      Alert.alert('Error', 'Beneficiary name is required');
      return false;
    }
    if (!beneficiaryTypedName.trim()) {
      Alert.alert('Error', 'Beneficiary must type their name to sign');
      return false;
    }
    if (!beneficiarySignature) {
      Alert.alert('Error', 'Beneficiary signature is required');
      return false;
    }
    if (!formFields.agent_name.trim()) {
      Alert.alert('Error', 'Agent name is required');
      return false;
    }
    if (!agentTypedName.trim()) {
      Alert.alert('Error', 'Agent must type their name to sign');
      return false;
    }
    if (!agentSignature) {
      Alert.alert('Error', 'Agent signature is required');
      return false;
    }
    if (!formFields.consent_given) {
      Alert.alert('Error', 'Beneficiary must acknowledge consent');
      return false;
    }
    
    // Check at least one product is selected
    const hasProduct = formFields.medicare_advantage || 
                       formFields.medicare_supplement || 
                       formFields.prescription_drug || 
                       formFields.dental_vision ||
                       formFields.other_products.trim();
    if (!hasProduct) {
      Alert.alert('Error', 'Please select at least one product to discuss');
      return false;
    }
    
    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setIsSaving(true);
    try {
      const scope = await api.createScope({
        lead_id: leadId!,
        form_fields: formFields,
        typed_name: beneficiaryTypedName.trim(),
        signature: beneficiarySignature,
        agent_typed_name: agentTypedName.trim(),
        agent_signature: agentSignature,
      });
      
      Alert.alert('Success', 'Scope of Appointment saved and PDF generated!', [
        { text: 'View Document', onPress: () => router.replace(`/scope/${scope.id}`) },
        { text: 'Done', onPress: () => router.back() },
      ]);
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Failed to save scope';
      Alert.alert('Error', message);
    } finally {
      setIsSaving(false);
    }
  };

  // Signature capture screen
  if (signatureMode) {
    const isAgent = signatureMode === 'agent';
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.signatureHeader}>
          <TouchableOpacity onPress={() => setSignatureMode(null)}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.signatureTitle}>
            {isAgent ? 'Agent Signature' : 'Beneficiary Signature'}
          </Text>
          <TouchableOpacity onPress={handleClearSignature}>
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.signatureInstructions}>
          <Ionicons name="create-outline" size={20} color="#3B82F6" />
          <Text style={styles.signatureInstructionsText}>
            {isAgent 
              ? 'As the licensed sales representative, sign below to confirm this appointment scope.'
              : 'Sign below to confirm the products you wish to discuss.'}
          </Text>
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
          <Text style={styles.doneButtonText}>Save Signature</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.container, styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading...</Text>
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
          <Ionicons name="document-text" size={24} color="#8B5CF6" />
          <View style={styles.infoTextContainer}>
            <Text style={styles.infoTitle}>CMS Required Document</Text>
            <Text style={styles.infoText}>
              This form documents the specific product types the beneficiary wants to discuss during the appointment.
            </Text>
          </View>
        </View>

        {/* Lead Reference */}
        {lead && (
          <TouchableOpacity 
            style={styles.leadReference}
            onPress={() => router.push(`/lead/${lead.id}`)}
          >
            <View style={styles.leadAvatar}>
              <Text style={styles.leadInitial}>{lead.name.charAt(0)}</Text>
            </View>
            <View style={styles.leadRefInfo}>
              <Text style={styles.leadRefLabel}>Creating SOA for:</Text>
              <Text style={styles.leadRefName}>{lead.name}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>
        )}

        {/* Section 1: Beneficiary Information */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionNumber}>
              <Text style={styles.sectionNumberText}>1</Text>
            </View>
            <Text style={styles.sectionTitle}>Beneficiary/Authorized Representative</Text>
          </View>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Full Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="Beneficiary's full legal name"
              placeholderTextColor="#64748B"
              value={formFields.beneficiary_name}
              onChangeText={(v) => updateFormField('beneficiary_name', v)}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Phone Number</Text>
            <TextInput
              style={styles.input}
              placeholder="(555) 123-4567"
              placeholderTextColor="#64748B"
              value={formFields.beneficiary_phone}
              onChangeText={(v) => updateFormField('beneficiary_phone', v)}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Address</Text>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              placeholder="Street address, City, State, ZIP"
              placeholderTextColor="#64748B"
              value={formFields.beneficiary_address}
              onChangeText={(v) => updateFormField('beneficiary_address', v)}
              multiline
            />
          </View>
        </View>

        {/* Section 2: Agent Information */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionNumber}>
              <Text style={styles.sectionNumberText}>2</Text>
            </View>
            <Text style={styles.sectionTitle}>Licensed Sales Representative</Text>
          </View>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Agent Name *</Text>
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
              placeholder="State license number"
              placeholderTextColor="#64748B"
              value={formFields.agent_license}
              onChangeText={(v) => updateFormField('agent_license', v)}
            />
          </View>
        </View>

        {/* Section 3: Products to Discuss */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionNumber}>
              <Text style={styles.sectionNumberText}>3</Text>
            </View>
            <Text style={styles.sectionTitle}>Products to be Discussed</Text>
          </View>
          
          <Text style={styles.sectionSubtitle}>
            Select all products the beneficiary would like information about:
          </Text>

          <CheckboxItem
            label="Medicare Advantage Plans (Part C)"
            sublabel="HMO, PPO, PFFS, SNP plans"
            checked={formFields.medicare_advantage}
            onToggle={() => updateFormField('medicare_advantage', !formFields.medicare_advantage)}
          />
          <CheckboxItem
            label="Medicare Supplement (Medigap) Insurance"
            sublabel="Plans A through N"
            checked={formFields.medicare_supplement}
            onToggle={() => updateFormField('medicare_supplement', !formFields.medicare_supplement)}
          />
          <CheckboxItem
            label="Prescription Drug Plans (Part D)"
            sublabel="Standalone prescription coverage"
            checked={formFields.prescription_drug}
            onToggle={() => updateFormField('prescription_drug', !formFields.prescription_drug)}
          />
          <CheckboxItem
            label="Dental, Vision, and/or Hearing Products"
            sublabel="Supplemental benefits"
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

        {/* Section 4: Consent */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionNumber}>
              <Text style={styles.sectionNumberText}>4</Text>
            </View>
            <Text style={styles.sectionTitle}>Consent & Acknowledgment</Text>
          </View>
          
          <View style={styles.consentBox}>
            <Text style={styles.consentText}>
              By signing below, I agree to a meeting with a sales agent to discuss the types of products I have selected above. 
              I understand that this is not an enrollment form and I am under no obligation to enroll in any plan. 
              The agent may only discuss the products I have indicated above.
              {'\n\n'}
              I understand that the Centers for Medicare & Medicaid Services (CMS) requires documentation of specific product types prior to any Medicare sales appointment.
            </Text>
          </View>
          
          <CheckboxItem
            label="I acknowledge and agree to the above terms"
            checked={formFields.consent_given}
            onToggle={() => updateFormField('consent_given', !formFields.consent_given)}
          />
        </View>

        {/* Section 5: Signatures */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionNumber}>
              <Text style={styles.sectionNumberText}>5</Text>
            </View>
            <Text style={styles.sectionTitle}>Signatures</Text>
          </View>
          
          {/* Beneficiary Signature */}
          <View style={styles.signatureSection}>
            <Text style={styles.signatureLabel}>Beneficiary/Authorized Representative *</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Type Full Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Type your full legal name"
                placeholderTextColor="#64748B"
                value={beneficiaryTypedName}
                onChangeText={setBeneficiaryTypedName}
                autoCapitalize="words"
              />
            </View>

            <TouchableOpacity
              style={styles.signatureBox}
              onPress={() => setSignatureMode('beneficiary')}
            >
              {beneficiarySignature ? (
                <View style={styles.signaturePreview}>
                  <Ionicons name="checkmark-circle" size={24} color="#22C55E" />
                  <Text style={styles.signedText}>Signature captured</Text>
                  <TouchableOpacity 
                    style={styles.resignLink}
                    onPress={() => {
                      setBeneficiarySignature('');
                      setSignatureMode('beneficiary');
                    }}
                  >
                    <Text style={styles.resignText}>Re-sign</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.signaturePlaceholder}>
                  <Ionicons name="create-outline" size={32} color="#64748B" />
                  <Text style={styles.signaturePlaceholderText}>Tap to sign</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Agent Signature */}
          <View style={styles.signatureSection}>
            <Text style={styles.signatureLabel}>Licensed Sales Representative *</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Type Full Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Type your full legal name"
                placeholderTextColor="#64748B"
                value={agentTypedName}
                onChangeText={setAgentTypedName}
                autoCapitalize="words"
              />
            </View>

            <TouchableOpacity
              style={styles.signatureBox}
              onPress={() => setSignatureMode('agent')}
            >
              {agentSignature ? (
                <View style={styles.signaturePreview}>
                  <Ionicons name="checkmark-circle" size={24} color="#22C55E" />
                  <Text style={styles.signedText}>Signature captured</Text>
                  <TouchableOpacity 
                    style={styles.resignLink}
                    onPress={() => {
                      setAgentSignature('');
                      setSignatureMode('agent');
                    }}
                  >
                    <Text style={styles.resignText}>Re-sign</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.signaturePlaceholder}>
                  <Ionicons name="create-outline" size={32} color="#64748B" />
                  <Text style={styles.signaturePlaceholderText}>Tap to sign</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Date */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Appointment Date</Text>
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
  sublabel,
  checked,
  onToggle,
}: {
  label: string;
  sublabel?: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <TouchableOpacity style={styles.checkboxItem} onPress={onToggle}>
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
      </View>
      <View style={styles.checkboxTextContainer}>
        <Text style={styles.checkboxLabel}>{label}</Text>
        {sublabel && <Text style={styles.checkboxSublabel}>{sublabel}</Text>}
      </View>
    </TouchableOpacity>
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
  loadingText: {
    color: '#94A3B8',
    marginTop: 12,
    fontSize: 14,
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
    backgroundColor: '#8B5CF6',
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
    marginBottom: 16,
    gap: 12,
  },
  infoTextContainer: {
    flex: 1,
  },
  infoTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  infoText: {
    color: '#94A3B8',
    fontSize: 13,
    lineHeight: 18,
  },
  leadReference: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  leadAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  leadInitial: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  leadRefInfo: {
    flex: 1,
    marginLeft: 12,
  },
  leadRefLabel: {
    color: '#64748B',
    fontSize: 12,
  },
  leadRefName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  section: {
    marginBottom: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  sectionNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#8B5CF6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionNumberText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
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
  multilineInput: {
    height: 80,
    textAlignVertical: 'top',
    paddingTop: 14,
  },
  checkboxItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: '#8B5CF6',
    borderColor: '#8B5CF6',
  },
  checkboxTextContainer: {
    flex: 1,
  },
  checkboxLabel: {
    color: '#E2E8F0',
    fontSize: 15,
  },
  checkboxSublabel: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 2,
  },
  consentBox: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  consentText: {
    color: '#94A3B8',
    fontSize: 13,
    lineHeight: 20,
  },
  signatureSection: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  signatureLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 16,
  },
  signatureBox: {
    backgroundColor: '#334155',
    borderRadius: 12,
    height: 100,
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
  resignLink: {
    marginLeft: 12,
  },
  resignText: {
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
  signatureInstructions: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  signatureInstructionsText: {
    flex: 1,
    color: '#94A3B8',
    fontSize: 14,
    lineHeight: 20,
  },
  signatureWrapper: {
    flex: 1,
    margin: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  doneButton: {
    backgroundColor: '#8B5CF6',
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
