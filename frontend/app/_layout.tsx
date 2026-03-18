import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../src/contexts/AuthContext';
import { NotificationProvider } from '../src/contexts/NotificationContext';
import { NetworkProvider } from '../src/contexts/NetworkContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, View } from 'react-native';
import NetworkStatusBanner from '../src/components/NetworkStatusBanner';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <AuthProvider>
          <NotificationProvider>
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
                  <Stack.Screen name="(auth)/signin" />
                  <Stack.Screen name="(auth)/signup" />
                  <Stack.Screen name="(auth)/onboarding" />
                  <Stack.Screen name="(auth)/forgot-password" />
                  <Stack.Screen name="(tabs)" />
                </Stack>
              </View>
            </NetworkProvider>
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
