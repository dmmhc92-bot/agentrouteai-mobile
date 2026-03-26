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
  Linking,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';

interface PlannerAction {
  id: string;
  type: string;
  priority: number;
  priority_label: string;
  title: string;
  description: string;
  time?: string;
  phone?: string;
  icon: string;
  color: string;
  action_text: string;
  record_type: string;
  record_id: string;
  lead_id?: string;
  lead_name?: string;
  address?: string;
  area?: string;
  reason: string;
}

interface PlannerSummary {
  total_actions: number;
  high_priority: number;
  medium_priority: number;
  low_priority: number;
  appointments_today: number;
  overdue_items: number;
  date: string;
  greeting: string;
}

interface DailyPlan {
  plan_date: string;
  generated_at: string;
  agent_id: string;
  agent_name: string;
  summary: PlannerSummary;
  actions: PlannerAction[];
}

interface TeamAgentSummary {
  agent_id: string;
  agent_name: string;
  agent_email: string;
  appointments_today: number;
  overdue_tasks: number;
  leads_to_contact: number;
  underwriting_pending: number;
  total_action_items: number;
  activity_score: number;
  needs_attention: boolean;
}

export default function DailyPlannerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dailyPlan, setDailyPlan] = useState<DailyPlan | null>(null);
  const [teamSummary, setTeamSummary] = useState<any>(null);
  const [completedActions, setCompletedActions] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'my_plan' | 'team'>('my_plan');

  const isManagerOrAdmin = user?.role === 'admin' || user?.role === 'manager';

  const loadData = async () => {
    try {
      const planData = await api.getDailyPlanner();
      setDailyPlan(planData);
      
      if (isManagerOrAdmin) {
        const teamData = await api.getTeamPlannerSummary();
        setTeamSummary(teamData);
      }
    } catch (error: any) {
      console.error('Error loading daily planner:', error);
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

  const handleActionPress = (action: PlannerAction) => {
    switch (action.record_type) {
      case 'lead':
        router.push(`/lead/${action.lead_id || action.record_id}`);
        break;
      case 'appointment':
        router.push(`/appointment/${action.record_id}`);
        break;
      case 'task':
        // Tasks don't have a dedicated screen, show alert
        Alert.alert(
          'Task Action',
          `${action.title}\n\n${action.description}`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Mark Complete',
              onPress: () => handleCompleteAction(action),
            },
          ]
        );
        break;
      default:
        if (action.lead_id) {
          router.push(`/lead/${action.lead_id}`);
        }
    }
  };

  const handleCompleteAction = async (action: PlannerAction) => {
    try {
      await api.completePlannerAction(
        action.type,
        action.record_id,
        action.lead_id,
        `Completed from daily planner`
      );
      setCompletedActions(prev => new Set([...prev, action.id]));
    } catch (error) {
      console.error('Error completing action:', error);
    }
  };

  const handleCallLead = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  const getPriorityStyle = (priority: number) => {
    if (priority <= 2) return { badge: styles.priorityHigh, text: styles.priorityHighText };
    if (priority <= 4) return { badge: styles.priorityMedium, text: styles.priorityMediumText };
    return { badge: styles.priorityLow, text: styles.priorityLowText };
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Generating your smart plan...</Text>
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
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Today's Smart Plan</Text>
          <Text style={styles.headerSubtitle}>
            {dailyPlan?.plan_date ? new Date(dailyPlan.plan_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) : ''}
          </Text>
        </View>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshButton}>
          <Ionicons name="refresh" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Tabs for Managers/Admins */}
      {isManagerOrAdmin && (
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'my_plan' && styles.tabActive]}
            onPress={() => setActiveTab('my_plan')}
          >
            <Ionicons name="person" size={16} color={activeTab === 'my_plan' ? '#3B82F6' : '#64748B'} />
            <Text style={[styles.tabText, activeTab === 'my_plan' && styles.tabTextActive]}>My Plan</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'team' && styles.tabActive]}
            onPress={() => setActiveTab('team')}
          >
            <Ionicons name="people" size={16} color={activeTab === 'team' ? '#3B82F6' : '#64748B'} />
            <Text style={[styles.tabText, activeTab === 'team' && styles.tabTextActive]}>Team Summary</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />
        }
      >
        {activeTab === 'my_plan' && dailyPlan && (
          <>
            {/* Greeting Card */}
            <View style={styles.greetingCard}>
              <Text style={styles.greetingText}>
                {dailyPlan.summary.greeting}, {dailyPlan.agent_name?.split(' ')[0]}! 👋
              </Text>
              <Text style={styles.greetingSubtext}>
                You have {dailyPlan.summary.total_actions} action{dailyPlan.summary.total_actions !== 1 ? 's' : ''} planned for today
              </Text>
            </View>

            {/* Summary Cards */}
            <View style={styles.summaryGrid}>
              <View style={[styles.summaryCard, { borderColor: '#EF4444' }]}>
                <View style={[styles.summaryIcon, { backgroundColor: '#EF444420' }]}>
                  <Ionicons name="alert-circle" size={18} color="#EF4444" />
                </View>
                <Text style={styles.summaryValue}>{dailyPlan.summary.high_priority}</Text>
                <Text style={styles.summaryLabel}>High Priority</Text>
              </View>
              <View style={[styles.summaryCard, { borderColor: '#3B82F6' }]}>
                <View style={[styles.summaryIcon, { backgroundColor: '#3B82F620' }]}>
                  <Ionicons name="calendar" size={18} color="#3B82F6" />
                </View>
                <Text style={styles.summaryValue}>{dailyPlan.summary.appointments_today}</Text>
                <Text style={styles.summaryLabel}>Appointments</Text>
              </View>
              <View style={[styles.summaryCard, { borderColor: '#F59E0B' }]}>
                <View style={[styles.summaryIcon, { backgroundColor: '#F59E0B20' }]}>
                  <Ionicons name="time" size={18} color="#F59E0B" />
                </View>
                <Text style={styles.summaryValue}>{dailyPlan.summary.overdue_items}</Text>
                <Text style={styles.summaryLabel}>Overdue</Text>
              </View>
            </View>

            {/* Action List */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Your Action Plan</Text>
              
              {dailyPlan.actions.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="checkmark-circle" size={64} color="#22C55E" />
                  <Text style={styles.emptyText}>All caught up!</Text>
                  <Text style={styles.emptySubtext}>No pending actions for today</Text>
                </View>
              ) : (
                dailyPlan.actions.map((action, index) => {
                  const isCompleted = completedActions.has(action.id);
                  const priorityStyle = getPriorityStyle(action.priority);
                  
                  return (
                    <TouchableOpacity
                      key={action.id}
                      style={[styles.actionCard, isCompleted && styles.actionCardCompleted]}
                      onPress={() => handleActionPress(action)}
                      disabled={isCompleted}
                    >
                      <View style={styles.actionLeft}>
                        <View style={[styles.actionIcon, { backgroundColor: action.color + '20' }]}>
                          <Ionicons
                            name={action.icon as any}
                            size={20}
                            color={isCompleted ? '#64748B' : action.color}
                          />
                        </View>
                        {action.time && (
                          <View style={styles.timeChip}>
                            <Text style={styles.timeChipText}>{action.time}</Text>
                          </View>
                        )}
                      </View>
                      
                      <View style={styles.actionContent}>
                        <View style={styles.actionHeader}>
                          <Text style={[styles.actionTitle, isCompleted && styles.actionTitleCompleted]}>
                            {action.title}
                          </Text>
                          <View style={[priorityStyle.badge]}>
                            <Text style={priorityStyle.text}>{action.priority_label}</Text>
                          </View>
                        </View>
                        <Text style={styles.actionDescription}>{action.description}</Text>
                        {action.reason && (
                          <Text style={styles.actionReason}>
                            <Ionicons name="bulb" size={12} color="#F59E0B" /> {action.reason}
                          </Text>
                        )}
                      </View>
                      
                      <View style={styles.actionRight}>
                        {action.phone && !isCompleted && (
                          <TouchableOpacity
                            style={styles.callButton}
                            onPress={() => handleCallLead(action.phone!)}
                          >
                            <Ionicons name="call" size={18} color="#22C55E" />
                          </TouchableOpacity>
                        )}
                        {isCompleted ? (
                          <Ionicons name="checkmark-circle" size={24} color="#22C55E" />
                        ) : (
                          <TouchableOpacity
                            style={styles.completeButton}
                            onPress={() => handleCompleteAction(action)}
                          >
                            <Ionicons name="checkmark" size={18} color="#64748B" />
                          </TouchableOpacity>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          </>
        )}

        {activeTab === 'team' && teamSummary && (
          <>
            {/* Team Overview */}
            <View style={styles.teamOverview}>
              <View style={styles.teamOverviewItem}>
                <Text style={styles.teamOverviewValue}>{teamSummary.total_agents}</Text>
                <Text style={styles.teamOverviewLabel}>Team Members</Text>
              </View>
              <View style={styles.teamOverviewDivider} />
              <View style={styles.teamOverviewItem}>
                <Text style={[styles.teamOverviewValue, { color: '#EF4444' }]}>
                  {teamSummary.agents_needing_attention}
                </Text>
                <Text style={styles.teamOverviewLabel}>Need Attention</Text>
              </View>
              <View style={styles.teamOverviewDivider} />
              <View style={styles.teamOverviewItem}>
                <Text style={styles.teamOverviewValue}>{teamSummary.total_appointments_today}</Text>
                <Text style={styles.teamOverviewLabel}>Appointments</Text>
              </View>
            </View>

            {/* Team List */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Team Activity</Text>
              
              {teamSummary.team_summary.map((agent: TeamAgentSummary) => (
                <TouchableOpacity
                  key={agent.agent_id}
                  style={[
                    styles.teamAgentCard,
                    agent.needs_attention && styles.teamAgentCardAlert,
                  ]}
                  onPress={() => router.push(`/command-center/${agent.agent_id}`)}
                >
                  <View style={styles.teamAgentHeader}>
                    <View style={styles.teamAgentAvatar}>
                      <Text style={styles.teamAgentAvatarText}>
                        {agent.agent_name.charAt(0).toUpperCase()}
                      </Text>
                      {agent.needs_attention && (
                        <View style={styles.attentionDot} />
                      )}
                    </View>
                    <View style={styles.teamAgentInfo}>
                      <Text style={styles.teamAgentName}>{agent.agent_name}</Text>
                      <Text style={styles.teamAgentEmail}>{agent.agent_email}</Text>
                    </View>
                    <View style={[
                      styles.activityScore,
                      { backgroundColor: agent.activity_score >= 70 ? '#22C55E20' : agent.activity_score >= 40 ? '#F59E0B20' : '#EF444420' }
                    ]}>
                      <Text style={[
                        styles.activityScoreText,
                        { color: agent.activity_score >= 70 ? '#22C55E' : agent.activity_score >= 40 ? '#F59E0B' : '#EF4444' }
                      ]}>
                        {agent.activity_score}%
                      </Text>
                    </View>
                  </View>
                  
                  <View style={styles.teamAgentStats}>
                    <View style={styles.teamAgentStatItem}>
                      <Text style={styles.teamAgentStatValue}>{agent.appointments_today}</Text>
                      <Text style={styles.teamAgentStatLabel}>Appointments</Text>
                    </View>
                    <View style={styles.teamAgentStatItem}>
                      <Text style={[styles.teamAgentStatValue, agent.overdue_tasks > 0 && { color: '#EF4444' }]}>
                        {agent.overdue_tasks}
                      </Text>
                      <Text style={styles.teamAgentStatLabel}>Overdue</Text>
                    </View>
                    <View style={styles.teamAgentStatItem}>
                      <Text style={styles.teamAgentStatValue}>{agent.leads_to_contact}</Text>
                      <Text style={styles.teamAgentStatLabel}>To Contact</Text>
                    </View>
                    <View style={styles.teamAgentStatItem}>
                      <Text style={styles.teamAgentStatValue}>{agent.underwriting_pending}</Text>
                      <Text style={styles.teamAgentStatLabel}>Underwriting</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </>
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
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  headerSubtitle: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  refreshButton: {
    padding: 8,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
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
  greetingCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  greetingText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
  },
  greetingSubtext: {
    color: '#94A3B8',
    fontSize: 14,
    marginTop: 4,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderLeftWidth: 3,
  },
  summaryIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryValue: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
  },
  summaryLabel: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 4,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtext: {
    color: '#94A3B8',
    fontSize: 14,
    marginTop: 4,
  },
  actionCard: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    alignItems: 'flex-start',
  },
  actionCardCompleted: {
    opacity: 0.6,
    backgroundColor: '#1E293B80',
  },
  actionLeft: {
    marginRight: 12,
    alignItems: 'center',
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timeChip: {
    backgroundColor: '#334155',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 6,
  },
  timeChipText: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '500',
  },
  actionContent: {
    flex: 1,
  },
  actionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  actionTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
  },
  actionTitleCompleted: {
    textDecorationLine: 'line-through',
    color: '#64748B',
  },
  actionDescription: {
    color: '#94A3B8',
    fontSize: 13,
    marginBottom: 4,
  },
  actionReason: {
    color: '#F59E0B',
    fontSize: 11,
    marginTop: 4,
  },
  priorityHigh: {
    backgroundColor: '#EF444420',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  priorityHighText: {
    color: '#EF4444',
    fontSize: 10,
    fontWeight: '600',
  },
  priorityMedium: {
    backgroundColor: '#F59E0B20',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  priorityMediumText: {
    color: '#F59E0B',
    fontSize: 10,
    fontWeight: '600',
  },
  priorityLow: {
    backgroundColor: '#64748B20',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  priorityLowText: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '600',
  },
  actionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  callButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#22C55E20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  completeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Team Summary styles
  teamOverview: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  teamOverviewItem: {
    flex: 1,
    alignItems: 'center',
  },
  teamOverviewValue: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
  },
  teamOverviewLabel: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 4,
  },
  teamOverviewDivider: {
    width: 1,
    backgroundColor: '#334155',
    marginHorizontal: 8,
  },
  teamAgentCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  teamAgentCardAlert: {
    borderWidth: 1,
    borderColor: '#EF444440',
  },
  teamAgentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  teamAgentAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    position: 'relative',
  },
  teamAgentAvatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  attentionDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: '#1E293B',
  },
  teamAgentInfo: {
    flex: 1,
  },
  teamAgentName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
  },
  teamAgentEmail: {
    color: '#64748B',
    fontSize: 12,
  },
  activityScore: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  activityScoreText: {
    fontSize: 14,
    fontWeight: '700',
  },
  teamAgentStats: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 10,
  },
  teamAgentStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  teamAgentStatValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  teamAgentStatLabel: {
    color: '#64748B',
    fontSize: 10,
    marginTop: 2,
  },
});
