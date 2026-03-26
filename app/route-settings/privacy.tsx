import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../src/services/api';

type VisibilityLevel = 'private' | 'summary' | 'shared';

interface VisibilityOption {
  level: VisibilityLevel;
  title: string;
  description: string;
  icon: string;
  iconColor: string;
}

const visibilityOptions: VisibilityOption[] = [
  {
    level: 'private',
    title: 'Private Route',
    description: 'Only you can see your full route details. Admin and managers cannot view your route.',
    icon: 'lock-closed',
    iconColor: '#EF4444',
  },
  {
    level: 'summary',
    title: 'Summary View',
    description: 'Admin and managers can see your route progress (stops scheduled, completed, remaining) but not full details.',
    icon: 'eye',
    iconColor: '#F59E0B',
  },
  {
    level: 'shared',
    title: 'Shared Route',
    description: 'Admin and managers can see your full route details including addresses and appointment times.',
    icon: 'globe',
    iconColor: '#22C55E',
  },
];

export default function RoutePrivacyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const [currentLevel, setCurrentLevel] = useState<VisibilityLevel>('private');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadVisibilitySettings();
  }, []);

  const loadVisibilitySettings = async () => {
    try {
      const data = await api.getRouteVisibility();
      setCurrentLevel(data.visibility?.visibility_level || 'private');
    } catch (error) {
      console.error('Failed to load visibility settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelect = async (level: VisibilityLevel) => {
    if (level === currentLevel) return;
    
    setIsSaving(true);
    try {
      await api.updateRouteVisibility(level);
      setCurrentLevel(level);
      Alert.alert('Success', 'Route visibility updated successfully');
    } catch (error) {
      console.error('Failed to update visibility:', error);
      Alert.alert('Error', 'Failed to update route visibility');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading settings...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Route Privacy</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Info Section */}
        <View style={styles.infoCard}>
          <Ionicons name="shield-checkmark" size={24} color="#3B82F6" />
          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>Control Your Route Visibility</Text>
            <Text style={styles.infoDescription}>
              Choose who can see your daily route information. This setting affects what your admin and manager can view.
            </Text>
          </View>
        </View>

        {/* Current Setting */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Current Setting</Text>
          <View style={styles.currentCard}>
            <View style={[styles.currentIcon, { backgroundColor: `${visibilityOptions.find(o => o.level === currentLevel)?.iconColor}20` }]}>
              <Ionicons 
                name={visibilityOptions.find(o => o.level === currentLevel)?.icon as any} 
                size={24} 
                color={visibilityOptions.find(o => o.level === currentLevel)?.iconColor} 
              />
            </View>
            <View style={styles.currentContent}>
              <Text style={styles.currentTitle}>
                {visibilityOptions.find(o => o.level === currentLevel)?.title}
              </Text>
              <Text style={styles.currentDescription}>
                {visibilityOptions.find(o => o.level === currentLevel)?.description}
              </Text>
            </View>
          </View>
        </View>

        {/* Visibility Options */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Visibility Options</Text>
          <View style={styles.optionsContainer}>
            {visibilityOptions.map((option) => (
              <TouchableOpacity
                key={option.level}
                style={[
                  styles.optionCard,
                  currentLevel === option.level && styles.optionCardSelected,
                ]}
                onPress={() => handleSelect(option.level)}
                disabled={isSaving}
              >
                <View style={styles.optionHeader}>
                  <View style={[styles.optionIcon, { backgroundColor: `${option.iconColor}20` }]}>
                    <Ionicons name={option.icon as any} size={22} color={option.iconColor} />
                  </View>
                  <View style={styles.optionTitleContainer}>
                    <Text style={styles.optionTitle}>{option.title}</Text>
                    {currentLevel === option.level && (
                      <View style={styles.selectedBadge}>
                        <Text style={styles.selectedBadgeText}>Selected</Text>
                      </View>
                    )}
                  </View>
                  {currentLevel === option.level ? (
                    <Ionicons name="checkmark-circle" size={24} color="#3B82F6" />
                  ) : (
                    <Ionicons name="ellipse-outline" size={24} color="#475569" />
                  )}
                </View>
                <Text style={styles.optionDescription}>{option.description}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* What Each Level Reveals */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What Each Level Reveals</Text>
          <View style={styles.comparisonCard}>
            <View style={styles.comparisonRow}>
              <Text style={styles.comparisonLabel}>Information</Text>
              <Text style={styles.comparisonHeader}>Private</Text>
              <Text style={styles.comparisonHeader}>Summary</Text>
              <Text style={styles.comparisonHeader}>Shared</Text>
            </View>
            <View style={styles.comparisonDivider} />
            <ComparisonRow label="Has Route" private="✓" summary="✓" shared="✓" />
            <ComparisonRow label="Stop Count" private="—" summary="✓" shared="✓" />
            <ComparisonRow label="Completion %" private="—" summary="✓" shared="✓" />
            <ComparisonRow label="Addresses" private="—" summary="—" shared="✓" />
            <ComparisonRow label="Times" private="—" summary="—" shared="✓" />
            <ComparisonRow label="Lead Names" private="—" summary="—" shared="✓" />
          </View>
        </View>

        {/* Privacy Notice */}
        <View style={styles.privacyNotice}>
          <Ionicons name="information-circle-outline" size={18} color="#64748B" />
          <Text style={styles.privacyNoticeText}>
            Your personal route data is always protected. This setting only affects what your organization's admin and managers can view for team coordination purposes.
          </Text>
        </View>

        {isSaving && (
          <View style={styles.savingOverlay}>
            <ActivityIndicator color="#3B82F6" />
            <Text style={styles.savingText}>Saving...</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function ComparisonRow({ label, private: priv, summary, shared }: { label: string; private: string; summary: string; shared: string }) {
  return (
    <View style={styles.comparisonRow}>
      <Text style={styles.comparisonLabel}>{label}</Text>
      <Text style={[styles.comparisonValue, priv === '—' && styles.comparisonValueHidden]}>{priv}</Text>
      <Text style={[styles.comparisonValue, summary === '—' && styles.comparisonValueHidden]}>{summary}</Text>
      <Text style={[styles.comparisonValue, shared === '—' && styles.comparisonValueHidden]}>{shared}</Text>
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
    paddingVertical: 16,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  headerRight: {
    width: 44,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    gap: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  infoDescription: {
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 18,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  currentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  currentIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  currentContent: {
    flex: 1,
  },
  currentTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  currentDescription: {
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 18,
  },
  optionsContainer: {
    gap: 12,
  },
  optionCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  optionCardSelected: {
    borderColor: '#3B82F6',
    backgroundColor: '#1E293B',
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  optionTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  selectedBadge: {
    backgroundColor: '#3B82F620',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  selectedBadgeText: {
    fontSize: 11,
    color: '#3B82F6',
    fontWeight: '600',
  },
  optionDescription: {
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 18,
    marginLeft: 52,
  },
  comparisonCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
  },
  comparisonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  comparisonLabel: {
    flex: 2,
    fontSize: 13,
    color: '#94A3B8',
  },
  comparisonHeader: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
  },
  comparisonValue: {
    flex: 1,
    fontSize: 14,
    color: '#22C55E',
    textAlign: 'center',
    fontWeight: '600',
  },
  comparisonValueHidden: {
    color: '#475569',
  },
  comparisonDivider: {
    height: 1,
    backgroundColor: '#334155',
    marginVertical: 8,
  },
  privacyNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 12,
    gap: 10,
  },
  privacyNoticeText: {
    flex: 1,
    color: '#64748B',
    fontSize: 13,
    lineHeight: 18,
  },
  savingOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
  },
  savingText: {
    color: '#94A3B8',
    fontSize: 14,
  },
});
