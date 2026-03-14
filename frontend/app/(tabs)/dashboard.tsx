import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { api } from '../../src/services/api';
import { format, parseISO, isToday, isTomorrow } from 'date-fns';

interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string;
  created_date: string;
}

interface Appointment {
  id: string;
  lead_id: string;
  appointment_date: string;
  appointment_time: string;
  status: string;
}

interface ComplianceCards {
  missing_soa: { count: number; label: string; color: string; icon: string };
  signed_soa: { count: number; label: string; color: string; icon: string };
  pending_no_soa: { count: number; label: string; color: string; icon: string };
  compliant_appointments: { count: number; label: string; color: string; icon: string };
  total_leads: number;
  total_upcoming_appointments: number;
}

export default function DashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [complianceCards, setComplianceCards] = useState<ComplianceCards | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const isAdminOrManager = user?.role === 'admin' || user?.role === 'manager';

  const loadData = async () => {
    try {
      const [leadsData, appointmentsData] = await Promise.all([
        api.getLeads(),
        api.getAppointments(),
      ]);
      setLeads(leadsData);
      setAppointments(appointmentsData);
      
      // Load compliance cards for admin/manager
      if (isAdminOrManager) {
        try {
          const complianceData = await api.getComplianceDashboardCards();
          setComplianceCards(complianceData);
        } catch (e) {
          console.log('Compliance cards not available');
        }
      }
    } catch (error) {
      console.log('Error loading dashboard data:', error);
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

  const upcomingAppointments = appointments
    .filter((apt) => apt.status === 'scheduled')
    .sort((a, b) => {
      const dateA = new Date(`${a.appointment_date}T${a.appointment_time}`);
      const dateB = new Date(`${b.appointment_date}T${b.appointment_time}`);
      return dateA.getTime() - dateB.getTime();
    })
    .slice(0, 5);

  const recentLeads = [...leads]
    .sort((a, b) => new Date(b.created_date).getTime() - new Date(a.created_date).getTime())
    .slice(0, 5);

  const getLeadName = (leadId: string) => {
    const lead = leads.find((l) => l.id === leadId);
    return lead?.name || 'Unknown';
  };

  const formatAppointmentDate = (dateStr: string) => {
    const date = parseISO(dateStr);
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'MMM d');
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Welcome back,</Text>
            <Text style={styles.userName}>{user?.name || 'Agent'}</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity
              style={styles.scanButton}
              onPress={() => router.push('/scanner')}
            >
              <Ionicons name="scan" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Ionicons name="people" size={28} color="#3B82F6" />
            <Text style={styles.statNumber}>{leads.length}</Text>
            <Text style={styles.statLabel}>Total Leads</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="calendar" size={28} color="#22C55E" />
            <Text style={styles.statNumber}>{upcomingAppointments.length}</Text>
            <Text style={styles.statLabel}>Upcoming</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="checkmark-circle" size={28} color="#F59E0B" />
            <Text style={styles.statNumber}>
              {appointments.filter((a) => a.status === 'completed').length}
            </Text>
            <Text style={styles.statLabel}>Completed</Text>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsGrid}>
            <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/lead/new')}>
              <View style={[styles.actionIcon, { backgroundColor: '#3B82F620' }]}>
                <Ionicons name="person-add" size={24} color="#3B82F6" />
              </View>
              <Text style={styles.actionText}>Add Lead</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/scanner')}>
              <View style={[styles.actionIcon, { backgroundColor: '#22C55E20' }]}>
                <Ionicons name="scan" size={24} color="#22C55E" />
              </View>
              <Text style={styles.actionText}>Scan Card</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/pipeline')}>
              <View style={[styles.actionIcon, { backgroundColor: '#8B5CF620' }]}>
                <Ionicons name="git-branch" size={24} color="#8B5CF6" />
              </View>
              <Text style={styles.actionText}>Pipeline</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/appointment/new')}>
              <View style={[styles.actionIcon, { backgroundColor: '#F59E0B20' }]}>
                <Ionicons name="calendar" size={24} color="#F59E0B" />
              </View>
              <Text style={styles.actionText}>Schedule</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/routes')}>
              <View style={[styles.actionIcon, { backgroundColor: '#EF444420' }]}>
                <Ionicons name="map" size={24} color="#EF4444" />
              </View>
              <Text style={styles.actionText}>Route</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/(tabs)/coach')}>
              <View style={[styles.actionIcon, { backgroundColor: '#06B6D420' }]}>
                <Ionicons name="chatbubbles" size={24} color="#06B6D4" />
              </View>
              <Text style={styles.actionText}>AI Coach</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Compliance Dashboard Cards for Admin/Manager */}
        {isAdminOrManager && complianceCards && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Medicare Compliance</Text>
              <TouchableOpacity onPress={() => router.push('/compliance')}>
                <Text style={styles.seeAll}>View Details</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.complianceGrid}>
              <TouchableOpacity 
                style={[styles.complianceCard, { borderLeftColor: '#EF4444' }]}
                onPress={() => router.push('/compliance')}
              >
                <Ionicons name="alert-circle" size={24} color="#EF4444" />
                <Text style={styles.complianceValue}>{complianceCards.missing_soa.count}</Text>
                <Text style={styles.complianceLabel}>Missing SOA</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.complianceCard, { borderLeftColor: '#22C55E' }]}
                onPress={() => router.push('/compliance')}
              >
                <Ionicons name="checkmark-circle" size={24} color="#22C55E" />
                <Text style={styles.complianceValue}>{complianceCards.signed_soa.count}</Text>
                <Text style={styles.complianceLabel}>Signed SOA</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.complianceCard, { borderLeftColor: '#F59E0B' }]}
                onPress={() => router.push('/compliance')}
              >
                <Ionicons name="warning" size={24} color="#F59E0B" />
                <Text style={styles.complianceValue}>{complianceCards.pending_no_soa.count}</Text>
                <Text style={styles.complianceLabel}>Pending</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.complianceCard, { borderLeftColor: '#3B82F6' }]}
                onPress={() => router.push('/compliance')}
              >
                <Ionicons name="shield-checkmark" size={24} color="#3B82F6" />
                <Text style={styles.complianceValue}>{complianceCards.compliant_appointments.count}</Text>
                <Text style={styles.complianceLabel}>Compliant</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Admin/Manager Quick Links */}
        {isAdminOrManager && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Agency Management</Text>
            <View style={styles.managementGrid}>
              <TouchableOpacity 
                style={styles.managementCard}
                onPress={() => router.push('/lead-distribution')}
              >
                <View style={[styles.managementIcon, { backgroundColor: '#8B5CF620' }]}>
                  <Ionicons name="git-network" size={24} color="#8B5CF6" />
                </View>
                <Text style={styles.managementText}>Lead Distribution</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.managementCard}
                onPress={() => router.push('/compliance')}
              >
                <View style={[styles.managementIcon, { backgroundColor: '#22C55E20' }]}>
                  <Ionicons name="shield-checkmark" size={24} color="#22C55E" />
                </View>
                <Text style={styles.managementText}>Compliance</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.managementCard}
                onPress={() => router.push('/agency-command-center')}
              >
                <View style={[styles.managementIcon, { backgroundColor: '#3B82F620' }]}>
                  <Ionicons name="analytics" size={24} color="#3B82F6" />
                </View>
                <Text style={styles.managementText}>Command Center</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.managementCard}
                onPress={() => router.push('/team-tree')}
              >
                <View style={[styles.managementIcon, { backgroundColor: '#F59E0B20' }]}>
                  <Ionicons name="people" size={24} color="#F59E0B" />
                </View>
                <Text style={styles.managementText}>Team Tree</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Today's Route */}
        {upcomingAppointments.length > 0 && (
          <TouchableOpacity 
            style={styles.routeBanner}
            onPress={() => router.push('/routes')}
          >
            <View style={styles.routeBannerIcon}>
              <Ionicons name="navigate" size={24} color="#FFFFFF" />
            </View>
            <View style={styles.routeBannerContent}>
              <Text style={styles.routeBannerTitle}>Today's Route</Text>
              <Text style={styles.routeBannerSubtitle}>
                {upcomingAppointments.length} stop{upcomingAppointments.length !== 1 ? 's' : ''} scheduled
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        )}

        {/* Upcoming Appointments */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Upcoming Appointments</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/calendar')}>
              <Text style={styles.seeAll}>See All</Text>
            </TouchableOpacity>
          </View>
          {upcomingAppointments.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={40} color="#64748B" />
              <Text style={styles.emptyText}>No upcoming appointments</Text>
            </View>
          ) : (
            upcomingAppointments.map((apt) => (
              <TouchableOpacity
                key={apt.id}
                style={styles.appointmentCard}
                onPress={() => router.push(`/appointment/${apt.id}`)}
              >
                <View style={styles.appointmentDate}>
                  <Text style={styles.appointmentDateText}>
                    {formatAppointmentDate(apt.appointment_date)}
                  </Text>
                  <Text style={styles.appointmentTime}>{apt.appointment_time}</Text>
                </View>
                <View style={styles.appointmentInfo}>
                  <Text style={styles.appointmentLead}>{getLeadName(apt.lead_id)}</Text>
                  <Text style={styles.appointmentStatus}>{apt.status}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#64748B" />
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Recent Leads */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Leads</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/leads')}>
              <Text style={styles.seeAll}>See All</Text>
            </TouchableOpacity>
          </View>
          {recentLeads.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={40} color="#64748B" />
              <Text style={styles.emptyText}>No leads yet</Text>
            </View>
          ) : (
            recentLeads.map((lead) => (
              <TouchableOpacity
                key={lead.id}
                style={styles.leadCard}
                onPress={() => router.push(`/lead/${lead.id}`)}
              >
                <View style={styles.leadAvatar}>
                  <Text style={styles.leadInitial}>{lead.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.leadInfo}>
                  <Text style={styles.leadName}>{lead.name}</Text>
                  <Text style={styles.leadContact}>{lead.phone || lead.email || 'No contact'}</Text>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 20,
  },
  greeting: {
    fontSize: 14,
    color: '#94A3B8',
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  headerRight: {
    flexDirection: 'row',
    gap: 12,
  },
  scanButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  seeAll: {
    color: '#3B82F6',
    fontSize: 14,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionButton: {
    width: '47%',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionText: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '500',
  },
  emptyState: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    color: '#64748B',
    marginTop: 12,
    fontSize: 14,
  },
  appointmentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  appointmentDate: {
    width: 70,
    marginRight: 16,
  },
  appointmentDateText: {
    color: '#3B82F6',
    fontSize: 14,
    fontWeight: '600',
  },
  appointmentTime: {
    color: '#94A3B8',
    fontSize: 12,
  },
  appointmentInfo: {
    flex: 1,
  },
  appointmentLead: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  appointmentStatus: {
    color: '#94A3B8',
    fontSize: 12,
    textTransform: 'capitalize',
  },
  leadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  leadAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  leadInitial: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  leadInfo: {
    flex: 1,
  },
  leadName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  leadContact: {
    color: '#94A3B8',
    fontSize: 12,
  },
  routeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B82F6',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  routeBannerIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  routeBannerContent: {
    flex: 1,
  },
  routeBannerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  routeBannerSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
  },
});
