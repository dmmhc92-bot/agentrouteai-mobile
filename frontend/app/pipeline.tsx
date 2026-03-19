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
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../src/services/api';
import { useAuth } from '../src/contexts/AuthContext';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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

// Premium color scheme
const COLORS = {
  background: '#0A0A0F',
  cardBackground: '#141419',
  cardBorder: '#1F1F28',
  primary: '#D4AF37', // Gold accent
  primaryMuted: '#8B7355',
  text: '#FFFFFF',
  textSecondary: '#9CA3AF',
  textMuted: '#6B7280',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',
};

// Stage configuration with premium styling
const STAGE_CONFIG: Record<string, { color: string; icon: string; label: string; priority: number }> = {
  new_lead: { color: '#6B7280', icon: 'person-add', label: 'New Lead', priority: 1 },
  new: { color: '#6B7280', icon: 'person-add', label: 'New', priority: 1 },
  contacted: { color: '#3B82F6', icon: 'chatbubble', label: 'Contacted', priority: 2 },
  follow_up: { color: '#F59E0B', icon: 'time', label: 'Follow Up', priority: 3 },
  appointment_set: { color: '#8B5CF6', icon: 'calendar', label: 'Appointment Set', priority: 4 },
  appointment_scheduled: { color: '#8B5CF6', icon: 'calendar', label: 'Appointment Set', priority: 4 },
  soa_completed: { color: '#06B6D4', icon: 'document-text', label: 'SOA Completed', priority: 5 },
  policy_submitted: { color: '#8B5CF6', icon: 'paper-plane', label: 'Policy Submitted', priority: 6 },
  application_submitted: { color: '#8B5CF6', icon: 'paper-plane', label: 'Application Submitted', priority: 6 },
  underwriting_review: { color: '#F59E0B', icon: 'hourglass', label: 'Underwriting', priority: 7 },
  additional_requirements: { color: '#EF4444', icon: 'alert-circle', label: 'Requirements', priority: 8 },
  approved: { color: '#10B981', icon: 'checkmark-circle', label: 'Approved', priority: 9 },
  closed_won: { color: '#22C55E', icon: 'trophy', label: 'Closed Won', priority: 10 },
  policy_issued: { color: '#06B6D4', icon: 'document', label: 'Policy Issued', priority: 11 },
  policy_placed: { color: '#14B8A6', icon: 'checkmark-done', label: 'Policy Placed', priority: 12 },
  commission_pending: { color: '#F97316', icon: 'cash', label: 'Commission Pending', priority: 13 },
  commission_paid: { color: '#22C55E', icon: 'wallet', label: 'Commission Paid', priority: 14 },
  closed_lost: { color: '#EF4444', icon: 'close-circle', label: 'Closed Lost', priority: 15 },
};

const ALL_STAGES = [
  'new_lead', 'contacted', 'follow_up', 'appointment_set', 'soa_completed',
  'policy_submitted', 'underwriting_review', 'additional_requirements',
  'approved', 'closed_won', 'policy_issued', 'policy_placed',
  'commission_pending', 'commission_paid', 'closed_lost',
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
  const [loadError, setLoadError] = useState<string | null>(null);

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
      setLoadError(null);
      console.log('[Pipeline] Loading pipeline data...', { teamView, userRole: user?.role, userId: user?.id });
      
      const data = await api.getPipeline(teamView);
      console.log('[Pipeline] Data received:', { 
        stagesCount: data?.stages?.length, 
        totalCases: data?.summary?.total_cases 
      });

      // Validate response structure
      if (data && data.stages && Array.isArray(data.stages)) {
        setPipelineData(data);
      } else {
        console.warn('[Pipeline] Invalid response structure, using empty state');
        setPipelineData({
          stages: [],
          summary: { total_cases: 0, total_premium: 0, total_commission: 0, conversion_rate: 0 },
          is_team_view: teamView,
        });
      }
    } catch (error: any) {
      // Log error internally but DO NOT show popup
      console.error('[Pipeline] Load failed:', {
        message: error?.message,
        status: error?.response?.status,
        data: error?.response?.data,
        url: error?.config?.url,
        userRole: user?.role,
      });

      // Set empty state on error - no popup, no crash
      setPipelineData({
        stages: [],
        summary: { total_cases: 0, total_premium: 0, total_commission: 0, conversion_rate: 0 },
        is_team_view: teamView,
      });

      setLoadError('Unable to load pipeline. Pull down to refresh.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [teamView, user?.role, user?.id]);

  useEffect(() => {
    loadPipeline();
  }, [loadPipeline]);

  const onRefresh = () => {
    setRefreshing(true);
    loadPipeline();
  };

  const handleMoveCase = (lead: PipelineLead, currentStage: string) => {
    setSelectedLead(lead);
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

      if (moveNotes.trim()) moveData.notes = moveNotes.trim();
      if (movePremium) moveData.premium = parseFloat(movePremium);
      if (moveCommission) moveData.commission = parseFloat(moveCommission);
      if (policyType.trim()) moveData.policy_type = policyType.trim();

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

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Get stages with cases (non-zero count)
  const activeStages = pipelineData?.stages?.filter(s => s.count > 0) || [];
  const emptyStages = pipelineData?.stages?.filter(s => s.count === 0) || [];

  const renderLeadCard = (lead: PipelineLead, stage: PipelineStage) => {
    const config = STAGE_CONFIG[stage.stage] || { color: '#6B7280', icon: 'help-circle', label: stage.label };

    return (
      <TouchableOpacity
        key={lead.id}
        style={styles.leadCard}
        onPress={() => router.push(`/lead/${lead.id}`)}
        activeOpacity={0.7}
      >
        <View style={styles.leadCardHeader}>
          <View style={styles.leadInfo}>
            <Text style={styles.leadName} numberOfLines={1}>{lead.name}</Text>
            <Text style={styles.leadDate}>{formatDate(lead.created_date)}</Text>
          </View>
          <TouchableOpacity
            style={[styles.moveButton, { backgroundColor: config.color }]}
            onPress={(e) => {
              e.stopPropagation();
              handleMoveCase(lead, stage.stage);
            }}
          >
            <Ionicons name="arrow-forward" size={14} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <View style={styles.leadDetails}>
          {lead.phone && (
            <View style={styles.leadDetailRow}>
              <Ionicons name="call-outline" size={12} color={COLORS.textMuted} />
              <Text style={styles.leadDetailText}>{lead.phone}</Text>
            </View>
          )}
          {lead.premium > 0 && (
            <View style={styles.leadDetailRow}>
              <Ionicons name="cash-outline" size={12} color={COLORS.primary} />
              <Text style={[styles.leadDetailText, { color: COLORS.primary }]}>
                {formatCurrency(lead.premium)}
              </Text>
            </View>
          )}
        </View>

        {lead.underwriting_status && lead.underwriting_status !== 'not_submitted' && (
          <View style={styles.leadStatus}>
            <View style={[styles.statusBadge, { backgroundColor: `${config.color}20` }]}>
              <Text style={[styles.statusText, { color: config.color }]}>
                {lead.underwriting_status.replace(/_/g, ' ')}
              </Text>
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderStageSection = (stage: PipelineStage) => {
    const config = STAGE_CONFIG[stage.stage] || { color: '#6B7280', icon: 'help-circle', label: stage.label, priority: 99 };
    const isExpanded = expandedStage === stage.stage;

    return (
      <View key={stage.stage} style={styles.stageSection}>
        <TouchableOpacity
          style={styles.stageHeader}
          onPress={() => setExpandedStage(isExpanded ? null : stage.stage)}
          activeOpacity={0.7}
        >
          <View style={styles.stageHeaderLeft}>
            <View style={[styles.stageIcon, { backgroundColor: `${config.color}20` }]}>
              <Ionicons name={config.icon as any} size={18} color={config.color} />
            </View>
            <View style={styles.stageHeaderText}>
              <Text style={styles.stageLabel}>{config.label}</Text>
              <Text style={styles.stageCount}>{stage.count} {stage.count === 1 ? 'case' : 'cases'}</Text>
            </View>
          </View>
          <View style={styles.stageHeaderRight}>
            {stage.total_premium > 0 && (
              <Text style={styles.stagePremium}>{formatCurrency(stage.total_premium)}</Text>
            )}
            <Ionicons
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={COLORS.textMuted}
            />
          </View>
        </TouchableOpacity>

        {isExpanded && stage.leads.length > 0 && (
          <View style={styles.stageLeads}>
            {stage.leads.map(lead => renderLeadCard(lead, stage))}
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading pipeline...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Premium Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
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
              color={teamView ? COLORS.primary : COLORS.textMuted}
            />
          </TouchableOpacity>
        )}
        {!canViewTeam && <View style={{ width: 40 }} />}
      </View>

      {/* Summary Stats */}
      <View style={styles.summaryContainer}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{pipelineData?.summary?.total_cases || 0}</Text>
          <Text style={styles.summaryLabel}>Total Cases</Text>
        </View>
        <View style={[styles.summaryCard, styles.summaryCardGold]}>
          <Text style={[styles.summaryValue, { color: COLORS.primary }]}>
            {formatCurrency(pipelineData?.summary?.total_premium || 0)}
          </Text>
          <Text style={styles.summaryLabel}>Premium</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={[styles.summaryValue, { color: COLORS.success }]}>
            {formatCurrency(pipelineData?.summary?.total_commission || 0)}
          </Text>
          <Text style={styles.summaryLabel}>Commission</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{pipelineData?.summary?.conversion_rate || 0}%</Text>
          <Text style={styles.summaryLabel}>Win Rate</Text>
        </View>
      </View>

      {/* Pipeline Content */}
      <ScrollView
        style={styles.pipelineContainer}
        contentContainerStyle={styles.pipelineContent}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {pipelineData?.is_team_view && (
          <View style={styles.teamBadge}>
            <Ionicons name="people" size={14} color={COLORS.primary} />
            <Text style={styles.teamBadgeText}>Team View</Text>
          </View>
        )}

        {activeStages.length > 0 ? (
          <>
            {/* Active stages with leads */}
            {activeStages.map(renderStageSection)}

            {/* Collapsed empty stages */}
            {emptyStages.length > 0 && (
              <View style={styles.emptyStagesSection}>
                <Text style={styles.emptyStagesTitle}>Other Stages</Text>
                <View style={styles.emptyStagesGrid}>
                  {emptyStages.slice(0, 8).map(stage => {
                    const config = STAGE_CONFIG[stage.stage] || { color: '#6B7280', icon: 'help-circle', label: stage.label };
                    return (
                      <View key={stage.stage} style={styles.emptyStageChip}>
                        <Ionicons name={config.icon as any} size={12} color={config.color} />
                        <Text style={styles.emptyStageChipText}>{config.label}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}
          </>
        ) : (
          /* Premium Empty State */
          <View style={styles.emptyState}>
            <View style={styles.emptyStateIcon}>
              <Ionicons name="layers-outline" size={48} color={COLORS.primaryMuted} />
            </View>
            <Text style={styles.emptyStateTitle}>
              {loadError ? 'Unable to Load Pipeline' : 'Your Pipeline is Empty'}
            </Text>
            <Text style={styles.emptyStateText}>
              {loadError
                ? 'Please check your connection and try again.'
                : 'Start adding leads and moving them through your sales pipeline to track your progress.'}
            </Text>
            <TouchableOpacity
              style={styles.emptyStateButton}
              onPress={() => {
                if (loadError) {
                  setLoading(true);
                  loadPipeline();
                } else {
                  router.push('/lead/new');
                }
              }}
            >
              <Ionicons name={loadError ? 'refresh' : 'add'} size={18} color="#0A0A0F" />
              <Text style={styles.emptyStateButtonText}>
                {loadError ? 'Retry' : 'Add Your First Lead'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 100 }} />
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
                <Ionicons name="close" size={24} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            {selectedLead && (
              <Text style={styles.modalSubtitle}>Moving: {selectedLead.name}</Text>
            )}

            <Text style={styles.inputLabel}>Move to Stage</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.stageSelector}>
              {ALL_STAGES.map((stage) => {
                const config = STAGE_CONFIG[stage] || { color: '#6B7280', label: stage };
                const isSelected = selectedNewStage === stage;
                return (
                  <TouchableOpacity
                    key={stage}
                    style={[
                      styles.stageSelectorItem,
                      isSelected && { backgroundColor: config.color, borderColor: config.color },
                    ]}
                    onPress={() => setSelectedNewStage(stage)}
                  >
                    <Text
                      style={[
                        styles.stageSelectorText,
                        isSelected && { color: '#FFFFFF' },
                      ]}
                    >
                      {config.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Text style={styles.inputLabel}>Notes (Optional)</Text>
            <TextInput
              style={styles.textInput}
              value={moveNotes}
              onChangeText={setMoveNotes}
              placeholder="Add notes about this move..."
              placeholderTextColor={COLORS.textMuted}
              multiline
            />

            <View style={styles.modalRow}>
              <View style={styles.modalRowItem}>
                <Text style={styles.inputLabel}>Premium ($)</Text>
                <TextInput
                  style={styles.textInput}
                  value={movePremium}
                  onChangeText={setMovePremium}
                  placeholder="0"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.modalRowItem}>
                <Text style={styles.inputLabel}>Commission ($)</Text>
                <TextInput
                  style={styles.textInput}
                  value={moveCommission}
                  onChangeText={setMoveCommission}
                  placeholder="0"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <Text style={styles.inputLabel}>Policy Type (Optional)</Text>
            <TextInput
              style={styles.textInput}
              value={policyType}
              onChangeText={setPolicyType}
              placeholder="e.g., Medicare Advantage"
              placeholderTextColor={COLORS.textMuted}
            />

            <TouchableOpacity
              style={[styles.confirmButton, moving && styles.confirmButtonDisabled]}
              onPress={confirmMoveCase}
              disabled={moving}
            >
              {moving ? (
                <ActivityIndicator color="#0A0A0F" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={20} color="#0A0A0F" />
                  <Text style={styles.confirmButtonText}>Confirm Move</Text>
                </>
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
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    marginTop: 16,
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    letterSpacing: 0.5,
  },
  teamToggle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  teamToggleActive: {
    borderColor: COLORS.primary,
    backgroundColor: `${COLORS.primary}15`,
  },
  summaryContainer: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 16,
    gap: 8,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  summaryCardGold: {
    borderColor: `${COLORS.primary}40`,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pipelineContainer: {
    flex: 1,
  },
  pipelineContent: {
    padding: 16,
  },
  teamBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: `${COLORS.primary}15`,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 16,
    gap: 6,
  },
  teamBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },
  stageSection: {
    marginBottom: 12,
    backgroundColor: COLORS.cardBackground,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
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
    flex: 1,
  },
  stageIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  stageHeaderText: {
    flex: 1,
  },
  stageLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  stageCount: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  stageHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stagePremium: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  stageLeads: {
    padding: 12,
    paddingTop: 0,
    gap: 8,
  },
  leadCard: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  leadCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  leadInfo: {
    flex: 1,
  },
  leadName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  leadDate: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  moveButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  leadDetails: {
    flexDirection: 'row',
    gap: 16,
  },
  leadDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  leadDetailText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  leadStatus: {
    marginTop: 10,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  emptyStagesSection: {
    marginTop: 24,
    padding: 16,
    backgroundColor: COLORS.cardBackground,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  emptyStagesTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyStagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  emptyStageChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  emptyStageChipText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyStateIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  emptyStateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  emptyStateButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0A0A0F',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.cardBackground,
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
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.text,
  },
  modalSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  stageSelector: {
    marginBottom: 20,
  },
  stageSelectorItem: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    marginRight: 8,
    backgroundColor: COLORS.background,
  },
  stageSelectorText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  textInput: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    marginBottom: 16,
    minHeight: 48,
  },
  modalRow: {
    flexDirection: 'row',
    gap: 12,
  },
  modalRowItem: {
    flex: 1,
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  confirmButtonDisabled: {
    opacity: 0.6,
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0A0A0F',
  },
});
