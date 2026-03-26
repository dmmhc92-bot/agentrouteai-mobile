/**
 * Secure Storage Service
 * Provides encrypted storage for sensitive data using expo-secure-store
 * Falls back to AsyncStorage on web with base64 encoding
 */

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

// Storage keys
const ENCRYPTION_KEY_STORAGE = '@encryption_key';

class SecureStorageService {
  private encryptionKey: string | null = null;

  /**
   * Initialize or retrieve the encryption key
   * Used for encrypting data that can't fit in SecureStore (2048 byte limit)
   */
  private async getEncryptionKey(): Promise<string> {
    if (this.encryptionKey) return this.encryptionKey;

    try {
      if (Platform.OS === 'web') {
        // On web, use a simpler approach
        let key = await AsyncStorage.getItem(ENCRYPTION_KEY_STORAGE);
        if (!key) {
          key = await Crypto.digestStringAsync(
            Crypto.CryptoDigestAlgorithm.SHA256,
            `${Date.now()}-${Math.random()}`
          );
          await AsyncStorage.setItem(ENCRYPTION_KEY_STORAGE, key);
        }
        this.encryptionKey = key;
        return key;
      }

      // On native, use SecureStore for the key
      let key = await SecureStore.getItemAsync(ENCRYPTION_KEY_STORAGE);
      if (!key) {
        key = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          `${Date.now()}-${Math.random()}-${Platform.OS}`
        );
        await SecureStore.setItemAsync(ENCRYPTION_KEY_STORAGE, key);
      }
      this.encryptionKey = key;
      return key;
    } catch (error) {
      // Fallback to a deterministic key based on platform
      console.warn('[SecureStorage] Failed to get encryption key, using fallback');
      return 'fallback-key-for-encryption';
    }
  }

  /**
   * Simple XOR-based obfuscation for data that needs to be stored in AsyncStorage
   * This is NOT cryptographically secure but provides basic protection
   * For truly sensitive data, use setSecureItem which uses SecureStore
   */
  private async obfuscate(data: string): Promise<string> {
    const key = await this.getEncryptionKey();
    let result = '';
    for (let i = 0; i < data.length; i++) {
      const charCode = data.charCodeAt(i) ^ key.charCodeAt(i % key.length);
      result += String.fromCharCode(charCode);
    }
    // Base64 encode the result
    return btoa(unescape(encodeURIComponent(result)));
  }

  private async deobfuscate(data: string): Promise<string> {
    try {
      const key = await this.getEncryptionKey();
      const decoded = decodeURIComponent(escape(atob(data)));
      let result = '';
      for (let i = 0; i < decoded.length; i++) {
        const charCode = decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length);
        result += String.fromCharCode(charCode);
      }
      return result;
    } catch (error) {
      // If deobfuscation fails, return empty string
      console.warn('[SecureStorage] Deobfuscation failed');
      return '';
    }
  }

  /**
   * Store small sensitive data securely (< 2048 bytes)
   * Uses iOS Keychain / Android Keystore
   */
  async setSecureItem(key: string, value: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        // Web fallback - obfuscate and store
        const obfuscated = await this.obfuscate(value);
        await AsyncStorage.setItem(key, obfuscated);
        return;
      }
      await SecureStore.setItemAsync(key, value);
    } catch (error) {
      console.warn('[SecureStorage] setSecureItem failed:', error);
      // Fallback to AsyncStorage with obfuscation
      const obfuscated = await this.obfuscate(value);
      await AsyncStorage.setItem(key, obfuscated);
    }
  }

  /**
   * Retrieve small sensitive data securely
   */
  async getSecureItem(key: string): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        const obfuscated = await AsyncStorage.getItem(key);
        if (!obfuscated) return null;
        return await this.deobfuscate(obfuscated);
      }
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      console.warn('[SecureStorage] getSecureItem failed:', error);
      // Try fallback
      const obfuscated = await AsyncStorage.getItem(key);
      if (!obfuscated) return null;
      return await this.deobfuscate(obfuscated);
    }
  }

  /**
   * Delete secure item
   */
  async deleteSecureItem(key: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        await AsyncStorage.removeItem(key);
        return;
      }
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      console.warn('[SecureStorage] deleteSecureItem failed:', error);
      await AsyncStorage.removeItem(key);
    }
  }

  /**
   * Store larger data with obfuscation (for data > 2048 bytes)
   * Uses AsyncStorage with obfuscation
   */
  async setObfuscatedItem(key: string, value: string): Promise<void> {
    try {
      const obfuscated = await this.obfuscate(value);
      await AsyncStorage.setItem(key, obfuscated);
    } catch (error) {
      console.warn('[SecureStorage] setObfuscatedItem failed:', error);
      throw error;
    }
  }

  /**
   * Retrieve larger obfuscated data
   */
  async getObfuscatedItem(key: string): Promise<string | null> {
    try {
      const obfuscated = await AsyncStorage.getItem(key);
      if (!obfuscated) return null;
      return await this.deobfuscate(obfuscated);
    } catch (error) {
      console.warn('[SecureStorage] getObfuscatedItem failed:', error);
      return null;
    }
  }

  /**
   * Delete obfuscated item
   */
  async deleteObfuscatedItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
  }
}

export const secureStorage = new SecureStorageService();
