import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetwork } from '../contexts/NetworkContext';
import { syncService, SyncServiceStatus } from '../services/syncService';

export default function NetworkStatusBanner() {
  const { isOnline } = useNetwork();
  const insets = useSafeAreaInsets();
  const [syncStatus, setSyncStatus] = useState<SyncServiceStatus>(syncService.getStatus());
  const [slideAnim] = useState(new Animated.Value(-100));

  useEffect(() => {
    const unsubscribe = syncService.subscribe(setSyncStatus);
    return unsubscribe;
  }, []);

  // Determine what to show
  const showBanner = !isOnline || syncStatus.isSyncing || syncStatus.pendingCount > 0;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: showBanner ? 0 : -100,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [showBanner, slideAnim]);

  const getBannerConfig = () => {
    if (!isOnline) {
      return {
        backgroundColor: '#F59E0B',
        icon: 'cloud-offline' as const,
        text: 'You\'re offline - changes saved locally',
        showCount: syncStatus.pendingCount > 0,
      };
    }
    if (syncStatus.isSyncing) {
      return {
        backgroundColor: '#3B82F6',
        icon: 'sync' as const,
        text: 'Syncing changes...',
        showCount: true,
      };
    }
    if (syncStatus.pendingCount > 0) {
      if (syncStatus.lastError) {
        return {
          backgroundColor: '#EF4444',
          icon: 'alert-circle' as const,
          text: 'Sync failed - tap to retry',
          showCount: true,
        };
      }
      return {
        backgroundColor: '#3B82F6',
        icon: 'time' as const,
        text: 'Changes pending sync',
        showCount: true,
      };
    }
    return null;
  };

  const config = getBannerConfig();
  if (!config) return null;

  const handlePress = () => {
    if (isOnline && (syncStatus.pendingCount > 0 || syncStatus.lastError)) {
      syncService.manualSync();
    }
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: config.backgroundColor,
          paddingTop: insets.top > 0 ? insets.top : 8,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <TouchableOpacity
        style={styles.content}
        onPress={handlePress}
        disabled={!isOnline || syncStatus.isSyncing}
        activeOpacity={0.8}
      >
        {syncStatus.isSyncing ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Ionicons name={config.icon} size={18} color="#FFFFFF" />
        )}
        <Text style={styles.text}>{config.text}</Text>
        {config.showCount && syncStatus.pendingCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{syncStatus.pendingCount}</Text>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    elevation: 1000,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 8,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  badge: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
});
