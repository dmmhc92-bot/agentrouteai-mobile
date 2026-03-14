import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { api } from '../src/services/api';
import { format, parseISO, addDays } from 'date-fns';

interface RouteStop {
  lead_id: string;
  lead_name: string;
  address: string;
  appointment_id?: string;
  appointment_time?: string;
  latitude?: number;
  longitude?: number;
  order: number;
}

interface DailyRoute {
  date: string;
  stops: RouteStop[];
  total_distance_km: number;
  estimated_duration_mins: number;
  optimized: boolean;
}

export default function RoutePlannerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [route, setRoute] = useState<DailyRoute | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    requestLocationPermission();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadRoute();
    }, [selectedDate, currentLocation])
  );

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const location = await Location.getCurrentPositionAsync({});
        setCurrentLocation({
          lat: location.coords.latitude,
          lng: location.coords.longitude,
        });
      }
    } catch (error) {
      console.log('Location permission error:', error);
    }
  };

  const loadRoute = async () => {
    setIsLoading(true);
    try {
      const routeData = await api.getDailyRoute(
        selectedDate,
        currentLocation?.lat,
        currentLocation?.lng
      );
      setRoute(routeData);
    } catch (error) {
      console.log('Error loading route:', error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadRoute();
  };

  const handleOptimizeRoute = async () => {
    if (!route || route.stops.length === 0) return;

    setIsOptimizing(true);
    try {
      // Batch geocode any leads without coordinates
      await api.batchGeocodeLeads();
      // Reload the route
      await loadRoute();
      Alert.alert('Route Optimized', 'Your route has been optimized based on lead locations.');
    } catch (error) {
      Alert.alert('Error', 'Failed to optimize route');
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleOpenNavigation = () => {
    if (!route || route.stops.length === 0) return;

    // Build navigation URL for multi-stop route
    const stopsWithCoords = route.stops.filter((s) => s.latitude && s.longitude);
    
    if (stopsWithCoords.length === 0) {
      // Use addresses instead
      const addresses = route.stops.map((s) => encodeURIComponent(s.address)).join('/');
      const url = Platform.select({
        ios: `maps://app?daddr=${addresses}`,
        android: `google.navigation:q=${route.stops[0].address}`,
        default: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(route.stops[route.stops.length - 1].address)}&waypoints=${route.stops.slice(0, -1).map((s) => encodeURIComponent(s.address)).join('|')}`,
      });
      
      if (url) Linking.openURL(url);
      return;
    }

    // Build Google Maps directions URL with waypoints
    const origin = currentLocation
      ? `${currentLocation.lat},${currentLocation.lng}`
      : stopsWithCoords[0].address;
    
    const destination = stopsWithCoords[stopsWithCoords.length - 1];
    const waypoints = stopsWithCoords.slice(0, -1);

    let url: string;
    
    if (Platform.OS === 'ios') {
      // Apple Maps
      const waypointAddrs = waypoints.map((w) => encodeURIComponent(w.address)).join('&daddr=');
      url = `maps://app?saddr=${origin}&daddr=${waypointAddrs}&daddr=${encodeURIComponent(destination.address)}`;
    } else {
      // Google Maps
      const waypointCoords = waypoints.map((w) => `${w.latitude},${w.longitude}`).join('|');
      url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination.latitude},${destination.longitude}&waypoints=${waypointCoords}&travelmode=driving`;
    }

    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Could not open maps application');
    });
  };

  const handleOpenSingleStop = (stop: RouteStop) => {
    const address = encodeURIComponent(stop.address);
    
    let url: string;
    if (Platform.OS === 'ios') {
      url = `maps://app?daddr=${address}`;
    } else {
      url = `google.navigation:q=${address}`;
    }

    Linking.openURL(url).catch(() => {
      // Fallback to Google Maps web
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${address}`);
    });
  };

  const formatDuration = (mins: number) => {
    const hours = Math.floor(mins / 60);
    const minutes = mins % 60;
    if (hours === 0) return `${minutes} min`;
    if (minutes === 0) return `${hours}h`;
    return `${hours}h ${minutes}m`;
  };

  const dates = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i));

  if (isLoading && !route) {
    return (
      <View style={[styles.container, styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading route...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.title}>Route Planner</Text>
        <TouchableOpacity
          style={styles.optimizeButton}
          onPress={handleOptimizeRoute}
          disabled={isOptimizing}
        >
          {isOptimizing ? (
            <ActivityIndicator size="small" color="#3B82F6" />
          ) : (
            <Ionicons name="analytics" size={24} color="#3B82F6" />
          )}
        </TouchableOpacity>
      </View>

      {/* Date Selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.dateScroller}
        contentContainerStyle={styles.dateScrollerContent}
      >
        {dates.map((date) => {
          const dateStr = format(date, 'yyyy-MM-dd');
          const isSelected = dateStr === selectedDate;
          const isToday = format(new Date(), 'yyyy-MM-dd') === dateStr;

          return (
            <TouchableOpacity
              key={dateStr}
              style={[styles.dateCard, isSelected && styles.dateCardSelected]}
              onPress={() => setSelectedDate(dateStr)}
            >
              <Text style={[styles.dateDayName, isSelected && styles.dateTextSelected]}>
                {isToday ? 'Today' : format(date, 'EEE')}
              </Text>
              <Text style={[styles.dateDay, isSelected && styles.dateTextSelected]}>
                {format(date, 'd')}
              </Text>
              <Text style={[styles.dateMonth, isSelected && styles.dateTextSelected]}>
                {format(date, 'MMM')}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />
        }
      >
        {/* Route Summary */}
        {route && route.stops.length > 0 && (
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Ionicons name="location" size={24} color="#3B82F6" />
                <Text style={styles.summaryValue}>{route.stops.length}</Text>
                <Text style={styles.summaryLabel}>Stops</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Ionicons name="car" size={24} color="#22C55E" />
                <Text style={styles.summaryValue}>{route.total_distance_km}</Text>
                <Text style={styles.summaryLabel}>km</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Ionicons name="time" size={24} color="#F59E0B" />
                <Text style={styles.summaryValue}>{formatDuration(route.estimated_duration_mins)}</Text>
                <Text style={styles.summaryLabel}>Est. Time</Text>
              </View>
            </View>

            {!route.optimized && (
              <View style={styles.optimizeWarning}>
                <Ionicons name="warning" size={16} color="#F59E0B" />
                <Text style={styles.optimizeWarningText}>
                  Some addresses need geocoding for optimal routing
                </Text>
              </View>
            )}

            <TouchableOpacity style={styles.startRouteButton} onPress={handleOpenNavigation}>
              <Ionicons name="navigate" size={20} color="#FFFFFF" />
              <Text style={styles.startRouteText}>Start Navigation</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Route Stops */}
        {route && route.stops.length > 0 ? (
          <View style={styles.stopsContainer}>
            <Text style={styles.stopsTitle}>Route Order</Text>
            {route.stops.map((stop, index) => (
              <View key={stop.lead_id} style={styles.stopCard}>
                <View style={styles.stopOrderContainer}>
                  <View style={styles.stopOrder}>
                    <Text style={styles.stopOrderText}>{stop.order}</Text>
                  </View>
                  {index < route.stops.length - 1 && <View style={styles.stopLine} />}
                </View>
                
                <View style={styles.stopContent}>
                  <View style={styles.stopHeader}>
                    <Text style={styles.stopName}>{stop.lead_name}</Text>
                    {stop.appointment_time && (
                      <View style={styles.timeBadge}>
                        <Ionicons name="time-outline" size={12} color="#3B82F6" />
                        <Text style={styles.timeText}>{stop.appointment_time}</Text>
                      </View>
                    )}
                  </View>
                  
                  <Text style={styles.stopAddress} numberOfLines={2}>
                    {stop.address || 'No address'}
                  </Text>
                  
                  <View style={styles.stopActions}>
                    <TouchableOpacity
                      style={styles.stopActionButton}
                      onPress={() => router.push(`/lead/${stop.lead_id}`)}
                    >
                      <Ionicons name="person" size={16} color="#64748B" />
                      <Text style={styles.stopActionText}>View Lead</Text>
                    </TouchableOpacity>
                    
                    {stop.address && (
                      <TouchableOpacity
                        style={styles.stopActionButton}
                        onPress={() => handleOpenSingleStop(stop)}
                      >
                        <Ionicons name="navigate" size={16} color="#3B82F6" />
                        <Text style={[styles.stopActionText, { color: '#3B82F6' }]}>
                          Navigate
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="map-outline" size={60} color="#64748B" />
            <Text style={styles.emptyTitle}>No Appointments</Text>
            <Text style={styles.emptyText}>
              No scheduled appointments for {format(parseISO(selectedDate), 'MMMM d, yyyy')}
            </Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => router.push('/appointment/new')}
            >
              <Ionicons name="add" size={20} color="#FFFFFF" />
              <Text style={styles.emptyButtonText}>Schedule Appointment</Text>
            </TouchableOpacity>
          </View>
        )}
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
  loadingText: {
    color: '#94A3B8',
    marginTop: 12,
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
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  optimizeButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  dateScroller: {
    maxHeight: 100,
  },
  dateScrollerContent: {
    paddingHorizontal: 12,
    gap: 8,
  },
  dateCard: {
    width: 70,
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  dateCardSelected: {
    backgroundColor: '#3B82F6',
  },
  dateDayName: {
    color: '#94A3B8',
    fontSize: 12,
    marginBottom: 4,
  },
  dateDay: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  dateMonth: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  dateTextSelected: {
    color: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  summaryCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryValue: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 8,
  },
  summaryLabel: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: '#334155',
  },
  optimizeWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F59E0B20',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  optimizeWarningText: {
    color: '#F59E0B',
    fontSize: 12,
    flex: 1,
  },
  startRouteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  startRouteText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  stopsContainer: {
    marginBottom: 24,
  },
  stopsTitle: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 16,
    textTransform: 'uppercase',
  },
  stopCard: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  stopOrderContainer: {
    alignItems: 'center',
    width: 40,
  },
  stopOrder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopOrderText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  stopLine: {
    flex: 1,
    width: 2,
    backgroundColor: '#334155',
    marginVertical: 4,
  },
  stopContent: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginLeft: 12,
  },
  stopHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  stopName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B82F620',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  timeText: {
    color: '#3B82F6',
    fontSize: 12,
    fontWeight: '500',
  },
  stopAddress: {
    color: '#94A3B8',
    fontSize: 14,
    marginBottom: 12,
  },
  stopActions: {
    flexDirection: 'row',
    gap: 16,
  },
  stopActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stopActionText: {
    color: '#64748B',
    fontSize: 13,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    color: '#94A3B8',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B82F6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
