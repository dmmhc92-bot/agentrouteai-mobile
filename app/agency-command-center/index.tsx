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
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';

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

const GRADE_CONFIG: Record<string, { bg: string; text: string; glow: string }> = {
  'A': { bg: '#10B981', text: '#FFFFFF', glow: '#10B98140' },
  'B': { bg: '#3B82F6', text: '#FFFFFF', glow: '#3B82F640' },
  'C': { bg: '#F59E0B', text: '#FFFFFF', glow: '#F59E0B40' },
  'D': { bg: '#EF4444', text: '#FFFFFF', glow: '#EF444440' },
  'F': { bg: '#DC2626', text: '#FFFFFF', glow: '#DC262640' },
};

export default function AgencyCommandCenterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [summary, setSummary] = useState<TeamSummary | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'attention'>('all');

  const isManagerOrAdmin = user?.role === 'admin' || user?.role === 'manager';

  const loadData = async () => {
    if (!isManagerOrAdmin) {
      setIsLoading(false);
      return;
    }

    try {
      const [agentsResponse] = await Promise.all([
        api.getTeamAgents().catch(() => []),
      ]);

      const agentsList = Array.isArray(agentsResponse) ? agentsResponse : [];
      setAgents(agentsList);

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
    if (!lastLogin) return { label: 'Offline', color: '#94A3B8', dotColor: '#CBD5E1', isActive: false };
    const hours = (Date.now() - new Date(lastLogin).getTime()) / (1000 * 60 * 60);
    if (hours < 1) return { label: 'Online', color: '#10B981', dotColor: '#10B981', isActive: true };
    if (hours < 24) return { label: 'Today', color: '#10B981', dotColor: '#10B981', isActive: true };
    if (hours < 72) return { label: '2-3 days', color: '#F59E0B', dotColor: '#F59E0B', isActive: false };
    return { label: 'Inactive', color: '#EF4444', dotColor: '#EF4444', isActive: false };
  };

  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
    return `$${amount.toFixed(0)}`;
  };

  const filteredAgents = agents.filter(agent => {
    if (activeFilter === 'all') return true;
    const status = getActivityStatus(agent.last_login);
    if (activeFilter === 'active') return status.isActive;
    if (activeFilter === 'attention') {
      return agent.scorecard_grade === 'D' || agent.scorecard_grade === 'F' || !status.isActive;
    }
    return true;
  });

  const sortedAgents = [...filteredAgents].sort((a, b) => {
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
            <Ionicons name="shield" size={48} color="#3B82F6" />
          </View>
          <Text style={styles.accessDeniedTitle}>Access Restricted</Text>
          <Text style={styles.accessDeniedText}>
            Command Center is available for Managers and Administrators only.
          </Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>Return to Dashboard</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading Team Data...</Text>
        </View>
      </View>
    );
  }

  const attentionCount = agents.filter(a => 
    a.scorecard_grade === 'D' || a.scorecard_grade === 'F' || !getActivityStatus(a.last_login).isActive
  ).length;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBack}>
          <Ionicons name="arrow-back" size={24} color="#1E3A5F" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Command Center</Text>
          <View style={styles.roleBadge}>
            <Ionicons 
              name={user?.role === 'admin' ? 'shield-checkmark' : 'people'} 
              size={12} 
              color="#3B82F6" 
            />
            <Text style={styles.roleBadgeText}>
              {user?.role === 'admin' ? 'ADMINISTRATOR' : 'MANAGER'}
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={onRefresh} style={styles.headerRefresh}>
          <Ionicons name="refresh" size={22} color="#64748B" />
        </TouchableOpacity>
      </View>

      {/* Hero Stats */}
      <View style={styles.heroSection}>
        <View style={styles.heroStatsRow}>
          <View style={styles.heroStatMain}>
            <View style={styles.heroStatIconWrap}>
              <Ionicons name="people" size={28} color="#FFFFFF" />
            </View>
            <Text style={styles.heroStatNumber}>{summary?.total_agents || 0}</Text>
            <Text style={styles.heroStatLabel}>Total Agents</Text>
          </View>
          
          <View style={styles.heroStatDivider} />
          
          <View style={styles.heroStatSecondary}>
            <View style={[styles.heroMiniStat, styles.heroMiniStatGreen]}>
              <Ionicons name="pulse" size={16} color="#10B981" />
              <Text style={[styles.heroMiniNumber, { color: '#10B981' }]}>{summary?.active_today || 0}</Text>
              <Text style={styles.heroMiniLabel}>Active</Text>
            </View>
            <View style={[styles.heroMiniStat, styles.heroMiniStatOrange]}>
              <Ionicons name="alert-circle" size={16} color="#F59E0B" />
              <Text style={[styles.heroMiniNumber, { color: '#F59E0B' }]}>{attentionCount}</Text>
              <Text style={styles.heroMiniLabel}>Attention</Text>
            </View>
          </View>
        </View>

        {/* Quick Metrics */}
        <View style={styles.quickMetricsRow}>
          <View style={styles.quickMetric}>
            <Ionicons name="person-add" size={18} color="#60A5FA" />
            <Text style={styles.quickMetricValue}>{summary?.total_leads || 0}</Text>
            <Text style={styles.quickMetricLabel}>Leads</Text>
          </View>
          <View style={styles.quickMetric}>
            <Ionicons name="calendar" size={18} color="#A78BFA" />
            <Text style={styles.quickMetricValue}>{summary?.total_appointments || 0}</Text>
            <Text style={styles.quickMetricLabel}>Appts</Text>
          </View>
          <View style={styles.quickMetric}>
            <Ionicons name="document-text" size={18} color="#F472B6" />
            <Text style={styles.quickMetricValue}>{summary?.total_policies || 0}</Text>
            <Text style={styles.quickMetricLabel}>Policies</Text>
          </View>
          <View style={styles.quickMetric}>
            <Ionicons name="trending-up" size={18} color="#34D399" />
            <Text style={[styles.quickMetricValue, { color: '#10B981' }]}>
              {formatCurrency(summary?.total_premium || 0)}
            </Text>
            <Text style={styles.quickMetricLabel}>Production</Text>
          </View>
        </View>
      </View>

      {/* Filter Section */}
      <View style={styles.filterSection}>
        <Text style={styles.sectionTitle}>Team Members</Text>
        <View style={styles.filterPills}>
          {[
            { key: 'all', label: `All (${agents.length})`, icon: 'grid' },
            { key: 'active', label: 'Active', icon: 'checkmark-circle' },
            { key: 'attention', label: 'Attention', icon: 'warning' },
          ].map((filter) => (
            <TouchableOpacity
              key={filter.key}
              style={[styles.filterPill, activeFilter === filter.key && styles.filterPillActive]}
              onPress={() => setActiveFilter(filter.key as any)}
            >
              <Ionicons 
                name={filter.icon as any} 
                size={14} 
                color={activeFilter === filter.key ? '#FFFFFF' : '#64748B'} 
              />
              <Text style={[styles.filterPillText, activeFilter === filter.key && styles.filterPillTextActive]}>
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
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />
        }
        showsVerticalScrollIndicator={false}
      >
        {sortedAgents.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={64} color="#94A3B8" />
            <Text style={styles.emptyTitle}>No Agents Found</Text>
            <Text style={styles.emptyText}>
              {activeFilter !== 'all' ? 'Try a different filter' : 'Add team members to get started'}
            </Text>
          </View>
        ) : (
          sortedAgents.map((agent) => {
            const activity = getActivityStatus(agent.last_login);
            const gradeConfig = GRADE_CONFIG[agent.scorecard_grade || 'C'] || GRADE_CONFIG['C'];
            const needsAttention = agent.scorecard_grade === 'D' || agent.scorecard_grade === 'F';

            return (
              <TouchableOpacity
                key={agent.id}
                style={[styles.agentCard, needsAttention && styles.agentCardAttention]}
                onPress={() => router.push(`/command-center/${agent.id}`)}
                activeOpacity={0.7}
              >
                {/* Card Header */}
                <View style={styles.cardHeader}>
                  <View style={styles.agentIdentity}>
                    <View style={styles.avatarContainer}>
                      <View style={[styles.avatar, { backgroundColor: '#E0E7FF' }]}>
                        <Text style={styles.avatarText}>{agent.name.charAt(0).toUpperCase()}</Text>
                      </View>
                      <View style={[styles.statusDot, { backgroundColor: activity.dotColor }]} />
                    </View>
                    <View style={styles.agentDetails}>
                      <View style={styles.nameRow}>
                        <Text style={styles.agentName} numberOfLines={1}>{agent.name}</Text>
                        {agent.scorecard_grade && (
                          <View style={[styles.gradeBadge, { backgroundColor: gradeConfig.bg }]}>
                            <Text style={styles.gradeText}>{agent.scorecard_grade}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.agentEmail} numberOfLines={1}>{agent.email}</Text>
                      <View style={styles.statusRow}>
                        <View style={[styles.statusPill, { backgroundColor: activity.dotColor + '20' }]}>
                          <View style={[styles.statusPillDot, { backgroundColor: activity.dotColor }]} />
                          <Text style={[styles.statusPillText, { color: activity.color }]}>{activity.label}</Text>
                        </View>
                        {agent.role !== 'agent' && (
                          <View style={styles.rolePill}>
                            <Text style={styles.rolePillText}>{agent.role}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
                </View>

                {/* Metrics Row */}
                <View style={styles.metricsRow}>
                  <View style={styles.metricBox}>
                    <Text style={styles.metricNumber}>{agent.leads_count || 0}</Text>
                    <Text style={styles.metricLabel}>Leads</Text>
                  </View>
                  <View style={styles.metricDivider} />
                  <View style={styles.metricBox}>
                    <Text style={styles.metricNumber}>{agent.appointments_today || 0}</Text>
                    <Text style={styles.metricLabel}>Appts</Text>
                  </View>
                  <View style={styles.metricDivider} />
                  <View style={styles.metricBox}>
                    <Text style={styles.metricNumber}>{agent.policies_issued || 0}</Text>
                    <Text style={styles.metricLabel}>Policies</Text>
                  </View>
                  <View style={styles.metricDivider} />
                  <View style={styles.metricBox}>
                    <Text style={[styles.metricNumber, { color: '#10B981' }]}>
                      {formatCurrency(agent.total_premium || 0)}
                    </Text>
                    <Text style={styles.metricLabel}>Production</Text>
                  </View>
                </View>

                {/* Quick Actions */}
                <View style={styles.actionsRow}>
                  <TouchableOpacity 
                    style={styles.actionBtn}
                    onPress={() => router.push(`/command-center/${agent.id}`)}
                  >
                    <Ionicons name="stats-chart" size={14} color="#3B82F6" />
                    <Text style={styles.actionBtnText}>Performance</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.actionBtn, styles.actionBtnSecondary]}
                    onPress={() => router.push('/pipeline')}
                  >
                    <Ionicons name="git-branch" size={14} color="#8B5CF6" />
                    <Text style={[styles.actionBtnText, { color: '#8B5CF6' }]}>Pipeline</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          })
        )}

        {/* Bottom spacing */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EFF6FF', // Soft blue background
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#475569',
    marginTop: 12,
    fontSize: 14,
  },
  accessDenied: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  accessDeniedIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#DBEAFE',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  accessDeniedTitle: {
    color: '#1E3A5F',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  accessDeniedText: {
    color: '#64748B',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  backBtn: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 24,
  },
  backBtnText: {
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
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
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
    color: '#1E3A5F',
    fontSize: 18,
    fontWeight: '700',
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 4,
    gap: 4,
  },
  roleBadgeText: {
    color: '#3B82F6',
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
  heroSection: {
    backgroundColor: '#1E40AF', // Deep blue hero
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  heroStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroStatMain: {
    flex: 1,
    alignItems: 'center',
  },
  heroStatIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  heroStatNumber: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '800',
  },
  heroStatLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    marginTop: 2,
  },
  heroStatDivider: {
    width: 1,
    height: 80,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginHorizontal: 20,
  },
  heroStatSecondary: {
    flex: 1,
    gap: 12,
  },
  heroMiniStat: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    gap: 10,
  },
  heroMiniStatGreen: {
    borderLeftWidth: 3,
    borderLeftColor: '#10B981',
  },
  heroMiniStatOrange: {
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
  },
  heroMiniNumber: {
    fontSize: 20,
    fontWeight: '800',
  },
  heroMiniLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  quickMetricsRow: {
    flexDirection: 'row',
    marginTop: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingVertical: 12,
  },
  quickMetric: {
    flex: 1,
    alignItems: 'center',
  },
  quickMetricValue: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4,
  },
  quickMetricLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
    marginTop: 2,
  },
  filterSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  sectionTitle: {
    color: '#1E3A5F',
    fontSize: 16,
    fontWeight: '700',
  },
  filterPills: {
    flexDirection: 'row',
    gap: 8,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  filterPillActive: {
    backgroundColor: '#3B82F6',
  },
  filterPillText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '500',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    color: '#1E3A5F',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptyText: {
    color: '#64748B',
    fontSize: 14,
    marginTop: 8,
  },
  agentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: '#1E40AF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    overflow: 'hidden',
  },
  agentCardAttention: {
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  agentIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 14,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#3B82F6',
    fontSize: 20,
    fontWeight: '700',
  },
  statusDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  agentDetails: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  agentName: {
    color: '#1E3A5F',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  gradeBadge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gradeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  agentEmail: {
    color: '#64748B',
    fontSize: 13,
    marginTop: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 8,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    gap: 4,
  },
  statusPillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  rolePill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  rolePillText: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  metricsRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  metricBox: {
    flex: 1,
    alignItems: 'center',
  },
  metricNumber: {
    color: '#1E3A5F',
    fontSize: 18,
    fontWeight: '700',
  },
  metricLabel: {
    color: '#94A3B8',
    fontSize: 10,
    marginTop: 2,
  },
  metricDivider: {
    width: 1,
    backgroundColor: '#E2E8F0',
  },
  actionsRow: {
    flexDirection: 'row',
    padding: 12,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  actionBtnSecondary: {
    backgroundColor: '#F5F3FF',
  },
  actionBtnText: {
    color: '#3B82F6',
    fontSize: 12,
    fontWeight: '600',
  },
});
