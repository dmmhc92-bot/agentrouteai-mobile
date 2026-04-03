import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
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

const COLORS = {
  background: '#0A0A0F',
  cardBackground: '#141419',
  cardBorder: '#1F1F28',
  primary: '#D4AF37',
  primaryMuted: '#8B7355',
  text: '#FFFFFF',
  textSecondary: '#9CA3AF',
  textMuted: '#6B7280',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
};

const STAGE_CONFIG: Record<string, { color: string; icon: string; label: string }> = {
  new_lead: { color: '#6B7280', icon: 'person-add', label: 'New Lead' },
  new: { color: '#6B7280', icon: 'person-add', label: 'New' },
  contacted: { color: '#3B82F6', icon: 'chatbubble', label: 'Contacted' },
  follow_up: { color: '#F59E0B', icon: 'time', label: 'Follow Up' },
  appointment_set: { color: '#8B5CF6', icon: 'calendar', label: 'Appointment Set' },
  appointment_scheduled: { color: '#8B5CF6', icon: 'calendar', label: 'Appointment Set' },
  qualified: { color: '#06B6D4', icon: 'checkmark-done', label: 'Qualified' },
  policy_submitted: { color: '#8B5CF6', icon: 'paper-plane', label: 'Policy Submitted' },
  application_submitted: { color: '#8B5CF6', icon: 'paper-plane', label: 'Application Submitted' },
  underwriting_review: { color: '#F59E0B', icon: 'hourglass', label: 'Underwriting' },
  additional_requirements: { color: '#EF4444', icon: 'alert-circle', label: 'Requirements' },
  approved: { color: '#10B981', icon: 'checkmark-circle', label: 'Approved' },
  closed_won: { color: '#22C55E', icon: 'trophy', label: 'Closed Won' },
  policy_issued: { color: '#06B6D4', icon: 'document', label: 'Policy Issued' },
  policy_placed: { color: '#14B8A6', icon: 'checkmark-done', label: 'Policy Placed' },
  commission_pending: { color: '#F97316', icon: 'cash', label: 'Commission Pending' },
  commission_paid: { color: '#22C55E', icon: 'wallet', label: 'Commission Paid' },
  closed_lost: { color: '#EF4444', icon: 'close-circle', label: 'Closed Lost' },
};

const ALL_STAGES = [
  'new_lead', 'contacted', 'follow_up', 
  'appointment_set', 'qualified', 'policy_submitted',
  'underwriting_review', 'additional_requirements',
  'approved', 'closed_won', 'policy_issued', 'policy_placed',
  'commission_pending', 'commission_paid', 'closed_lost',
];

// Stage aliases - map variant names to their canonical stage
const STAGE_ALIASES: Record<string, string> = {
  'new': 'new_lead',
  'appointment_scheduled': 'appointment_set',
  'application_submitted': 'policy_submitted',
};

export default function PipelineScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  // ===== STATE MANAGEMENT (HARDENED) =====
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pipelineData, setPipelineData] = useState<PipelineData | null>(null);
  const [teamView, setTeamView] = useState(false);
  const [hasError, setHasError] = useState(false);

  // ===== REQUEST TRACKING (PREVENT RACE CONDITIONS) =====
  const requestIdRef = useRef(0);
  const isMountedRef = useRef(true);
  const isLoadingRef = useRef(false);

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
  const userRole = user?.role || 'agent';
  const isAuthenticated = !!user?.id;

  // ===== HARDENED FETCH FUNCTION =====
  const fetchPipeline = useCallback(async (isRefresh: boolean = false) => {
    // Prevent duplicate concurrent requests
    if (isLoadingRef.current && !isRefresh) {
      console.log('[Pipeline] Skipping duplicate request');
      return;
    }

    // Generate unique request ID to handle race conditions
    const currentRequestId = ++requestIdRef.current;
    isLoadingRef.current = true;

    console.log(`[Pipeline] Request #${currentRequestId} started`, { 
      role: userRole, 
      teamView, 
      isRefresh,
      hasExistingData: !!pipelineData 
    });

    try {
      const data = await api.getPipeline(teamView);

      // Check if this request is still the latest (race condition protection)
      if (currentRequestId !== requestIdRef.current) {
        console.log(`[Pipeline] Request #${currentRequestId} discarded (superseded by #${requestIdRef.current})`);
        return;
      }

      // Check if component is still mounted
      if (!isMountedRef.current) {
        console.log(`[Pipeline] Request #${currentRequestId} discarded (unmounted)`);
        return;
      }

      // Validate response
      if (data && data.stages && Array.isArray(data.stages)) {
        console.log(`[Pipeline] Request #${currentRequestId} SUCCESS`, { 
          stages: data.stages.length, 
          total: data.summary?.total_cases 
        });
        setPipelineData(data);
        setHasError(false);
      } else {
        console.warn(`[Pipeline] Request #${currentRequestId} invalid response`);
        // Only set empty state if we have no existing data
        if (!pipelineData) {
          setPipelineData({
            stages: [],
            summary: { total_cases: 0, total_premium: 0, total_commission: 0, conversion_rate: 0 },
            is_team_view: teamView,
          });
        }
        setHasError(false); // Empty is not an error
      }
    } catch (error: any) {
      console.error(`[Pipeline] Request #${currentRequestId} FAILED:`, error?.message);

      // Check if this request is still the latest
      if (currentRequestId !== requestIdRef.current) {
        console.log(`[Pipeline] Failed request #${currentRequestId} ignored (superseded)`);
        return;
      }

      if (!isMountedRef.current) return;

      // CRITICAL: Do NOT overwrite existing valid data on refresh failure
      if (isRefresh && pipelineData) {
        console.log('[Pipeline] Refresh failed but keeping existing data');
        // Just show a subtle error, don't wipe data
        setHasError(false); // Keep showing data
      } else {
        // Initial load failed - show error state
        setHasError(true);
        if (!pipelineData) {
          setPipelineData({
            stages: [],
            summary: { total_cases: 0, total_premium: 0, total_commission: 0, conversion_rate: 0 },
            is_team_view: teamView,
          });
        }
      }
    } finally {
      if (isMountedRef.current && currentRequestId === requestIdRef.current) {
        isLoadingRef.current = false;
        setIsInitialLoad(false);
        setIsRefreshing(false);
      }
    }
  }, [teamView, userRole, pipelineData]);

  // ===== SINGLE MOUNT EFFECT (NO DUPLICATES) =====
  useEffect(() => {
    isMountedRef.current = true;
    
    // Only fetch if authenticated
    if (isAuthenticated) {
      fetchPipeline(false);
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [isAuthenticated]); // Re-run when auth state changes

  // ===== REFRESH ON SCREEN FOCUS (ENSURES DATA IS CURRENT) =====
  useFocusEffect(
    useCallback(() => {
      // Always refresh data when screen comes into focus
      // This ensures new leads appear immediately after creation
      if (isAuthenticated) {
        console.log('[Pipeline] Screen focused - refreshing data');
        fetchPipeline(true);
      }
    }, [isAuthenticated, fetchPipeline])
  );

  // ===== TEAM VIEW CHANGE HANDLER =====
  useEffect(() => {
    // Skip initial render
    if (isInitialLoad) return;
    
    // Fetch when teamView changes
    setIsInitialLoad(true);
    fetchPipeline(false);
  }, [teamView]);

  // ===== REFRESH HANDLER (SINGLE TRIGGER) =====
  const handleRefresh = useCallback(() => {
    if (isLoadingRef.current) {
      console.log('[Pipeline] Refresh skipped - already loading');
      return;
    }
    setIsRefreshing(true);
    fetchPipeline(true);
  }, [fetchPipeline]);

  // ===== RETRY HANDLER =====
  const handleRetry = useCallback(() => {
    setIsInitialLoad(true);
    setHasError(false);
    fetchPipeline(false);
  }, [fetchPipeline]);

  // ===== NAVIGATION HANDLERS =====
  const handleStagePress = (stage: PipelineStage) => {
    router.push(`/stage/${stage.stage}`);
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
      fetchPipeline(true);
      Alert.alert('Success', 'Case moved successfully');
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Failed to move case';
      Alert.alert('Error', message);
    } finally {
      setMoving(false);
    }
  };

  // ===== HELPERS =====
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // ===== STAGE DATA PROCESSING =====
  const getStagesWithData = () => {
    if (!pipelineData?.stages) return [];
    
    // First, normalize stage data by merging aliases
    const stageMap = new Map<string, PipelineStage>();
    
    pipelineData.stages.forEach(s => {
      // Get the canonical stage name (resolve alias if exists)
      const canonicalStage = STAGE_ALIASES[s.stage] || s.stage;
      
      if (stageMap.has(canonicalStage)) {
        // Merge with existing stage data
        const existing = stageMap.get(canonicalStage)!;
        stageMap.set(canonicalStage, {
          ...existing,
          count: existing.count + s.count,
          total_premium: existing.total_premium + s.total_premium,
          total_commission: existing.total_commission + s.total_commission,
          leads: [...existing.leads, ...s.leads],
        });
      } else {
        // Set as new entry with canonical stage name
        stageMap.set(canonicalStage, {
          ...s,
          stage: canonicalStage,
        });
      }
    });
    
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

  // ===== RENDER STAGE ROW =====
  const renderStageRow = (stage: PipelineStage) => {
    const config = STAGE_CONFIG[stage.stage] || { color: '#6B7280', icon: 'help-circle', label: stage.label };
    const hasLeads = stage.count > 0;

    return (
      <TouchableOpacity
        key={stage.stage}
        style={[styles.stageRow, hasLeads && styles.stageRowWithCases]}
        onPress={() => handleStagePress(stage)}
        activeOpacity={0.6}
      >
        <View style={[styles.stageIconContainer, { backgroundColor: `${config.color}20` }]}>
          <Ionicons name={config.icon as any} size={22} color={config.color} />
        </View>

        <View style={styles.stageInfo}>
          <Text style={[styles.stageName, !hasLeads && styles.stageNameEmpty]}>
            {config.label}
          </Text>
          <Text style={styles.stageCount}>
            {hasLeads ? `${stage.count} ${stage.count === 1 ? 'case' : 'cases'}` : 'No cases'}
          </Text>
        </View>

        <View style={styles.stageRight}>
          {stage.total_premium > 0 && (
            <Text style={styles.stageTotalPremium}>{formatCurrency(stage.total_premium)}</Text>
          )}
          <Ionicons name="chevron-forward" size={22} color={COLORS.textMuted} />
        </View>
      </TouchableOpacity>
    );
  };

  // ===== LOADING STATE (INITIAL ONLY) =====
  if (isInitialLoad && !pipelineData) {
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
            onPress={() => setTeamView(!teamView)}
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

      {/* Summary Stats - NOW CLICKABLE */}
      <View style={styles.summaryContainer}>
        <TouchableOpacity 
          style={styles.summaryCard}
          onPress={() => router.push('/(tabs)/leads')}
          activeOpacity={0.7}
        >
          <Text style={styles.summaryValue}>{pipelineData?.summary?.total_cases || 0}</Text>
          <Text style={styles.summaryLabel}>Cases</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.summaryCard, styles.summaryCardHighlight]}
          onPress={() => router.push('/stage/application_submitted')}
          activeOpacity={0.7}
        >
          <Text style={[styles.summaryValue, { color: COLORS.primary }]}>
            {formatCurrency(pipelineData?.summary?.total_premium || 0)}
          </Text>
          <Text style={styles.summaryLabel}>Premium</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.summaryCard}
          onPress={() => router.push('/stage/commission_pending')}
          activeOpacity={0.7}
        >
          <Text style={[styles.summaryValue, { color: COLORS.success }]}>
            {formatCurrency(pipelineData?.summary?.total_commission || 0)}
          </Text>
          <Text style={styles.summaryLabel}>Commission</Text>
        </TouchableOpacity>
      </View>

      {/* Pipeline Stages */}
      <ScrollView
        style={styles.stagesScrollView}
        contentContainerStyle={styles.stagesContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
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

        {/* Error state - only shown if NO data AND error */}
        {hasError && (!pipelineData || pipelineData.summary.total_cases === 0) ? (
          <View style={styles.errorState}>
            <Ionicons name="cloud-offline-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.errorTitle}>Unable to Load Pipeline</Text>
            <Text style={styles.errorText}>Please check your connection and try again.</Text>
            <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
              <Ionicons name="refresh" size={18} color="#0A0A0F" />
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Active Stages */}
            {stagesWithCases.length > 0 && (
              <View style={styles.stagesSection}>
                <Text style={styles.sectionTitle}>Active Stages</Text>
                {stagesWithCases.map(stage => renderStageRow(stage))}
              </View>
            )}

            {/* All Stages */}
            {stagesWithoutCases.length > 0 && (
              <View style={styles.stagesSection}>
                <Text style={styles.sectionTitle}>All Stages</Text>
                {stagesWithoutCases.map(stage => renderStageRow(stage))}
              </View>
            )}

            {/* Empty State - valid empty (not error) */}
            {stagesWithCases.length === 0 && !hasError && (
              <View style={styles.emptyState}>
                <View style={styles.emptyStateIcon}>
                  <Ionicons name="layers-outline" size={48} color={COLORS.primaryMuted} />
                </View>
                <Text style={styles.emptyStateTitle}>Your Pipeline is Empty</Text>
                <Text style={styles.emptyStateText}>
                  Add leads and move them through stages to track your progress.
                </Text>
                <TouchableOpacity style={styles.addLeadButton} onPress={() => router.push('/lead/new')}>
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
              <TouchableOpacity onPress={() => setMoveModalVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            {selectedLead && (
              <Text style={styles.modalSubtitle}>Moving: {selectedLead.name}</Text>
            )}

            <Text style={styles.inputLabel}>Select Stage</Text>
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
                    <Text style={[styles.stageSelectorText, isSelected && { color: '#FFFFFF' }]}>
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
  stageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardBackground,
    borderRadius: 14,
    padding: 16,
    minHeight: 72,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  stageRowWithCases: {
    borderColor: COLORS.cardBorder,
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
