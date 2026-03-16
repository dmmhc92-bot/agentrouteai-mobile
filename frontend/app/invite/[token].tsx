import React, { useState, useEffect } from 'react';
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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { api } from '../../src/services/api';
import * as SecureStore from 'expo-secure-store';

type FlowStep = 'validating' | 'invalid' | 'choose' | 'signin' | 'signup' | 'success';

interface InviteInfo {
  valid: boolean;
  status: string;
  email?: string;
  name?: string;
  role: string;
  organization_id?: string;
  organization_name?: string;
  invited_by_name?: string;
  expires_at?: string;
  message?: string;
  is_email_locked?: boolean;
}

const ROLE_COLORS: Record<string, string> = {
  admin: '#8B5CF6',
  manager: '#3B82F6',
  agent: '#22C55E',
};

const ROLE_ICONS: Record<string, string> = {
  admin: 'shield-checkmark',
  manager: 'people',
  agent: 'person',
};

export default function AcceptInviteScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();

  const [step, setStep] = useState<FlowStep>('validating');
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Form fields
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const token = params.token as string;

  // Validate invite on mount
  useEffect(() => {
    if (token) {
      validateInvite();
    } else {
      setStep('invalid');
      setErrorMessage('No invitation token provided');
    }
  }, [token]);

  const validateInvite = async () => {
    setStep('validating');
    try {
      const data = await api.validateInviteLink(token);
      setInviteInfo(data);
      
      if (!data.valid) {
        setStep('invalid');
        setErrorMessage(data.message || 'Invalid invitation');
        return;
      }
      
      // Pre-fill fields if provided
      if (data.email) setEmail(data.email);
      if (data.name) setName(data.name);
      
      // Go to choice step
      setStep('choose');
    } catch (error: any) {
      setStep('invalid');
      setErrorMessage(error.response?.data?.detail || 'Failed to validate invitation');
    }
  };

  const getRouteForRole = (role: string): string => {
    switch (role) {
      case 'admin':
      case 'manager':
        return '/command-center';
      default:
        return '/(tabs)/dashboard';
    }
  };

  const handleExistingUser = () => {
    setStep('signin');
  };

  const handleNewUser = () => {
    setStep('signup');
  };

  const handleSignInAndJoin = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email');
      return;
    }
    if (!password) {
      Alert.alert('Error', 'Please enter your password');
      return;
    }

    setIsProcessing(true);
    try {
      const response = await api.acceptInviteLink({
        token,
        email: email.trim(),
        password,
        is_existing_user: true,
      });
      
      // Store token and update auth state
      await SecureStore.setItemAsync('auth_token', response.access_token);
      api.setAuthToken(response.access_token);
      
      setStep('success');
      
      // Navigate after short delay
      setTimeout(() => {
        const route = getRouteForRole(response.user.role);
        router.replace(route as any);
      }, 2000);
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Failed to join team';
      
      if (error.response?.status === 409) {
        Alert.alert(
          'Already in Another Team',
          message,
          [
            { text: 'OK' },
            { text: 'Contact Support', onPress: () => router.push('/(tabs)/settings') }
          ]
        );
      } else if (error.response?.status === 401) {
        Alert.alert('Error', 'Invalid password. Please try again.');
      } else {
        Alert.alert('Error', message);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSignUpAndJoin = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter your name');
      return;
    }
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email');
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

    setIsProcessing(true);
    try {
      const response = await api.acceptInviteLink({
        token,
        email: email.trim(),
        password,
        name: name.trim(),
        is_existing_user: false,
      });
      
      // Store token and update auth state
      await SecureStore.setItemAsync('auth_token', response.access_token);
      api.setAuthToken(response.access_token);
      
      setStep('success');
      
      // Navigate after short delay
      setTimeout(() => {
        const route = getRouteForRole(response.user.role);
        router.replace(route as any);
      }, 2000);
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Failed to create account';
      Alert.alert('Error', message);
    } finally {
      setIsProcessing(false);
    }
  };

  // Render validating state
  if (step === 'validating') {
    return (
      <View style={[styles.container, styles.centerContent, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Validating invitation...</Text>
      </View>
    );
  }

  // Render invalid state
  if (step === 'invalid') {
    const statusIcon = inviteInfo?.status === 'expired' ? 'time-outline' :
                       inviteInfo?.status === 'revoked' ? 'close-circle-outline' :
                       inviteInfo?.status === 'accepted' ? 'checkmark-circle-outline' :
                       'alert-circle-outline';
    
    const statusColor = inviteInfo?.status === 'accepted' ? '#22C55E' : '#EF4444';
    
    return (
      <View style={[styles.container, styles.centerContent, { paddingTop: insets.top }]}>
        <View style={styles.errorCard}>
          <View style={[styles.errorIconCircle, { backgroundColor: `${statusColor}20` }]}>
            <Ionicons name={statusIcon as any} size={48} color={statusColor} />
          </View>
          <Text style={styles.errorTitle}>
            {inviteInfo?.status === 'expired' ? 'Invitation Expired' :
             inviteInfo?.status === 'revoked' ? 'Invitation Revoked' :
             inviteInfo?.status === 'accepted' ? 'Already Accepted' :
             'Invalid Invitation'}
          </Text>
          <Text style={styles.errorMessage}>{errorMessage}</Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.replace('/')}
          >
            <Text style={styles.primaryButtonText}>Go to Home</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Render success state
  if (step === 'success') {
    return (
      <View style={[styles.container, styles.centerContent, { paddingTop: insets.top }]}>
        <View style={styles.successCard}>
          <View style={styles.successIconCircle}>
            <Ionicons name="checkmark-circle" size={64} color="#22C55E" />
          </View>
          <Text style={styles.successTitle}>Welcome to the Team!</Text>
          <Text style={styles.successMessage}>
            You've joined {inviteInfo?.organization_name || 'the team'} as {inviteInfo?.role}
          </Text>
          <ActivityIndicator color="#3B82F6" style={{ marginTop: 20 }} />
          <Text style={styles.redirectText}>Redirecting to dashboard...</Text>
        </View>
      </View>
    );
  }

  // Render choice step
  if (step === 'choose') {
    const roleColor = ROLE_COLORS[inviteInfo?.role || 'agent'];
    const roleIcon = ROLE_ICONS[inviteInfo?.role || 'agent'];
    
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Invite Info Card */}
          <View style={styles.inviteCard}>
            <View style={[styles.roleIconCircle, { backgroundColor: `${roleColor}20` }]}>
              <Ionicons name={roleIcon as any} size={32} color={roleColor} />
            </View>
            <Text style={styles.inviteTitle}>You're Invited!</Text>
            <Text style={styles.inviteSubtitle}>
              {inviteInfo?.invited_by_name} invited you to join
            </Text>
            <Text style={styles.orgName}>{inviteInfo?.organization_name || 'their team'}</Text>
            
            <View style={[styles.roleBadge, { backgroundColor: `${roleColor}20` }]}>
              <Text style={[styles.roleBadgeText, { color: roleColor }]}>
                as {(inviteInfo?.role || 'agent').charAt(0).toUpperCase() + (inviteInfo?.role || 'agent').slice(1)}
              </Text>
            </View>
          </View>

          {/* Choice Buttons */}
          <View style={styles.choiceContainer}>
            <Text style={styles.choiceTitle}>How would you like to continue?</Text>
            
            <TouchableOpacity
              style={styles.choiceCard}
              onPress={handleExistingUser}
            >
              <View style={[styles.choiceIconCircle, { backgroundColor: '#3B82F620' }]}>
                <Ionicons name="log-in" size={24} color="#3B82F6" />
              </View>
              <View style={styles.choiceContent}>
                <Text style={styles.choiceCardTitle}>I have an account</Text>
                <Text style={styles.choiceCardDescription}>
                  Sign in with your existing AgentRoute account
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#64748B" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.choiceCard}
              onPress={handleNewUser}
            >
              <View style={[styles.choiceIconCircle, { backgroundColor: '#22C55E20' }]}>
                <Ionicons name="person-add" size={24} color="#22C55E" />
              </View>
              <View style={styles.choiceContent}>
                <Text style={styles.choiceCardTitle}>I'm new here</Text>
                <Text style={styles.choiceCardDescription}>
                  Create a new account and join the team
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // Render sign in form
  if (step === 'signin') {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity style={styles.backButton} onPress={() => setStep('choose')}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>

          <View style={styles.formHeader}>
            <View style={styles.formIconCircle}>
              <Ionicons name="log-in" size={32} color="#3B82F6" />
            </View>
            <Text style={styles.formTitle}>Sign In to Join</Text>
            <Text style={styles.formSubtitle}>
              Enter your existing account credentials
            </Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputContainer}>
              <Ionicons name="mail-outline" size={20} color="#64748B" style={styles.inputIcon} />
              <TextInput
                style={[styles.input, inviteInfo?.is_email_locked && styles.inputDisabled]}
                placeholder="Email"
                placeholderTextColor="#64748B"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!inviteInfo?.is_email_locked}
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
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, isProcessing && styles.buttonDisabled]}
              onPress={handleSignInAndJoin}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="enter" size={20} color="#FFFFFF" />
                  <Text style={styles.primaryButtonText}>Sign In & Join Team</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // Render sign up form
  if (step === 'signup') {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity style={styles.backButton} onPress={() => setStep('choose')}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>

          <View style={styles.formHeader}>
            <View style={[styles.formIconCircle, { backgroundColor: '#22C55E' }]}>
              <Ionicons name="person-add" size={32} color="#FFFFFF" />
            </View>
            <Text style={styles.formTitle}>Create Account & Join</Text>
            <Text style={styles.formSubtitle}>
              Set up your account to join {inviteInfo?.organization_name || 'the team'}
            </Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputContainer}>
              <Ionicons name="person-outline" size={20} color="#64748B" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Your Full Name"
                placeholderTextColor="#64748B"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.inputContainer}>
              <Ionicons name="mail-outline" size={20} color="#64748B" style={styles.inputIcon} />
              <TextInput
                style={[styles.input, inviteInfo?.is_email_locked && styles.inputDisabled]}
                placeholder="Email"
                placeholderTextColor="#64748B"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!inviteInfo?.is_email_locked}
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
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#64748B" />
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
              style={[styles.primaryButton, { backgroundColor: '#22C55E' }, isProcessing && styles.buttonDisabled]}
              onPress={handleSignUpAndJoin}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                  <Text style={styles.primaryButtonText}>Create Account & Join</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 16,
    fontSize: 16,
  },
  errorCard: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    maxWidth: 320,
  },
  errorIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 15,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  successCard: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    maxWidth: 320,
  },
  successIconCircle: {
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  successMessage: {
    fontSize: 15,
    color: '#94A3B8',
    textAlign: 'center',
  },
  redirectText: {
    color: '#64748B',
    marginTop: 8,
    fontSize: 14,
  },
  inviteCard: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  roleIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  inviteTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  inviteSubtitle: {
    fontSize: 15,
    color: '#94A3B8',
    marginBottom: 4,
  },
  orgName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  roleBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  roleBadgeText: {
    fontSize: 15,
    fontWeight: '600',
  },
  choiceContainer: {
    marginTop: 8,
  },
  choiceTitle: {
    fontSize: 16,
    color: '#94A3B8',
    marginBottom: 16,
    textAlign: 'center',
  },
  choiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
  },
  choiceIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  choiceContent: {
    flex: 1,
  },
  choiceCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  choiceCardDescription: {
    fontSize: 13,
    color: '#94A3B8',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 8,
  },
  backText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  formHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  formIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  formTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  formSubtitle: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
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
  primaryButton: {
    flexDirection: 'row',
    backgroundColor: '#3B82F6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
});
