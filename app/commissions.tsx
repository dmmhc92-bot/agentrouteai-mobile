import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  Switch,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../src/services/api';
import { useAuth } from '../src/contexts/AuthContext';
import { format } from 'date-fns';

// Commission status configuration
const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  estimated: { label: 'Estimated', color: '#6B7280', icon: 'calculator' },
  pending: { label: 'Pending', color: '#F59E0B', icon: 'hourglass' },
  approved: { label: 'Approved', color: '#3B82F6', icon: 'checkmark-circle' },
  paid: { label: 'Paid', color: '#22C55E', icon: 'wallet' },
};

interface CommissionRecord {
  id: string;
  lead_id: string | null;
  lead_name: string | null;
  production_id: string | null;
  policy_type: string;
  carrier: string;
  premium: number;
  estimated_commission: number;
  agent_commission: number;
  manager_override: number;
  agency_share: number;
  paid_amount: number | null;
  commission_status: string;
  payment_date: string | null;
  created_by_user: string;
  agent_name: string | null;
  created_date: string;
  notes: string;
}

interface CommissionSummary {
  total_estimated: number;
  total_pending: number;
  total_approved: number;
  total_paid: number;
  total_paid_amount: number;
  agent_totals: {
    estimated: number;
    pending: number;
    approved: number;
    paid: number;
  };
  records_count: number;
  by_status: Record<string, number>;
  by_carrier: Record<string, number>;
  by_policy_type: Record<string, number>;
  is_team_view: boolean;
}

export default function CommissionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [commissions, setCommissions] = useState<CommissionRecord[]>([]);
  const [summary, setSummary] = useState<CommissionSummary | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [teamView, setTeamView] = useState(false);
  
  // Update modal state
  const [updateModalVisible, setUpdateModalVisible] = useState(false);
  const [selectedCommission, setSelectedCommission] = useState<CommissionRecord | null>(null);
  const [newStatus, setNewStatus] = useState('');
  const [paidAmount, setPaidAmount] = useState('');
  const [updating, setUpdating] = useState(false);
  
  const isManagerOrAdmin = user?.role === 'admin' || user?.role === 'manager';

  const loadData = async () => {
    try {
      const [commissionsData, summaryData] = await Promise.all([
        api.getCommissions(selectedStatus || undefined, teamView),
        api.getCommissionSummary(teamView),
      ]);
      setCommissions(commissionsData);
      setSummary(summaryData);
    } catch (error: any) {
      console.error('Error loading commissions:', error);
      Alert.alert('Error', 'Failed to load commission data');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [selectedStatus, teamView])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const openUpdateModal = (commission: CommissionRecord) => {
    setSelectedCommission(commission);
    setNewStatus(commission.commission_status);
    setPaidAmount(commission.paid_amount?.toString() || commission.agent_commission.toString());
    setUpdateModalVisible(true);
  };

  const handleUpdateCommission = async () => {
    if (!selectedCommission) return;
    
    setUpdating(true);
    try {
      const updateData: any = {
        commission_status: newStatus,
      };
      
      if (newStatus === 'paid' && paidAmount) {
        updateData.paid_amount = parseFloat(paidAmount);
        updateData.payment_date = new Date().toISOString();
      }
      
      await api.updateCommission(selectedCommission.id, updateData);
      setUpdateModalVisible(false);
      loadData();
      Alert.alert('Success', 'Commission updated');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to update commission');
    } finally {
      setUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading commissions...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Commissions</Text>
        <View style={styles.headerRight}>
          {isManagerOrAdmin && (
            <View style={styles.teamToggle}>
              <Text style={styles.teamToggleLabel}>Team</Text>
              <Switch
                value={teamView}
                onValueChange={setTeamView}
                trackColor={{ false: '#334155', true: '#3B82F680' }}
                thumbColor={teamView ? '#3B82F6' : '#64748B'}
              />
            </View>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />
        }
      >
        {/* Summary Cards */}
        {summary && (
          <View style={styles.summarySection}>
            <Text style={styles.sectionTitle}>
              {teamView ? 'Team Summary' : 'Your Summary'}
            </Text>
            <View style={styles.summaryGrid}>
              <View style={[styles.summaryCard, { borderColor: '#6B7280' }]}>
                <Ionicons name="calculator" size={20} color="#6B7280" />
                <Text style={styles.summaryLabel}>Estimated</Text>
                <Text style={[styles.summaryValue, { color: '#6B7280' }]}>
                  {formatCurrency(summary.agent_totals.estimated)}
                </Text>
                <Text style={styles.summaryCount}>
                  {summary.by_status.estimated || 0} records
                </Text>
              </View>
              <View style={[styles.summaryCard, { borderColor: '#F59E0B' }]}>
                <Ionicons name="hourglass" size={20} color="#F59E0B" />
                <Text style={styles.summaryLabel}>Pending</Text>
                <Text style={[styles.summaryValue, { color: '#F59E0B' }]}>
                  {formatCurrency(summary.agent_totals.pending)}
                </Text>
                <Text style={styles.summaryCount}>
                  {summary.by_status.pending || 0} records
                </Text>
              </View>
              <View style={[styles.summaryCard, { borderColor: '#3B82F6' }]}>
                <Ionicons name="checkmark-circle" size={20} color="#3B82F6" />
                <Text style={styles.summaryLabel}>Approved</Text>
                <Text style={[styles.summaryValue, { color: '#3B82F6' }]}>
                  {formatCurrency(summary.agent_totals.approved)}
                </Text>
                <Text style={styles.summaryCount}>
                  {summary.by_status.approved || 0} records
                </Text>
              </View>
              <View style={[styles.summaryCard, { borderColor: '#22C55E' }]}>
                <Ionicons name="wallet" size={20} color="#22C55E" />
                <Text style={styles.summaryLabel}>Paid</Text>
                <Text style={[styles.summaryValue, { color: '#22C55E' }]}>
                  {formatCurrency(summary.total_paid_amount || summary.agent_totals.paid)}
                </Text>
                <Text style={styles.summaryCount}>
                  {summary.by_status.paid || 0} records
                </Text>
              </View>
            </View>
            
            {/* Grand Total */}
            <View style={styles.grandTotalCard}>
              <View style={styles.grandTotalLeft}>
                <Ionicons name="cash" size={24} color="#22C55E" />
                <View>
                  <Text style={styles.grandTotalLabel}>Total Expected</Text>
                  <Text style={styles.grandTotalSubtext}>
                    All commissions ({summary.records_count} policies)
                  </Text>
                </View>
              </View>
              <Text style={styles.grandTotalValue}>
                {formatCurrency(
                  summary.agent_totals.estimated +
                  summary.agent_totals.pending +
                  summary.agent_totals.approved +
                  summary.agent_totals.paid
                )}
              </Text>
            </View>
          </View>
        )}

        {/* Status Filter */}
        <View style={styles.filterSection}>
          <Text style={styles.filterLabel}>Filter by Status</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
            <TouchableOpacity
              style={[styles.filterChip, !selectedStatus && styles.filterChipActive]}
              onPress={() => setSelectedStatus(null)}
            >
              <Text style={[styles.filterChipText, !selectedStatus && styles.filterChipTextActive]}>
                All
              </Text>
            </TouchableOpacity>
            {Object.entries(STATUS_CONFIG).map(([status, config]) => (
              <TouchableOpacity
                key={status}
                style={[
                  styles.filterChip,
                  selectedStatus === status && { backgroundColor: config.color },
                ]}
                onPress={() => setSelectedStatus(selectedStatus === status ? null : status)}
              >
                <Ionicons
                  name={config.icon as any}
                  size={14}
                  color={selectedStatus === status ? '#FFFFFF' : config.color}
                />
                <Text
                  style={[
                    styles.filterChipText,
                    selectedStatus === status && styles.filterChipTextActive,
                  ]}
                >
                  {config.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Commission List */}
        <View style={styles.listSection}>
          <Text style={styles.sectionTitle}>
            Commission Records ({commissions.length})
          </Text>
          
          {commissions.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="wallet-outline" size={48} color="#64748B" />
              <Text style={styles.emptyText}>No commission records found</Text>
              <Text style={styles.emptySubtext}>
                Commissions will appear here when policies are submitted
              </Text>
            </View>
          ) : (
            commissions.map((commission) => {
              const statusConfig = STATUS_CONFIG[commission.commission_status] || STATUS_CONFIG.estimated;
              return (
                <TouchableOpacity
                  key={commission.id}
                  style={styles.commissionCard}
                  onPress={() => openUpdateModal(commission)}
                >
                  <View style={styles.commissionHeader}>
                    <View style={styles.commissionHeaderLeft}>
                      <View style={[styles.statusBadge, { backgroundColor: statusConfig.color }]}>
                        <Ionicons name={statusConfig.icon as any} size={12} color="#FFFFFF" />
                        <Text style={styles.statusBadgeText}>{statusConfig.label}</Text>
                      </View>
                      {teamView && commission.agent_name && (
                        <Text style={styles.agentName}>{commission.agent_name}</Text>
                      )}
                    </View>
                    <Text style={styles.commissionDate}>
                      {format(new Date(commission.created_date), 'MMM d, yyyy')}
                    </Text>
                  </View>
                  
                  <View style={styles.commissionBody}>
                    <View style={styles.commissionInfo}>
                      <Text style={styles.policyType}>{commission.policy_type}</Text>
                      <Text style={styles.carrier}>{commission.carrier}</Text>
                      {commission.lead_name && (
                        <Text style={styles.leadName}>Client: {commission.lead_name}</Text>
                      )}
                    </View>
                    <View style={styles.commissionAmounts}>
                      <Text style={styles.premiumLabel}>Premium</Text>
                      <Text style={styles.premiumValue}>{formatCurrency(commission.premium)}</Text>
                    </View>
                  </View>
                  
                  <View style={styles.commissionFooter}>
                    <View style={styles.splitInfo}>
                      <View style={styles.splitItem}>
                        <Text style={styles.splitLabel}>Your Share</Text>
                        <Text style={[styles.splitValue, { color: '#22C55E' }]}>
                          {formatCurrency(commission.agent_commission)}
                        </Text>
                      </View>
                      {isManagerOrAdmin && (
                        <>
                          <View style={styles.splitDivider} />
                          <View style={styles.splitItem}>
                            <Text style={styles.splitLabel}>Override</Text>
                            <Text style={styles.splitValue}>
                              {formatCurrency(commission.manager_override)}
                            </Text>
                          </View>
                        </>
                      )}
                    </View>
                    {commission.commission_status === 'paid' && commission.paid_amount && (
                      <View style={styles.paidInfo}>
                        <Ionicons name="checkmark-done" size={14} color="#22C55E" />
                        <Text style={styles.paidText}>
                          Paid {formatCurrency(commission.paid_amount)}
                          {commission.payment_date && ` on ${format(new Date(commission.payment_date), 'MMM d')}`}
                        </Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Update Modal */}
      <Modal
        visible={updateModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setUpdateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Update Commission</Text>
              <TouchableOpacity onPress={() => setUpdateModalVisible(false)}>
                <Ionicons name="close" size={24} color="#64748B" />
              </TouchableOpacity>
            </View>

            {selectedCommission && (
              <>
                <View style={styles.modalInfo}>
                  <Text style={styles.modalInfoLabel}>{selectedCommission.policy_type}</Text>
                  <Text style={styles.modalInfoValue}>{selectedCommission.carrier}</Text>
                  <Text style={styles.modalInfoAmount}>
                    Expected: {formatCurrency(selectedCommission.agent_commission)}
                  </Text>
                </View>

                <Text style={styles.inputLabel}>Status</Text>
                <View style={styles.statusOptions}>
                  {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                    <TouchableOpacity
                      key={status}
                      style={[
                        styles.statusOption,
                        newStatus === status && { backgroundColor: config.color, borderColor: config.color },
                      ]}
                      onPress={() => setNewStatus(status)}
                    >
                      <Ionicons
                        name={config.icon as any}
                        size={16}
                        color={newStatus === status ? '#FFFFFF' : config.color}
                      />
                      <Text
                        style={[
                          styles.statusOptionText,
                          newStatus === status && { color: '#FFFFFF' },
                        ]}
                      >
                        {config.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {newStatus === 'paid' && (
                  <>
                    <Text style={styles.inputLabel}>Paid Amount</Text>
                    <TextInput
                      style={styles.amountInput}
                      value={paidAmount}
                      onChangeText={setPaidAmount}
                      placeholder="0.00"
                      placeholderTextColor="#64748B"
                      keyboardType="decimal-pad"
                    />
                  </>
                )}

                <TouchableOpacity
                  style={[styles.updateButton, updating && styles.updateButtonDisabled]}
                  onPress={handleUpdateCommission}
                  disabled={updating}
                >
                  {updating ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.updateButtonText}>Update Commission</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
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
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  headerRight: {
    width: 80,
    alignItems: 'flex-end',
  },
  teamToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  teamToggleLabel: {
    color: '#94A3B8',
    fontSize: 12,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  summarySection: {
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryCard: {
    width: '48%',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 3,
  },
  summaryLabel: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 8,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 2,
  },
  summaryCount: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 4,
  },
  grandTotalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#22C55E40',
  },
  grandTotalLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  grandTotalLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  grandTotalSubtext: {
    color: '#64748B',
    fontSize: 12,
  },
  grandTotalValue: {
    color: '#22C55E',
    fontSize: 22,
    fontWeight: '700',
  },
  filterSection: {
    marginBottom: 20,
  },
  filterLabel: {
    color: '#94A3B8',
    fontSize: 12,
    marginBottom: 8,
  },
  filterScroll: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1E293B',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#3B82F6',
  },
  filterChipText: {
    color: '#94A3B8',
    fontSize: 13,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  listSection: {
    marginBottom: 20,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 16,
    marginTop: 12,
  },
  emptySubtext: {
    color: '#64748B',
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
  },
  commissionCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  commissionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  commissionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '500',
  },
  agentName: {
    color: '#94A3B8',
    fontSize: 12,
  },
  commissionDate: {
    color: '#64748B',
    fontSize: 12,
  },
  commissionBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  commissionInfo: {
    flex: 1,
  },
  policyType: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
  },
  carrier: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 2,
  },
  leadName: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 4,
  },
  commissionAmounts: {
    alignItems: 'flex-end',
  },
  premiumLabel: {
    color: '#64748B',
    fontSize: 11,
  },
  premiumValue: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '500',
  },
  commissionFooter: {
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 12,
  },
  splitInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  splitItem: {
    flex: 1,
  },
  splitLabel: {
    color: '#64748B',
    fontSize: 11,
  },
  splitValue: {
    color: '#E2E8F0',
    fontSize: 16,
    fontWeight: '600',
  },
  splitDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#334155',
    marginHorizontal: 16,
  },
  paidInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    backgroundColor: '#22C55E20',
    padding: 8,
    borderRadius: 8,
  },
  paidText: {
    color: '#22C55E',
    fontSize: 12,
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
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  modalInfo: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  modalInfoLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  modalInfoValue: {
    color: '#94A3B8',
    fontSize: 14,
    marginTop: 4,
  },
  modalInfoAmount: {
    color: '#22C55E',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 8,
  },
  inputLabel: {
    color: '#94A3B8',
    fontSize: 12,
    marginBottom: 8,
    marginTop: 12,
  },
  statusOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
  },
  statusOptionText: {
    color: '#E2E8F0',
    fontSize: 13,
  },
  amountInput: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 16,
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  updateButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  updateButtonDisabled: {
    backgroundColor: '#64748B',
  },
  updateButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
