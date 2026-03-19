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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import { useAuth } from '../../src/contexts/AuthContext';

interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string;
  created_date: string;
  stage: string;
  premium?: number;
  notes?: string;
}

const COLORS = {
  background: '#0A0A0F',
  cardBackground: '#141419',
  cardBorder: '#1F1F28',
  primary: '#D4AF37',
  text: '#FFFFFF',
  textSecondary: '#9CA3AF',
  textMuted: '#6B7280',
  success: '#10B981',
};

const STAGE_CONFIG: Record<string, { color: string; icon: string; label: string }> = {
  new_lead: { color: '#6B7280', icon: 'person-add', label: 'New Lead' },
  new: { color: '#6B7280', icon: 'person-add', label: 'New' },
  contacted: { color: '#3B82F6', icon: 'chatbubble', label: 'Contacted' },
  follow_up: { color: '#F59E0B', icon: 'time', label: 'Follow Up' },
  appointment_set: { color: '#8B5CF6', icon: 'calendar', label: 'Appointment Set' },
  appointment_scheduled: { color: '#8B5CF6', icon: 'calendar', label: 'Appointment Set' },
  soa_completed: { color: '#06B6D4', icon: 'document-text', label: 'SOA Completed' },
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

export default function StageDetailScreen() {
  const router = useRouter();
  const { stage } = useLocalSearchParams<{ stage: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);

  const stageKey = stage || 'new_lead';
  const config = STAGE_CONFIG[stageKey] || { color: '#6B7280', icon: 'help-circle', label: stageKey };

  const loadLeads = useCallback(async () => {
    try {
      const allLeads = await api.getLeads();
      // Filter leads by stage
      const filtered = allLeads.filter((lead: Lead) => lead.stage === stageKey);
      setLeads(filtered);
    } catch (error) {
      console.error('[StageDetail] Failed to load leads:', error);
      setLeads([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [stageKey]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  const onRefresh = () => {
    setRefreshing(true);
    loadLeads();
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
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
        <View style={styles.headerTitleContainer}>
          <View style={[styles.stageIcon, { backgroundColor: `${config.color}20` }]}>
            <Ionicons name={config.icon as any} size={20} color={config.color} />
          </View>
          <Text style={styles.headerTitle}>{config.label}</Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      {/* Count Badge */}
      <View style={styles.countBadge}>
        <Text style={styles.countText}>{leads.length} {leads.length === 1 ? 'case' : 'cases'}</Text>
      </View>

      {/* Leads List */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
      >
        {leads.length > 0 ? (
          leads.map((lead) => (
            <TouchableOpacity
              key={lead.id}
              style={styles.leadCard}
              onPress={() => router.push(`/lead/${lead.id}`)}
              activeOpacity={0.7}
            >
              <View style={styles.leadInfo}>
                <Text style={styles.leadName}>{lead.name}</Text>
                {lead.phone && <Text style={styles.leadPhone}>{lead.phone}</Text>}
                {lead.email && <Text style={styles.leadEmail}>{lead.email}</Text>}
                <Text style={styles.leadDate}>{formatDate(lead.created_date)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.emptyState}>
            <View style={[styles.emptyIcon, { backgroundColor: `${config.color}15` }]}>
              <Ionicons name={config.icon as any} size={40} color={config.color} />
            </View>
            <Text style={styles.emptyTitle}>No Cases in {config.label}</Text>
            <Text style={styles.emptyText}>
              Leads will appear here when they reach this stage in your pipeline.
            </Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => router.push('/lead/new')}
            >
              <Ionicons name="add" size={20} color="#0A0A0F" />
              <Text style={styles.addButtonText}>Add New Lead</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
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
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stageIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
  },
  countBadge: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.cardBackground,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
  },
  countText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  leadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  leadInfo: {
    flex: 1,
  },
  leadName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  leadPhone: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  leadEmail: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 4,
  },
  leadDate: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 10,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  addButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0A0A0F',
  },
});
