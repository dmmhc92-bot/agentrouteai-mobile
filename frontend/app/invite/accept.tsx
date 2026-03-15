import React, { useState } from 'react';
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
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { api } from '../../src/services/api';

interface InviteInfo {
  valid: boolean;
  email: string;
  name?: string;
  role: string;
  invited_by_name: string;
  expires_at: string;
}

const ROLE_COLORS: Record<string, string> = {
  admin: '#8B5CF6',
  manager: '#3B82F6',
  agent: '#22C55E',
};

export default function AcceptInviteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signUp } = useAuth();

  const [token, setToken] = useState<string>('');
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const validateToken = async () => {
    if (!token.trim()) {
      setError('Please enter an invitation token');
      return;
    }

    setIsValidating(true);
    setError(null);

    try {
      const data = await api.validateInvitation(token.trim());
      setInviteInfo(data);
      if (data.name) {
        setName(data.name);
      }
    } catch (err: any) {
      const message = err.response?.data?.detail || 'Invalid or expired invitation';
      setError(message);
      setInviteInfo(null);
    } finally {
      setIsValidating(false);
    }
  };

  const handleAcceptInvite = async () => {
    if (!inviteInfo) {
      Alert.alert('Error', 'Please validate your invitation first');
      return;
    }

    if (!name.trim()) {
      Alert.alert('Error', 'Please enter your name');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    setIsLoading(true);
    try {
      await signUp(name.trim(), inviteInfo.email, password, token);
      Alert.alert(
        'Welcome!',
        `You've joined as ${inviteInfo.role.charAt(0).toUpperCase() + inviteInfo.role.slice(1)}`,
        [{ text: 'Get Started', onPress: () => router.replace('/(tabs)/dashboard') }]
      );
    } catch (err: any) {
      const message = err.response?.data?.detail || 'Failed to accept invitation';
      Alert.alert('Error', message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>

        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <Ionicons name="mail-open" size={40} color="#FFFFFF" />
          </View>
          <Text style={styles.title}>Accept Invitation</Text>
          <Text style={styles.subtitle}>
            {inviteInfo ? `Join as ${inviteInfo.role}` : 'Enter your invitation code'}
          </Text>
        </View>

        {/* Token Input (if not already validated) */}
        {!inviteInfo && (
          <View style={styles.form}>
            <View style={styles.inputContainer}>
              <Ionicons name="key-outline" size={20} color="#64748B" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Invitation Token"
                placeholderTextColor="#64748B"
                value={token}
                onChangeText={setToken}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {error && (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={20} color="#EF4444" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.validateButton, isValidating && styles.buttonDisabled]}
              onPress={validateToken}
              disabled={isValidating}
            >
              {isValidating ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.validateButtonText}>Validate Invitation</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Invite Info & Registration Form */}
        {inviteInfo && (
          <>
            <View style={styles.inviteBanner}>
              <View style={[styles.roleIcon, { backgroundColor: ROLE_COLORS[inviteInfo.role] }]}>
                <Ionicons
                  name={inviteInfo.role === 'manager' ? 'people' : 'person'}
                  size={24}
                  color="#FFFFFF"
                />
              </View>
              <View style={styles.inviteBannerText}>
                <Text style={styles.inviteBannerTitle}>
                  You're joining as {inviteInfo.role.charAt(0).toUpperCase() + inviteInfo.role.slice(1)}
                </Text>
                <Text style={styles.inviteBannerSubtitle}>
                  Invited by {inviteInfo.invited_by_name}
                </Text>
              </View>
              <Ionicons name="checkmark-circle" size={24} color="#22C55E" />
            </View>

            <View style={styles.form}>
              <View style={styles.inputContainer}>
                <Ionicons name="mail-outline" size={20} color="#64748B" style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, styles.inputDisabled]}
                  value={inviteInfo.email}
                  editable={false}
                />
              </View>

              <View style={styles.inputContainer}>
                <Ionicons name="person-outline" size={20} color="#64748B" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Full Name"
                  placeholderTextColor="#64748B"
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                />
              </View>

              <View style={styles.inputContainer}>
                <Ionicons name="lock-closed-outline" size={20} color="#64748B" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Password"
                  placeholderTextColor="#64748B"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color="#64748B"
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.inputContainer}>
                <Ionicons name="lock-closed-outline" size={20} color="#64748B" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Confirm Password"
                  placeholderTextColor="#64748B"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                />
              </View>

              <TouchableOpacity
                style={[styles.acceptButton, isLoading && styles.buttonDisabled]}
                onPress={handleAcceptInvite}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.acceptButtonText}>Accept Invitation & Join</Text>
                )}
              </TouchableOpacity>

              <Text style={styles.noteText}>
                Your role and team assignment are set by the invitation and cannot be changed.
              </Text>
            </View>
          </>
        )}

        {/* Link to regular signup */}
        <View style={styles.signInContainer}>
          <Text style={styles.signInText}>No invitation? </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/signup')}>
            <Text style={styles.signInLink}>Sign up normally</Text>
          </TouchableOpacity>
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
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  backButton: {
    marginBottom: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#94A3B8',
  },
  form: {
    gap: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 56,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
  },
  inputDisabled: {
    color: '#64748B',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EF444420',
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
    flex: 1,
  },
  validateButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  validateButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  inviteBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#22C55E15',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#22C55E40',
    gap: 12,
  },
  roleIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inviteBannerText: {
    flex: 1,
  },
  inviteBannerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  inviteBannerSubtitle: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 2,
  },
  acceptButton: {
    backgroundColor: '#22C55E',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  acceptButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  noteText: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
  signInContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 32,
  },
  signInText: {
    color: '#94A3B8',
    fontSize: 14,
  },
  signInLink: {
    color: '#3B82F6',
    fontSize: 14,
    fontWeight: '600',
  },
});
