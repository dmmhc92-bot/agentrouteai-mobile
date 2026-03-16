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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { api } from '../../src/services/api';

type OnboardingStep = 'choice' | 'create-org' | 'join-team' | 'solo-agent';

interface InviteInfo {
  email: string;
  name?: string;
  role: string;
  invited_by_name: string;
  organization_name: string;
}

export default function OnboardingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { createOrganization, registerSolo, signUp } = useAuth();

  // Current step in onboarding
  const [step, setStep] = useState<OnboardingStep>('choice');

  // Common fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Organization-specific
  const [organizationName, setOrganizationName] = useState('');

  // Join team specific
  const [inviteToken, setInviteToken] = useState('');
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const getRouteForRole = (role: string): string => {
    switch (role) {
      case 'admin':
        return '/command-center';
      case 'manager':
        return '/command-center';
      case 'agent':
      default:
        return '/(tabs)/dashboard';
    }
  };

  const validateForm = (): boolean => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter your full name');
      return false;
    }
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email address');
      return false;
    }
    if (!password) {
      Alert.alert('Error', 'Please enter a password');
      return false;
    }
    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return false;
    }
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return false;
    }
    return true;
  };

  const handleValidateInvite = async () => {
    if (!inviteToken.trim()) {
      Alert.alert('Error', 'Please enter an invitation token');
      return;
    }

    setIsValidating(true);
    try {
      const data = await api.validateInvitation(inviteToken.trim());
      if (data.valid) {
        setInviteInfo({
          email: data.email,
          name: data.name,
          role: data.role,
          invited_by_name: data.invited_by_name,
          organization_name: data.organization_name || 'Team',
        });
        // Pre-fill email if provided
        if (data.email) setEmail(data.email);
        if (data.name) setName(data.name);
      } else {
        Alert.alert('Invalid Token', 'This invitation token is invalid or has expired.');
      }
    } catch (error) {
      Alert.alert('Invalid Token', 'This invitation token is invalid or has expired.');
      setInviteInfo(null);
    } finally {
      setIsValidating(false);
    }
  };

  const handleCreateOrganization = async () => {
    if (!organizationName.trim()) {
      Alert.alert('Error', 'Please enter your organization/agency name');
      return;
    }
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      const user = await createOrganization(organizationName, name, email, password, phone || undefined);
      const route = getRouteForRole(user.role);
      router.replace(route as any);
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Failed to create organization';
      Alert.alert('Error', message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinTeam = async () => {
    if (!inviteInfo) {
      Alert.alert('Error', 'Please validate your invitation token first');
      return;
    }
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      await signUp(name, email, password, inviteToken);
      const route = getRouteForRole(inviteInfo.role);
      router.replace(route as any);
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Failed to join team';
      Alert.alert('Error', message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSoloAgent = async () => {
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      const user = await registerSolo(name, email, password, phone || undefined);
      router.replace('/(tabs)/dashboard');
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Registration failed';
      Alert.alert('Error', message);
    } finally {
      setIsLoading(false);
    }
  };

  const renderChoiceStep = () => (
    <View style={styles.choiceContainer}>
      <View style={styles.header}>
        <View style={styles.iconCircle}>
          <Ionicons name="rocket" size={40} color="#FFFFFF" />
        </View>
        <Text style={styles.title}>Get Started</Text>
        <Text style={styles.subtitle}>How would you like to use AgentRoute AI?</Text>
      </View>

      {/* Create Organization Option */}
      <TouchableOpacity
        style={styles.choiceCard}
        onPress={() => setStep('create-org')}
        activeOpacity={0.7}
      >
        <View style={[styles.choiceIconCircle, { backgroundColor: '#3B82F620' }]}>
          <Ionicons name="business" size={28} color="#3B82F6" />
        </View>
        <View style={styles.choiceContent}>
          <Text style={styles.choiceTitle}>Create Organization</Text>
          <Text style={styles.choiceDescription}>
            Start a new agency or team. You'll be the Admin with full control.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={24} color="#64748B" />
      </TouchableOpacity>

      {/* Join Team Option */}
      <TouchableOpacity
        style={styles.choiceCard}
        onPress={() => setStep('join-team')}
        activeOpacity={0.7}
      >
        <View style={[styles.choiceIconCircle, { backgroundColor: '#22C55E20' }]}>
          <Ionicons name="people" size={28} color="#22C55E" />
        </View>
        <View style={styles.choiceContent}>
          <Text style={styles.choiceTitle}>Join Existing Team</Text>
          <Text style={styles.choiceDescription}>
            Join an organization using an invitation from your admin or manager.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={24} color="#64748B" />
      </TouchableOpacity>

      {/* Solo Agent Option */}
      <TouchableOpacity
        style={styles.choiceCard}
        onPress={() => setStep('solo-agent')}
        activeOpacity={0.7}
      >
        <View style={[styles.choiceIconCircle, { backgroundColor: '#F59E0B20' }]}>
          <Ionicons name="person" size={28} color="#F59E0B" />
        </View>
        <View style={styles.choiceContent}>
          <Text style={styles.choiceTitle}>Continue as Solo Agent</Text>
          <Text style={styles.choiceDescription}>
            Work independently. You can join a team later if needed.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={24} color="#64748B" />
      </TouchableOpacity>

      <View style={styles.signInContainer}>
        <Text style={styles.signInText}>Already have an account? </Text>
        <TouchableOpacity onPress={() => router.push('/(auth)/signin')}>
          <Text style={styles.signInLink}>Sign In</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderCreateOrgStep = () => (
    <View style={styles.formContainer}>
      <View style={styles.stepHeader}>
        <View style={[styles.iconCircle, { backgroundColor: '#3B82F6' }]}>
          <Ionicons name="business" size={32} color="#FFFFFF" />
        </View>
        <Text style={styles.stepTitle}>Create Organization</Text>
        <Text style={styles.stepSubtitle}>Set up your agency and become the Admin</Text>
      </View>

      <View style={styles.form}>
        <View style={styles.inputContainer}>
          <Ionicons name="business-outline" size={20} color="#64748B" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Organization / Agency Name"
            placeholderTextColor="#64748B"
            value={organizationName}
            onChangeText={setOrganizationName}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>Your Account</Text>
          <View style={styles.dividerLine} />
        </View>

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
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#64748B"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.inputContainer}>
          <Ionicons name="call-outline" size={20} color="#64748B" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Phone (optional)"
            placeholderTextColor="#64748B"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
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
          style={[styles.primaryButton, isLoading && styles.buttonDisabled]}
          onPress={handleCreateOrganization}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="rocket" size={20} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>Create Organization</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.trialText}>30-day free trial included</Text>
      </View>
    </View>
  );

  const renderJoinTeamStep = () => (
    <View style={styles.formContainer}>
      <View style={styles.stepHeader}>
        <View style={[styles.iconCircle, { backgroundColor: '#22C55E' }]}>
          <Ionicons name="people" size={32} color="#FFFFFF" />
        </View>
        <Text style={styles.stepTitle}>Join Team</Text>
        <Text style={styles.stepSubtitle}>Enter your invitation token to join</Text>
      </View>

      <View style={styles.form}>
        {/* Token Input */}
        <View style={styles.tokenInputContainer}>
          <View style={[styles.inputContainer, { flex: 1 }]}>
            <Ionicons name="key-outline" size={20} color="#64748B" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Invitation Token"
              placeholderTextColor="#64748B"
              value={inviteToken}
              onChangeText={(text) => {
                setInviteToken(text);
                setInviteInfo(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <TouchableOpacity
            style={styles.validateButton}
            onPress={handleValidateInvite}
            disabled={isValidating || !inviteToken.trim()}
          >
            {isValidating ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="checkmark" size={24} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        </View>

        {/* Invite Info Banner */}
        {inviteInfo && (
          <View style={styles.inviteBanner}>
            <Ionicons name="checkmark-circle" size={24} color="#22C55E" />
            <View style={styles.inviteBannerText}>
              <Text style={styles.inviteBannerTitle}>
                Valid Invitation
              </Text>
              <Text style={styles.inviteBannerRole}>
                Join as {inviteInfo.role.charAt(0).toUpperCase() + inviteInfo.role.slice(1)} in {inviteInfo.organization_name}
              </Text>
              <Text style={styles.inviteBannerSubtitle}>
                Invited by {inviteInfo.invited_by_name}
              </Text>
            </View>
          </View>
        )}

        {inviteInfo && (
          <>
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>Your Account</Text>
              <View style={styles.dividerLine} />
            </View>

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
                style={[styles.input, inviteInfo.email && styles.inputDisabled]}
                placeholder="Email"
                placeholderTextColor="#64748B"
                value={email}
                onChangeText={inviteInfo.email ? undefined : setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!inviteInfo.email}
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
              style={[styles.primaryButton, { backgroundColor: '#22C55E' }, isLoading && styles.buttonDisabled]}
              onPress={handleJoinTeam}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="enter" size={20} color="#FFFFFF" />
                  <Text style={styles.primaryButtonText}>Join Team</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}

        {!inviteInfo && (
          <Text style={styles.helpText}>
            Don't have a token? Contact your agency admin or manager to get an invitation.
          </Text>
        )}
      </View>
    </View>
  );

  const renderSoloAgentStep = () => (
    <View style={styles.formContainer}>
      <View style={styles.stepHeader}>
        <View style={[styles.iconCircle, { backgroundColor: '#F59E0B' }]}>
          <Ionicons name="person" size={32} color="#FFFFFF" />
        </View>
        <Text style={styles.stepTitle}>Solo Agent</Text>
        <Text style={styles.stepSubtitle}>Work independently with your own leads</Text>
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
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#64748B"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.inputContainer}>
          <Ionicons name="call-outline" size={20} color="#64748B" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Phone (optional)"
            placeholderTextColor="#64748B"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
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
          style={[styles.primaryButton, { backgroundColor: '#F59E0B' }, isLoading && styles.buttonDisabled]}
          onPress={handleSoloAgent}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="rocket" size={20} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>Start as Solo Agent</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.trialText}>30-day free trial included</Text>

        <View style={styles.soloNote}>
          <Ionicons name="information-circle-outline" size={18} color="#64748B" />
          <Text style={styles.soloNoteText}>
            You can join a team later from Settings if you receive an invitation.
          </Text>
        </View>
      </View>
    </View>
  );

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
        {step !== 'choice' && (
          <TouchableOpacity 
            style={styles.backButton} 
            onPress={() => {
              setStep('choice');
              // Reset form
              setInviteToken('');
              setInviteInfo(null);
            }}
          >
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        )}

        {step === 'choice' && renderChoiceStep()}
        {step === 'create-org' && renderCreateOrgStep()}
        {step === 'join-team' && renderJoinTeamStep()}
        {step === 'solo-agent' && renderSoloAgentStep()}
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
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  backText: {
    color: '#FFFFFF',
    fontSize: 16,
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
    textAlign: 'center',
  },
  choiceContainer: {
    flex: 1,
  },
  choiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  choiceIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  choiceContent: {
    flex: 1,
  },
  choiceTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  choiceDescription: {
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 18,
  },
  signInContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
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
  formContainer: {
    flex: 1,
  },
  stepHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  stepSubtitle: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
  },
  form: {
    gap: 14,
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
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#334155',
  },
  dividerText: {
    color: '#64748B',
    fontSize: 12,
    marginHorizontal: 12,
    textTransform: 'uppercase',
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
  trialText: {
    color: '#22C55E',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
  },
  tokenInputContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  validateButton: {
    backgroundColor: '#3B82F6',
    width: 56,
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inviteBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#22C55E15',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#22C55E40',
    gap: 12,
  },
  inviteBannerText: {
    flex: 1,
  },
  inviteBannerTitle: {
    color: '#22C55E',
    fontSize: 15,
    fontWeight: '600',
  },
  inviteBannerRole: {
    color: '#FFFFFF',
    fontSize: 14,
    marginTop: 4,
  },
  inviteBannerSubtitle: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 2,
  },
  helpText: {
    color: '#64748B',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 20,
  },
  soloNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 12,
    gap: 10,
    marginTop: 8,
  },
  soloNoteText: {
    flex: 1,
    color: '#94A3B8',
    fontSize: 13,
    lineHeight: 18,
  },
});
