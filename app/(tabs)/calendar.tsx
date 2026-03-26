import React, { useState, useCallback } from 'react';
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
import { Calendar } from 'react-native-calendars';
import { api } from '../../src/services/api';
import { format, parseISO } from 'date-fns';

interface Appointment {
  id: string;
  lead_id: string;
  appointment_date: string;
  appointment_time: string;
  notes: string;
  status: string;
}

interface Lead {
  id: string;
  name: string;
}

export default function CalendarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const [appointmentsData, leadsData] = await Promise.all([
        api.getAppointments(),
        api.getLeads(),
      ]);
      setAppointments(appointmentsData);
      setLeads(leadsData);
    } catch (error) {
      console.log('Error loading calendar data:', error);
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

  const getLeadName = (leadId: string) => {
    const lead = leads.find((l) => l.id === leadId);
    return lead?.name || 'Unknown';
  };

  const markedDates = appointments.reduce((acc, apt) => {
    const date = apt.appointment_date;
    if (!acc[date]) {
      acc[date] = { marked: true, dotColor: '#3B82F6' };
    }
    if (date === selectedDate) {
      acc[date] = { ...acc[date], selected: true, selectedColor: '#3B82F6' };
    }
    return acc;
  }, {} as Record<string, any>);

  if (!markedDates[selectedDate]) {
    markedDates[selectedDate] = { selected: true, selectedColor: '#3B82F6' };
  }

  const dayAppointments = appointments
    .filter((apt) => apt.appointment_date === selectedDate)
    .sort((a, b) => a.appointment_time.localeCompare(b.appointment_time));

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

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Calendar</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => router.push('/appointment/new')}
        >
          <Ionicons name="add" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />
        }
      >
        <Calendar
          theme={{
            backgroundColor: '#0F172A',
            calendarBackground: '#1E293B',
            textSectionTitleColor: '#94A3B8',
            selectedDayBackgroundColor: '#3B82F6',
            selectedDayTextColor: '#FFFFFF',
            todayTextColor: '#3B82F6',
            dayTextColor: '#FFFFFF',
            textDisabledColor: '#475569',
            monthTextColor: '#FFFFFF',
            arrowColor: '#3B82F6',
          }}
          style={styles.calendar}
          markedDates={markedDates}
          onDayPress={(day: any) => setSelectedDate(day.dateString)}
        />

        <View style={styles.appointmentsSection}>
          <Text style={styles.sectionTitle}>
            {format(parseISO(selectedDate), 'EEEE, MMMM d')}
          </Text>

          {dayAppointments.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={40} color="#64748B" />
              <Text style={styles.emptyText}>No appointments on this day</Text>
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => router.push('/appointment/new')}
              >
                <Text style={styles.emptyButtonText}>Schedule Appointment</Text>
              </TouchableOpacity>
            </View>
          ) : (
            dayAppointments.map((apt) => (
              <TouchableOpacity
                key={apt.id}
                style={styles.appointmentCard}
                onPress={() => router.push(`/appointment/${apt.id}`)}
              >
                <View style={[styles.statusBar, { backgroundColor: getStatusColor(apt.status) }]} />
                <View style={styles.appointmentContent}>
                  <View style={styles.appointmentHeader}>
                    <Text style={styles.appointmentTime}>{apt.appointment_time}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(apt.status) + '20' }]}>
                      <Text style={[styles.statusText, { color: getStatusColor(apt.status) }]}>
                        {apt.status}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.appointmentLead}>{getLeadName(apt.lead_id)}</Text>
                  {apt.notes ? (
                    <Text style={styles.appointmentNotes} numberOfLines={2}>
                      {apt.notes}
                    </Text>
                  ) : null}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendar: {
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  appointmentsSection: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  emptyState: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    color: '#94A3B8',
    marginTop: 12,
    marginBottom: 16,
    fontSize: 14,
  },
  emptyButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  appointmentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  statusBar: {
    width: 4,
    alignSelf: 'stretch',
  },
  appointmentContent: {
    flex: 1,
    padding: 16,
  },
  appointmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  appointmentTime: {
    color: '#3B82F6',
    fontSize: 16,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  appointmentLead: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  appointmentNotes: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 4,
  },
});
