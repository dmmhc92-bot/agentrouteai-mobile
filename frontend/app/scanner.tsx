import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { api } from '../src/services/api';

interface ScanResult {
  name: string;
  phone: string;
  email: string;
  company: string;
  job_title: string;
  address: string;
  website: string;
}

export default function ScannerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Editable fields for confirmation
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [address, setAddress] = useState('');

  useEffect(() => {
    if (scanResult) {
      setName(scanResult.name || '');
      setPhone(scanResult.phone || '');
      setEmail(scanResult.email || '');
      setCompany(scanResult.company || '');
      setJobTitle(scanResult.job_title || '');
      setAddress(scanResult.address || '');
    }
  }, [scanResult]);

  const handleCapture = async () => {
    if (!cameraRef.current) return;

    setIsScanning(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.8,
      });

      if (photo?.base64) {
        const result = await api.scanBusinessCard(photo.base64);
        setScanResult({
          name: result.name || '',
          phone: result.phone || '',
          email: result.email || '',
          company: result.company || '',
          job_title: result.job_title || '',
          address: result.address || '',
          website: result.website || '',
        });
      }
    } catch (error: any) {
      console.log('Scan error:', error);
      const message = error.response?.data?.detail || 'Failed to scan business card. Please try again.';
      Alert.alert('Scan Error', message);
    } finally {
      setIsScanning(false);
    }
  };

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setIsScanning(true);
      try {
        const scanData = await api.scanBusinessCard(result.assets[0].base64);
        setScanResult({
          name: scanData.name || '',
          phone: scanData.phone || '',
          email: scanData.email || '',
          company: scanData.company || '',
          job_title: scanData.job_title || '',
          address: scanData.address || '',
          website: scanData.website || '',
        });
      } catch (error: any) {
        const message = error.response?.data?.detail || 'Failed to scan business card';
        Alert.alert('Scan Error', message);
      } finally {
        setIsScanning(false);
      }
    }
  };

  const handleSaveLead = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Name is required');
      return;
    }

    setIsSaving(true);
    try {
      // Build comprehensive notes from scanned data
      const noteParts: string[] = [];
      noteParts.push('📇 Created from business card scan');
      if (company.trim()) {
        noteParts.push(`🏢 Company: ${company.trim()}`);
      }
      if (jobTitle.trim()) {
        noteParts.push(`💼 Title: ${jobTitle.trim()}`);
      }
      if (scanResult?.website) {
        noteParts.push(`🌐 Website: ${scanResult.website}`);
      }
      
      const lead = await api.createLead({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
        notes: noteParts.join('\n'),
        source: 'business_card_scan',
      });
      
      Alert.alert('Success', 'Lead created successfully!', [
        { text: 'View Lead', onPress: () => router.replace(`/lead/${lead.id}`) },
        { text: 'Scan Another', onPress: () => handleRescan() },
      ]);
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Failed to save lead';
      Alert.alert('Error', message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRescan = () => {
    setScanResult(null);
    setName('');
    setPhone('');
    setEmail('');
    setCompany('');
    setJobTitle('');
    setAddress('');
  };

  if (!permission) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Business Card Scanner</Text>
          <View style={{ width: 44 }} />
        </View>
        <View style={styles.permissionContainer}>
          <Ionicons name="camera-outline" size={60} color="#64748B" />
          <Text style={styles.permissionTitle}>Camera Permission Required</Text>
          <Text style={styles.permissionText}>
            We need camera access to scan business cards
          </Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>Grant Permission</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.galleryButton} onPress={handlePickImage}>
            <Ionicons name="images-outline" size={20} color="#3B82F6" />
            <Text style={styles.galleryButtonText}>Choose from Gallery</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Show confirmation screen after scanning
  if (scanResult) {
    return (
      <KeyboardAvoidingView
        style={[styles.container, { paddingTop: insets.top }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={handleRescan}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Confirm Details</Text>
          <TouchableOpacity
            style={[styles.saveHeaderButton, isSaving && styles.saveButtonDisabled]}
            onPress={handleSaveLead}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.saveButtonText}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.confirmScrollView}
          contentContainerStyle={styles.confirmScrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.successBanner}>
            <Ionicons name="checkmark-circle" size={32} color="#22C55E" />
            <Text style={styles.successText}>Card scanned successfully!</Text>
            <Text style={styles.successSubtext}>Review and edit the details below</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full Name *</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="person-outline" size={20} color="#64748B" />
                <TextInput
                  style={styles.input}
                  placeholder="Full name"
                  placeholderTextColor="#64748B"
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Company</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="business-outline" size={20} color="#64748B" />
                <TextInput
                  style={styles.input}
                  placeholder="Company name"
                  placeholderTextColor="#64748B"
                  value={company}
                  onChangeText={setCompany}
                  autoCapitalize="words"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Job Title</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="briefcase-outline" size={20} color="#64748B" />
                <TextInput
                  style={styles.input}
                  placeholder="Job title"
                  placeholderTextColor="#64748B"
                  value={jobTitle}
                  onChangeText={setJobTitle}
                  autoCapitalize="words"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Phone Number</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="call-outline" size={20} color="#64748B" />
                <TextInput
                  style={styles.input}
                  placeholder="Phone number"
                  placeholderTextColor="#64748B"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email Address</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="mail-outline" size={20} color="#64748B" />
                <TextInput
                  style={styles.input}
                  placeholder="Email address"
                  placeholderTextColor="#64748B"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Business Address</Text>
              <View style={[styles.inputContainer, styles.addressInputContainer]}>
                <Ionicons name="location-outline" size={20} color="#64748B" style={styles.addressIcon} />
                <TextInput
                  style={[styles.input, styles.addressInput]}
                  placeholder="Street, City, State, ZIP"
                  placeholderTextColor="#64748B"
                  value={address}
                  onChangeText={setAddress}
                  multiline
                  numberOfLines={2}
                />
              </View>
            </View>
          </View>

          <TouchableOpacity style={styles.rescanButton} onPress={handleRescan}>
            <Ionicons name="scan-outline" size={20} color="#3B82F6" />
            <Text style={styles.rescanButtonText}>Scan Another Card</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // Camera view
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scan Business Card</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={styles.cameraContainer}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
        >
          <View style={styles.overlay}>
            <View style={styles.scanFrame}>
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
            </View>
            <Text style={styles.instructionText}>
              Position the business card within the frame
            </Text>
          </View>
        </CameraView>
      </View>

      <View style={[styles.controls, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity style={styles.galleryIconButton} onPress={handlePickImage}>
          <Ionicons name="images-outline" size={28} color="#FFFFFF" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.captureButton, isScanning && styles.captureButtonDisabled]}
          onPress={handleCapture}
          disabled={isScanning}
        >
          {isScanning ? (
            <ActivityIndicator size="large" color="#FFFFFF" />
          ) : (
            <View style={styles.captureButtonInner} />
          )}
        </TouchableOpacity>

        <View style={{ width: 60 }} />
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
    paddingVertical: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  saveHeaderButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  permissionTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
    marginTop: 20,
    marginBottom: 8,
  },
  permissionText: {
    color: '#94A3B8',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  permissionButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 16,
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  galleryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  galleryButtonText: {
    color: '#3B82F6',
    fontSize: 16,
  },
  cameraContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  scanFrame: {
    width: 300,
    height: 180,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: '#3B82F6',
    borderWidth: 3,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  topRight: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  instructionText: {
    color: '#FFFFFF',
    fontSize: 14,
    marginTop: 24,
    textAlign: 'center',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 24,
    backgroundColor: '#0F172A',
  },
  galleryIconButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#FFFFFF',
  },
  captureButtonDisabled: {
    opacity: 0.7,
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
  },
  // Confirmation screen styles
  confirmScrollView: {
    flex: 1,
  },
  confirmScrollContent: {
    padding: 16,
  },
  successBanner: {
    backgroundColor: '#22C55E20',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 24,
  },
  successText: {
    color: '#22C55E',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 8,
  },
  successSubtext: {
    color: '#94A3B8',
    fontSize: 14,
    marginTop: 4,
  },
  form: {
    gap: 20,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '500',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 56,
    gap: 12,
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
  },
  addressInputContainer: {
    height: 80,
    alignItems: 'flex-start',
    paddingVertical: 12,
  },
  addressIcon: {
    marginTop: 2,
  },
  addressInput: {
    textAlignVertical: 'top',
    height: 56,
  },
  rescanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    paddingVertical: 16,
    gap: 8,
  },
  rescanButtonText: {
    color: '#3B82F6',
    fontSize: 16,
  },
});
