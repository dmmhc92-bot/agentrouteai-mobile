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
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { format, formatDistanceToNow } from 'date-fns';

// Stage configuration
const STAGE_CONFIG: Record<string, { label: string; color: string }> = {
  new_lead: { label: 'Lead', color: '#6B7280' },
  appointment_scheduled: { label: 'Apt Scheduled', color: '#3B82F6' },
  application_submitted: { label: 'App Submitted', color: '#8B5CF6' },
  underwriting_review: { label: 'Underwriting', color: '#F59E0B' },
  additional_requirements: { label: 'Add. Requirements', color: '#EF4444' },
  approved: { label: 'Approved', color: '#10B981' },
  policy_issued: { label: 'Policy Issued', color: '#06B6D4' },
  policy_placed: { label: 'Policy Placed', color: '#14B8A6' },
  commission_pending: { label: 'Comm Pending', color: '#F97316' },
  commission_paid: { label: 'Comm Paid', color: '#22C55E' },
};

interface AgentDetails {
  agent: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    role: string;
    territory: string | null;
    commission_rate: number;
    last_login: string | null;
    created_at: string;
  };
  leads: any[];
  appointments: any[];
  scopes: any[];
  production: any[];
  activities: any[];
  tasks: any[];
  summary: {
    total_leads: number;
    leads_by_stage: Record<string, number>;
    total_appointments: number;
    appointments_completed: number;
    total_scopes: number;
    total_production: number;
    total_commission: number;
    overdue_tasks: number;
    pending_follow_ups: number;
  };
}

export default function AgentDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [agentData, setAgentData] = useState<AgentDetails | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'leads' | 'activity' | 'pipeline'>('overview');

  const loadData = async () => {
    if (!id) return;
    
    try {
      const data = await api.getAgentDetails(id);
      setAgentData(data);
    } catch (error: any) {
      console.error('Error loading agent details:', error);
      if (error.response?.status === 403) {
        Alert.alert('Access Denied', 'You do not have permission to view this agent');
        router.back();
      } else {
        Alert.alert('Error', 'Failed to load agent details');
      }
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [id])
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

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    try {
      return format(new Date(dateStr), 'MMM d, yyyy');
    } catch {
      return 'N/A';
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'lead_created': return 'person-add';
      case 'lead_updated': return 'create';
      case 'appointment_created': return 'calendar';
      case 'appointment_completed': return 'checkmark-circle';
      case 'scope_created': return 'document-text';
      case 'scope_delivered': return 'paper-plane';
      case 'production_created': return 'cash';
      case 'pipeline_move': return 'arrow-forward';
      default: return 'ellipse';
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading agent details...</Text>
        </View>
      </View>
    );
  }

  if (!agentData) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color="#EF4444" />
          <Text style={styles.errorText}>Agent not found</Text>
          <TouchableOpacity style={styles.goBackButton} onPress={() => router.back()}>
            <Text style={styles.goBackButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const { agent, summary, leads, appointments, scopes, activities, tasks } = agentData;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Agent Details</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Agent Profile Card */}
      <View style={styles.profileCard}>
        <View style={styles.profileAvatar}>
          <Text style={styles.profileAvatarText}>
            {agent.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{agent.name}</Text>
          <Text style={styles.profileEmail}>{agent.email}</Text>
          <View style={styles.profileMeta}>
            {agent.phone && (
              <View style={styles.profileMetaItem}>
                <Ionicons name="call" size={12} color="#64748B" />
                <Text style={styles.profileMetaText}>{agent.phone}</Text>
              </View>
            )}
            {agent.territory && (
              <View style={styles.profileMetaItem}>
                <Ionicons name="location" size={12} color="#64748B" />
                <Text style={styles.profileMetaText}>{agent.territory}</Text>
              </View>
            )}
            <View style={styles.profileMetaItem}>
              <Ionicons name="time" size={12} color="#64748B" />
              <Text style={styles.profileMetaText}>
                Last login: {agent.last_login ? formatDistanceToNow(new Date(agent.last_login), { addSuffix: true }) : 'Never'}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {['overview', 'leads', 'pipeline', 'activity'].map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab as any)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />
        }
      >
        {activeTab === 'overview' && (
          <>
            {/* Key Metrics */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Performance Metrics</Text>
              <View style={styles.metricsGrid}>
                <View style={styles.metricCard}>
                  <Ionicons name="people" size={20} color="#3B82F6" />
                  <Text style={styles.metricValue}>{summary.total_leads}</Text>
                  <Text style={styles.metricLabel}>Total Leads</Text>
                </View>
                <View style={styles.metricCard}>
                  <Ionicons name="calendar" size={20} color="#8B5CF6" />
                  <Text style={styles.metricValue}>{summary.total_appointments}</Text>
                  <Text style={styles.metricLabel}>Appointments</Text>
                </View>
                <View style={styles.metricCard}>
                  <Ionicons name="checkmark-done" size={20} color="#22C55E" />
                  <Text style={styles.metricValue}>{summary.appointments_completed}</Text>
                  <Text style={styles.metricLabel}>Completed</Text>
                </View>
                <View style={styles.metricCard}>
                  <Ionicons name="document-text" size={20} color="#F59E0B" />
                  <Text style={styles.metricValue}>{summary.total_scopes}</Text>
                  <Text style={styles.metricLabel}>SOAs</Text>
                </View>
              </View>
            </View>

            {/* Production & Commission */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Production & Commission</Text>
              <View style={styles.productionCard}>
                <View style={styles.productionRow}>
                  <View style={styles.productionItem}>
                    <Text style={styles.productionLabel}>Total Production</Text>
                    <Text style={[styles.productionValue, { color: '#22C55E' }]}>
                      {formatCurrency(summary.total_production)}
                    </Text>
                  </View>
                  <View style={styles.productionItem}>
                    <Text style={styles.productionLabel}>Total Commission</Text>
                    <Text style={[styles.productionValue, { color: '#3B82F6' }]}>
                      {formatCurrency(summary.total_commission)}
                    </Text>
                  </View>
                </View>
                <View style={styles.productionDivider} />
                <View style={styles.productionRow}>
                  <View style={styles.productionItem}>
                    <Text style={styles.productionLabel}>Commission Rate</Text>
                    <Text style={styles.productionValue}>{(agent.commission_rate * 100).toFixed(0)}%</Text>
                  </View>
                  <View style={styles.productionItem}>
                    <Text style={styles.productionLabel}>Member Since</Text>
                    <Text style={styles.productionValue}>{formatDate(agent.created_at)}</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Follow-up Status */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Follow-up Status</Text>
              <View style={styles.followUpCard}>
                <View style={styles.followUpItem}>
                  <View style={[styles.followUpIcon, { backgroundColor: '#EF444420' }]}>
                    <Ionicons name="alert-circle" size={20} color="#EF4444" />
                  </View>
                  <View>
                    <Text style={styles.followUpValue}>{summary.overdue_tasks}</Text>
                    <Text style={styles.followUpLabel}>Overdue Tasks</Text>
                  </View>
                </View>
                <View style={styles.followUpDivider} />
                <View style={styles.followUpItem}>
                  <View style={[styles.followUpIcon, { backgroundColor: '#F59E0B20' }]}>
                    <Ionicons name="time" size={20} color="#F59E0B" />
                  </View>
                  <View>
                    <Text style={styles.followUpValue}>{summary.pending_follow_ups}</Text>
                    <Text style={styles.followUpLabel}>Pending Follow-ups</Text>
                  </View>
                </View>
              </View>
            </View>
          </>
        )}

        {activeTab === 'leads' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Leads ({leads.length})</Text>
            {leads.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={40} color="#64748B" />
                <Text style={styles.emptyText}>No leads found</Text>
              </View>
            ) : (
              leads.slice(0, 20).map((lead) => {
                const stageConfig = STAGE_CONFIG[lead.stage] || { label: lead.stage, color: '#6B7280' };
                return (
                  <View key={lead.id} style={styles.leadCard}>
                    <View style={styles.leadHeader}>
                      <Text style={styles.leadName}>{lead.name}</Text>
                      <View style={[styles.stageBadge, { backgroundColor: stageConfig.color }]}>
                        <Text style={styles.stageBadgeText}>{stageConfig.label}</Text>
                      </View>
                    </View>
                    <View style={styles.leadMeta}>
                      {lead.phone && (
                        <View style={styles.leadMetaItem}>
                          <Ionicons name="call" size={12} color="#64748B" />
                          <Text style={styles.leadMetaText}>{lead.phone}</Text>
                        </View>
                      )}
                      {lead.email && (
                        <View style={styles.leadMetaItem}>
                          <Ionicons name="mail" size={12} color="#64748B" />
                          <Text style={styles.leadMetaText}>{lead.email}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.leadDate}>Added {formatDate(lead.created_date)}</Text>
                  </View>
                );
              })
            )}
            {leads.length > 20 && (
              <Text style={styles.moreText}>+ {leads.length - 20} more leads</Text>
            )}
          </View>
        )}

        {activeTab === 'pipeline' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pipeline Distribution</Text>
            {Object.entries(summary.leads_by_stage).map(([stage, count]) => {
              if (count === 0) return null;
              const config = STAGE_CONFIG[stage] || { label: stage, color: '#6B7280' };
              const percentage = summary.total_leads > 0 ? (count / summary.total_leads) * 100 : 0;
              return (
                <View key={stage} style={styles.pipelineItem}>
                  <View style={styles.pipelineHeader}>
                    <View style={[styles.pipelineDot, { backgroundColor: config.color }]} />
                    <Text style={styles.pipelineLabel}>{config.label}</Text>
                    <Text style={styles.pipelineCount}>{count}</Text>
                  </View>
                  <View style={styles.pipelineBar}>
                    <View
                      style={[
                        styles.pipelineBarFill,
                        { width: `${percentage}%`, backgroundColor: config.color },
                      ]}
                    />
                  </View>
                </View>
              );
            })}

            {/* Scope of Appointment Documents */}
            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
              Scope of Appointment Documents ({scopes.length})
            </Text>
            {scopes.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="document-text-outline" size={40} color="#64748B" />
                <Text style={styles.emptyText}>No SOA documents</Text>
              </View>
            ) : (
              scopes.slice(0, 10).map((scope) => (
                <View key={scope.id} style={styles.scopeCard}>
                  <Ionicons name="document-text" size={24} color="#8B5CF6" />
                  <View style={styles.scopeInfo}>
                    <Text style={styles.scopeName}>
                      {scope.typed_name || 'Unsigned'}
                    </Text>
                    <Text style={styles.scopeDate}>
                      Created {formatDate(scope.created_date)}
                    </Text>
                  </View>
                  {scope.pdf_base64 && (
                    <View style={styles.scopePdfBadge}>
                      <Ionicons name="checkmark" size={12} color="#22C55E" />
                      <Text style={styles.scopePdfText}>PDF</Text>
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {activeTab === 'activity' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            {activities.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="time-outline" size={40} color="#64748B" />
                <Text style={styles.emptyText}>No recent activity</Text>
              </View>
            ) : (
              activities.map((activity, index) => (
                <View key={activity.id || index} style={styles.activityItem}>
                  <View style={styles.activityIcon}>
                    <Ionicons
                      name={getActivityIcon(activity.action_type) as any}
                      size={16}
                      color="#3B82F6"
                    />
                  </View>
                  <View style={styles.activityContent}>
                    <Text style={styles.activityDescription}>
                      {activity.description || activity.action_type}
                    </Text>
                    <Text style={styles.activityTime}>
                      {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}
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
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 12,
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    color: '#FFFFFF',
    fontSize: 16,
    marginTop: 12,
  },
  goBackButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 24,
  },
  goBackButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  headerRight: {
    width: 40,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  profileAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  profileAvatarText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '600',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
  },
  profileEmail: {
    color: '#94A3B8',
    fontSize: 14,
    marginTop: 2,
  },
  profileMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: 12,
  },
  profileMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  profileMetaText: {
    color: '#64748B',
    fontSize: 12,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: '#3B82F620',
  },
  tabText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#3B82F6',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCard: {
    width: '48%',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  metricValue: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    marginTop: 8,
  },
  metricLabel: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 4,
  },
  productionCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
  },
  productionRow: {
    flexDirection: 'row',
  },
  productionItem: {
    flex: 1,
  },
  productionLabel: {
    color: '#94A3B8',
    fontSize: 12,
  },
  productionValue: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 4,
  },
  productionDivider: {
    height: 1,
    backgroundColor: '#334155',
    marginVertical: 12,
  },
  followUpCard: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
  },
  followUpItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  followUpIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  followUpValue: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
  },
  followUpLabel: {
    color: '#94A3B8',
    fontSize: 12,
  },
  followUpDivider: {
    width: 1,
    backgroundColor: '#334155',
    marginHorizontal: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    color: '#64748B',
    fontSize: 14,
    marginTop: 8,
  },
  leadCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  leadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leadName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
  },
  stageBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  stageBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
  leadMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: 12,
  },
  leadMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  leadMetaText: {
    color: '#64748B',
    fontSize: 12,
  },
  leadDate: {
    color: '#475569',
    fontSize: 11,
    marginTop: 8,
  },
  moreText: {
    color: '#64748B',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
  },
  pipelineItem: {
    marginBottom: 12,
  },
  pipelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  pipelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  pipelineLabel: {
    color: '#E2E8F0',
    fontSize: 14,
    flex: 1,
  },
  pipelineCount: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  pipelineBar: {
    height: 8,
    backgroundColor: '#334155',
    borderRadius: 4,
    overflow: 'hidden',
  },
  pipelineBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  scopeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  scopeInfo: {
    flex: 1,
    marginLeft: 12,
  },
  scopeName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  scopeDate: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 2,
  },
  scopePdfBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#22C55E20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  scopePdfText: {
    color: '#22C55E',
    fontSize: 11,
    fontWeight: '500',
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  activityIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3B82F620',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  activityContent: {
    flex: 1,
  },
  activityDescription: {
    color: '#E2E8F0',
    fontSize: 14,
  },
  activityTime: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 2,
  },
});
