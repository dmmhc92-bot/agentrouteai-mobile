import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/services/api';
import { format } from 'date-fns';

interface Appointment {
  id: string;
  lead_id: string;
  appointment_date: string;
  appointment_time: string;
  notes: string;
  status: string;
  created_date: string;
}

interface Lead {
  id: string;
  name: string;
}

export default function AppointmentDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [lead, setLead] = useState<Lead | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = async () => {
    if (!id || id === 'new') return;
    try {
      const aptData = await api.getAppointment(id);
      setAppointment(aptData);
      const leadData = await api.getLead(aptData.lead_id);
      setLead(leadData);
    } catch (error) {
      console.log('Error loading appointment:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [id])
  );

  const handleUpdateStatus = async (status: string) => {
    try {
      await api.updateAppointment(id!, { status });
      setAppointment((prev) => (prev ? { ...prev, status } : null));
    } catch (error) {
      Alert.alert('Error', 'Failed to update status');
    }
  };

  const handleDelete = () => {
    Alert.alert('Delete Appointment', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteAppointment(id!);
            router.back();
          } catch (error) {
            Alert.alert('Error', 'Failed to delete appointment');
          }
        },
      },
    ]);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return '#22C55E';
      case 'cancelled':
        return '#EF4444';
      default:
        return '#3B82F6';
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  if (!appointment) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
        <View style={styles.errorState}>
          <Text style={styles.errorText}>Appointment not found</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Appointment</Text>
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <Ionicons name="trash-outline" size={22} color="#EF4444" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Date & Time Card */}
        <View style={styles.dateCard}>
          <View style={styles.dateIconContainer}>
            <Ionicons name="calendar" size={32} color="#3B82F6" />
          </View>
          <View style={styles.dateInfo}>
            <Text style={styles.dateText}>
              {format(new Date(appointment.appointment_date), 'EEEE, MMMM d, yyyy')}
            </Text>
            <Text style={styles.timeText}>{appointment.appointment_time}</Text>
          </View>
        </View>

        {/* Lead Info */}
        <TouchableOpacity
          style={styles.leadCard}
          onPress={() => router.push(`/lead/${appointment.lead_id}`)}
        >
          <View style={styles.leadAvatar}>
            <Text style={styles.leadInitial}>{lead?.name?.charAt(0) || '?'}</Text>
          </View>
          <View style={styles.leadInfo}>
            <Text style={styles.leadLabel}>Lead</Text>
            <Text style={styles.leadName}>{lead?.name || 'Unknown'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#64748B" />
        </TouchableOpacity>

        {/* Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Status</Text>
          <View style={styles.statusButtons}>
            {['scheduled', 'completed', 'cancelled'].map((status) => (
              <TouchableOpacity
                key={status}
                style={[
                  styles.statusButton,
                  appointment.status === status && {
                    backgroundColor: getStatusColor(status) + '30',
                    borderColor: getStatusColor(status),
                  },
                ]}
                onPress={() => handleUpdateStatus(status)}
              >
                <Text
                  style={[
                    styles.statusButtonText,
                    appointment.status === status && { color: getStatusColor(status) },
                  ]}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Notes */}
        {appointment.notes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <View style={styles.notesCard}>
              <Text style={styles.notesText}>{appointment.notes}</Text>
            </View>
          </View>
        )}

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push(`/scope/new?leadId=${appointment.lead_id}`)}
          >
            <Ionicons name="document-text" size={24} color="#8B5CF6" />
            <Text style={styles.actionButtonText}>Create Scope of Appointment</Text>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  deleteButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  errorState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 16,
  },
  dateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  dateIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#3B82F620',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  dateInfo: {
    flex: 1,
  },
  dateText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  timeText: {
    color: '#3B82F6',
    fontSize: 24,
    fontWeight: 'bold',
  },
  leadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
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
  leadLabel: {
    color: '#94A3B8',
    fontSize: 12,
  },
  leadName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  statusButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  statusButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
  },
  statusButtonText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '500',
  },
  notesCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
  },
  notesText: {
    color: '#E2E8F0',
    fontSize: 15,
    lineHeight: 24,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  actionButtonText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
  },
});
