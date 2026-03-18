import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';

// Only import WebView for native platforms
let WebView: any = null;
if (Platform.OS !== 'web') {
  WebView = require('react-native-webview').WebView;
}

const BASE_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || 
                 process.env.EXPO_PUBLIC_BACKEND_URL || 
                 'https://profile-photo-upload-2.preview.emergentagent.com';

export default function LegalScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  
  const [isLoading, setIsLoading] = useState(true);
  
  // Get the page type from params
  const pageType = params.type as string || 'privacy';
  
  const getPageInfo = () => {
    switch (pageType) {
      case 'terms':
        return {
          title: 'Terms of Service',
          url: `${BASE_URL}/api/terms`,
        };
      case 'privacy':
      default:
        return {
          title: 'Privacy Policy',
          url: `${BASE_URL}/api/privacy`,
        };
    }
  };
  
  const pageInfo = getPageInfo();

  const handleOpenExternal = async () => {
    try {
      await Linking.openURL(pageInfo.url);
    } catch (error) {
      console.error('Failed to open URL:', error);
    }
  };

  // Web platform: Show iframe
  if (Platform.OS === 'web') {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{pageInfo.title}</Text>
          <TouchableOpacity style={styles.externalButton} onPress={handleOpenExternal}>
            <Ionicons name="open-outline" size={20} color="#3B82F6" />
          </TouchableOpacity>
        </View>

        {/* Web: Use iframe */}
        <View style={styles.webViewContainer}>
          {isLoading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#3B82F6" />
              <Text style={styles.loadingText}>Loading...</Text>
            </View>
          )}
          <iframe
            src={pageInfo.url}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              backgroundColor: '#0F172A',
            }}
            onLoad={() => setIsLoading(false)}
          />
        </View>
      </View>
    );
  }

  // Native platform: Use WebView
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{pageInfo.title}</Text>
        <View style={styles.headerRight} />
      </View>

      {/* WebView */}
      <View style={styles.webViewContainer}>
        {isLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        )}
        {WebView && (
          <WebView
            source={{ uri: pageInfo.url }}
            style={styles.webView}
            onLoadStart={() => setIsLoading(true)}
            onLoadEnd={() => setIsLoading(false)}
            startInLoadingState={true}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            originWhitelist={['*']}
            allowsBackForwardNavigationGestures={true}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
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
  externalButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  webViewContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  webView: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    zIndex: 1,
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 12,
    fontSize: 14,
  },
});
