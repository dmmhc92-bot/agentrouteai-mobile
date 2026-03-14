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
  Image,
  Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import SignatureCapture from '../../src/components/SignatureCapture';
import { api } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';

interface FormData {
  // Beneficiary Info
  beneficiary_name: string;
  beneficiary_phone: string;
  beneficiary_address: string;
  // Authorized Rep (if different)
  auth_rep_name: string;
  auth_rep_relationship: string;
  // Agent Info
  agent_name: string;
  agent_license: string;
  agent_phone: string;
  agent_id_number: string;
  // Contact Method
  initial_contact_method: 'phone' | 'in_person' | 'email' | 'mail' | 'referral' | 'other';
  // Products
  medicare_advantage: boolean;
  medicare_supplement: boolean;
  prescription_drug: boolean;
  dental_vision_hearing: boolean;
  hospital_indemnity: boolean;
  other_products: string;
  // Plans to Represent
  plans_to_represent: string;
  // Dates
  appointment_date: string;
  signature_date: string;
  // Consent
  consent_given: boolean;
}

type SignatureType = 'beneficiary' | 'agent' | null;
type FormStep = 'form' | 'review' | 'complete';

const CONTACT_METHODS = [
  { value: 'phone', label: 'Phone Call', icon: 'call-outline' },
  { value: 'in_person', label: 'In Person', icon: 'person-outline' },
  { value: 'email', label: 'Email', icon: 'mail-outline' },
  { value: 'mail', label: 'Direct Mail', icon: 'mail-open-outline' },
  { value: 'referral', label: 'Referral', icon: 'people-outline' },
  { value: 'other', label: 'Other', icon: 'ellipsis-horizontal-outline' },
];

export default function NewScopeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { leadId } = useLocalSearchParams<{ leadId: string }>();
  const { user } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [lead, setLead] = useState<any>(null);
  const [step, setStep] = useState<FormStep>('form');
  const [showDatePicker, setShowDatePicker] = useState<'appointment' | 'signature' | null>(null);

  // Signatures
  const [signatureModalType, setSignatureModalType] = useState<SignatureType>(null);
  const [beneficiarySignature, setBeneficiarySignature] = useState<string>('');
  const [agentSignature, setAgentSignature] = useState<string>('');

  // Form data
  const [formData, setFormData] = useState<FormData>({
    beneficiary_name: '',
    beneficiary_phone: '',
    beneficiary_address: '',
    auth_rep_name: '',
    auth_rep_relationship: '',
    agent_name: '',
    agent_license: '',
    agent_phone: '',
    agent_id_number: '',
    initial_contact_method: 'phone',
    medicare_advantage: false,
    medicare_supplement: false,
    prescription_drug: false,
    dental_vision_hearing: false,
    hospital_indemnity: false,
    other_products: '',
    plans_to_represent: '',
    appointment_date: new Date().toISOString().split('T')[0],
    signature_date: new Date().toISOString().split('T')[0],
    consent_given: false,
  });

  useEffect(() => {
    loadData();
  }, [leadId]);

  useEffect(() => {
    if (user) {
      setFormData(prev => ({
        ...prev,
        agent_name: user.name || '',
        agent_phone: user.phone || '',
        agent_license: user.license_number || '',
        agent_id_number: user.npn || user.id?.slice(0, 8).toUpperCase() || '',
      }));
    }
  }, [user]);

  const loadData = async () => {
    if (!leadId) {
      setIsLoading(false);
      return;
    }

    try {
      const leadData = await api.getLead(leadId);
      setLead(leadData);
      setFormData(prev => ({
        ...prev,
        beneficiary_name: leadData.name || '',
        beneficiary_phone: leadData.phone || '',
        beneficiary_address: leadData.address || '',
      }));
    } catch (error) {
      console.error('Error loading lead:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateField = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const toggleProduct = (field: keyof FormData) => {
    setFormData(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const validateForm = (): string | null => {
    if (!formData.beneficiary_name.trim()) return 'Beneficiary name is required';
    if (!formData.agent_name.trim()) return 'Agent name is required';
    
    const hasProduct = formData.medicare_advantage || 
                       formData.medicare_supplement || 
                       formData.prescription_drug || 
                       formData.dental_vision_hearing ||
                       formData.hospital_indemnity ||
                       formData.other_products.trim();
    if (!hasProduct) return 'Please select at least one product to discuss';
    
    if (!formData.consent_given) return 'Beneficiary must acknowledge consent';
    
    // Validate signatures exist and are real image data (not empty or placeholder)
    if (!beneficiarySignature) {
      return 'Beneficiary handwritten signature is required. Tap the signature area to sign.';
    }
    if (!beneficiarySignature.startsWith('data:image/')) {
      return 'Invalid beneficiary signature format. Please sign again.';
    }
    // Check for minimum signature data (base64 PNG should be >500 chars for a real signature)
    if (beneficiarySignature.length < 500) {
      return 'Beneficiary signature appears incomplete. Please draw a full signature.';
    }
    
    if (!agentSignature) {
      return 'Agent handwritten signature is required. Tap the signature area to sign.';
    }
    if (!agentSignature.startsWith('data:image/')) {
      return 'Invalid agent signature format. Please sign again.';
    }
    if (agentSignature.length < 500) {
      return 'Agent signature appears incomplete. Please draw a full signature.';
    }
    
    return null;
  };

  const handleReview = () => {
    const error = validateForm();
    if (error) {
      Alert.alert('Incomplete Form', error);
      return;
    }
    setStep('review');
  };

  const handleSave = async () => {
    const error = validateForm();
    if (error) {
      Alert.alert('Validation Error', error);
      return;
    }

    setIsSaving(true);
    try {
      // Build products list for PDF
      const products = [];
      if (formData.medicare_advantage) products.push('Medicare Advantage (Part C)');
      if (formData.medicare_supplement) products.push('Medicare Supplement (Medigap)');
      if (formData.prescription_drug) products.push('Prescription Drug Plans (Part D)');
      if (formData.dental_vision_hearing) products.push('Dental, Vision & Hearing');
      if (formData.hospital_indemnity) products.push('Hospital Indemnity');
      if (formData.other_products.trim()) products.push(formData.other_products.trim());

      // Add signature timestamps
      const now = new Date().toISOString();

      const scope = await api.createScope({
        lead_id: leadId!,
        form_fields: {
          ...formData,
          products_selected: products,
          beneficiary_signed_at: now,
          agent_signed_at: now,
        },
        typed_name: formData.beneficiary_name.trim(),
        signature: beneficiarySignature,
        agent_typed_name: formData.agent_name.trim(),
        agent_signature: agentSignature,
      });

      // Check if PDF was generated successfully
      if (scope.pdf_error) {
        console.warn('PDF generation issue:', scope.pdf_error);
        // Still continue - PDF can be regenerated later
        Alert.alert(
          'Document Saved',
          'Your Scope of Appointment was saved, but there was an issue generating the PDF. The PDF will be available when you view the document.',
          [{ text: 'OK' }]
        );
      } else if (!scope.pdf_base64) {
        console.warn('PDF not generated during save, will be generated on view');
      } else {
        console.log('SOA saved successfully with PDF');
      }

      setStep('complete');
      
      // Navigate to view the completed document
      setTimeout(() => {
        router.replace(`/scope/${scope.id}`);
      }, 1500);
    } catch (error: any) {
      console.error('Save error:', error);
      const message = error.response?.data?.detail || 'Failed to save document. Please try again.';
      Alert.alert('Save Failed', message, [{ text: 'OK' }]);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(null);
    }
    if (selectedDate) {
      const dateStr = selectedDate.toISOString().split('T')[0];
      if (showDatePicker === 'appointment') {
        updateField('appointment_date', dateStr);
      } else if (showDatePicker === 'signature') {
        updateField('signature_date', dateStr);
      }
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  // Loading state
  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#8B5CF6" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  // Complete state
  if (step === 'complete') {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <View style={styles.successIcon}>
          <Ionicons name="checkmark-circle" size={80} color="#22C55E" />
        </View>
        <Text style={styles.successTitle}>Document Saved!</Text>
        <Text style={styles.successText}>Your Scope of Appointment has been completed and saved.</Text>
        <ActivityIndicator size="small" color="#8B5CF6" style={{ marginTop: 20 }} />
        <Text style={styles.redirectText}>Opening document...</Text>
      </View>
    );
  }

  // Review state
  if (step === 'review') {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerButton} onPress={() => setStep('form')}>
            <Ionicons name="arrow-back" size={24} color="#1F2937" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Review Document</Text>
          <View style={styles.headerButton} />
        </View>

        <ScrollView style={styles.reviewScroll} contentContainerStyle={styles.reviewContent}>
          <View style={styles.reviewBanner}>
            <Ionicons name="document-text" size={28} color="#8B5CF6" />
            <Text style={styles.reviewBannerTitle}>Review Before Saving</Text>
            <Text style={styles.reviewBannerText}>
              Please review all information below. Once saved, a professional PDF document will be generated.
            </Text>
          </View>

          {/* Beneficiary Section */}
          <View style={styles.reviewSection}>
            <Text style={styles.reviewSectionTitle}>Beneficiary Information</Text>
            <ReviewRow label="Name" value={formData.beneficiary_name} />
            <ReviewRow label="Phone" value={formData.beneficiary_phone || 'Not provided'} />
            <ReviewRow label="Address" value={formData.beneficiary_address || 'Not provided'} />
            {formData.auth_rep_name && (
              <>
                <ReviewRow label="Authorized Rep" value={formData.auth_rep_name} />
                <ReviewRow label="Relationship" value={formData.auth_rep_relationship} />
              </>
            )}
          </View>

          {/* Agent Section */}
          <View style={styles.reviewSection}>
            <Text style={styles.reviewSectionTitle}>Sales Representative</Text>
            <ReviewRow label="Name" value={formData.agent_name} />
            <ReviewRow label="License #" value={formData.agent_license || 'Not provided'} />
            <ReviewRow label="Phone" value={formData.agent_phone || 'Not provided'} />
            <ReviewRow label="Agent ID" value={formData.agent_id_number || 'Not provided'} />
          </View>

          {/* Products Section */}
          <View style={styles.reviewSection}>
            <Text style={styles.reviewSectionTitle}>Products to Discuss</Text>
            {formData.medicare_advantage && <ReviewRow label="✓" value="Medicare Advantage Plans (Part C)" />}
            {formData.medicare_supplement && <ReviewRow label="✓" value="Medicare Supplement (Medigap)" />}
            {formData.prescription_drug && <ReviewRow label="✓" value="Prescription Drug Plans (Part D)" />}
            {formData.dental_vision_hearing && <ReviewRow label="✓" value="Dental, Vision & Hearing" />}
            {formData.hospital_indemnity && <ReviewRow label="✓" value="Hospital Indemnity" />}
            {formData.other_products && <ReviewRow label="✓" value={formData.other_products} />}
          </View>

          {/* Dates Section */}
          <View style={styles.reviewSection}>
            <Text style={styles.reviewSectionTitle}>Dates</Text>
            <ReviewRow label="Appointment Date" value={formatDate(formData.appointment_date)} />
            <ReviewRow label="Signature Date" value={formatDate(formData.signature_date)} />
            <ReviewRow label="Initial Contact" value={CONTACT_METHODS.find(m => m.value === formData.initial_contact_method)?.label || 'Not specified'} />
          </View>

          {/* Signatures Section */}
          <View style={styles.reviewSection}>
            <Text style={styles.reviewSectionTitle}>Signatures</Text>
            <View style={styles.signatureReview}>
              <Text style={styles.signatureReviewLabel}>Beneficiary Signature:</Text>
              {beneficiarySignature ? (
                <Image source={{ uri: beneficiarySignature }} style={styles.signatureImage} resizeMode="contain" />
              ) : (
                <Text style={styles.noSignature}>Missing</Text>
              )}
              <Text style={styles.signaturePrintedName}>Printed: {formData.beneficiary_name}</Text>
            </View>
            <View style={styles.signatureReview}>
              <Text style={styles.signatureReviewLabel}>Agent Signature:</Text>
              {agentSignature ? (
                <Image source={{ uri: agentSignature }} style={styles.signatureImage} resizeMode="contain" />
              ) : (
                <Text style={styles.noSignature}>Missing</Text>
              )}
              <Text style={styles.signaturePrintedName}>Printed: {formData.agent_name}</Text>
            </View>
          </View>
        </ScrollView>

        <View style={[styles.reviewFooter, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity style={styles.editButton} onPress={() => setStep('form')}>
            <Ionicons name="create-outline" size={20} color="#8B5CF6" />
            <Text style={styles.editButtonText}>Edit Form</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.saveButton, isSaving && styles.saveButtonDisabled]} 
            onPress={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                <Text style={styles.saveButtonText}>Save & Generate PDF</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Form state
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.headerButton} onPress={() => router.back()}>
          <Ionicons name="close" size={24} color="#1F2937" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Scope of Appointment</Text>
          <Text style={styles.headerSubtitle}>CMS Required Document</Text>
        </View>
        <View style={styles.headerButton} />
      </View>

      <ScrollView
        style={styles.formScroll}
        contentContainerStyle={styles.formContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Lead Reference */}
        {lead && (
          <TouchableOpacity 
            style={styles.leadCard}
            onPress={() => router.push(`/lead/${lead.id}`)}
          >
            <View style={styles.leadAvatar}>
              <Text style={styles.leadInitial}>{lead.name?.charAt(0) || '?'}</Text>
            </View>
            <View style={styles.leadInfo}>
              <Text style={styles.leadLabel}>Creating SOA for:</Text>
              <Text style={styles.leadName}>{lead.name}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
          </TouchableOpacity>
        )}

        {/* Section 1: Beneficiary */}
        <SectionHeader number={1} title="Beneficiary Information" />
        
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Beneficiary Full Name <Text style={styles.required}>*</Text></Text>
          <TextInput
            style={styles.input}
            placeholder="Full legal name"
            placeholderTextColor="#94A3B8"
            value={formData.beneficiary_name}
            onChangeText={(v) => updateField('beneficiary_name', v)}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Phone Number</Text>
          <TextInput
            style={styles.input}
            placeholder="(555) 123-4567"
            placeholderTextColor="#94A3B8"
            value={formData.beneficiary_phone}
            onChangeText={(v) => updateField('beneficiary_phone', v)}
            keyboardType="phone-pad"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Address</Text>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            placeholder="Street, City, State ZIP"
            placeholderTextColor="#94A3B8"
            value={formData.beneficiary_address}
            onChangeText={(v) => updateField('beneficiary_address', v)}
            multiline
          />
        </View>

        {/* Authorized Representative */}
        <View style={styles.optionalSection}>
          <Text style={styles.optionalTitle}>Authorized Representative (if applicable)</Text>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Representative Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Leave blank if beneficiary is signing"
              placeholderTextColor="#94A3B8"
              value={formData.auth_rep_name}
              onChangeText={(v) => updateField('auth_rep_name', v)}
              autoCapitalize="words"
            />
          </View>
          {formData.auth_rep_name && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Relationship to Beneficiary</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Son, Daughter, Spouse, POA"
                placeholderTextColor="#94A3B8"
                value={formData.auth_rep_relationship}
                onChangeText={(v) => updateField('auth_rep_relationship', v)}
              />
            </View>
          )}
        </View>

        {/* Section 2: Agent */}
        <SectionHeader number={2} title="Licensed Sales Representative" />

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Agent Name <Text style={styles.required}>*</Text></Text>
          <TextInput
            style={styles.input}
            placeholder="Full legal name"
            placeholderTextColor="#94A3B8"
            value={formData.agent_name}
            onChangeText={(v) => updateField('agent_name', v)}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.row}>
          <View style={[styles.inputGroup, { flex: 1 }]}>
            <Text style={styles.inputLabel}>License Number</Text>
            <TextInput
              style={styles.input}
              placeholder="State license #"
              placeholderTextColor="#94A3B8"
              value={formData.agent_license}
              onChangeText={(v) => updateField('agent_license', v)}
            />
          </View>
          <View style={[styles.inputGroup, { flex: 1, marginLeft: 12 }]}>
            <Text style={styles.inputLabel}>Agent ID / NPN</Text>
            <TextInput
              style={styles.input}
              placeholder="ID number"
              placeholderTextColor="#94A3B8"
              value={formData.agent_id_number}
              onChangeText={(v) => updateField('agent_id_number', v)}
            />
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Agent Phone</Text>
          <TextInput
            style={styles.input}
            placeholder="(555) 123-4567"
            placeholderTextColor="#94A3B8"
            value={formData.agent_phone}
            onChangeText={(v) => updateField('agent_phone', v)}
            keyboardType="phone-pad"
          />
        </View>

        {/* Section 3: Initial Contact */}
        <SectionHeader number={3} title="Initial Method of Contact" />
        <View style={styles.contactMethodGrid}>
          {CONTACT_METHODS.map((method) => (
            <TouchableOpacity
              key={method.value}
              style={[
                styles.contactMethodCard,
                formData.initial_contact_method === method.value && styles.contactMethodActive,
              ]}
              onPress={() => updateField('initial_contact_method', method.value)}
            >
              <Ionicons 
                name={method.icon as any} 
                size={24} 
                color={formData.initial_contact_method === method.value ? '#8B5CF6' : '#64748B'} 
              />
              <Text style={[
                styles.contactMethodText,
                formData.initial_contact_method === method.value && styles.contactMethodTextActive,
              ]}>
                {method.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Section 4: Products */}
        <SectionHeader number={4} title="Products to be Discussed" />
        <Text style={styles.sectionHint}>
          Select all products the beneficiary wants information about:
        </Text>

        <ProductCheckbox
          label="Medicare Advantage Plans (Part C)"
          sublabel="HMO, PPO, PFFS, SNP plans"
          checked={formData.medicare_advantage}
          onToggle={() => toggleProduct('medicare_advantage')}
        />
        <ProductCheckbox
          label="Medicare Supplement (Medigap)"
          sublabel="Plans A through N"
          checked={formData.medicare_supplement}
          onToggle={() => toggleProduct('medicare_supplement')}
        />
        <ProductCheckbox
          label="Prescription Drug Plans (Part D)"
          sublabel="Standalone prescription coverage"
          checked={formData.prescription_drug}
          onToggle={() => toggleProduct('prescription_drug')}
        />
        <ProductCheckbox
          label="Dental, Vision & Hearing"
          sublabel="Supplemental benefits"
          checked={formData.dental_vision_hearing}
          onToggle={() => toggleProduct('dental_vision_hearing')}
        />
        <ProductCheckbox
          label="Hospital Indemnity Insurance"
          sublabel="Additional hospital coverage"
          checked={formData.hospital_indemnity}
          onToggle={() => toggleProduct('hospital_indemnity')}
        />

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Other Products</Text>
          <TextInput
            style={styles.input}
            placeholder="List any other products"
            placeholderTextColor="#94A3B8"
            value={formData.other_products}
            onChangeText={(v) => updateField('other_products', v)}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Plan(s) to be Represented</Text>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            placeholder="e.g., Aetna Medicare Advantage, UHC AARP Medigap"
            placeholderTextColor="#94A3B8"
            value={formData.plans_to_represent}
            onChangeText={(v) => updateField('plans_to_represent', v)}
            multiline
          />
        </View>

        {/* Section 5: Dates */}
        <SectionHeader number={5} title="Appointment Details" />

        <View style={styles.row}>
          <View style={[styles.inputGroup, { flex: 1 }]}>
            <Text style={styles.inputLabel}>Appointment Date</Text>
            <TouchableOpacity 
              style={styles.dateButton}
              onPress={() => setShowDatePicker('appointment')}
            >
              <Ionicons name="calendar-outline" size={20} color="#64748B" />
              <Text style={styles.dateText}>{formatDate(formData.appointment_date)}</Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.inputGroup, { flex: 1, marginLeft: 12 }]}>
            <Text style={styles.inputLabel}>Signature Date</Text>
            <TouchableOpacity 
              style={styles.dateButton}
              onPress={() => setShowDatePicker('signature')}
            >
              <Ionicons name="calendar-outline" size={20} color="#64748B" />
              <Text style={styles.dateText}>{formatDate(formData.signature_date)}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Section 6: Consent */}
        <SectionHeader number={6} title="Consent & Acknowledgment" />

        <View style={styles.consentBox}>
          <Text style={styles.consentText}>
            By signing below, I agree to a meeting with a sales agent to discuss the types of products I have selected above. I understand that this is not an enrollment form and I am under no obligation to enroll in any plan. The agent may only discuss the products I have indicated above.
          </Text>
          <Text style={styles.consentText}>
            I understand that the Centers for Medicare & Medicaid Services (CMS) requires documentation of specific product types prior to any Medicare sales appointment.
          </Text>
        </View>

        <ProductCheckbox
          label="I acknowledge and agree to the above terms"
          checked={formData.consent_given}
          onToggle={() => toggleProduct('consent_given')}
          highlight
        />

        {/* Section 7: Signatures */}
        <SectionHeader number={7} title="Signatures" />

        {/* Beneficiary Signature */}
        <View style={styles.signatureCard}>
          <View style={styles.signatureCardHeader}>
            <Text style={styles.signatureCardTitle}>Beneficiary/Authorized Representative</Text>
            <Text style={styles.required}>*</Text>
          </View>
          
          <View style={styles.signatureNameRow}>
            <Text style={styles.signatureNameLabel}>Printed Name:</Text>
            <Text style={styles.signatureNameValue}>{formData.beneficiary_name || formData.auth_rep_name || '—'}</Text>
          </View>

          <TouchableOpacity
            style={styles.signatureArea}
            onPress={() => setSignatureModalType('beneficiary')}
          >
            {beneficiarySignature ? (
              <View style={styles.signaturePreview}>
                <Image 
                  source={{ uri: beneficiarySignature }} 
                  style={styles.signaturePreviewImage}
                  resizeMode="contain"
                />
                <TouchableOpacity 
                  style={styles.resignButton}
                  onPress={() => {
                    setBeneficiarySignature('');
                    setSignatureModalType('beneficiary');
                  }}
                >
                  <Ionicons name="refresh" size={16} color="#3B82F6" />
                  <Text style={styles.resignText}>Re-sign</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.signaturePlaceholder}>
                <Ionicons name="create-outline" size={36} color="#94A3B8" />
                <Text style={styles.signaturePlaceholderText}>Tap to sign</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Agent Signature */}
        <View style={styles.signatureCard}>
          <View style={styles.signatureCardHeader}>
            <Text style={styles.signatureCardTitle}>Licensed Sales Representative</Text>
            <Text style={styles.required}>*</Text>
          </View>
          
          <View style={styles.signatureNameRow}>
            <Text style={styles.signatureNameLabel}>Printed Name:</Text>
            <Text style={styles.signatureNameValue}>{formData.agent_name || '—'}</Text>
          </View>

          <TouchableOpacity
            style={styles.signatureArea}
            onPress={() => setSignatureModalType('agent')}
          >
            {agentSignature ? (
              <View style={styles.signaturePreview}>
                <Image 
                  source={{ uri: agentSignature }} 
                  style={styles.signaturePreviewImage}
                  resizeMode="contain"
                />
                <TouchableOpacity 
                  style={styles.resignButton}
                  onPress={() => {
                    setAgentSignature('');
                    setSignatureModalType('agent');
                  }}
                >
                  <Ionicons name="refresh" size={16} color="#3B82F6" />
                  <Text style={styles.resignText}>Re-sign</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.signaturePlaceholder}>
                <Ionicons name="create-outline" size={36} color="#94A3B8" />
                <Text style={styles.signaturePlaceholderText}>Tap to sign</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity style={styles.reviewButton} onPress={handleReview}>
          <Text style={styles.reviewButtonText}>Review & Complete</Text>
          <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Signature Modals */}
      <SignatureCapture
        visible={signatureModalType === 'beneficiary'}
        onClose={() => setSignatureModalType(null)}
        onSave={(sig) => {
          setBeneficiarySignature(sig);
          setSignatureModalType(null);
        }}
        title="Beneficiary Signature"
        subtitle="Sign to confirm products to discuss"
        signerName={formData.beneficiary_name || formData.auth_rep_name}
        existingSignature={beneficiarySignature}
      />

      <SignatureCapture
        visible={signatureModalType === 'agent'}
        onClose={() => setSignatureModalType(null)}
        onSave={(sig) => {
          setAgentSignature(sig);
          setSignatureModalType(null);
        }}
        title="Agent Signature"
        subtitle="Confirm appointment scope"
        signerName={formData.agent_name}
        existingSignature={agentSignature}
      />

      {/* Date Pickers */}
      {showDatePicker && (
        <Modal
          transparent
          animationType="fade"
          visible={!!showDatePicker}
          onRequestClose={() => setShowDatePicker(null)}
        >
          <TouchableOpacity 
            style={styles.datePickerOverlay}
            activeOpacity={1}
            onPress={() => setShowDatePicker(null)}
          >
            <View style={styles.datePickerContainer}>
              <View style={styles.datePickerHeader}>
                <Text style={styles.datePickerTitle}>
                  {showDatePicker === 'appointment' ? 'Appointment Date' : 'Signature Date'}
                </Text>
                <TouchableOpacity onPress={() => setShowDatePicker(null)}>
                  <Text style={styles.datePickerDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={new Date(
                  showDatePicker === 'appointment' 
                    ? formData.appointment_date 
                    : formData.signature_date
                )}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={handleDateChange}
                style={styles.datePicker}
              />
            </View>
          </TouchableOpacity>
        </Modal>
      )}
    </KeyboardAvoidingView>
  );
}

// Reusable Components
function SectionHeader({ number, title }: { number: number; title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionNumber}>
        <Text style={styles.sectionNumberText}>{number}</Text>
      </View>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function ProductCheckbox({ 
  label, 
  sublabel, 
  checked, 
  onToggle,
  highlight = false,
}: { 
  label: string; 
  sublabel?: string; 
  checked: boolean; 
  onToggle: () => void;
  highlight?: boolean;
}) {
  return (
    <TouchableOpacity 
      style={[styles.checkboxRow, highlight && styles.checkboxRowHighlight]} 
      onPress={onToggle}
    >
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
      </View>
      <View style={styles.checkboxTextContainer}>
        <Text style={[styles.checkboxLabel, highlight && styles.checkboxLabelHighlight]}>{label}</Text>
        {sublabel && <Text style={styles.checkboxSublabel}>{sublabel}</Text>}
      </View>
    </TouchableOpacity>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={styles.reviewValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#64748B',
  },
  successIcon: {
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
  },
  successText: {
    fontSize: 16,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 40,
  },
  redirectText: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  formScroll: {
    flex: 1,
  },
  formContent: {
    padding: 16,
  },
  leadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  leadAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#8B5CF6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  leadInitial: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  leadInfo: {
    flex: 1,
    marginLeft: 12,
  },
  leadLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  leadName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginTop: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
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
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  sectionHint: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 12,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#475569',
    marginBottom: 8,
  },
  required: {
    color: '#EF4444',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 52,
    fontSize: 16,
    color: '#1F2937',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  multilineInput: {
    height: 80,
    textAlignVertical: 'top',
    paddingTop: 14,
  },
  row: {
    flexDirection: 'row',
  },
  optionalSection: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  optionalTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 12,
  },
  contactMethodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  contactMethodCard: {
    width: '31%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E2E8F0',
  },
  contactMethodActive: {
    borderColor: '#8B5CF6',
    backgroundColor: '#F5F3FF',
  },
  contactMethodText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 6,
    textAlign: 'center',
  },
  contactMethodTextActive: {
    color: '#8B5CF6',
    fontWeight: '600',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  checkboxRowHighlight: {
    borderColor: '#F59E0B',
    backgroundColor: '#FFFBEB',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#CBD5E1',
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
    marginLeft: 12,
  },
  checkboxLabel: {
    fontSize: 15,
    color: '#1F2937',
    fontWeight: '500',
  },
  checkboxLabelHighlight: {
    color: '#B45309',
  },
  checkboxSublabel: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  consentBox: {
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  consentText: {
    fontSize: 13,
    color: '#78350F',
    lineHeight: 20,
    marginBottom: 8,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 52,
    gap: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dateText: {
    fontSize: 15,
    color: '#1F2937',
  },
  signatureCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  signatureCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  signatureCardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
  },
  signatureNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  signatureNameLabel: {
    fontSize: 13,
    color: '#64748B',
    marginRight: 8,
  },
  signatureNameValue: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1F2937',
  },
  signatureArea: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    height: 120,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  signaturePlaceholder: {
    alignItems: 'center',
    gap: 8,
  },
  signaturePlaceholderText: {
    fontSize: 14,
    color: '#94A3B8',
  },
  signaturePreview: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  signaturePreviewImage: {
    width: '80%',
    height: '80%',
  },
  resignButton: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  resignText: {
    fontSize: 13,
    color: '#3B82F6',
    fontWeight: '500',
  },
  footer: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  reviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8B5CF6',
    borderRadius: 12,
    paddingVertical: 16,
    gap: 8,
  },
  reviewButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Review Screen Styles
  reviewScroll: {
    flex: 1,
  },
  reviewContent: {
    padding: 16,
  },
  reviewBanner: {
    backgroundColor: '#F5F3FF',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  reviewBannerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginTop: 12,
  },
  reviewBannerText: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  reviewSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  reviewSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8B5CF6',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  reviewLabel: {
    fontSize: 14,
    color: '#64748B',
  },
  reviewValue: {
    fontSize: 14,
    color: '#1F2937',
    fontWeight: '500',
    textAlign: 'right',
    flex: 1,
    marginLeft: 16,
  },
  signatureReview: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  signatureReviewLabel: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 8,
  },
  signatureImage: {
    height: 60,
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
  },
  noSignature: {
    fontSize: 14,
    color: '#EF4444',
    fontStyle: 'italic',
  },
  signaturePrintedName: {
    fontSize: 13,
    color: '#1F2937',
    marginTop: 8,
  },
  reviewFooter: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  editButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F3FF',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
  },
  editButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#8B5CF6',
  },
  saveButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#22C55E',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Date Picker Styles
  datePickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  datePickerContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  datePickerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1F2937',
  },
  datePickerDone: {
    fontSize: 16,
    fontWeight: '600',
    color: '#8B5CF6',
  },
  datePicker: {
    height: 200,
  },
});
