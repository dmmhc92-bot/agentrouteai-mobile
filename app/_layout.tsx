import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../src/contexts/AuthContext';
import { NotificationProvider } from '../src/contexts/NotificationContext';
import { NetworkProvider } from '../src/contexts/NetworkContext';
import { AppLockProvider } from '../src/contexts/AppLockContext';
import { SubscriptionProvider } from '../src/contexts/SubscriptionContext';
import { UsageProvider, useUsage } from '../src/contexts/UsageContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, View } from 'react-native';
import NetworkStatusBanner from '../src/components/NetworkStatusBanner';
import { AppLockScreen } from '../src/components/AppLockScreen';
import SubscriptionPrompt from '../src/components/SubscriptionPrompt';

// Component that renders the subscription prompt
function UsagePromptWrapper() {
  const { showSubscriptionPrompt, dismissPrompt } = useUsage();
  
  return (
    <SubscriptionPrompt 
      visible={showSubscriptionPrompt} 
      onDismiss={dismissPrompt} 
    />
  );
}

// Inner component that has access to auth state
function AppContent() {
  const { user } = useAuth();
  const isAuthenticated = !!user;

  return (
    <AppLockProvider isAuthenticated={isAuthenticated}>
      <SubscriptionProvider>
        <UsageProvider>
          <NetworkProvider>
            <View style={styles.container}>
              <NetworkStatusBanner />
              <StatusBar style="light" />
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: '#0F172A' },
                  animation: 'slide_from_right',
                }}
              >
                <Stack.Screen name="index" />
                <Stack.Screen name="(auth)" />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen 
                  name="subscription" 
                  options={{ 
                    presentation: 'modal',
                    animation: 'slide_from_bottom',
                  }} 
                />
              </Stack>
              {/* App Lock Overlay - only shows when locked */}
              <AppLockScreen />
              {/* Subscription Prompt - non-blocking */}
              <UsagePromptWrapper />
            </View>
          </NetworkProvider>
        </UsageProvider>
      </SubscriptionProvider>
    </AppLockProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <AuthProvider>
          <NotificationProvider>
            <AppContent />
          </NotificationProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
