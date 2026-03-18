import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SyncStatus } from '../services/offlineStorage';

interface SyncStatusIndicatorProps {
  status: SyncStatus | 'online';
  compact?: boolean;
}

export default function SyncStatusIndicator({ status, compact = false }: SyncStatusIndicatorProps) {
  const getConfig = () => {
    switch (status) {
      case 'pending':
        return {
          icon: 'time' as const,
          color: '#F59E0B',
          text: 'Saved locally',
          bgColor: '#F59E0B20',
        };
      case 'syncing':
        return {
          icon: 'sync' as const,
          color: '#3B82F6',
          text: 'Syncing...',
          bgColor: '#3B82F620',
          showSpinner: true,
        };
      case 'failed':
        return {
          icon: 'alert-circle' as const,
          color: '#EF4444',
          text: 'Sync failed',
          bgColor: '#EF444420',
        };
      case 'synced':
        return {
          icon: 'checkmark-circle' as const,
          color: '#22C55E',
          text: 'Synced',
          bgColor: '#22C55E20',
        };
      case 'online':
      default:
        return null;
    }
  };

  const config = getConfig();
  if (!config) return null;

  if (compact) {
    return (
      <View style={[styles.compactContainer, { backgroundColor: config.bgColor }]}>
        {config.showSpinner ? (
          <ActivityIndicator size="small" color={config.color} />
        ) : (
          <Ionicons name={config.icon} size={14} color={config.color} />
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: config.bgColor }]}>
      {config.showSpinner ? (
        <ActivityIndicator size="small" color={config.color} />
      ) : (
        <Ionicons name={config.icon} size={16} color={config.color} />
      )}
      <Text style={[styles.text, { color: config.color }]}>{config.text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  compactContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontSize: 13,
    fontWeight: '500',
  },
});
