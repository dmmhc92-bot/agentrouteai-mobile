import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';

interface ComplianceSummary {
  total_leads: number;
  leads_with_soa: number;
  leads_without_soa: number;
  signed_soas: number;
  pending_soas: number;
  appointments_without_soa: number;
  compliant_appointments: number;
  compliance_rate: number;
}

interface ComplianceRecord {
  lead_id: string;
  lead_name: string;
  appointment_id?: string;
  appointment_date?: string;
  appointment_time?: string;
  soa_id?: string;
  soa_signed: boolean;
  soa_pdf_available: boolean;
  compliance_status: string;
  agent_id: string;
  agent_name: string;
}

type FilterStatus = 'all' | 'missing_soa' | 'pending_signature' | 'signed' | 'compliant';

export default function ComplianceTrackingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState<ComplianceSummary | null>(null);
  const [records, setRecords] = useState<ComplianceRecord[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterStatus>('all');

  const loadData = async () => {
    try {
      const [summaryData, recordsData] = await Promise.all([
        api.getComplianceSummary(),
        api.getComplianceRecords(activeFilter === 'all' ? undefined : activeFilter, 100),
      ]);
      setSummary(summaryData);
      setRecords(recordsData);
    } catch (error) {
      console.error('Error loading compliance data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    // Wait for user to be loaded before fetching data
    if (user && (user.role === 'admin' || user.role === 'manager')) {
      loadData();
    } else if (user && user.role === 'agent') {
      // Agent doesn't have access, stop loading
      setLoading(false);
    }
  }, [user, activeFilter]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleFilterChange = (filter: FilterStatus) => {
    setActiveFilter(filter);
    setLoading(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'compliant': return '#22C55E';
      case 'signed': return '#3B82F6';
      case 'pending_signature': return '#F59E0B';
      case 'missing_soa': return '#EF4444';
      default: return '#6B7280';
    }
  };

  const getStatusIcon = (status: string): keyof typeof Ionicons.glyphMap => {
    switch (status) {
      case 'compliant': return 'shield-checkmark';
      case 'signed': return 'checkmark-circle';
      case 'pending_signature': return 'time';
      case 'missing_soa': return 'alert-circle';
      default: return 'help-circle';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'compliant': return 'Compliant';
      case 'signed': return 'SOA Signed';
      case 'pending_signature': return 'Pending Signature';
      case 'missing_soa': return 'Missing SOA';
      default: return 'Unknown';
    }
  };

  // Check role access
  const isAdminOrManager = user?.role === 'admin' || user?.role === 'manager';

  if (!isAdminOrManager) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Compliance Tracking</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.accessDenied}>
          <Ionicons name="lock-closed" size={64} color="#64748B" />
          <Text style={styles.accessDeniedText}>Access Restricted</Text>
          <Text style={styles.accessDeniedSubtext}>
            Compliance tracking is only available to Admins and Managers.
          </Text>
        </View>
      </View>
    );
  }

  if (loading && !refreshing) {
    return (
      <View style={[styles.container, styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#8B5CF6" />
        <Text style={styles.loadingText}>Loading compliance data...</Text>
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
        <Text style={styles.headerTitle}>Medicare Compliance</Text>
        <View style={styles.headerBadge}>
          <Ionicons name="shield-checkmark" size={18} color="#22C55E" />
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8B5CF6" />
        }
      >
        {/* Compliance Rate Card */}
        {summary && (
          <View style={styles.rateCard}>
            <View style={styles.rateCircle}>
              <Text style={styles.rateValue}>{summary.compliance_rate}%</Text>
              <Text style={styles.rateLabel}>Compliant</Text>
            </View>
            <View style={styles.rateStats}>
              <Text style={styles.rateTitle}>Overall Compliance Rate</Text>
              <Text style={styles.rateDescription}>
                {summary.compliant_appointments} of {summary.appointments_without_soa + summary.compliant_appointments} appointments are compliant
              </Text>
            </View>
          </View>
        )}

        {/* Summary Cards */}
        {summary && (
          <View style={styles.summaryGrid}>
            <View style={[styles.summaryCard, { borderLeftColor: '#EF4444' }]}>
              <View style={styles.summaryIcon}>
                <Ionicons name="alert-circle" size={24} color="#EF4444" />
              </View>
              <View style={styles.summaryContent}>
                <Text style={styles.summaryValue}>{summary.leads_without_soa}</Text>
                <Text style={styles.summaryLabel}>Missing SOA</Text>
              </View>
            </View>

            <View style={[styles.summaryCard, { borderLeftColor: '#22C55E' }]}>
              <View style={styles.summaryIcon}>
                <Ionicons name="checkmark-circle" size={24} color="#22C55E" />
              </View>
              <View style={styles.summaryContent}>
                <Text style={styles.summaryValue}>{summary.signed_soas}</Text>
                <Text style={styles.summaryLabel}>Signed SOAs</Text>
              </View>
            </View>

            <View style={[styles.summaryCard, { borderLeftColor: '#F59E0B' }]}>
              <View style={styles.summaryIcon}>
                <Ionicons name="warning" size={24} color="#F59E0B" />
              </View>
              <View style={styles.summaryContent}>
                <Text style={styles.summaryValue}>{summary.appointments_without_soa}</Text>
                <Text style={styles.summaryLabel}>Appts Without SOA</Text>
              </View>
            </View>

            <View style={[styles.summaryCard, { borderLeftColor: '#3B82F6' }]}>
              <View style={styles.summaryIcon}>
                <Ionicons name="shield-checkmark" size={24} color="#3B82F6" />
              </View>
              <View style={styles.summaryContent}>
                <Text style={styles.summaryValue}>{summary.compliant_appointments}</Text>
                <Text style={styles.summaryLabel}>Compliant Appts</Text>
              </View>
            </View>
          </View>
        )}

        {/* Filter Tabs */}
        <View style={styles.filterContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <TouchableOpacity
              style={[styles.filterTab, activeFilter === 'all' && styles.filterTabActive]}
              onPress={() => handleFilterChange('all')}
            >
              <Text style={[styles.filterText, activeFilter === 'all' && styles.filterTextActive]}>
                All
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterTab, activeFilter === 'missing_soa' && styles.filterTabActive]}
              onPress={() => handleFilterChange('missing_soa')}
            >
              <Ionicons name="alert-circle" size={14} color={activeFilter === 'missing_soa' ? '#FFFFFF' : '#EF4444'} />
              <Text style={[styles.filterText, activeFilter === 'missing_soa' && styles.filterTextActive]}>
                Missing
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterTab, activeFilter === 'pending_signature' && styles.filterTabActive]}
              onPress={() => handleFilterChange('pending_signature')}
            >
              <Ionicons name="time" size={14} color={activeFilter === 'pending_signature' ? '#FFFFFF' : '#F59E0B'} />
              <Text style={[styles.filterText, activeFilter === 'pending_signature' && styles.filterTextActive]}>
                Pending
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterTab, activeFilter === 'signed' && styles.filterTabActive]}
              onPress={() => handleFilterChange('signed')}
            >
              <Ionicons name="checkmark-circle" size={14} color={activeFilter === 'signed' ? '#FFFFFF' : '#3B82F6'} />
              <Text style={[styles.filterText, activeFilter === 'signed' && styles.filterTextActive]}>
                Signed
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterTab, activeFilter === 'compliant' && styles.filterTabActive]}
              onPress={() => handleFilterChange('compliant')}
            >
              <Ionicons name="shield-checkmark" size={14} color={activeFilter === 'compliant' ? '#FFFFFF' : '#22C55E'} />
              <Text style={[styles.filterText, activeFilter === 'compliant' && styles.filterTextActive]}>
                Compliant
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* Records List */}
        <View style={styles.recordsSection}>
          <Text style={styles.sectionTitle}>Compliance Records ({records.length})</Text>
          
          {records.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="document-text-outline" size={48} color="#64748B" />
              <Text style={styles.emptyText}>No records match the current filter</Text>
            </View>
          ) : (
            records.map((record) => (
              <TouchableOpacity
                key={record.lead_id}
                style={styles.recordCard}
                onPress={() => router.push(`/lead/${record.lead_id}`)}
              >
                <View style={[styles.statusIndicator, { backgroundColor: getStatusColor(record.compliance_status) }]} />
                <View style={styles.recordContent}>
                  <View style={styles.recordHeader}>
                    <Text style={styles.recordName}>{record.lead_name}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: `${getStatusColor(record.compliance_status)}20` }]}>
                      <Ionicons name={getStatusIcon(record.compliance_status)} size={14} color={getStatusColor(record.compliance_status)} />
                      <Text style={[styles.statusText, { color: getStatusColor(record.compliance_status) }]}>
                        {getStatusLabel(record.compliance_status)}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.recordDetails}>
                    <View style={styles.recordDetail}>
                      <Ionicons name="person" size={14} color="#64748B" />
                      <Text style={styles.recordDetailText}>{record.agent_name}</Text>
                    </View>
                    {record.appointment_date && (
                      <View style={styles.recordDetail}>
                        <Ionicons name="calendar" size={14} color="#64748B" />
                        <Text style={styles.recordDetailText}>
                          {record.appointment_date} {record.appointment_time}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.recordFlags}>
                    {record.soa_id && (
                      <View style={[styles.flag, { backgroundColor: '#3B82F620' }]}>
                        <Ionicons name="document-text" size={12} color="#3B82F6" />
                        <Text style={[styles.flagText, { color: '#3B82F6' }]}>SOA</Text>
                      </View>
                    )}
                    {record.soa_signed && (
                      <View style={[styles.flag, { backgroundColor: '#22C55E20' }]}>
                        <Ionicons name="create" size={12} color="#22C55E" />
                        <Text style={[styles.flagText, { color: '#22C55E' }]}>Signed</Text>
                      </View>
                    )}
                    {record.soa_pdf_available && (
                      <View style={[styles.flag, { backgroundColor: '#8B5CF620' }]}>
                        <Ionicons name="document" size={12} color="#8B5CF6" />
                        <Text style={[styles.flagText, { color: '#8B5CF6' }]}>PDF</Text>
                      </View>
                    )}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#64748B" />
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
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
  loadingText: {
    color: '#94A3B8',
    marginTop: 16,
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
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  headerRight: {
    width: 40,
  },
  headerBadge: {
    width: 40,
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  accessDenied: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  accessDeniedText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
  },
  accessDeniedSubtext: {
    color: '#64748B',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  rateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#22C55E30',
  },
  rateCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#22C55E20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  rateValue: {
    color: '#22C55E',
    fontSize: 24,
    fontWeight: '700',
  },
  rateLabel: {
    color: '#22C55E',
    fontSize: 10,
    fontWeight: '500',
  },
  rateStats: {
    flex: 1,
  },
  rateTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  rateDescription: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 4,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  summaryCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 4,
  },
  summaryIcon: {
    marginRight: 12,
  },
  summaryContent: {
    flex: 1,
  },
  summaryValue: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
  },
  summaryLabel: {
    color: '#94A3B8',
    fontSize: 11,
  },
  filterContainer: {
    marginBottom: 16,
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#1E293B',
    borderRadius: 20,
    marginRight: 8,
    gap: 6,
  },
  filterTabActive: {
    backgroundColor: '#8B5CF6',
  },
  filterText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '500',
  },
  filterTextActive: {
    color: '#FFFFFF',
  },
  recordsSection: {
    marginTop: 8,
  },
  sectionTitle: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    color: '#64748B',
    marginTop: 12,
    fontSize: 14,
  },
  recordCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  statusIndicator: {
    width: 4,
    height: '100%',
    borderRadius: 2,
    marginRight: 12,
    minHeight: 60,
  },
  recordContent: {
    flex: 1,
  },
  recordHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  recordName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  recordDetails: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 8,
  },
  recordDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  recordDetailText: {
    color: '#94A3B8',
    fontSize: 12,
  },
  recordFlags: {
    flexDirection: 'row',
    gap: 8,
  },
  flag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 4,
  },
  flagText: {
    fontSize: 10,
    fontWeight: '600',
  },
});
