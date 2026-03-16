import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';

type RequiredRole = 'admin' | 'manager' | 'agent' | 'admin_or_manager' | 'any';

interface RouteGuardProps {
  children: React.ReactNode;
  requiredRole?: RequiredRole;
  requireTeam?: boolean;
  requireSolo?: boolean;
  fallbackRoute?: string;
  showAccessDenied?: boolean;
}

/**
 * RouteGuard - Protects routes based on authentication and role requirements.
 * 
 * Usage:
 * <RouteGuard requiredRole="admin">
 *   <AdminScreen />
 * </RouteGuard>
 * 
 * @param requiredRole - The role required to access this route
 * @param requireTeam - If true, user must be part of a team (not solo)
 * @param requireSolo - If true, user must be in solo mode
 * @param fallbackRoute - Route to redirect to if access denied
 * @param showAccessDenied - Show access denied message instead of redirecting
 */
export function RouteGuard({
  children,
  requiredRole = 'any',
  requireTeam = false,
  requireSolo = false,
  fallbackRoute,
  showAccessDenied = false,
}: RouteGuardProps) {
  const router = useRouter();
  const { user, isLoading, isAdmin, isManager, isAgent, isSoloMode, isConnectedMode, token } = useAuth();
  const [accessDenied, setAccessDenied] = useState(false);
  const [deniedReason, setDeniedReason] = useState('');

  useEffect(() => {
    if (isLoading) return;

    // Check if user is authenticated
    if (!user || !token) {
      if (fallbackRoute) {
        router.replace(fallbackRoute as any);
      } else {
        router.replace('/(auth)/signin');
      }
      return;
    }

    // Check role requirements
    let hasRequiredRole = false;
    switch (requiredRole) {
      case 'admin':
        hasRequiredRole = isAdmin;
        break;
      case 'manager':
        hasRequiredRole = isManager;
        break;
      case 'agent':
        hasRequiredRole = isAgent;
        break;
      case 'admin_or_manager':
        hasRequiredRole = isAdmin || isManager;
        break;
      case 'any':
        hasRequiredRole = true;
        break;
    }

    if (!hasRequiredRole) {
      setAccessDenied(true);
      setDeniedReason(`This screen requires ${requiredRole} access.`);
      if (!showAccessDenied && fallbackRoute) {
        router.replace(fallbackRoute as any);
      } else if (!showAccessDenied) {
        // Default fallback based on role
        const defaultRoute = isAdmin || isManager ? '/command-center' : '/(tabs)/dashboard';
        router.replace(defaultRoute as any);
      }
      return;
    }

    // Check team requirements
    if (requireTeam && isSoloMode) {
      setAccessDenied(true);
      setDeniedReason('This feature requires team membership.');
      if (!showAccessDenied && fallbackRoute) {
        router.replace(fallbackRoute as any);
      }
      return;
    }

    if (requireSolo && isConnectedMode) {
      setAccessDenied(true);
      setDeniedReason('This feature is only available in solo mode.');
      if (!showAccessDenied && fallbackRoute) {
        router.replace(fallbackRoute as any);
      }
      return;
    }

    // Access granted
    setAccessDenied(false);
  }, [user, isLoading, token, requiredRole, requireTeam, requireSolo]);

  // Show loading state
  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  // Show access denied message
  if (accessDenied && showAccessDenied) {
    return (
      <View style={styles.container}>
        <View style={styles.accessDeniedCard}>
          <View style={styles.iconCircle}>
            <Ionicons name="lock-closed" size={40} color="#EF4444" />
          </View>
          <Text style={styles.accessDeniedTitle}>Access Restricted</Text>
          <Text style={styles.accessDeniedMessage}>{deniedReason}</Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Access granted - render children
  if (!accessDenied && user) {
    return <>{children}</>;
  }

  // Default loading state while redirecting
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#3B82F6" />
    </View>
  );
}

/**
 * withRouteGuard - HOC version of RouteGuard for class components
 */
export function withRouteGuard(
  WrappedComponent: React.ComponentType<any>,
  options: Omit<RouteGuardProps, 'children'>
) {
  return function GuardedComponent(props: any) {
    return (
      <RouteGuard {...options}>
        <WrappedComponent {...props} />
      </RouteGuard>
    );
  };
}

/**
 * useRouteGuard - Hook for programmatic route protection
 */
export function useRouteGuard(requiredRole: RequiredRole = 'any') {
  const { user, isLoading, isAdmin, isManager, isAgent, token } = useAuth();
  const router = useRouter();

  const checkAccess = (): boolean => {
    if (isLoading || !user || !token) return false;

    switch (requiredRole) {
      case 'admin':
        return isAdmin;
      case 'manager':
        return isManager;
      case 'agent':
        return isAgent;
      case 'admin_or_manager':
        return isAdmin || isManager;
      case 'any':
        return true;
      default:
        return false;
    }
  };

  const redirectToAppropriate = () => {
    if (!user) {
      router.replace('/(auth)/signin');
    } else if (isAdmin || isManager) {
      router.replace('/command-center');
    } else {
      router.replace('/(tabs)/dashboard');
    }
  };

  return {
    isLoading,
    hasAccess: checkAccess(),
    redirectToAppropriate,
    user,
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 16,
    fontSize: 16,
  },
  accessDeniedCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    maxWidth: 320,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EF444420',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  accessDeniedTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  accessDeniedMessage: {
    fontSize: 15,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    gap: 8,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
