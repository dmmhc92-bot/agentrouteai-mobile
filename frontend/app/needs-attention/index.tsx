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

// Type Definitions
interface AlertDetails {
  email?: string;
  role?: string;
  last_login?: string | null;
  days_since_login?: number;
  phone?: string;
  agent_name?: string;
  agent_id?: string;
  lead_id?: string;
  lead_name?: string;
  created_date?: string;
  days_waiting?: number;
  days_overdue?: number;
  days_missed?: number;
  days_stalled?: number;
  days_pending?: number;
  task_type?: string;
  due_date?: string;
  appointment_date?: string;
  appointment_time?: string;
  stage?: string;
  carrier?: string;
  policy_type?: string;
  estimated_commission?: number;
  status?: string;
  recent_leads?: number;
  recent_appointments?: number;
  last_contact?: string;
}

interface AlertItem {
  id: string;
  alert_type: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  subtitle: string;
  details: AlertDetails;
  related_id: string;
  related_type: 'user' | 'lead' | 'appointment' | 'commission' | 'task';
}

interface AlertCategory {
  category: string;
  title: string;
  icon: string;
  count: number;
  severity: 'critical' | 'warning' | 'info';
  alerts: AlertItem[];
}

interface NeedsAttentionData {
  total_alerts: number;
  critical_count: number;
  warning_count: number;
  categories: AlertCategory[];
}

const ICON_MAP: Record<string, keyof typeof Ionicons.glyphMap> = {
  'log-out': 'log-out-outline',
  'trending-down': 'trending-down-outline',
  'person-add': 'person-add-outline',
  'time': 'time-outline',
  'calendar-clear': 'calendar-outline',
  'help-circle': 'help-circle-outline',
  'document-text': 'document-text-outline',
  'clipboard': 'clipboard-outline',
  'cash': 'cash-outline',
};

const SEVERITY_COLORS = {
  critical: { bg: '#FEE2E2', text: '#DC2626', icon: '#EF4444' },
  warning: { bg: '#FEF3C7', text: '#B45309', icon: '#F59E0B' },
  info: { bg: '#DBEAFE', text: '#1D4ED8', icon: '#3B82F6' },
};

export default function NeedsAttentionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, isLoading: authLoading } = useAuth();
  
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<NeedsAttentionData | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<AlertCategory | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);

  const isManagerOrAdmin = user?.role === 'admin' || user?.role === 'manager';

  const loadData = async () => {
    if (!isManagerOrAdmin) {
      setIsLoading(false);
      return;
    }
    
    try {
      const response = await api.getNeedsAttentionAlerts();
      setData(response);
    } catch (error: any) {
      console.error('Error loading needs attention:', error);
      if (error.response?.status === 403) {
        Alert.alert('Access Denied', 'You do not have permission to view this dashboard');
        router.back();
      } else {
        Alert.alert('Error', 'Failed to load alerts');
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

  const openCategory = (category: AlertCategory) => {
    setSelectedCategory(category);
    setShowCategoryModal(true);
  };

  const navigateToRelated = (alert: AlertItem) => {
    setShowCategoryModal(false);
    
    switch (alert.related_type) {
      case 'user':
        router.push(`/command-center/${alert.related_id}`);
        break;
      case 'lead':
        router.push(`/lead/${alert.related_id}`);
        break;
      case 'commission':
        router.push('/commissions');
        break;
      default:
        // For tasks or unknown types, try to navigate to lead if available
        if (alert.details.lead_id) {
          router.push(`/lead/${alert.details.lead_id}`);
        } else if (alert.details.agent_id) {
          router.push(`/command-center/${alert.details.agent_id}`);
        }
    }
  };

  const getIconName = (icon: string): keyof typeof Ionicons.glyphMap => {
    return ICON_MAP[icon] || 'alert-circle-outline';
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
            The Needs Attention dashboard is only available to Administrators and Managers.
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
          <Text style={styles.loadingText}>Scanning for issues...</Text>
        </View>
      </View>
    );
  }

  // Summary Header Component
  const renderSummaryHeader = () => (
    <View style={styles.summaryHeader}>
      <View style={styles.summaryMain}>
        <View style={styles.summaryIconContainer}>
          <Ionicons name="alert-circle" size={32} color="#EF4444" />
        </View>
        <View style={styles.summaryText}>
          <Text style={styles.summaryCount}>{data?.total_alerts || 0}</Text>
          <Text style={styles.summaryLabel}>Items Need Attention</Text>
        </View>
      </View>
      
      <View style={styles.summaryBadges}>
        {(data?.critical_count || 0) > 0 && (
          <View style={[styles.severityBadge, { backgroundColor: SEVERITY_COLORS.critical.bg }]}>
            <Ionicons name="alert" size={14} color={SEVERITY_COLORS.critical.icon} />
            <Text style={[styles.severityBadgeText, { color: SEVERITY_COLORS.critical.text }]}>
              {data?.critical_count} Critical
            </Text>
          </View>
        )}
        {(data?.warning_count || 0) > 0 && (
          <View style={[styles.severityBadge, { backgroundColor: SEVERITY_COLORS.warning.bg }]}>
            <Ionicons name="warning" size={14} color={SEVERITY_COLORS.warning.icon} />
            <Text style={[styles.severityBadgeText, { color: SEVERITY_COLORS.warning.text }]}>
              {data?.warning_count} Warnings
            </Text>
          </View>
        )}
      </View>
    </View>
  );

  // All Clear State
  const renderAllClear = () => (
    <View style={styles.allClearContainer}>
      <View style={styles.allClearIcon}>
        <Ionicons name="checkmark-circle" size={64} color="#22C55E" />
      </View>
      <Text style={styles.allClearTitle}>All Clear!</Text>
      <Text style={styles.allClearText}>
        No issues requiring your attention right now. Great job keeping things on track!
      </Text>
    </View>
  );

  // Category Card Component
  const renderCategoryCard = (category: AlertCategory) => {
    const colors = SEVERITY_COLORS[category.severity];
    
    return (
      <TouchableOpacity 
        key={category.category} 
        style={[styles.categoryCard, { borderLeftColor: colors.icon }]}
        onPress={() => openCategory(category)}
        activeOpacity={0.7}
      >
        <View style={styles.categoryHeader}>
          <View style={[styles.categoryIconContainer, { backgroundColor: colors.bg }]}>
            <Ionicons name={getIconName(category.icon)} size={22} color={colors.icon} />
          </View>
          <View style={styles.categoryInfo}>
            <Text style={styles.categoryTitle}>{category.title}</Text>
            <Text style={styles.categorySubtitle}>
              {category.alerts.length > 3 ? `${category.alerts.slice(0, 3).map(a => a.title).join(', ')}...` : category.alerts.map(a => a.title).join(', ')}
            </Text>
          </View>
          <View style={[styles.categoryCountBadge, { backgroundColor: colors.bg }]}>
            <Text style={[styles.categoryCountText, { color: colors.text }]}>{category.count}</Text>
          </View>
        </View>
        
        {/* Preview of top alerts */}
        <View style={styles.categoryPreview}>
          {category.alerts.slice(0, 2).map((alert, idx) => (
            <View key={alert.id} style={styles.previewItem}>
              <View style={[styles.previewDot, { backgroundColor: SEVERITY_COLORS[alert.severity].icon }]} />
              <Text style={styles.previewTitle} numberOfLines={1}>{alert.title}</Text>
              <Text style={styles.previewSubtitle} numberOfLines={1}>{alert.subtitle}</Text>
            </View>
          ))}
          {category.count > 2 && (
            <Text style={styles.previewMore}>+{category.count - 2} more</Text>
          )}
        </View>
        
        <View style={styles.categoryFooter}>
          <Text style={[styles.viewAllText, { color: colors.icon }]}>View All</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.icon} />
        </View>
      </TouchableOpacity>
    );
  };

  // Alert Item in Modal
  const renderAlertItem = (alert: AlertItem) => {
    const colors = SEVERITY_COLORS[alert.severity];
    
    return (
      <TouchableOpacity 
        key={alert.id} 
        style={styles.alertItem}
        onPress={() => navigateToRelated(alert)}
        activeOpacity={0.7}
      >
        <View style={[styles.alertSeverityIndicator, { backgroundColor: colors.icon }]} />
        <View style={styles.alertContent}>
          <View style={styles.alertHeader}>
            <Text style={styles.alertTitle} numberOfLines={1}>{alert.title}</Text>
            <View style={[styles.alertTypeBadge, { backgroundColor: colors.bg }]}>
              <Text style={[styles.alertTypeText, { color: colors.text }]}>
                {alert.severity === 'critical' ? '!' : '⚠'}
              </Text>
            </View>
          </View>
          <Text style={styles.alertSubtitle}>{alert.subtitle}</Text>
          
          {/* Additional details based on alert type */}
          <View style={styles.alertDetails}>
            {alert.details.phone && (
              <View style={styles.alertDetailItem}>
                <Ionicons name="call-outline" size={12} color="#64748B" />
                <Text style={styles.alertDetailText}>{alert.details.phone}</Text>
              </View>
            )}
            {alert.details.email && (
              <View style={styles.alertDetailItem}>
                <Ionicons name="mail-outline" size={12} color="#64748B" />
                <Text style={styles.alertDetailText} numberOfLines={1}>{alert.details.email}</Text>
              </View>
            )}
            {alert.details.carrier && (
              <View style={styles.alertDetailItem}>
                <Ionicons name="business-outline" size={12} color="#64748B" />
                <Text style={styles.alertDetailText}>{alert.details.carrier}</Text>
              </View>
            )}
            {alert.details.estimated_commission && (
              <View style={styles.alertDetailItem}>
                <Ionicons name="cash-outline" size={12} color="#64748B" />
                <Text style={styles.alertDetailText}>${alert.details.estimated_commission.toLocaleString()}</Text>
              </View>
            )}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
      </TouchableOpacity>
    );
  };

  // Category Modal
  const renderCategoryModal = () => {
    if (!selectedCategory) return null;
    const colors = SEVERITY_COLORS[selectedCategory.severity];
    
    return (
      <Modal
        visible={showCategoryModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCategoryModal(false)}
      >
        <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.icon }]}>
            <TouchableOpacity onPress={() => setShowCategoryModal(false)} style={styles.modalCloseBtn}>
              <Ionicons name="close" size={28} color="#1F2937" />
            </TouchableOpacity>
            <View style={styles.modalTitleContainer}>
              <View style={[styles.modalIconContainer, { backgroundColor: colors.bg }]}>
                <Ionicons name={getIconName(selectedCategory.icon)} size={20} color={colors.icon} />
              </View>
              <Text style={styles.modalTitle}>{selectedCategory.title}</Text>
            </View>
            <View style={[styles.modalCountBadge, { backgroundColor: colors.bg }]}>
              <Text style={[styles.modalCountText, { color: colors.text }]}>{selectedCategory.count}</Text>
            </View>
          </View>
          
          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            {selectedCategory.alerts.map(renderAlertItem)}
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Needs Attention</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>{user?.role?.toUpperCase()}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={24} color="#3B82F6" />
        </TouchableOpacity>
      </View>

      {/* Main Content */}
      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary Header */}
        {renderSummaryHeader()}
        
        {/* Categories or All Clear */}
        {data && data.categories.length > 0 ? (
          <View style={styles.categoriesContainer}>
            <Text style={styles.sectionTitle}>Alert Categories</Text>
            {data.categories.map(renderCategoryCard)}
          </View>
        ) : (
          renderAllClear()
        )}
        
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Category Modal */}
      {renderCategoryModal()}
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
  content: {
    flex: 1,
  },
  
  // Summary Header
  summaryHeader: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  summaryMain: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  summaryIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  summaryText: {
    flex: 1,
  },
  summaryCount: {
    fontSize: 36,
    fontWeight: '800',
    color: '#1F2937',
  },
  summaryLabel: {
    fontSize: 15,
    color: '#64748B',
    marginTop: 2,
  },
  summaryBadges: {
    flexDirection: 'row',
    gap: 12,
  },
  severityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  severityBadgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  
  // All Clear
  allClearContainer: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  allClearIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#DCFCE7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  allClearTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#22C55E',
    marginBottom: 8,
  },
  allClearText: {
    fontSize: 15,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 22,
  },
  
  // Categories Section
  categoriesContainer: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  
  // Category Card
  categoryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    overflow: 'hidden',
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 12,
  },
  categoryIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  categoryInfo: {
    flex: 1,
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  categorySubtitle: {
    fontSize: 13,
    color: '#64748B',
  },
  categoryCountBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryCountText: {
    fontSize: 14,
    fontWeight: '700',
  },
  categoryPreview: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  previewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  previewDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  previewTitle: {
    flex: 1,
    fontSize: 14,
    color: '#1F2937',
    fontWeight: '500',
  },
  previewSubtitle: {
    fontSize: 12,
    color: '#64748B',
    maxWidth: 120,
  },
  previewMore: {
    fontSize: 12,
    color: '#64748B',
    marginLeft: 14,
  },
  categoryFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 4,
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: '600',
  },
  
  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 3,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  modalIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1F2937',
  },
  modalCountBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  modalCountText: {
    fontSize: 14,
    fontWeight: '700',
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  
  // Alert Item
  alertItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  alertSeverityIndicator: {
    width: 4,
    height: '100%',
    minHeight: 80,
  },
  alertContent: {
    flex: 1,
    padding: 14,
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  alertTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
    marginRight: 8,
  },
  alertTypeBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertTypeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  alertSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 8,
  },
  alertDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  alertDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  alertDetailText: {
    fontSize: 12,
    color: '#64748B',
  },
});
