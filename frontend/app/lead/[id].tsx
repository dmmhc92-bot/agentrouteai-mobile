import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import { format } from 'date-fns';

interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  created_date: string;
  stage: string;
  underwriting_status: string;
  source: string;
  last_contact_date?: string;
  next_follow_up?: string;
}

// Pipeline stage configuration
const STAGE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  new_lead: { label: 'Lead', color: '#6B7280', icon: 'person-add' },
  appointment_scheduled: { label: 'Appointment Scheduled', color: '#3B82F6', icon: 'calendar' },
  scope_completed: { label: 'SOA Completed', color: '#8B5CF6', icon: 'document-text' },
  application_submitted: { label: 'Application Submitted', color: '#8B5CF6', icon: 'document-text' },
  underwriting_review: { label: 'Underwriting Review', color: '#F59E0B', icon: 'hourglass' },
  additional_requirements: { label: 'Additional Requirements', color: '#EF4444', icon: 'alert-circle' },
  approved: { label: 'Approved', color: '#10B981', icon: 'checkmark-circle' },
  policy_issued: { label: 'Policy Issued', color: '#06B6D4', icon: 'document' },
  policy_placed: { label: 'Policy Placed', color: '#14B8A6', icon: 'checkmark-done' },
  commission_pending: { label: 'Commission Pending', color: '#F97316', icon: 'cash' },
  commission_paid: { label: 'Commission Paid', color: '#22C55E', icon: 'wallet' },
};

const ALL_STAGES = [
  'new_lead',
  'appointment_scheduled',
  'application_submitted',
  'underwriting_review',
  'additional_requirements',
  'approved',
  'policy_issued',
  'policy_placed',
  'commission_pending',
  'commission_paid',
];

interface Appointment {
  id: string;
  appointment_date: string;
  appointment_time: string;
  status: string;
  notes: string;
}

interface Scope {
  id: string;
  typed_name: string;
  created_date: string;
  signature?: string;
  pdf_base64?: string;
}

interface ComplianceStatus {
  compliance_status: string;
  compliance_message: string;
  has_appointment: boolean;
  has_soa: boolean;
  has_signed_soa: boolean;
  has_pdf: boolean;
}

export default function LeadDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [lead, setLead] = useState<Lead | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [compliance, setCompliance] = useState<ComplianceStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Stage update modal state
  const [stageModalVisible, setStageModalVisible] = useState(false);
  const [selectedStage, setSelectedStage] = useState<string>('');
  const [stageNotes, setStageNotes] = useState('');
  const [updatingStage, setUpdatingStage] = useState(false);

  const loadData = async () => {
    if (!id || id === 'new') return;
    try {
      const [leadData, appointmentsData, scopesData] = await Promise.all([
        api.getLead(id),
        api.getLeadAppointments(id),
        api.getLeadScopes(id),
      ]);
      setLead(leadData);
      setAppointments(appointmentsData);
      setScopes(scopesData);
      
      // Also fetch compliance status
      try {
        const complianceData = await api.getLeadComplianceStatus(id);
        setCompliance(complianceData);
      } catch (e) {
        // Non-critical, compliance may not be available
        console.log('Compliance status not available');
      }
    } catch (error) {
      console.log('Error loading lead:', error);
      Alert.alert('Error', 'Failed to load lead details');
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [id])
  );

  const handleUpdateStage = async () => {
    if (!selectedStage || !lead) return;
    
    setUpdatingStage(true);
    try {
      await api.movePipelineCase({
        lead_id: lead.id,
        new_stage: selectedStage,
        notes: stageNotes || undefined,
      });
      setStageModalVisible(false);
      setStageNotes('');
      loadData(); // Refresh lead data
      Alert.alert('Success', 'Pipeline stage updated');
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Failed to update stage';
      Alert.alert('Error', message);
    } finally {
      setUpdatingStage(false);
    }
  };

  const openStageModal = () => {
    setSelectedStage(lead?.stage || 'new_lead');
    setStageNotes('');
    setStageModalVisible(true);
  };

  const handleDelete = () => {
    Alert.alert('Delete Lead', 'Are you sure you want to delete this lead?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteLead(id!);
            router.back();
          } catch (error) {
            Alert.alert('Error', 'Failed to delete lead');
          }
        },
      },
    ]);
  };

  const handleCall = () => {
    if (lead?.phone) {
      Linking.openURL(`tel:${lead.phone}`);
    }
  };

  const handleEmail = () => {
    if (lead?.email) {
      Linking.openURL(`mailto:${lead.email}`);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  if (!lead) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
        <View style={styles.errorState}>
          <Text style={styles.errorText}>Lead not found</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => router.push(`/lead/edit/${id}`)}
          >
            <Ionicons name="create-outline" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={handleDelete}>
            <Ionicons name="trash-outline" size={22} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Lead Header */}
        <View style={styles.leadHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{lead.name.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.leadName}>{lead.name}</Text>
          <Text style={styles.leadDate}>
            Added {format(new Date(lead.created_date), 'MMM d, yyyy')}
          </Text>
        </View>

        {/* Pipeline Stage Card */}
        <TouchableOpacity style={styles.pipelineCard} onPress={openStageModal}>
          <View style={styles.pipelineCardLeft}>
            <View style={[
              styles.pipelineIcon, 
              { backgroundColor: STAGE_CONFIG[lead.stage]?.color || '#6B7280' }
            ]}>
              <Ionicons 
                name={(STAGE_CONFIG[lead.stage]?.icon || 'help-circle') as any} 
                size={20} 
                color="#FFFFFF" 
              />
            </View>
            <View style={styles.pipelineInfo}>
              <Text style={styles.pipelineLabel}>Pipeline Stage</Text>
              <Text style={[
                styles.pipelineStage, 
                { color: STAGE_CONFIG[lead.stage]?.color || '#6B7280' }
              ]}>
                {STAGE_CONFIG[lead.stage]?.label || lead.stage}
              </Text>
            </View>
          </View>
          <View style={styles.pipelineCardRight}>
            <Text style={styles.pipelineUpdateText}>Update</Text>
            <Ionicons name="chevron-forward" size={18} color="#64748B" />
          </View>
        </TouchableOpacity>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          {lead.phone && (
            <TouchableOpacity style={styles.quickAction} onPress={handleCall}>
              <View style={[styles.quickActionIcon, { backgroundColor: '#22C55E20' }]}>
                <Ionicons name="call" size={22} color="#22C55E" />
              </View>
              <Text style={styles.quickActionText}>Call</Text>
            </TouchableOpacity>
          )}
          {lead.email && (
            <TouchableOpacity style={styles.quickAction} onPress={handleEmail}>
              <View style={[styles.quickActionIcon, { backgroundColor: '#3B82F620' }]}>
                <Ionicons name="mail" size={22} color="#3B82F6" />
              </View>
              <Text style={styles.quickActionText}>Email</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.quickAction}
            onPress={() => router.push(`/appointment/new?leadId=${id}`)}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: '#F59E0B20' }]}>
              <Ionicons name="calendar" size={22} color="#F59E0B" />
            </View>
            <Text style={styles.quickActionText}>Schedule</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickAction}
            onPress={() => router.push(`/scope/new?leadId=${id}`)}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: '#8B5CF620' }]}>
              <Ionicons name="document-text" size={22} color="#8B5CF6" />
            </View>
            <Text style={styles.quickActionText}>Scope</Text>
          </TouchableOpacity>
        </View>

        {/* Contact Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact Information</Text>
          <View style={styles.infoCard}>
            {lead.phone && (
              <InfoRow icon="call-outline" label="Phone" value={lead.phone} />
            )}
            {lead.email && (
              <InfoRow icon="mail-outline" label="Email" value={lead.email} />
            )}
            {lead.address && (
              <InfoRow icon="location-outline" label="Address" value={lead.address} />
            )}
            {!lead.phone && !lead.email && !lead.address && (
              <Text style={styles.noInfo}>No contact information</Text>
            )}
          </View>
        </View>

        {/* Notes */}
        {lead.notes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <View style={styles.notesCard}>
              <Text style={styles.notesText}>{lead.notes}</Text>
            </View>
          </View>
        )}

        {/* Appointments */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Appointments</Text>
            <TouchableOpacity onPress={() => router.push(`/appointment/new?leadId=${id}`)}>
              <Ionicons name="add-circle" size={24} color="#3B82F6" />
            </TouchableOpacity>
          </View>
          {appointments.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No appointments scheduled</Text>
            </View>
          ) : (
            appointments.map((apt) => (
              <TouchableOpacity
                key={apt.id}
                style={styles.appointmentCard}
                onPress={() => router.push(`/appointment/${apt.id}`)}
              >
                <View style={styles.appointmentInfo}>
                  <Text style={styles.appointmentDate}>
                    {format(new Date(apt.appointment_date), 'MMM d, yyyy')}
                  </Text>
                  <Text style={styles.appointmentTime}>{apt.appointment_time}</Text>
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor:
                        apt.status === 'completed'
                          ? '#22C55E20'
                          : apt.status === 'cancelled'
                          ? '#EF444420'
                          : '#3B82F620',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      {
                        color:
                          apt.status === 'completed'
                            ? '#22C55E'
                            : apt.status === 'cancelled'
                            ? '#EF4444'
                            : '#3B82F6',
                      },
                    ]}
                  >
                    {apt.status}
                  </Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Medicare Compliance Indicator */}
        {compliance && (
          <View style={[
            styles.complianceCard,
            { borderLeftColor: compliance.compliance_status === 'compliant' ? '#22C55E' :
              compliance.compliance_status === 'signed' ? '#3B82F6' :
              compliance.compliance_status === 'pending_signature' ? '#F59E0B' : '#EF4444'
            }
          ]}>
            <View style={styles.complianceHeader}>
              <View style={styles.complianceIconWrap}>
                <Ionicons
                  name={
                    compliance.compliance_status === 'compliant' ? 'shield-checkmark' :
                    compliance.compliance_status === 'signed' ? 'checkmark-circle' :
                    compliance.compliance_status === 'pending_signature' ? 'time' : 'alert-circle'
                  }
                  size={24}
                  color={
                    compliance.compliance_status === 'compliant' ? '#22C55E' :
                    compliance.compliance_status === 'signed' ? '#3B82F6' :
                    compliance.compliance_status === 'pending_signature' ? '#F59E0B' : '#EF4444'
                  }
                />
              </View>
              <View style={styles.complianceInfo}>
                <Text style={styles.complianceTitle}>Medicare Compliance</Text>
                <Text style={[
                  styles.complianceStatus,
                  { color: compliance.compliance_status === 'compliant' ? '#22C55E' :
                    compliance.compliance_status === 'signed' ? '#3B82F6' :
                    compliance.compliance_status === 'pending_signature' ? '#F59E0B' : '#EF4444'
                  }
                ]}>
                  {compliance.compliance_message}
                </Text>
              </View>
            </View>
            <View style={styles.complianceFlags}>
              <View style={[styles.complianceFlag, { backgroundColor: compliance.has_appointment ? '#22C55E20' : '#64748B20' }]}>
                <Ionicons name="calendar" size={12} color={compliance.has_appointment ? '#22C55E' : '#64748B'} />
                <Text style={[styles.complianceFlagText, { color: compliance.has_appointment ? '#22C55E' : '#64748B' }]}>
                  Appointment
                </Text>
              </View>
              <View style={[styles.complianceFlag, { backgroundColor: compliance.has_soa ? '#22C55E20' : '#64748B20' }]}>
                <Ionicons name="document-text" size={12} color={compliance.has_soa ? '#22C55E' : '#64748B'} />
                <Text style={[styles.complianceFlagText, { color: compliance.has_soa ? '#22C55E' : '#64748B' }]}>
                  SOA
                </Text>
              </View>
              <View style={[styles.complianceFlag, { backgroundColor: compliance.has_signed_soa ? '#22C55E20' : '#64748B20' }]}>
                <Ionicons name="create" size={12} color={compliance.has_signed_soa ? '#22C55E' : '#64748B'} />
                <Text style={[styles.complianceFlagText, { color: compliance.has_signed_soa ? '#22C55E' : '#64748B' }]}>
                  Signed
                </Text>
              </View>
              <View style={[styles.complianceFlag, { backgroundColor: compliance.has_pdf ? '#22C55E20' : '#64748B20' }]}>
                <Ionicons name="document" size={12} color={compliance.has_pdf ? '#22C55E' : '#64748B'} />
                <Text style={[styles.complianceFlagText, { color: compliance.has_pdf ? '#22C55E' : '#64748B' }]}>
                  PDF
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Scope Documents */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Scope of Appointment</Text>
            <TouchableOpacity onPress={() => router.push(`/scope/new?leadId=${id}`)}>
              <Ionicons name="add-circle" size={24} color="#3B82F6" />
            </TouchableOpacity>
          </View>
          {scopes.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No scope documents</Text>
            </View>
          ) : (
            scopes.map((scope) => (
              <TouchableOpacity
                key={scope.id}
                style={styles.scopeCard}
                onPress={() => router.push(`/scope/${scope.id}`)}
              >
                <View style={styles.scopeIconWrap}>
                  <Ionicons name="document-text" size={24} color="#8B5CF6" />
                  {scope.signature && (
                    <View style={styles.signedBadge}>
                      <Ionicons name="checkmark" size={10} color="#FFFFFF" />
                    </View>
                  )}
                </View>
                <View style={styles.scopeInfo}>
                  <Text style={styles.scopeName}>Signed by: {scope.typed_name}</Text>
                  <Text style={styles.scopeDate}>
                    {format(new Date(scope.created_date), 'MMM d, yyyy')}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#64748B" />
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>

      {/* Stage Update Modal */}
      <Modal
        visible={stageModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setStageModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Update Pipeline Stage</Text>
              <TouchableOpacity onPress={() => setStageModalVisible(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Current: {STAGE_CONFIG[lead.stage]?.label || lead.stage}
            </Text>

            {/* Stage Selector */}
            <Text style={styles.inputLabel}>Select New Stage</Text>
            <ScrollView 
              style={styles.stageList} 
              showsVerticalScrollIndicator={false}
            >
              {ALL_STAGES.map((stage) => {
                const config = STAGE_CONFIG[stage];
                const isSelected = selectedStage === stage;
                const isCurrent = lead.stage === stage;
                return (
                  <TouchableOpacity
                    key={stage}
                    style={[
                      styles.stageOption,
                      isSelected && { borderColor: config.color, borderWidth: 2 },
                      isCurrent && { backgroundColor: '#334155' },
                    ]}
                    onPress={() => setSelectedStage(stage)}
                  >
                    <View style={[styles.stageOptionIcon, { backgroundColor: config.color }]}>
                      <Ionicons name={config.icon as any} size={16} color="#FFFFFF" />
                    </View>
                    <Text style={[
                      styles.stageOptionText,
                      isSelected && { color: config.color, fontWeight: '600' }
                    ]}>
                      {config.label}
                    </Text>
                    {isCurrent && (
                      <View style={styles.currentBadge}>
                        <Text style={styles.currentBadgeText}>Current</Text>
                      </View>
                    )}
                    {isSelected && !isCurrent && (
                      <Ionicons name="checkmark-circle" size={20} color={config.color} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Notes */}
            <Text style={styles.inputLabel}>Notes (optional)</Text>
            <TextInput
              style={styles.notesInput}
              placeholder="Add notes about this stage change..."
              placeholderTextColor="#94A3B8"
              value={stageNotes}
              onChangeText={setStageNotes}
              multiline
            />

            <TouchableOpacity
              style={[
                styles.updateButton,
                (updatingStage || selectedStage === lead.stage) && styles.updateButtonDisabled
              ]}
              onPress={handleUpdateStage}
              disabled={updatingStage || selectedStage === lead.stage}
            >
              {updatingStage ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.updateButtonText}>
                  {selectedStage === lead.stage ? 'No Change' : 'Update Stage'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon as any} size={20} color="#94A3B8" />
      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  errorState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 16,
  },
  leadHeader: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '600',
  },
  leadName: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  leadDate: {
    color: '#94A3B8',
    fontSize: 14,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    marginBottom: 16,
  },
  quickAction: {
    alignItems: 'center',
  },
  quickActionIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  quickActionText: {
    color: '#E2E8F0',
    fontSize: 12,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  infoCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  infoContent: {
    marginLeft: 12,
    flex: 1,
  },
  infoLabel: {
    color: '#94A3B8',
    fontSize: 12,
    marginBottom: 2,
  },
  infoValue: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  noInfo: {
    color: '#64748B',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 12,
  },
  notesCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
  },
  notesText: {
    color: '#E2E8F0',
    fontSize: 15,
    lineHeight: 24,
  },
  emptyState: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    color: '#64748B',
    fontSize: 14,
  },
  appointmentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  appointmentInfo: {
    flex: 1,
  },
  appointmentDate: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  appointmentTime: {
    color: '#94A3B8',
    fontSize: 14,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  scopeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  scopeInfo: {
    flex: 1,
    marginLeft: 12,
  },
  scopeName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  scopeDate: {
    color: '#94A3B8',
    fontSize: 13,
  },
  // Pipeline Card Styles
  pipelineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  pipelineCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pipelineIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pipelineInfo: {
    gap: 2,
  },
  pipelineLabel: {
    color: '#94A3B8',
    fontSize: 12,
  },
  pipelineStage: {
    fontSize: 16,
    fontWeight: '600',
  },
  pipelineCardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pipelineUpdateText: {
    color: '#64748B',
    fontSize: 14,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1E293B',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  modalSubtitle: {
    color: '#94A3B8',
    fontSize: 14,
    marginBottom: 16,
  },
  inputLabel: {
    color: '#94A3B8',
    fontSize: 12,
    marginBottom: 8,
    marginTop: 12,
  },
  stageList: {
    maxHeight: 300,
  },
  stageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  stageOptionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  stageOptionText: {
    flex: 1,
    color: '#E2E8F0',
    fontSize: 14,
  },
  currentBadge: {
    backgroundColor: '#334155',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  currentBadgeText: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '500',
  },
  notesInput: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 16,
    color: '#FFFFFF',
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  updateButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  updateButtonDisabled: {
    backgroundColor: '#64748B',
  },
  updateButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  // Compliance Card Styles
  complianceCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
  },
  complianceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  complianceIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  complianceInfo: {
    flex: 1,
  },
  complianceTitle: {
    color: '#94A3B8',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  complianceStatus: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  complianceFlags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  complianceFlag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  complianceFlagText: {
    fontSize: 11,
    fontWeight: '600',
  },
  // Scope card enhancements
  scopeIconWrap: {
    position: 'relative',
  },
  signedBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#22C55E',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
