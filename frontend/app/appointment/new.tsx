import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Calendar } from 'react-native-calendars';
import { api } from '../../src/services/api';
import { format } from 'date-fns';

interface Lead {
  id: string;
  name: string;
}

export default function NewAppointmentScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { leadId } = useLocalSearchParams<{ leadId?: string }>();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLead, setSelectedLead] = useState<string>(leadId || '');
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedTime, setSelectedTime] = useState('09:00');
  const [notes, setNotes] = useState('');
  const [showLeadPicker, setShowLeadPicker] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadLeads();
  }, []);

  const loadLeads = async () => {
    try {
      const data = await api.getLeads();
      setLeads(data);
      if (leadId) {
        setSelectedLead(leadId);
      }
    } catch (error) {
      console.log('Error loading leads:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const timeSlots = [
    '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
    '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
    '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
    '17:00', '17:30', '18:00',
  ];

  const handleSave = async () => {
    if (!selectedLead) {
      Alert.alert('Error', 'Please select a lead');
      return;
    }

    setIsSaving(true);
    try {
      await api.createAppointment({
        lead_id: selectedLead,
        appointment_date: selectedDate,
        appointment_time: selectedTime,
        notes: notes.trim(),
        status: 'scheduled',
      });
      router.back();
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Failed to create appointment';
      Alert.alert('Error', message);
    } finally {
      setIsSaving(false);
    }
  };

  const getSelectedLeadName = () => {
    const lead = leads.find((l) => l.id === selectedLead);
    return lead?.name || 'Select a lead';
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="close" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.title}>New Appointment</Text>
        <TouchableOpacity
          style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Lead Selector */}
        <View style={styles.section}>
          <Text style={styles.label}>Lead *</Text>
          <TouchableOpacity
            style={styles.selectorButton}
            onPress={() => setShowLeadPicker(!showLeadPicker)}
          >
            <Ionicons name="person" size={20} color="#64748B" />
            <Text style={[styles.selectorText, !selectedLead && styles.placeholder]}>
              {getSelectedLeadName()}
            </Text>
            <Ionicons name={showLeadPicker ? 'chevron-up' : 'chevron-down'} size={20} color="#64748B" />
          </TouchableOpacity>
          {showLeadPicker && (
            <View style={styles.pickerContainer}>
              {leads.length === 0 ? (
                <Text style={styles.noLeadsText}>No leads available</Text>
              ) : (
                leads.map((lead) => (
                  <TouchableOpacity
                    key={lead.id}
                    style={[
                      styles.pickerItem,
                      selectedLead === lead.id && styles.pickerItemSelected,
                    ]}
                    onPress={() => {
                      setSelectedLead(lead.id);
                      setShowLeadPicker(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.pickerItemText,
                        selectedLead === lead.id && styles.pickerItemTextSelected,
                      ]}
                    >
                      {lead.name}
                    </Text>
                    {selectedLead === lead.id && (
                      <Ionicons name="checkmark" size={20} color="#3B82F6" />
                    )}
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}
        </View>

        {/* Calendar */}
        <View style={styles.section}>
          <Text style={styles.label}>Date</Text>
          <Calendar
            theme={{
              backgroundColor: '#1E293B',
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
            markedDates={{
              [selectedDate]: { selected: true, selectedColor: '#3B82F6' },
            }}
            onDayPress={(day: any) => setSelectedDate(day.dateString)}
            minDate={format(new Date(), 'yyyy-MM-dd')}
          />
        </View>

        {/* Time Slots */}
        <View style={styles.section}>
          <Text style={styles.label}>Time</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.timeGrid}>
              {timeSlots.map((time) => (
                <TouchableOpacity
                  key={time}
                  style={[
                    styles.timeSlot,
                    selectedTime === time && styles.timeSlotSelected,
                  ]}
                  onPress={() => setSelectedTime(time)}
                >
                  <Text
                    style={[
                      styles.timeSlotText,
                      selectedTime === time && styles.timeSlotTextSelected,
                    ]}
                  >
                    {time}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Notes */}
        <View style={styles.section}>
          <Text style={styles.label}>Notes</Text>
          <View style={styles.textAreaContainer}>
            <TextInput
              style={styles.textArea}
              placeholder="Add notes for this appointment..."
              placeholderTextColor="#64748B"
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  saveButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  label: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 12,
  },
  selectorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 56,
    gap: 12,
  },
  selectorText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
  },
  placeholder: {
    color: '#64748B',
  },
  pickerContainer: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    marginTop: 8,
    overflow: 'hidden',
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  pickerItemSelected: {
    backgroundColor: '#3B82F620',
  },
  pickerItemText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  pickerItemTextSelected: {
    color: '#3B82F6',
    fontWeight: '600',
  },
  noLeadsText: {
    color: '#64748B',
    padding: 16,
    textAlign: 'center',
  },
  calendar: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  timeGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  timeSlot: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1E293B',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  timeSlotSelected: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  timeSlotText: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '500',
  },
  timeSlotTextSelected: {
    color: '#FFFFFF',
  },
  textAreaContainer: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
  },
  textArea: {
    color: '#FFFFFF',
    fontSize: 16,
    minHeight: 100,
  },
});
