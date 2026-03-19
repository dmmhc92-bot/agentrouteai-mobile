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
  cardHover: '#1A1A22',
  primary: '#D4AF37',
  primaryMuted: '#8B7355',
  text: '#FFFFFF',
  textSecondary: '#9CA3AF',
  textMuted: '#6B7280',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',
};

// Stage configuration
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
      console.log('[Pipeline] Loading...', { teamView, role: user?.role });

      const data = await api.getPipeline(teamView);
      console.log('[Pipeline] Data received:', { stages: data?.stages?.length, total: data?.summary?.total_cases });

      if (data && data.stages && Array.isArray(data.stages)) {
        setPipelineData(data);
      } else {
        console.warn('[Pipeline] Invalid response');
        setPipelineData({
          stages: [],
          summary: { total_cases: 0, total_premium: 0, total_commission: 0, conversion_rate: 0 },
          is_team_view: teamView,
        });
      }
    } catch (error: any) {
      console.error('[Pipeline] Load failed:', error?.message);
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
  }, [teamView, user?.role]);

  useEffect(() => {
    loadPipeline();
  }, [loadPipeline]);

  const onRefresh = () => {
    setRefreshing(true);
    loadPipeline();
  };

  const handleStagePress = (stage: PipelineStage) => {
    // Toggle expand/collapse
    if (expandedStage === stage.stage) {
      setExpandedStage(null);
    } else {
      setExpandedStage(stage.stage);
    }
  };

  const handleLeadPress = (lead: PipelineLead) => {
    router.push(`/lead/${lead.id}`);
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

  // Get all stages with data, sorted by priority
  const getStagesWithData = () => {
    if (!pipelineData?.stages) return [];
    
    // Create a map of stages from API data
    const stageMap = new Map<string, PipelineStage>();
    pipelineData.stages.forEach(s => stageMap.set(s.stage, s));
    
    // Return all stages in order, with count 0 for missing ones
    return ALL_STAGES.map(stageKey => {
      const existing = stageMap.get(stageKey);
      if (existing) return existing;
      
      const config = STAGE_CONFIG[stageKey] || { label: stageKey };
      return {
        stage: stageKey,
        label: config.label,
        count: 0,
        total_premium: 0,
        total_commission: 0,
        leads: [],
      };
    });
  };

  const allStages = getStagesWithData();
  const stagesWithCases = allStages.filter(s => s.count > 0);
  const stagesWithoutCases = allStages.filter(s => s.count === 0);

  // Render individual lead card
  const renderLeadCard = (lead: PipelineLead, stage: PipelineStage) => {
    const config = STAGE_CONFIG[stage.stage] || { color: '#6B7280', icon: 'help-circle' };

    return (
      <TouchableOpacity
        key={lead.id}
        style={styles.leadCard}
        onPress={() => handleLeadPress(lead)}
        activeOpacity={0.7}
      >
        <View style={styles.leadCardContent}>
          <View style={styles.leadMainInfo}>
            <Text style={styles.leadName} numberOfLines={1}>{lead.name}</Text>
            {lead.phone && (
              <Text style={styles.leadPhone}>{lead.phone}</Text>
            )}
            <Text style={styles.leadDate}>{formatDate(lead.created_date)}</Text>
          </View>
          
          <View style={styles.leadActions}>
            {lead.premium > 0 && (
              <Text style={styles.leadPremium}>{formatCurrency(lead.premium)}</Text>
            )}
            <TouchableOpacity
              style={[styles.moveButton, { backgroundColor: config.color }]}
              onPress={(e) => {
                e.stopPropagation();
                handleMoveCase(lead, stage.stage);
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // Render stage row - LARGE, TAPPABLE
  const renderStageRow = (stage: PipelineStage, showEmpty: boolean = true) => {
    const config = STAGE_CONFIG[stage.stage] || { color: '#6B7280', icon: 'help-circle', label: stage.label };
    const isExpanded = expandedStage === stage.stage;
    const hasLeads = stage.count > 0;

    // Don't show empty stages if showEmpty is false
    if (!hasLeads && !showEmpty) return null;

    return (
      <View key={stage.stage} style={styles.stageContainer}>
        <TouchableOpacity
          style={[
            styles.stageRow,
            hasLeads && styles.stageRowWithCases,
            isExpanded && styles.stageRowExpanded,
          ]}
          onPress={() => handleStagePress(stage)}
          activeOpacity={0.6}
        >
          {/* Stage Icon */}
          <View style={[styles.stageIconContainer, { backgroundColor: `${config.color}20` }]}>
            <Ionicons name={config.icon as any} size={22} color={config.color} />
          </View>

          {/* Stage Info */}
          <View style={styles.stageInfo}>
            <Text style={[styles.stageName, !hasLeads && styles.stageNameEmpty]}>
              {config.label}
            </Text>
            <Text style={styles.stageCount}>
              {hasLeads ? `${stage.count} ${stage.count === 1 ? 'case' : 'cases'}` : 'No cases'}
            </Text>
          </View>

          {/* Right side - Premium & Chevron */}
          <View style={styles.stageRight}>
            {stage.total_premium > 0 && (
              <Text style={styles.stageTotalPremium}>{formatCurrency(stage.total_premium)}</Text>
            )}
            {hasLeads && (
              <Ionicons
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={22}
                color={COLORS.textMuted}
                style={styles.chevron}
              />
            )}
          </View>
        </TouchableOpacity>

        {/* Expanded Leads List */}
        {isExpanded && hasLeads && (
          <View style={styles.leadsContainer}>
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
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Sales Pipeline</Text>
        {canViewTeam ? (
          <TouchableOpacity
            style={[styles.teamToggle, teamView && styles.teamToggleActive]}
            onPress={() => {
              setTeamView(!teamView);
              setLoading(true);
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name={teamView ? 'people' : 'person'}
              size={20}
              color={teamView ? COLORS.primary : COLORS.textMuted}
            />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 44 }} />
        )}
      </View>

      {/* Summary Stats */}
      <View style={styles.summaryContainer}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{pipelineData?.summary?.total_cases || 0}</Text>
          <Text style={styles.summaryLabel}>Cases</Text>
        </View>
        <View style={[styles.summaryCard, styles.summaryCardHighlight]}>
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
      </View>

      {/* Pipeline Stages */}
      <ScrollView
        style={styles.stagesScrollView}
        contentContainerStyle={styles.stagesContent}
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

        {loadError ? (
          <View style={styles.errorState}>
            <Ionicons name="cloud-offline-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.errorTitle}>Unable to Load Pipeline</Text>
            <Text style={styles.errorText}>{loadError}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => {
                setLoading(true);
                loadPipeline();
              }}
            >
              <Ionicons name="refresh" size={18} color="#0A0A0F" />
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Active Stages (with cases) */}
            {stagesWithCases.length > 0 && (
              <View style={styles.stagesSection}>
                <Text style={styles.sectionTitle}>Active Stages</Text>
                {stagesWithCases.map(stage => renderStageRow(stage))}
              </View>
            )}

            {/* All Stages (show empty stages too) */}
            {stagesWithoutCases.length > 0 && (
              <View style={styles.stagesSection}>
                <Text style={styles.sectionTitle}>All Stages</Text>
                {stagesWithoutCases.map(stage => renderStageRow(stage, true))}
              </View>
            )}

            {/* Empty State - No cases at all */}
            {stagesWithCases.length === 0 && !loadError && (
              <View style={styles.emptyState}>
                <View style={styles.emptyStateIcon}>
                  <Ionicons name="layers-outline" size={48} color={COLORS.primaryMuted} />
                </View>
                <Text style={styles.emptyStateTitle}>Your Pipeline is Empty</Text>
                <Text style={styles.emptyStateText}>
                  Add leads and move them through your sales stages to track your progress.
                </Text>
                <TouchableOpacity
                  style={styles.addLeadButton}
                  onPress={() => router.push('/lead/new')}
                >
                  <Ionicons name="add" size={20} color="#0A0A0F" />
                  <Text style={styles.addLeadButtonText}>Add Your First Lead</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
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
              <TouchableOpacity 
                onPress={() => setMoveModalVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={24} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            {selectedLead && (
              <Text style={styles.modalSubtitle}>Moving: {selectedLead.name}</Text>
            )}

            <Text style={styles.inputLabel}>Select Stage</Text>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false} 
              style={styles.stageSelector}
              contentContainerStyle={styles.stageSelectorContent}
            >
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
              placeholder="Add notes..."
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
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
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
    color: COLORS.text,
  },
  teamToggle: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 10,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  summaryCardHighlight: {
    borderColor: `${COLORS.primary}40`,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  stagesScrollView: {
    flex: 1,
  },
  stagesContent: {
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
  stagesSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  stageContainer: {
    marginBottom: 8,
  },
  stageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardBackground,
    borderRadius: 14,
    padding: 16,
    minHeight: 72,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  stageRowWithCases: {
    borderColor: COLORS.cardBorder,
  },
  stageRowExpanded: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
  },
  stageIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  stageInfo: {
    flex: 1,
  },
  stageName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  stageNameEmpty: {
    color: COLORS.textSecondary,
  },
  stageCount: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  stageRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stageTotalPremium: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
    marginRight: 8,
  },
  chevron: {
    marginLeft: 4,
  },
  leadsContainer: {
    backgroundColor: COLORS.cardBackground,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: COLORS.cardBorder,
    padding: 12,
    gap: 8,
  },
  leadCard: {
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  leadCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leadMainInfo: {
    flex: 1,
  },
  leadName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 3,
  },
  leadPhone: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  leadDate: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  leadActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  leadPremium: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  moveButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: 16,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  retryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0A0A0F',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 32,
  },
  emptyStateIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: COLORS.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 10,
  },
  emptyStateText: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  addLeadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  addLeadButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0A0A0F',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.cardBackground,
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
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  stageSelector: {
    marginBottom: 16,
  },
  stageSelectorContent: {
    paddingRight: 16,
  },
  stageSelectorItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    marginRight: 8,
    backgroundColor: COLORS.background,
    minHeight: 44,
    justifyContent: 'center',
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
    minHeight: 52,
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
