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
import { format, formatDistanceToNow } from 'date-fns';

// Type Definitions
interface SummaryData {
  total_active_agents: number;
  leads_this_week: number;
  appointments_today: number;
  applications_submitted: number;
  policies_issued: number;
  pending_commissions: number;
  paid_commissions: number;
}

interface AgentPerformance {
  id: string;
  name: string;
  email: string;
  role: string;
  total_premium?: number;
  total_commission?: number;
  policies?: number;
  team_size?: number;
  team_premium?: number;
  override_earned?: number;
  last_login: string | null;
  days_since_login?: number;
  leads_last_7_days?: number;
}

interface OverdueFollowup {
  id: string;
  title: string;
  task_type: string;
  due_date: string;
  days_overdue: number;
  agent_id: string;
  agent_name: string;
  lead_id: string | null;
  lead_name: string | null;
}

interface PipelineLead {
  id: string;
  name: string;
  phone: string;
  email: string;
  stage: string;
  created_date: string;
  last_contact_date: string | null;
  agent_id: string;
  agent_name: string;
  is_stalled: boolean;
  days_in_stage: number;
  days_stalled?: number;
}

interface ActivityUser {
  id: string;
  name: string;
  email: string;
  role: string;
  last_login: string | null;
  days_since_login?: number;
  leads_count?: number;
  appointments_today?: number;
  appointment_count?: number;
  appointments?: Array<{
    id: string;
    lead_id: string;
    lead_name: string;
    time: string;
    status: string;
  }>;
  overdue_count?: number;
  leads?: Array<{
    id: string;
    name: string;
    phone: string;
    stage: string;
    days_overdue: number;
  }>;
}

interface TeamPerformance {
  top_producers: AgentPerformance[];
  top_managers: AgentPerformance[];
  lowest_activity: AgentPerformance[];
  overdue_followups: OverdueFollowup[];
}

interface PipelineHealth {
  underwriting_review: PipelineLead[];
  additional_requirements: PipelineLead[];
  approved_cases: PipelineLead[];
  issued_policies: PipelineLead[];
  stalled_cases: PipelineLead[];
}

interface ActivityTracking {
  logged_in_today: ActivityUser[];
  not_logged_recently: ActivityUser[];
  appointments_today: ActivityUser[];
  overdue_lead_activity: ActivityUser[];
}

type SectionType = 'summary' | 'team' | 'pipeline' | 'activity';
type DrilldownType = 
  | 'top_producers' | 'top_managers' | 'lowest_activity' | 'overdue_followups'
  | 'underwriting' | 'additional_req' | 'approved' | 'issued' | 'stalled'
  | 'logged_today' | 'not_logged' | 'apt_today' | 'overdue_activity'
  | null;

const STAGE_LABELS: Record<string, string> = {
  new_lead: 'New',
  new: 'New',
  contacted: 'Contacted',
  follow_up: 'Follow Up',
  appointment_set: 'Appointment Set',
  appointment_scheduled: 'Appointment Set',
  qualified: 'Qualified',
  policy_submitted: 'Policy Submitted',
  application_submitted: 'Policy Submitted',
  underwriting_review: 'Underwriting Review',
  additional_requirements: 'Additional Requirements',
  approved: 'Approved',
  closed_won: 'Closed Won',
  policy_issued: 'Policy Issued',
  policy_placed: 'Policy Placed',
  commission_pending: 'Commission Pending',
  commission_paid: 'Commission Paid',
  closed_lost: 'Closed Lost',
};

export default function AgencyCommandCenterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, isLoading: authLoading } = useAuth();
  
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionType>('summary');
  const [drilldownType, setDrilldownType] = useState<DrilldownType>(null);
  const [showDrilldown, setShowDrilldown] = useState(false);
  
  // Data states
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [teamPerformance, setTeamPerformance] = useState<TeamPerformance | null>(null);
  const [pipelineHealth, setPipelineHealth] = useState<PipelineHealth | null>(null);
  const [activityTracking, setActivityTracking] = useState<ActivityTracking | null>(null);

  const isManagerOrAdmin = user?.role === 'admin' || user?.role === 'manager';

  const loadData = async () => {
    if (!isManagerOrAdmin) {
      setIsLoading(false);
      return;
    }
    
    try {
      const fullData = await api.getAgencyCommandCenterFull();
      setSummary(fullData.summary);
      setTeamPerformance(fullData.team_performance);
      setPipelineHealth(fullData.pipeline_health);
      setActivityTracking(fullData.activity_tracking);
    } catch (error: any) {
      console.error('Error loading agency command center:', error);
      if (error.response?.status === 403) {
        Alert.alert('Access Denied', 'You do not have permission to view the Agency Command Center');
        router.back();
      } else {
        Alert.alert('Error', 'Failed to load agency data');
      }
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && isManagerOrAdmin) {
        loadData();
      } else if (!authLoading) {
        setIsLoading(false);
      }
    }, [authLoading, isManagerOrAdmin])
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

  const openDrilldown = (type: DrilldownType) => {
    setDrilldownType(type);
    setShowDrilldown(true);
  };

  const navigateToLead = (leadId: string) => {
    setShowDrilldown(false);
    router.push(`/lead/${leadId}`);
  };

  const navigateToAgent = (agentId: string) => {
    setShowDrilldown(false);
    router.push(`/command-center/${agentId}`);
  };

  // Loading state
  if (authLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </View>
    );
  }

  // Access denied for non-admin/manager
  if (!isManagerOrAdmin) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.accessDenied}>
          <Ionicons name="lock-closed" size={64} color="#EF4444" />
          <Text style={styles.accessDeniedTitle}>Access Restricted</Text>
          <Text style={styles.accessDeniedText}>
            The Agency Command Center is only available to Administrators and Managers.
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
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading Agency Data...</Text>
        </View>
      </View>
    );
  }

  // Summary Cards Component
  const renderSummaryCards = () => (
    <View style={styles.summaryGrid}>
      <TouchableOpacity style={styles.summaryCard} onPress={() => openDrilldown('logged_today')}>
        <View style={styles.summaryIconContainer}>
          <Ionicons name="people" size={24} color="#3B82F6" />
        </View>
        <Text style={styles.summaryValue}>{summary?.total_active_agents || 0}</Text>
        <Text style={styles.summaryLabel}>Active Agents</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.summaryCard} onPress={() => setActiveSection('pipeline')}>
        <View style={[styles.summaryIconContainer, { backgroundColor: '#DCFCE7' }]}>
          <Ionicons name="person-add" size={24} color="#22C55E" />
        </View>
        <Text style={styles.summaryValue}>{summary?.leads_this_week || 0}</Text>
        <Text style={styles.summaryLabel}>Leads This Week</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.summaryCard} onPress={() => openDrilldown('apt_today')}>
        <View style={[styles.summaryIconContainer, { backgroundColor: '#FEF3C7' }]}>
          <Ionicons name="calendar" size={24} color="#F59E0B" />
        </View>
        <Text style={styles.summaryValue}>{summary?.appointments_today || 0}</Text>
        <Text style={styles.summaryLabel}>Appointments Today</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.summaryCard} onPress={() => openDrilldown('underwriting')}>
        <View style={[styles.summaryIconContainer, { backgroundColor: '#E0E7FF' }]}>
          <Ionicons name="document-text" size={24} color="#6366F1" />
        </View>
        <Text style={styles.summaryValue}>{summary?.applications_submitted || 0}</Text>
        <Text style={styles.summaryLabel}>Applications</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.summaryCard} onPress={() => openDrilldown('issued')}>
        <View style={[styles.summaryIconContainer, { backgroundColor: '#D1FAE5' }]}>
          <Ionicons name="shield-checkmark" size={24} color="#10B981" />
        </View>
        <Text style={styles.summaryValue}>{summary?.policies_issued || 0}</Text>
        <Text style={styles.summaryLabel}>Policies Issued</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.summaryCard} onPress={() => router.push('/commissions')}>
        <View style={[styles.summaryIconContainer, { backgroundColor: '#FEE2E2' }]}>
          <Ionicons name="time" size={24} color="#EF4444" />
        </View>
        <Text style={styles.summaryValue}>{formatCurrency(summary?.pending_commissions || 0)}</Text>
        <Text style={styles.summaryLabel}>Pending Comm.</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.summaryCard, styles.wideCard]} onPress={() => router.push('/commissions')}>
        <View style={[styles.summaryIconContainer, { backgroundColor: '#D1FAE5' }]}>
          <Ionicons name="checkmark-circle" size={24} color="#22C55E" />
        </View>
        <Text style={styles.summaryValue}>{formatCurrency(summary?.paid_commissions || 0)}</Text>
        <Text style={styles.summaryLabel}>Paid Commissions</Text>
      </TouchableOpacity>
    </View>
  );

  // Team Performance Section
  const renderTeamPerformance = () => (
    <View style={styles.sectionContent}>
      {/* Top Producers */}
      <TouchableOpacity style={styles.performanceCard} onPress={() => openDrilldown('top_producers')}>
        <View style={styles.performanceHeader}>
          <View style={styles.performanceIconContainer}>
            <Ionicons name="trophy" size={20} color="#F59E0B" />
          </View>
          <Text style={styles.performanceTitle}>Top Producers</Text>
          <Ionicons name="chevron-forward" size={20} color="#64748B" />
        </View>
        <View style={styles.performancePreview}>
          {teamPerformance?.top_producers?.slice(0, 3).map((agent, index) => (
            <View key={agent.id} style={styles.previewItem}>
              <Text style={styles.previewRank}>#{index + 1}</Text>
              <Text style={styles.previewName} numberOfLines={1}>{agent.name}</Text>
              <Text style={styles.previewValue}>{formatCurrency(agent.total_premium || 0)}</Text>
            </View>
          ))}
          {(!teamPerformance?.top_producers || teamPerformance.top_producers.length === 0) && (
            <Text style={styles.emptyText}>No production data this month</Text>
          )}
        </View>
      </TouchableOpacity>

      {/* Top Managers */}
      <TouchableOpacity style={styles.performanceCard} onPress={() => openDrilldown('top_managers')}>
        <View style={styles.performanceHeader}>
          <View style={[styles.performanceIconContainer, { backgroundColor: '#E0E7FF' }]}>
            <Ionicons name="star" size={20} color="#6366F1" />
          </View>
          <Text style={styles.performanceTitle}>Top Managers/Uplines</Text>
          <Ionicons name="chevron-forward" size={20} color="#64748B" />
        </View>
        <View style={styles.performancePreview}>
          {teamPerformance?.top_managers?.slice(0, 3).map((mgr, index) => (
            <View key={mgr.id} style={styles.previewItem}>
              <Text style={styles.previewRank}>#{index + 1}</Text>
              <Text style={styles.previewName} numberOfLines={1}>{mgr.name}</Text>
              <Text style={styles.previewValue}>{formatCurrency(mgr.team_premium || 0)}</Text>
            </View>
          ))}
          {(!teamPerformance?.top_managers || teamPerformance.top_managers.length === 0) && (
            <Text style={styles.emptyText}>No manager data</Text>
          )}
        </View>
      </TouchableOpacity>

      {/* Lowest Activity */}
      <TouchableOpacity style={styles.performanceCard} onPress={() => openDrilldown('lowest_activity')}>
        <View style={styles.performanceHeader}>
          <View style={[styles.performanceIconContainer, { backgroundColor: '#FEE2E2' }]}>
            <Ionicons name="alert-circle" size={20} color="#EF4444" />
          </View>
          <Text style={styles.performanceTitle}>Lowest Activity Agents</Text>
          <View style={styles.alertBadge}>
            <Text style={styles.alertBadgeText}>{teamPerformance?.lowest_activity?.length || 0}</Text>
          </View>
        </View>
        <View style={styles.performancePreview}>
          {teamPerformance?.lowest_activity?.slice(0, 3).map((agent) => (
            <View key={agent.id} style={styles.previewItem}>
              <Ionicons name="ellipse" size={8} color="#EF4444" style={{ marginRight: 8 }} />
              <Text style={styles.previewName} numberOfLines={1}>{agent.name}</Text>
              <Text style={styles.previewAlert}>{agent.days_since_login}d ago</Text>
            </View>
          ))}
          {(!teamPerformance?.lowest_activity || teamPerformance.lowest_activity.length === 0) && (
            <Text style={styles.emptyTextGood}>✓ All agents active!</Text>
          )}
        </View>
      </TouchableOpacity>

      {/* Overdue Follow-ups */}
      <TouchableOpacity style={styles.performanceCard} onPress={() => openDrilldown('overdue_followups')}>
        <View style={styles.performanceHeader}>
          <View style={[styles.performanceIconContainer, { backgroundColor: '#FEF3C7' }]}>
            <Ionicons name="time" size={20} color="#F59E0B" />
          </View>
          <Text style={styles.performanceTitle}>Overdue Follow-ups</Text>
          <View style={[styles.alertBadge, { backgroundColor: '#FEF3C7' }]}>
            <Text style={[styles.alertBadgeText, { color: '#B45309' }]}>{teamPerformance?.overdue_followups?.length || 0}</Text>
          </View>
        </View>
        <View style={styles.performancePreview}>
          {teamPerformance?.overdue_followups?.slice(0, 3).map((task) => (
            <View key={task.id} style={styles.previewItem}>
              <Ionicons name="ellipse" size={8} color="#F59E0B" style={{ marginRight: 8 }} />
              <Text style={styles.previewName} numberOfLines={1}>{task.lead_name || task.title}</Text>
              <Text style={styles.previewAlert}>{task.days_overdue}d overdue</Text>
            </View>
          ))}
          {(!teamPerformance?.overdue_followups || teamPerformance.overdue_followups.length === 0) && (
            <Text style={styles.emptyTextGood}>✓ No overdue tasks!</Text>
          )}
        </View>
      </TouchableOpacity>
    </View>
  );

  // Pipeline Health Section
  const renderPipelineHealth = () => (
    <View style={styles.sectionContent}>
      <TouchableOpacity style={styles.pipelineCard} onPress={() => openDrilldown('underwriting')}>
        <View style={styles.pipelineHeader}>
          <View style={[styles.pipelineIndicator, { backgroundColor: '#6366F1' }]} />
          <Text style={styles.pipelineTitle}>Underwriting Review</Text>
          <View style={styles.pipelineCount}>
            <Text style={styles.pipelineCountText}>{pipelineHealth?.underwriting_review?.length || 0}</Text>
          </View>
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={styles.pipelineCard} onPress={() => openDrilldown('additional_req')}>
        <View style={styles.pipelineHeader}>
          <View style={[styles.pipelineIndicator, { backgroundColor: '#F59E0B' }]} />
          <Text style={styles.pipelineTitle}>Additional Requirements</Text>
          <View style={[styles.pipelineCount, { backgroundColor: '#FEF3C7' }]}>
            <Text style={[styles.pipelineCountText, { color: '#B45309' }]}>{pipelineHealth?.additional_requirements?.length || 0}</Text>
          </View>
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={styles.pipelineCard} onPress={() => openDrilldown('approved')}>
        <View style={styles.pipelineHeader}>
          <View style={[styles.pipelineIndicator, { backgroundColor: '#22C55E' }]} />
          <Text style={styles.pipelineTitle}>Approved Cases</Text>
          <View style={[styles.pipelineCount, { backgroundColor: '#DCFCE7' }]}>
            <Text style={[styles.pipelineCountText, { color: '#15803D' }]}>{pipelineHealth?.approved_cases?.length || 0}</Text>
          </View>
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={styles.pipelineCard} onPress={() => openDrilldown('issued')}>
        <View style={styles.pipelineHeader}>
          <View style={[styles.pipelineIndicator, { backgroundColor: '#10B981' }]} />
          <Text style={styles.pipelineTitle}>Issued Policies</Text>
          <View style={[styles.pipelineCount, { backgroundColor: '#D1FAE5' }]}>
            <Text style={[styles.pipelineCountText, { color: '#047857' }]}>{pipelineHealth?.issued_policies?.length || 0}</Text>
          </View>
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.pipelineCard, styles.stalledCard]} onPress={() => openDrilldown('stalled')}>
        <View style={styles.pipelineHeader}>
          <View style={[styles.pipelineIndicator, { backgroundColor: '#EF4444' }]} />
          <Text style={styles.pipelineTitle}>Stalled Cases (7+ Days)</Text>
          <View style={[styles.pipelineCount, { backgroundColor: '#FEE2E2' }]}>
            <Text style={[styles.pipelineCountText, { color: '#DC2626' }]}>{pipelineHealth?.stalled_cases?.length || 0}</Text>
          </View>
        </View>
        {(pipelineHealth?.stalled_cases?.length || 0) > 0 && (
          <Text style={styles.stalledWarning}>⚠️ Requires attention</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  // Activity Tracking Section
  const renderActivityTracking = () => (
    <View style={styles.sectionContent}>
      <TouchableOpacity style={styles.activityCard} onPress={() => openDrilldown('logged_today')}>
        <View style={styles.activityHeader}>
          <Ionicons name="checkmark-circle" size={24} color="#22C55E" />
          <Text style={styles.activityTitle}>Logged In Today</Text>
          <Text style={styles.activityCount}>{activityTracking?.logged_in_today?.length || 0}</Text>
        </View>
        <View style={styles.activityAvatars}>
          {activityTracking?.logged_in_today?.slice(0, 5).map((user) => (
            <View key={user.id} style={styles.activityAvatar}>
              <Text style={styles.avatarText}>{user.name.charAt(0)}</Text>
            </View>
          ))}
          {(activityTracking?.logged_in_today?.length || 0) > 5 && (
            <View style={[styles.activityAvatar, styles.avatarMore]}>
              <Text style={styles.avatarMoreText}>+{(activityTracking?.logged_in_today?.length || 0) - 5}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={styles.activityCard} onPress={() => openDrilldown('not_logged')}>
        <View style={styles.activityHeader}>
          <Ionicons name="alert-circle" size={24} color="#EF4444" />
          <Text style={styles.activityTitle}>Not Logged In (3+ Days)</Text>
          <Text style={[styles.activityCount, { color: '#EF4444' }]}>{activityTracking?.not_logged_recently?.length || 0}</Text>
        </View>
        <View style={styles.activityAvatars}>
          {activityTracking?.not_logged_recently?.slice(0, 5).map((user) => (
            <View key={user.id} style={[styles.activityAvatar, { backgroundColor: '#FEE2E2' }]}>
              <Text style={[styles.avatarText, { color: '#EF4444' }]}>{user.name.charAt(0)}</Text>
            </View>
          ))}
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={styles.activityCard} onPress={() => openDrilldown('apt_today')}>
        <View style={styles.activityHeader}>
          <Ionicons name="calendar" size={24} color="#3B82F6" />
          <Text style={styles.activityTitle}>Appointments Today</Text>
          <Text style={[styles.activityCount, { color: '#3B82F6' }]}>{activityTracking?.appointments_today?.length || 0}</Text>
        </View>
        {activityTracking?.appointments_today?.slice(0, 3).map((user) => (
          <View key={user.id} style={styles.appointmentPreview}>
            <Text style={styles.appointmentAgent}>{user.name}</Text>
            <Text style={styles.appointmentCount}>{user.appointment_count} appt{(user.appointment_count || 0) > 1 ? 's' : ''}</Text>
          </View>
        ))}
      </TouchableOpacity>

      <TouchableOpacity style={styles.activityCard} onPress={() => openDrilldown('overdue_activity')}>
        <View style={styles.activityHeader}>
          <Ionicons name="warning" size={24} color="#F59E0B" />
          <Text style={styles.activityTitle}>Overdue Lead Activity</Text>
          <Text style={[styles.activityCount, { color: '#F59E0B' }]}>{activityTracking?.overdue_lead_activity?.length || 0}</Text>
        </View>
        {activityTracking?.overdue_lead_activity?.slice(0, 3).map((user) => (
          <View key={user.id} style={styles.appointmentPreview}>
            <Text style={styles.appointmentAgent}>{user.name}</Text>
            <Text style={[styles.appointmentCount, { color: '#F59E0B' }]}>{user.overdue_count} overdue</Text>
          </View>
        ))}
      </TouchableOpacity>
    </View>
  );

  // Drilldown Modal Content
  const renderDrilldownContent = () => {
    const getDrilldownTitle = () => {
      switch (drilldownType) {
        case 'top_producers': return 'Top Producers';
        case 'top_managers': return 'Top Managers/Uplines';
        case 'lowest_activity': return 'Low Activity Agents';
        case 'overdue_followups': return 'Overdue Follow-ups';
        case 'underwriting': return 'Underwriting Review';
        case 'additional_req': return 'Additional Requirements';
        case 'approved': return 'Approved Cases';
        case 'issued': return 'Issued Policies';
        case 'stalled': return 'Stalled Cases';
        case 'logged_today': return 'Logged In Today';
        case 'not_logged': return 'Not Logged Recently';
        case 'apt_today': return 'Appointments Today';
        case 'overdue_activity': return 'Overdue Lead Activity';
        default: return 'Details';
      }
    };

    const renderAgentList = (agents: AgentPerformance[], showPremium = true) => (
      <ScrollView style={styles.drilldownScroll}>
        {agents.map((agent, index) => (
          <TouchableOpacity key={agent.id} style={styles.drilldownItem} onPress={() => navigateToAgent(agent.id)}>
            <View style={styles.drilldownRank}>
              <Text style={styles.drilldownRankText}>{index + 1}</Text>
            </View>
            <View style={styles.drilldownInfo}>
              <Text style={styles.drilldownName}>{agent.name}</Text>
              <Text style={styles.drilldownEmail}>{agent.email}</Text>
            </View>
            {showPremium && (
              <View style={styles.drilldownMetric}>
                <Text style={styles.drilldownValue}>{formatCurrency(agent.total_premium || agent.team_premium || 0)}</Text>
                <Text style={styles.drilldownLabel}>Premium</Text>
              </View>
            )}
            {agent.days_since_login !== undefined && (
              <View style={styles.drilldownMetric}>
                <Text style={[styles.drilldownValue, { color: '#EF4444' }]}>{agent.days_since_login}d</Text>
                <Text style={styles.drilldownLabel}>Inactive</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>
        ))}
        {agents.length === 0 && (
          <View style={styles.emptyDrilldown}>
            <Ionicons name="checkmark-circle" size={48} color="#22C55E" />
            <Text style={styles.emptyDrilldownText}>No records found</Text>
          </View>
        )}
      </ScrollView>
    );

    const renderLeadList = (leads: PipelineLead[]) => (
      <ScrollView style={styles.drilldownScroll}>
        {leads.map((lead) => (
          <TouchableOpacity key={lead.id} style={styles.drilldownItem} onPress={() => navigateToLead(lead.id)}>
            <View style={styles.drilldownInfo}>
              <Text style={styles.drilldownName}>{lead.name}</Text>
              <Text style={styles.drilldownEmail}>{lead.agent_name} • {STAGE_LABELS[lead.stage] || lead.stage}</Text>
              {lead.phone && <Text style={styles.drilldownPhone}>{lead.phone}</Text>}
            </View>
            <View style={styles.drilldownMetric}>
              <Text style={[styles.drilldownValue, lead.is_stalled ? { color: '#EF4444' } : {}]}>
                {lead.days_stalled !== undefined ? `${lead.days_stalled}d` : `${lead.days_in_stage}d`}
              </Text>
              <Text style={styles.drilldownLabel}>{lead.is_stalled ? 'Stalled' : 'In Stage'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>
        ))}
        {leads.length === 0 && (
          <View style={styles.emptyDrilldown}>
            <Ionicons name="checkmark-circle" size={48} color="#22C55E" />
            <Text style={styles.emptyDrilldownText}>No cases in this stage</Text>
          </View>
        )}
      </ScrollView>
    );

    const renderActivityList = (users: ActivityUser[], showOverdue = false) => (
      <ScrollView style={styles.drilldownScroll}>
        {users.map((user) => (
          <TouchableOpacity key={user.id} style={styles.drilldownItem} onPress={() => navigateToAgent(user.id)}>
            <View style={styles.drilldownAvatar}>
              <Text style={styles.drilldownAvatarText}>{user.name.charAt(0)}</Text>
            </View>
            <View style={styles.drilldownInfo}>
              <Text style={styles.drilldownName}>{user.name}</Text>
              <Text style={styles.drilldownEmail}>{user.role} • {user.email}</Text>
              {user.appointments && user.appointments.length > 0 && (
                <View style={styles.appointmentList}>
                  {user.appointments.slice(0, 3).map((apt) => (
                    <Text key={apt.id} style={styles.appointmentItem}>
                      {apt.time} - {apt.lead_name}
                    </Text>
                  ))}
                </View>
              )}
            </View>
            {user.days_since_login !== undefined && (
              <View style={styles.drilldownMetric}>
                <Text style={[styles.drilldownValue, { color: '#EF4444' }]}>{user.days_since_login}d</Text>
                <Text style={styles.drilldownLabel}>Ago</Text>
              </View>
            )}
            {user.appointment_count !== undefined && (
              <View style={styles.drilldownMetric}>
                <Text style={styles.drilldownValue}>{user.appointment_count}</Text>
                <Text style={styles.drilldownLabel}>Appts</Text>
              </View>
            )}
            {showOverdue && user.overdue_count !== undefined && (
              <View style={styles.drilldownMetric}>
                <Text style={[styles.drilldownValue, { color: '#F59E0B' }]}>{user.overdue_count}</Text>
                <Text style={styles.drilldownLabel}>Overdue</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>
        ))}
        {users.length === 0 && (
          <View style={styles.emptyDrilldown}>
            <Ionicons name="people" size={48} color="#64748B" />
            <Text style={styles.emptyDrilldownText}>No users found</Text>
          </View>
        )}
      </ScrollView>
    );

    const renderOverdueFollowups = () => (
      <ScrollView style={styles.drilldownScroll}>
        {teamPerformance?.overdue_followups?.map((task) => (
          <TouchableOpacity 
            key={task.id} 
            style={styles.drilldownItem} 
            onPress={() => task.lead_id ? navigateToLead(task.lead_id) : null}
          >
            <View style={[styles.drilldownRank, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="time" size={16} color="#F59E0B" />
            </View>
            <View style={styles.drilldownInfo}>
              <Text style={styles.drilldownName}>{task.title}</Text>
              <Text style={styles.drilldownEmail}>{task.agent_name} • {task.lead_name || 'No lead'}</Text>
              <Text style={styles.drilldownPhone}>Due: {task.due_date}</Text>
            </View>
            <View style={styles.drilldownMetric}>
              <Text style={[styles.drilldownValue, { color: '#F59E0B' }]}>{task.days_overdue}d</Text>
              <Text style={styles.drilldownLabel}>Overdue</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>
        ))}
        {(!teamPerformance?.overdue_followups || teamPerformance.overdue_followups.length === 0) && (
          <View style={styles.emptyDrilldown}>
            <Ionicons name="checkmark-circle" size={48} color="#22C55E" />
            <Text style={styles.emptyDrilldownText}>No overdue follow-ups!</Text>
          </View>
        )}
      </ScrollView>
    );

    switch (drilldownType) {
      case 'top_producers':
        return renderAgentList(teamPerformance?.top_producers || []);
      case 'top_managers':
        return renderAgentList(teamPerformance?.top_managers || []);
      case 'lowest_activity':
        return renderAgentList(teamPerformance?.lowest_activity || [], false);
      case 'overdue_followups':
        return renderOverdueFollowups();
      case 'underwriting':
        return renderLeadList(pipelineHealth?.underwriting_review || []);
      case 'additional_req':
        return renderLeadList(pipelineHealth?.additional_requirements || []);
      case 'approved':
        return renderLeadList(pipelineHealth?.approved_cases || []);
      case 'issued':
        return renderLeadList(pipelineHealth?.issued_policies || []);
      case 'stalled':
        return renderLeadList(pipelineHealth?.stalled_cases || []);
      case 'logged_today':
        return renderActivityList(activityTracking?.logged_in_today || []);
      case 'not_logged':
        return renderActivityList(activityTracking?.not_logged_recently || []);
      case 'apt_today':
        return renderActivityList(activityTracking?.appointments_today || []);
      case 'overdue_activity':
        return renderActivityList(activityTracking?.overdue_lead_activity || [], true);
      default:
        return null;
    }

    return null;
  };

  // Section Tabs
  const renderSectionTabs = () => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsContainer}>
      <TouchableOpacity
        style={[styles.tab, activeSection === 'summary' && styles.tabActive]}
        onPress={() => setActiveSection('summary')}
      >
        <Ionicons name="grid" size={18} color={activeSection === 'summary' ? '#3B82F6' : '#64748B'} />
        <Text style={[styles.tabText, activeSection === 'summary' && styles.tabTextActive]}>Summary</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tab, activeSection === 'team' && styles.tabActive]}
        onPress={() => setActiveSection('team')}
      >
        <Ionicons name="people" size={18} color={activeSection === 'team' ? '#3B82F6' : '#64748B'} />
        <Text style={[styles.tabText, activeSection === 'team' && styles.tabTextActive]}>Team</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tab, activeSection === 'pipeline' && styles.tabActive]}
        onPress={() => setActiveSection('pipeline')}
      >
        <Ionicons name="git-branch" size={18} color={activeSection === 'pipeline' ? '#3B82F6' : '#64748B'} />
        <Text style={[styles.tabText, activeSection === 'pipeline' && styles.tabTextActive]}>Pipeline</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tab, activeSection === 'activity' && styles.tabActive]}
        onPress={() => setActiveSection('activity')}
      >
        <Ionicons name="pulse" size={18} color={activeSection === 'activity' ? '#3B82F6' : '#64748B'} />
        <Text style={[styles.tabText, activeSection === 'activity' && styles.tabTextActive]}>Activity</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Agency Command Center</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>{user?.role?.toUpperCase()}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={24} color="#3B82F6" />
        </TouchableOpacity>
      </View>

      {/* Section Tabs */}
      {renderSectionTabs()}

      {/* Main Content */}
      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {activeSection === 'summary' && renderSummaryCards()}
        {activeSection === 'team' && renderTeamPerformance()}
        {activeSection === 'pipeline' && renderPipelineHealth()}
        {activeSection === 'activity' && renderActivityTracking()}
        
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Drilldown Modal */}
      <Modal
        visible={showDrilldown}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowDrilldown(false)}
      >
        <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowDrilldown(false)}>
              <Ionicons name="close" size={28} color="#1F2937" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {drilldownType === 'top_producers' ? 'Top Producers' :
               drilldownType === 'top_managers' ? 'Top Managers/Uplines' :
               drilldownType === 'lowest_activity' ? 'Low Activity Agents' :
               drilldownType === 'overdue_followups' ? 'Overdue Follow-ups' :
               drilldownType === 'underwriting' ? 'Underwriting Review' :
               drilldownType === 'additional_req' ? 'Additional Requirements' :
               drilldownType === 'approved' ? 'Approved Cases' :
               drilldownType === 'issued' ? 'Issued Policies' :
               drilldownType === 'stalled' ? 'Stalled Cases' :
               drilldownType === 'logged_today' ? 'Logged In Today' :
               drilldownType === 'not_logged' ? 'Not Logged Recently' :
               drilldownType === 'apt_today' ? 'Appointments Today' :
               drilldownType === 'overdue_activity' ? 'Overdue Lead Activity' :
               'Details'}
            </Text>
            <View style={{ width: 28 }} />
          </View>
          {renderDrilldownContent()}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#64748B',
  },
  accessDenied: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  accessDeniedTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    marginTop: 16,
  },
  accessDeniedText: {
    fontSize: 16,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 8,
  },
  backButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#3B82F6',
    borderRadius: 8,
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
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: {
    padding: 4,
  },
  headerTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  roleBadge: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  refreshBtn: {
    padding: 4,
  },
  tabsContainer: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    gap: 6,
  },
  tabActive: {
    backgroundColor: '#DBEAFE',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748B',
  },
  tabTextActive: {
    color: '#3B82F6',
  },
  content: {
    flex: 1,
  },
  sectionContent: {
    padding: 16,
  },
  
  // Summary Cards
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    gap: 12,
  },
  summaryCard: {
    width: '47%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  wideCard: {
    width: '97%',
  },
  summaryIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#DBEAFE',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
  },
  summaryLabel: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
  },

  // Performance Cards
  performanceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  performanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  performanceIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  performanceTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  alertBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  alertBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#DC2626',
  },
  performancePreview: {
    gap: 8,
  },
  previewItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewRank: {
    width: 28,
    fontSize: 13,
    fontWeight: '600',
    color: '#3B82F6',
  },
  previewName: {
    flex: 1,
    fontSize: 14,
    color: '#1F2937',
  },
  previewValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#22C55E',
  },
  previewAlert: {
    fontSize: 13,
    fontWeight: '500',
    color: '#EF4444',
  },
  emptyText: {
    fontSize: 14,
    color: '#64748B',
    fontStyle: 'italic',
  },
  emptyTextGood: {
    fontSize: 14,
    color: '#22C55E',
    fontWeight: '500',
  },

  // Pipeline Cards
  pipelineCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  stalledCard: {
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  pipelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pipelineIndicator: {
    width: 4,
    height: 24,
    borderRadius: 2,
    marginRight: 12,
  },
  pipelineTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#1F2937',
  },
  pipelineCount: {
    backgroundColor: '#E0E7FF',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pipelineCountText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4338CA',
  },
  stalledWarning: {
    fontSize: 13,
    color: '#EF4444',
    marginTop: 8,
    marginLeft: 16,
  },

  // Activity Cards
  activityCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  activityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  activityTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
  },
  activityCount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#22C55E',
  },
  activityAvatars: {
    flexDirection: 'row',
    gap: -8,
  },
  activityAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DBEAFE',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
  },
  avatarMore: {
    backgroundColor: '#64748B',
  },
  avatarMoreText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  appointmentPreview: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  appointmentAgent: {
    fontSize: 14,
    color: '#1F2937',
  },
  appointmentCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
  },

  // Modal / Drilldown
  modalContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  drilldownScroll: {
    flex: 1,
    padding: 16,
  },
  drilldownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  drilldownRank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#DBEAFE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  drilldownRankText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#3B82F6',
  },
  drilldownAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  drilldownAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  drilldownInfo: {
    flex: 1,
  },
  drilldownName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
  },
  drilldownEmail: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  drilldownPhone: {
    fontSize: 13,
    color: '#3B82F6',
    marginTop: 2,
  },
  drilldownMetric: {
    alignItems: 'flex-end',
    marginRight: 8,
  },
  drilldownValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#22C55E',
  },
  drilldownLabel: {
    fontSize: 11,
    color: '#64748B',
  },
  appointmentList: {
    marginTop: 8,
  },
  appointmentItem: {
    fontSize: 12,
    color: '#3B82F6',
    marginTop: 2,
  },
  emptyDrilldown: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyDrilldownText: {
    fontSize: 16,
    color: '#64748B',
    marginTop: 12,
  },
});
