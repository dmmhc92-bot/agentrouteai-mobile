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
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';

interface AgentData {
  id: string;
  name: string;
  email: string;
  role: string;
  phone?: string;
  leads_count: number;
  appointments_today: number;
  policies_issued: number;
  total_premium: number;
  last_login: string | null;
  scorecard_grade?: string;
}

interface TeamSummary {
  total_agents: number;
  active_today: number;
  total_leads: number;
  total_appointments: number;
  total_policies: number;
  total_premium: number;
}

const GRADE_COLORS: Record<string, { bg: string; text: string }> = {
  'A': { bg: '#DCFCE7', text: '#166534' },
  'B': { bg: '#DBEAFE', text: '#1E40AF' },
  'C': { bg: '#FEF9C3', text: '#A16207' },
  'D': { bg: '#FEE2E2', text: '#B91C1C' },
  'F': { bg: '#FEE2E2', text: '#991B1B' },
};

export default function AgencyCommandCenterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [summary, setSummary] = useState<TeamSummary | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const isManagerOrAdmin = user?.role === 'admin' || user?.role === 'manager';

  const loadData = async () => {
    if (!isManagerOrAdmin) {
      setIsLoading(false);
      return;
    }

    try {
      const [agentsResponse, snapshotResponse] = await Promise.all([
        api.getTeamAgents().catch(() => []),
        api.getTeamSnapshot().catch(() => null),
      ]);

      const agentsList = Array.isArray(agentsResponse) ? agentsResponse : [];
      setAgents(agentsList);

      // Calculate summary
      const activeTodayCount = agentsList.filter(a => {
        if (!a.last_login) return false;
        const hours = (Date.now() - new Date(a.last_login).getTime()) / (1000 * 60 * 60);
        return hours < 24;
      }).length;

      setSummary({
        total_agents: agentsList.length,
        active_today: activeTodayCount,
        total_leads: agentsList.reduce((sum, a) => sum + (a.leads_count || 0), 0),
        total_appointments: agentsList.reduce((sum, a) => sum + (a.appointments_today || 0), 0),
        total_policies: agentsList.reduce((sum, a) => sum + (a.policies_issued || 0), 0),
        total_premium: agentsList.reduce((sum, a) => sum + (a.total_premium || 0), 0),
      });
    } catch (error) {
      console.error('Error loading command center:', error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const getActivityStatus = (lastLogin: string | null) => {
    if (!lastLogin) return { label: 'Never', color: '#9CA3AF', dotColor: '#D1D5DB' };
    const hours = (Date.now() - new Date(lastLogin).getTime()) / (1000 * 60 * 60);
    if (hours < 1) return { label: 'Online', color: '#059669', dotColor: '#10B981' };
    if (hours < 24) return { label: 'Today', color: '#059669', dotColor: '#10B981' };
    if (hours < 72) return { label: '2-3 days', color: '#D97706', dotColor: '#F59E0B' };
    return { label: 'Inactive', color: '#DC2626', dotColor: '#EF4444' };
  };

  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
    return `$${amount.toFixed(0)}`;
  };

  const filteredAgents = agents.filter(agent => {
    if (activeFilter === 'all') return true;
    const status = getActivityStatus(agent.last_login);
    if (activeFilter === 'active') return status.label === 'Online' || status.label === 'Today';
    return status.label === 'Inactive' || status.label === 'Never';
  });

  const sortedAgents = [...filteredAgents].sort((a, b) => {
    // Sort by last_login (most recent first), then by leads_count
    const aTime = a.last_login ? new Date(a.last_login).getTime() : 0;
    const bTime = b.last_login ? new Date(b.last_login).getTime() : 0;
    if (bTime !== aTime) return bTime - aTime;
    return (b.leads_count || 0) - (a.leads_count || 0);
  });

  if (!isManagerOrAdmin) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.accessDenied}>
          <View style={styles.accessDeniedIcon}>
            <Ionicons name="lock-closed" size={48} color="#DC2626" />
          </View>
          <Text style={styles.accessDeniedTitle}>Access Restricted</Text>
          <Text style={styles.accessDeniedText}>
            Command Center is only available for Managers and Administrators.
          </Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Loading Team Data...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBack}>
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Command Center</Text>
          <View style={[styles.roleBadge, { backgroundColor: user?.role === 'admin' ? '#DBEAFE' : '#E0E7FF' }]}>
            <Text style={[styles.roleBadgeText, { color: user?.role === 'admin' ? '#1E40AF' : '#4338CA' }]}>
              {user?.role === 'admin' ? 'ADMIN' : 'MANAGER'}
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={onRefresh} style={styles.headerRefresh}>
          <Ionicons name="refresh" size={22} color="#6B7280" />
        </TouchableOpacity>
      </View>

      {/* Summary Stats */}
      <View style={styles.summaryContainer}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <View style={[styles.summaryIcon, { backgroundColor: '#DBEAFE' }]}>
              <Ionicons name="people" size={20} color="#2563EB" />
            </View>
            <Text style={styles.summaryValue}>{summary?.total_agents || 0}</Text>
            <Text style={styles.summaryLabel}>Agents</Text>
          </View>
          <View style={styles.summaryCard}>
            <View style={[styles.summaryIcon, { backgroundColor: '#D1FAE5' }]}>
              <Ionicons name="pulse" size={20} color="#059669" />
            </View>
            <Text style={[styles.summaryValue, { color: '#059669' }]}>{summary?.active_today || 0}</Text>
            <Text style={styles.summaryLabel}>Active Today</Text>
          </View>
          <View style={styles.summaryCard}>
            <View style={[styles.summaryIcon, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="person-add" size={20} color="#D97706" />
            </View>
            <Text style={styles.summaryValue}>{summary?.total_leads || 0}</Text>
            <Text style={styles.summaryLabel}>Total Leads</Text>
          </View>
          <View style={styles.summaryCard}>
            <View style={[styles.summaryIcon, { backgroundColor: '#DCFCE7' }]}>
              <Ionicons name="cash" size={20} color="#16A34A" />
            </View>
            <Text style={[styles.summaryValue, { color: '#16A34A' }]}>{formatCurrency(summary?.total_premium || 0)}</Text>
            <Text style={styles.summaryLabel}>Production</Text>
          </View>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        <Text style={styles.sectionTitle}>Team Members</Text>
        <View style={styles.filterTabs}>
          {[
            { key: 'all', label: 'All' },
            { key: 'active', label: 'Active' },
            { key: 'inactive', label: 'Inactive' },
          ].map((filter) => (
            <TouchableOpacity
              key={filter.key}
              style={[styles.filterTab, activeFilter === filter.key && styles.filterTabActive]}
              onPress={() => setActiveFilter(filter.key as any)}
            >
              <Text style={[styles.filterTabText, activeFilter === filter.key && styles.filterTabTextActive]}>
                {filter.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Agent List */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />
        }
        showsVerticalScrollIndicator={false}
      >
        {sortedAgents.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={56} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>No Agents Found</Text>
            <Text style={styles.emptyText}>
              {activeFilter !== 'all' ? 'Try changing your filter' : 'Add team members to get started'}
            </Text>
          </View>
        ) : (
          sortedAgents.map((agent) => {
            const activity = getActivityStatus(agent.last_login);
            const gradeColors = GRADE_COLORS[agent.scorecard_grade || 'C'] || GRADE_COLORS['C'];

            return (
              <TouchableOpacity
                key={agent.id}
                style={styles.agentCard}
                onPress={() => router.push(`/command-center/${agent.id}`)}
                activeOpacity={0.7}
              >
                {/* Agent Header */}
                <View style={styles.agentHeader}>
                  <View style={styles.agentAvatarSection}>
                    <View style={styles.agentAvatar}>
                      <Text style={styles.agentAvatarText}>
                        {agent.name.charAt(0).toUpperCase()}
                      </Text>
                      <View style={[styles.activityDot, { backgroundColor: activity.dotColor }]} />
                    </View>
                    <View style={styles.agentInfo}>
                      <View style={styles.agentNameRow}>
                        <Text style={styles.agentName} numberOfLines={1}>{agent.name}</Text>
                        {agent.scorecard_grade && (
                          <View style={[styles.gradeBadge, { backgroundColor: gradeColors.bg }]}>
                            <Text style={[styles.gradeText, { color: gradeColors.text }]}>
                              {agent.scorecard_grade}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.agentEmail} numberOfLines={1}>{agent.email}</Text>
                      <View style={styles.activityRow}>
                        <View style={[styles.activityBadge, { backgroundColor: activity.dotColor + '20' }]}>
                          <View style={[styles.activityDotSmall, { backgroundColor: activity.dotColor }]} />
                          <Text style={[styles.activityLabel, { color: activity.color }]}>{activity.label}</Text>
                        </View>
                        {agent.role !== 'agent' && (
                          <View style={styles.rolePill}>
                            <Text style={styles.rolePillText}>{agent.role}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                </View>

                {/* Agent Metrics */}
                <View style={styles.metricsRow}>
                  <View style={styles.metricItem}>
                    <Ionicons name="people-outline" size={16} color="#6B7280" />
                    <Text style={styles.metricValue}>{agent.leads_count || 0}</Text>
                    <Text style={styles.metricLabel}>Leads</Text>
                  </View>
                  <View style={styles.metricDivider} />
                  <View style={styles.metricItem}>
                    <Ionicons name="calendar-outline" size={16} color="#6B7280" />
                    <Text style={styles.metricValue}>{agent.appointments_today || 0}</Text>
                    <Text style={styles.metricLabel}>Appts</Text>
                  </View>
                  <View style={styles.metricDivider} />
                  <View style={styles.metricItem}>
                    <Ionicons name="document-text-outline" size={16} color="#6B7280" />
                    <Text style={styles.metricValue}>{agent.policies_issued || 0}</Text>
                    <Text style={styles.metricLabel}>Policies</Text>
                  </View>
                  <View style={styles.metricDivider} />
                  <View style={styles.metricItem}>
                    <Ionicons name="trending-up" size={16} color="#16A34A" />
                    <Text style={[styles.metricValue, { color: '#16A34A' }]}>
                      {formatCurrency(agent.total_premium || 0)}
                    </Text>
                    <Text style={styles.metricLabel}>Production</Text>
                  </View>
                </View>

                {/* Quick Actions */}
                <View style={styles.quickActionsRow}>
                  <TouchableOpacity 
                    style={styles.quickActionBtn}
                    onPress={() => router.push(`/command-center/${agent.id}`)}
                  >
                    <Ionicons name="bar-chart-outline" size={14} color="#2563EB" />
                    <Text style={styles.quickActionText}>View Details</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.quickActionBtn}
                    onPress={() => router.push('/pipeline')}
                  >
                    <Ionicons name="git-branch-outline" size={14} color="#7C3AED" />
                    <Text style={[styles.quickActionText, { color: '#7C3AED' }]}>Pipeline</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          })
        )}

        {/* Team Total Card */}
        {sortedAgents.length > 0 && (
          <View style={styles.teamTotalCard}>
            <Text style={styles.teamTotalTitle}>Team Totals</Text>
            <View style={styles.teamTotalGrid}>
              <View style={styles.teamTotalItem}>
                <Text style={styles.teamTotalValue}>{summary?.total_leads || 0}</Text>
                <Text style={styles.teamTotalLabel}>Leads</Text>
              </View>
              <View style={styles.teamTotalItem}>
                <Text style={styles.teamTotalValue}>{summary?.total_policies || 0}</Text>
                <Text style={styles.teamTotalLabel}>Policies</Text>
              </View>
              <View style={styles.teamTotalItem}>
                <Text style={[styles.teamTotalValue, { color: '#16A34A' }]}>
                  {formatCurrency(summary?.total_premium || 0)}
                </Text>
                <Text style={styles.teamTotalLabel}>Production</Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    color: '#6B7280',
    marginTop: 12,
    fontSize: 14,
  },
  accessDenied: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#F9FAFB',
  },
  accessDeniedIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  accessDeniedTitle: {
    color: '#1F2937',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  accessDeniedText: {
    color: '#6B7280',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  backButton: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 24,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerBack: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    color: '#1F2937',
    fontSize: 18,
    fontWeight: '700',
  },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 4,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  headerRefresh: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryContainer: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryCard: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  summaryIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryValue: {
    color: '#1F2937',
    fontSize: 18,
    fontWeight: '700',
  },
  summaryLabel: {
    color: '#6B7280',
    fontSize: 11,
    marginTop: 2,
  },
  filterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  sectionTitle: {
    color: '#1F2937',
    fontSize: 16,
    fontWeight: '600',
  },
  filterTabs: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 2,
  },
  filterTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  filterTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  filterTabText: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '500',
  },
  filterTabTextActive: {
    color: '#1F2937',
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    color: '#1F2937',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 14,
    marginTop: 8,
  },
  agentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  agentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  agentAvatarSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  agentAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    position: 'relative',
  },
  agentAvatarText: {
    color: '#4F46E5',
    fontSize: 20,
    fontWeight: '700',
  },
  activityDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  agentInfo: {
    flex: 1,
  },
  agentNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  agentName: {
    color: '#1F2937',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  gradeBadge: {
    width: 24,
    height: 24,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gradeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  agentEmail: {
    color: '#6B7280',
    fontSize: 13,
    marginTop: 2,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 8,
  },
  activityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    gap: 4,
  },
  activityDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  activityLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  rolePill: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  rolePillText: {
    color: '#6B7280',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  metricsRow: {
    flexDirection: 'row',
    backgroundColor: '#F9FAFB',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
  },
  metricValue: {
    color: '#1F2937',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 4,
  },
  metricLabel: {
    color: '#9CA3AF',
    fontSize: 10,
    marginTop: 2,
  },
  metricDivider: {
    width: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 4,
  },
  quickActionsRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  quickActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2FF',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  quickActionText: {
    color: '#2563EB',
    fontSize: 12,
    fontWeight: '600',
  },
  teamTotalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  teamTotalTitle: {
    color: '#1F2937',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  teamTotalGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  teamTotalItem: {
    alignItems: 'center',
  },
  teamTotalValue: {
    color: '#1F2937',
    fontSize: 22,
    fontWeight: '700',
  },
  teamTotalLabel: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 4,
  },
});
