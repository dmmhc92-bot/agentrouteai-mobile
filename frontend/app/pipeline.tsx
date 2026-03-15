import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../src/services/api';
import { useAuth } from '../src/contexts/AuthContext';

interface PipelineLead {
  id: string;
  name: string;
  phone: string;
  email: string;
  created_date: string;
  premium: number;
  commission: number;
  agent_name?: string;
  underwriting_status: string;
  policy_type?: string;
  notes: string;
}

interface PipelineStage {
  stage: string;
  label: string;
  count: number;
  total_premium: number;
  total_commission: number;
  leads: PipelineLead[];
}

interface PipelineData {
  stages: PipelineStage[];
  summary: {
    total_cases: number;
    total_premium: number;
    total_commission: number;
    conversion_rate: number;
  };
  is_team_view: boolean;
}

// Stage colors, icons, and display labels
const STAGE_CONFIG: Record<string, { color: string; icon: string; bgColor: string; label: string }> = {
  new_lead: { color: '#6B7280', icon: 'person-add', bgColor: '#F3F4F6', label: 'New' },
  new: { color: '#6B7280', icon: 'person-add', bgColor: '#F3F4F6', label: 'New' },
  contacted: { color: '#3B82F6', icon: 'chatbubble', bgColor: '#EFF6FF', label: 'Contacted' },
  follow_up: { color: '#F59E0B', icon: 'time', bgColor: '#FFFBEB', label: 'Follow Up' },
  appointment_set: { color: '#3B82F6', icon: 'calendar', bgColor: '#EFF6FF', label: 'Appointment Set' },
  appointment_scheduled: { color: '#3B82F6', icon: 'calendar', bgColor: '#EFF6FF', label: 'Appointment Set' },
  soa_completed: { color: '#8B5CF6', icon: 'document-text', bgColor: '#F5F3FF', label: 'SOA Completed' },
  policy_submitted: { color: '#8B5CF6', icon: 'document-text', bgColor: '#F5F3FF', label: 'Policy Submitted' },
  application_submitted: { color: '#8B5CF6', icon: 'document-text', bgColor: '#F5F3FF', label: 'Policy Submitted' },
  underwriting_review: { color: '#F59E0B', icon: 'hourglass', bgColor: '#FFFBEB', label: 'Underwriting Review' },
  additional_requirements: { color: '#EF4444', icon: 'alert-circle', bgColor: '#FEF2F2', label: 'Additional Requirements' },
  approved: { color: '#10B981', icon: 'checkmark-circle', bgColor: '#ECFDF5', label: 'Approved' },
  closed_won: { color: '#22C55E', icon: 'trophy', bgColor: '#F0FDF4', label: 'Closed Won' },
  policy_issued: { color: '#06B6D4', icon: 'document', bgColor: '#ECFEFF', label: 'Policy Issued' },
  policy_placed: { color: '#14B8A6', icon: 'checkmark-done', bgColor: '#F0FDFA', label: 'Policy Placed' },
  commission_pending: { color: '#F97316', icon: 'cash', bgColor: '#FFF7ED', label: 'Commission Pending' },
  commission_paid: { color: '#22C55E', icon: 'wallet', bgColor: '#F0FDF4', label: 'Commission Paid' },
  closed_lost: { color: '#EF4444', icon: 'close-circle', bgColor: '#FEF2F2', label: 'Closed Lost' },
};

const ALL_STAGES = [
  'new_lead',
  'contacted',
  'follow_up',
  'appointment_set',
  'soa_completed',
  'policy_submitted',
  'underwriting_review',
  'additional_requirements',
  'approved',
  'closed_won',
  'policy_issued',
  'policy_placed',
  'commission_pending',
  'commission_paid',
  'closed_lost',
];

export default function PipelineScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pipelineData, setPipelineData] = useState<PipelineData | null>(null);
  const [teamView, setTeamView] = useState(false);
  const [expandedStage, setExpandedStage] = useState<string | null>(null);
  
  // Move modal state
  const [moveModalVisible, setMoveModalVisible] = useState(false);
  const [selectedLead, setSelectedLead] = useState<PipelineLead | null>(null);
  const [selectedNewStage, setSelectedNewStage] = useState<string>('');
  const [moveNotes, setMoveNotes] = useState('');
  const [movePremium, setMovePremium] = useState('');
  const [moveCommission, setMoveCommission] = useState('');
  const [policyType, setPolicyType] = useState('');
  const [moving, setMoving] = useState(false);

  const canViewTeam = user?.role === 'admin' || user?.role === 'manager';

  const loadPipeline = useCallback(async () => {
    try {
      const data = await api.getPipeline(teamView);
      setPipelineData(data);
    } catch (error) {
      console.error('Failed to load pipeline:', error);
      Alert.alert('Error', 'Failed to load pipeline data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [teamView]);

  useEffect(() => {
    loadPipeline();
  }, [loadPipeline]);

  const onRefresh = () => {
    setRefreshing(true);
    loadPipeline();
  };

  const handleMoveCase = (lead: PipelineLead, currentStage: string) => {
    setSelectedLead(lead);
    // Find the next stage in the pipeline
    const currentIndex = ALL_STAGES.indexOf(currentStage);
    const nextStage = currentIndex < ALL_STAGES.length - 1 ? ALL_STAGES[currentIndex + 1] : currentStage;
    setSelectedNewStage(nextStage);
    setMoveNotes('');
    setMovePremium('');
    setMoveCommission('');
    setPolicyType('');
    setMoveModalVisible(true);
  };

  const confirmMoveCase = async () => {
    if (!selectedLead || !selectedNewStage) return;

    setMoving(true);
    try {
      const moveData: any = {
        lead_id: selectedLead.id,
        new_stage: selectedNewStage,
      };

      if (moveNotes.trim()) {
        moveData.notes = moveNotes.trim();
      }
      if (movePremium) {
        moveData.premium = parseFloat(movePremium);
      }
      if (moveCommission) {
        moveData.commission = parseFloat(moveCommission);
      }
      if (policyType.trim()) {
        moveData.policy_type = policyType.trim();
      }

      await api.movePipelineCase(moveData);
      setMoveModalVisible(false);
      loadPipeline();
      Alert.alert('Success', 'Case moved successfully');
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Failed to move case';
      Alert.alert('Error', message);
    } finally {
      setMoving(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const renderStageCard = (stage: PipelineStage) => {
    const config = STAGE_CONFIG[stage.stage] || { color: '#6B7280', icon: 'help-circle', bgColor: '#F3F4F6' };
    const isExpanded = expandedStage === stage.stage;

    return (
      <View key={stage.stage} style={styles.stageCard}>
        <TouchableOpacity
          style={[styles.stageHeader, { backgroundColor: config.bgColor }]}
          onPress={() => setExpandedStage(isExpanded ? null : stage.stage)}
        >
          <View style={styles.stageHeaderLeft}>
            <View style={[styles.stageIcon, { backgroundColor: config.color }]}>
              <Ionicons name={config.icon as any} size={16} color="#FFFFFF" />
            </View>
            <View style={styles.stageInfo}>
              <Text style={styles.stageLabel}>{stage.label}</Text>
              <Text style={styles.stageCount}>{stage.count} case{stage.count !== 1 ? 's' : ''}</Text>
            </View>
          </View>
          <View style={styles.stageHeaderRight}>
            {stage.total_premium > 0 && (
              <Text style={[styles.stagePremium, { color: config.color }]}>
                {formatCurrency(stage.total_premium)}
              </Text>
            )}
            <Ionicons
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={20}
              color="#64748B"
            />
          </View>
        </TouchableOpacity>

        {isExpanded && stage.leads.length > 0 && (
          <View style={styles.leadsContainer}>
            {stage.leads.map((lead) => (
              <TouchableOpacity
                key={lead.id}
                style={styles.leadCard}
                onPress={() => router.push(`/lead/${lead.id}`)}
              >
                <View style={styles.leadInfo}>
                  <Text style={styles.leadName}>{lead.name}</Text>
                  {lead.agent_name && (
                    <Text style={styles.leadAgent}>Agent: {lead.agent_name}</Text>
                  )}
                  {lead.policy_type && (
                    <Text style={styles.leadPolicyType}>{lead.policy_type}</Text>
                  )}
                  {lead.premium > 0 && (
                    <View style={styles.leadFinancials}>
                      <Text style={styles.leadPremium}>Premium: {formatCurrency(lead.premium)}</Text>
                      <Text style={styles.leadCommission}>Commission: {formatCurrency(lead.commission)}</Text>
                    </View>
                  )}
                </View>
                <TouchableOpacity
                  style={[styles.moveButton, { backgroundColor: config.color }]}
                  onPress={() => handleMoveCase(lead, stage.stage)}
                >
                  <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {isExpanded && stage.leads.length === 0 && (
          <View style={styles.emptyStage}>
            <Text style={styles.emptyStageText}>No cases in this stage</Text>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading pipeline...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Sales Pipeline</Text>
        {canViewTeam && (
          <TouchableOpacity
            style={[styles.teamToggle, teamView && styles.teamToggleActive]}
            onPress={() => {
              setTeamView(!teamView);
              setLoading(true);
            }}
          >
            <Ionicons
              name={teamView ? 'people' : 'person'}
              size={18}
              color={teamView ? '#FFFFFF' : '#94A3B8'}
            />
          </TouchableOpacity>
        )}
      </View>

      {/* Summary Stats */}
      {pipelineData && (
        <View style={styles.summaryContainer}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{pipelineData.summary.total_cases}</Text>
            <Text style={styles.summaryLabel}>Total Cases</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{formatCurrency(pipelineData.summary.total_premium)}</Text>
            <Text style={styles.summaryLabel}>Premium</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{formatCurrency(pipelineData.summary.total_commission)}</Text>
            <Text style={styles.summaryLabel}>Commission</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{pipelineData.summary.conversion_rate}%</Text>
            <Text style={styles.summaryLabel}>Win Rate</Text>
          </View>
        </View>
      )}

      {/* Pipeline Stages */}
      <ScrollView
        style={styles.pipelineContainer}
        contentContainerStyle={styles.pipelineContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {pipelineData?.is_team_view && (
          <View style={styles.teamBadge}>
            <Ionicons name="people" size={14} color="#3B82F6" />
            <Text style={styles.teamBadgeText}>Team View</Text>
          </View>
        )}

        {pipelineData?.stages.map(renderStageCard)}
      </ScrollView>

      {/* Move Case Modal */}
      <Modal
        visible={moveModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setMoveModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Move Case</Text>
              <TouchableOpacity onPress={() => setMoveModalVisible(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            {selectedLead && (
              <Text style={styles.modalSubtitle}>Moving: {selectedLead.name}</Text>
            )}

            {/* Stage Selector */}
            <Text style={styles.inputLabel}>Move to Stage</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.stageSelector}>
              {ALL_STAGES.map((stage) => {
                const config = STAGE_CONFIG[stage];
                const isSelected = selectedNewStage === stage;
                const label = pipelineData?.stages.find(s => s.stage === stage)?.label || stage;
                return (
                  <TouchableOpacity
                    key={stage}
                    style={[
                      styles.stageSelectorItem,
                      isSelected && { backgroundColor: config.color },
                    ]}
                    onPress={() => setSelectedNewStage(stage)}
                  >
                    <Ionicons
                      name={config.icon as any}
                      size={14}
                      color={isSelected ? '#FFFFFF' : config.color}
                    />
                    <Text
                      style={[
                        styles.stageSelectorText,
                        isSelected && { color: '#FFFFFF' },
                      ]}
                      numberOfLines={1}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Notes */}
            <Text style={styles.inputLabel}>Notes (optional)</Text>
            <TextInput
              style={styles.notesInput}
              placeholder="Add notes about this move..."
              placeholderTextColor="#94A3B8"
              value={moveNotes}
              onChangeText={setMoveNotes}
              multiline
            />

            {/* Financial fields (show for application_submitted and later) */}
            {['application_submitted', 'underwriting_review', 'approved', 'policy_issued', 'policy_placed', 'commission_pending', 'commission_paid'].includes(selectedNewStage) && (
              <>
                <View style={styles.financialRow}>
                  <View style={styles.financialField}>
                    <Text style={styles.inputLabel}>Premium ($)</Text>
                    <TextInput
                      style={styles.financialInput}
                      placeholder="0.00"
                      placeholderTextColor="#94A3B8"
                      value={movePremium}
                      onChangeText={setMovePremium}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={styles.financialField}>
                    <Text style={styles.inputLabel}>Commission ($)</Text>
                    <TextInput
                      style={styles.financialInput}
                      placeholder="0.00"
                      placeholderTextColor="#94A3B8"
                      value={moveCommission}
                      onChangeText={setMoveCommission}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>

                <Text style={styles.inputLabel}>Policy Type</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g., Medicare Advantage, Life Insurance"
                  placeholderTextColor="#94A3B8"
                  value={policyType}
                  onChangeText={setPolicyType}
                />
              </>
            )}

            <TouchableOpacity
              style={[styles.moveConfirmButton, moving && styles.moveConfirmButtonDisabled]}
              onPress={confirmMoveCase}
              disabled={moving}
            >
              {moving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.moveConfirmButtonText}>Move Case</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0F172A',
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
    paddingVertical: 12,
    backgroundColor: '#1E293B',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  teamToggle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
  },
  teamToggleActive: {
    backgroundColor: '#3B82F6',
  },
  summaryContainer: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 16,
    gap: 8,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  summaryValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  summaryLabel: {
    color: '#94A3B8',
    fontSize: 10,
    marginTop: 4,
  },
  pipelineContainer: {
    flex: 1,
  },
  pipelineContent: {
    padding: 16,
    paddingBottom: 32,
  },
  teamBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E40AF',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 16,
    gap: 6,
  },
  teamBadgeText: {
    color: '#93C5FD',
    fontSize: 12,
    fontWeight: '500',
  },
  stageCard: {
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  stageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  stageHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stageIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stageInfo: {
    gap: 2,
  },
  stageLabel: {
    color: '#1E293B',
    fontSize: 14,
    fontWeight: '600',
  },
  stageCount: {
    color: '#64748B',
    fontSize: 12,
  },
  stageHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stagePremium: {
    fontSize: 14,
    fontWeight: '600',
  },
  leadsContainer: {
    backgroundColor: '#1E293B',
    padding: 12,
    gap: 8,
  },
  leadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#334155',
    borderRadius: 8,
    padding: 12,
  },
  leadInfo: {
    flex: 1,
  },
  leadName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  leadAgent: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  leadPolicyType: {
    color: '#3B82F6',
    fontSize: 12,
    marginTop: 4,
  },
  leadFinancials: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
  },
  leadPremium: {
    color: '#10B981',
    fontSize: 11,
  },
  leadCommission: {
    color: '#F59E0B',
    fontSize: 11,
  },
  moveButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyStage: {
    backgroundColor: '#1E293B',
    padding: 24,
    alignItems: 'center',
  },
  emptyStageText: {
    color: '#64748B',
    fontSize: 13,
  },
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
    maxHeight: '80%',
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
    marginBottom: 20,
  },
  inputLabel: {
    color: '#94A3B8',
    fontSize: 12,
    marginBottom: 8,
    marginTop: 16,
  },
  stageSelector: {
    flexDirection: 'row',
  },
  stageSelectorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#334155',
    marginRight: 8,
    gap: 6,
  },
  stageSelectorText: {
    color: '#94A3B8',
    fontSize: 11,
    maxWidth: 80,
  },
  notesInput: {
    backgroundColor: '#334155',
    borderRadius: 12,
    padding: 16,
    color: '#FFFFFF',
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  financialRow: {
    flexDirection: 'row',
    gap: 12,
  },
  financialField: {
    flex: 1,
  },
  financialInput: {
    backgroundColor: '#334155',
    borderRadius: 12,
    padding: 16,
    color: '#FFFFFF',
    fontSize: 14,
  },
  textInput: {
    backgroundColor: '#334155',
    borderRadius: 12,
    padding: 16,
    color: '#FFFFFF',
    fontSize: 14,
  },
  moveConfirmButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  moveConfirmButtonDisabled: {
    backgroundColor: '#64748B',
  },
  moveConfirmButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
