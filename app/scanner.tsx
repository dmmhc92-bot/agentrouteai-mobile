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
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { api } from '../src/services/api';
import { useNetwork } from '../src/contexts/NetworkContext';

interface ScanResult {
  name: string;
  phone: string;
  email: string;
  company: string;
  job_title: string;
  street_address: string;
  city: string;
  state: string;
  zip_code: string;
  address: string;
  website: string;
  notes: string;
  confidence: {
    name: number;
    phone: number;
    email: number;
    company: number;
    address: number;
    overall: number;
  };
  document_type_detected: string;
}

interface SavedLead {
  id: string;
  name: string;
}

type ScanMode = 'camera' | 'review' | 'success';

const CONFIDENCE_THRESHOLD = 0.7;

export default function ScannerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const { isOnline } = useNetwork();

  const [permission, requestPermission] = useCameraPermissions();
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [mode, setMode] = useState<ScanMode>('camera');
  const [savedLead, setSavedLead] = useState<SavedLead | null>(null);
  const [scanCount, setScanCount] = useState(0);
  const [showQuickActions, setShowQuickActions] = useState(false);

  // Editable fields for confirmation
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (scanResult) {
      setName(scanResult.name || '');
      setPhone(scanResult.phone || '');
      setEmail(scanResult.email || '');
      setCompany(scanResult.company || '');
      setJobTitle(scanResult.job_title || '');
      setStreetAddress(scanResult.street_address || '');
      setCity(scanResult.city || '');
      setState(scanResult.state || '');
      setZipCode(scanResult.zip_code || '');
      setNotes(scanResult.notes || '');
      setMode('review');
    }
  }, [scanResult]);

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= CONFIDENCE_THRESHOLD) return '#22C55E';
    if (confidence >= 0.5) return '#F59E0B';
    return '#EF4444';
  };

  const getConfidenceIcon = (confidence: number): keyof typeof Ionicons.glyphMap => {
    if (confidence >= CONFIDENCE_THRESHOLD) return 'checkmark-circle';
    if (confidence >= 0.5) return 'alert-circle';
    return 'warning';
  };

  const isLowConfidence = (confidence: number) => confidence < CONFIDENCE_THRESHOLD;

  const handleCapture = async () => {
    if (!cameraRef.current) return;

    // Check network before attempting OCR
    if (!isOnline) {
      Alert.alert(
        'Internet Required',
        'Scanning business cards requires an internet connection for AI-powered text recognition. Please connect to the internet and try again.',
        [{ text: 'OK' }]
      );
      return;
    }

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
          street_address: result.street_address || '',
          city: result.city || '',
          state: result.state || '',
          zip_code: result.zip_code || '',
          address: result.address || '',
          website: result.website || '',
          notes: result.notes || '',
          confidence: result.confidence || { name: 0.5, phone: 0.5, email: 0.5, company: 0.5, address: 0.5, overall: 0.5 },
          document_type_detected: result.document_type_detected || 'unknown',
        });
      }
    } catch (error: any) {
      console.log('Scan error:', error);
      const message = error.response?.data?.detail || 'Failed to scan. Please try again with a clearer image.';
      Alert.alert('Scan Error', message);
    } finally {
      setIsScanning(false);
    }
  };

  const handlePickImage = async () => {
    // Check network before attempting OCR
    if (!isOnline) {
      Alert.alert(
        'Internet Required',
        'Scanning business cards requires an internet connection for AI-powered text recognition. Please connect to the internet and try again.',
        [{ text: 'OK' }]
      );
      return;
    }

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
          street_address: scanData.street_address || '',
          city: scanData.city || '',
          state: scanData.state || '',
          zip_code: scanData.zip_code || '',
          address: scanData.address || '',
          website: scanData.website || '',
          notes: scanData.notes || '',
          confidence: scanData.confidence || { name: 0.5, phone: 0.5, email: 0.5, company: 0.5, address: 0.5, overall: 0.5 },
          document_type_detected: scanData.document_type_detected || 'unknown',
        });
      } catch (error: any) {
        const message = error.response?.data?.detail || 'Failed to scan image. Please try a clearer image.';
        Alert.alert('Scan Error', message);
      } finally {
        setIsScanning(false);
      }
    }
  };

  const buildFullAddress = () => {
    const parts = [];
    if (streetAddress.trim()) parts.push(streetAddress.trim());
    if (city.trim()) parts.push(city.trim());
    if (state.trim() && zipCode.trim()) {
      parts.push(`${state.trim()} ${zipCode.trim()}`);
    } else if (state.trim()) {
      parts.push(state.trim());
    } else if (zipCode.trim()) {
      parts.push(zipCode.trim());
    }
    return parts.join(', ');
  };

  const validateLead = (): boolean => {
    if (!name.trim()) {
      Alert.alert('Required Field', 'Please enter a name for this lead.');
      return false;
    }
    // Check if at least one contact method is provided
    if (!phone.trim() && !email.trim()) {
      Alert.alert('Contact Info Needed', 'Please provide at least a phone number or email address.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save Anyway', onPress: () => doSaveLead() },
      ]);
      return false;
    }
    return true;
  };

  const handleSaveLead = async () => {
    if (!validateLead()) return;
    await doSaveLead();
  };

  const doSaveLead = async () => {
    setIsSaving(true);
    try {
      // Build comprehensive notes from scanned data
      const noteParts: string[] = [];
      const docType = scanResult?.document_type_detected || 'scan';
      noteParts.push(`📇 Created from ${docType === 'business_card' ? 'business card' : docType} scan`);
      
      if (company.trim()) {
        noteParts.push(`🏢 Company: ${company.trim()}`);
      }
      if (jobTitle.trim()) {
        noteParts.push(`💼 Title: ${jobTitle.trim()}`);
      }
      if (scanResult?.website) {
        noteParts.push(`🌐 Website: ${scanResult.website}`);
      }
      if (notes.trim()) {
        noteParts.push(`📝 Notes: ${notes.trim()}`);
      }
      
      const fullAddress = buildFullAddress();
      
      const lead = await api.createLead({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address: fullAddress,
        notes: noteParts.join('\n'),
        source: 'lead_scanner',
      });
      
      setSavedLead({ id: lead.id, name: lead.name });
      setScanCount(prev => prev + 1);
      setMode('success');
      setShowQuickActions(true);
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Failed to save lead';
      Alert.alert('Error', message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleScanNext = () => {
    setScanResult(null);
    setSavedLead(null);
    setName('');
    setPhone('');
    setEmail('');
    setCompany('');
    setJobTitle('');
    setStreetAddress('');
    setCity('');
    setState('');
    setZipCode('');
    setNotes('');
    setMode('camera');
    setShowQuickActions(false);
  };

  const handleViewLead = () => {
    if (savedLead) {
      router.replace(`/lead/${savedLead.id}`);
    }
  };

  const handleReturnToLeads = () => {
    router.replace('/(tabs)/leads');
  };

  const handleScheduleAppointment = () => {
    if (savedLead) {
      router.push(`/appointment/new?leadId=${savedLead.id}`);
    }
  };

  // Permission screens
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
          <Text style={styles.headerTitle}>Lead Scanner</Text>
          <View style={{ width: 44 }} />
        </View>
        <View style={styles.permissionContainer}>
          <Ionicons name="camera-outline" size={60} color="#64748B" />
          <Text style={styles.permissionTitle}>Camera Permission Required</Text>
          <Text style={styles.permissionText}>
            We need camera access to scan leads from business cards, forms, and documents
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

  // Success screen with quick actions
  if (mode === 'success' && savedLead) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Lead Saved!</Text>
          <View style={styles.scanCountBadge}>
            <Text style={styles.scanCountText}>{scanCount}</Text>
          </View>
        </View>

        <ScrollView style={styles.successContainer} contentContainerStyle={styles.successContent}>
          <View style={styles.successBanner}>
            <View style={styles.successIconContainer}>
              <Ionicons name="checkmark-circle" size={64} color="#22C55E" />
            </View>
            <Text style={styles.successTitle}>{savedLead.name}</Text>
            <Text style={styles.successSubtitle}>Added to your leads</Text>
          </View>

          {/* Quick Actions */}
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActionsGrid}>
            <TouchableOpacity style={styles.quickActionCard} onPress={handleScanNext}>
              <View style={[styles.quickActionIcon, { backgroundColor: '#3B82F620' }]}>
                <Ionicons name="scan" size={28} color="#3B82F6" />
              </View>
              <Text style={styles.quickActionLabel}>Scan Next Lead</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.quickActionCard} onPress={handleViewLead}>
              <View style={[styles.quickActionIcon, { backgroundColor: '#8B5CF620' }]}>
                <Ionicons name="person" size={28} color="#8B5CF6" />
              </View>
              <Text style={styles.quickActionLabel}>View Lead</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.quickActionCard} onPress={handleScheduleAppointment}>
              <View style={[styles.quickActionIcon, { backgroundColor: '#F59E0B20' }]}>
                <Ionicons name="calendar" size={28} color="#F59E0B" />
              </View>
              <Text style={styles.quickActionLabel}>Schedule Appt</Text>
            </TouchableOpacity>
          </View>

          {/* More Actions */}
          <Text style={styles.sectionTitle}>More Options</Text>
          <TouchableOpacity style={styles.moreActionRow} onPress={() => router.push('/routes')}>
            <Ionicons name="map-outline" size={22} color="#64748B" />
            <Text style={styles.moreActionText}>Open Route Planner</Text>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.moreActionRow} onPress={() => router.push('/pipeline')}>
            <Ionicons name="git-branch-outline" size={22} color="#64748B" />
            <Text style={styles.moreActionText}>View Pipeline</Text>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.moreActionRow} onPress={handleReturnToLeads}>
            <Ionicons name="list-outline" size={22} color="#64748B" />
            <Text style={styles.moreActionText}>Return to Leads List</Text>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>
        </ScrollView>

        {/* Fast Scan Button */}
        <View style={[styles.fastScanContainer, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity style={styles.fastScanButton} onPress={handleScanNext}>
            <Ionicons name="scan" size={24} color="#FFFFFF" />
            <Text style={styles.fastScanText}>Scan Next Lead</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Review screen after scanning
  if (mode === 'review' && scanResult) {
    const overallConfidence = scanResult.confidence?.overall || 0.5;
    const needsReview = overallConfidence < CONFIDENCE_THRESHOLD;

    return (
      <KeyboardAvoidingView
        style={[styles.container, { paddingTop: insets.top }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={handleScanNext}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Review Lead</Text>
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
          {/* Confidence Banner */}
          <View style={[styles.confidenceBanner, { backgroundColor: needsReview ? '#FEF3C7' : '#DCFCE7' }]}>
            <View style={styles.confidenceHeader}>
              <Ionicons 
                name={needsReview ? 'alert-circle' : 'checkmark-circle'} 
                size={28} 
                color={needsReview ? '#F59E0B' : '#22C55E'} 
              />
              <View style={styles.confidenceText}>
                <Text style={[styles.confidenceTitle, { color: needsReview ? '#B45309' : '#15803D' }]}>
                  {needsReview ? 'Review Needed' : 'High Confidence Scan'}
                </Text>
                <Text style={styles.confidenceSubtitle}>
                  {scanResult.document_type_detected !== 'unknown' 
                    ? `Detected: ${scanResult.document_type_detected.replace('_', ' ')}`
                    : 'Document scanned successfully'}
                </Text>
              </View>
            </View>
            {needsReview && (
              <Text style={styles.confidenceHint}>
                ⚠️ Some fields may need correction. Yellow-highlighted fields have lower confidence.
              </Text>
            )}
          </View>

          <View style={styles.form}>
            {/* Name Field */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Full Name *</Text>
                {scanResult.confidence && (
                  <Ionicons 
                    name={getConfidenceIcon(scanResult.confidence.name)} 
                    size={16} 
                    color={getConfidenceColor(scanResult.confidence.name)} 
                  />
                )}
              </View>
              <View style={[
                styles.inputContainer,
                isLowConfidence(scanResult.confidence?.name || 0) && styles.inputContainerWarning
              ]}>
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

            {/* Phone Field */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Phone Number</Text>
                {scanResult.confidence && (
                  <Ionicons 
                    name={getConfidenceIcon(scanResult.confidence.phone)} 
                    size={16} 
                    color={getConfidenceColor(scanResult.confidence.phone)} 
                  />
                )}
              </View>
              <View style={[
                styles.inputContainer,
                isLowConfidence(scanResult.confidence?.phone || 0) && styles.inputContainerWarning
              ]}>
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

            {/* Email Field */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Email Address</Text>
                {scanResult.confidence && (
                  <Ionicons 
                    name={getConfidenceIcon(scanResult.confidence.email)} 
                    size={16} 
                    color={getConfidenceColor(scanResult.confidence.email)} 
                  />
                )}
              </View>
              <View style={[
                styles.inputContainer,
                isLowConfidence(scanResult.confidence?.email || 0) && styles.inputContainerWarning
              ]}>
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

            {/* Company Field */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Company</Text>
                {scanResult.confidence && (
                  <Ionicons 
                    name={getConfidenceIcon(scanResult.confidence.company)} 
                    size={16} 
                    color={getConfidenceColor(scanResult.confidence.company)} 
                  />
                )}
              </View>
              <View style={[
                styles.inputContainer,
                isLowConfidence(scanResult.confidence?.company || 0) && styles.inputContainerWarning
              ]}>
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

            {/* Job Title Field */}
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

            {/* Address Section */}
            <View style={styles.addressSection}>
              <View style={styles.labelRow}>
                <Text style={styles.sectionLabel}>Address</Text>
                {scanResult.confidence && (
                  <Ionicons 
                    name={getConfidenceIcon(scanResult.confidence.address)} 
                    size={16} 
                    color={getConfidenceColor(scanResult.confidence.address)} 
                  />
                )}
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Street Address</Text>
                <View style={[
                  styles.inputContainer,
                  isLowConfidence(scanResult.confidence?.address || 0) && styles.inputContainerWarning
                ]}>
                  <Ionicons name="location-outline" size={20} color="#64748B" />
                  <TextInput
                    style={styles.input}
                    placeholder="Street address"
                    placeholderTextColor="#64748B"
                    value={streetAddress}
                    onChangeText={setStreetAddress}
                  />
                </View>
              </View>

              <View style={styles.addressRow}>
                <View style={[styles.inputGroup, { flex: 2 }]}>
                  <Text style={styles.label}>City</Text>
                  <View style={styles.inputContainer}>
                    <TextInput
                      style={styles.input}
                      placeholder="City"
                      placeholderTextColor="#64748B"
                      value={city}
                      onChangeText={setCity}
                    />
                  </View>
                </View>
                <View style={[styles.inputGroup, { flex: 1, marginLeft: 12 }]}>
                  <Text style={styles.label}>State</Text>
                  <View style={styles.inputContainer}>
                    <TextInput
                      style={styles.input}
                      placeholder="ST"
                      placeholderTextColor="#64748B"
                      value={state}
                      onChangeText={setState}
                      autoCapitalize="characters"
                      maxLength={2}
                    />
                  </View>
                </View>
                <View style={[styles.inputGroup, { flex: 1, marginLeft: 12 }]}>
                  <Text style={styles.label}>ZIP</Text>
                  <View style={styles.inputContainer}>
                    <TextInput
                      style={styles.input}
                      placeholder="ZIP"
                      placeholderTextColor="#64748B"
                      value={zipCode}
                      onChangeText={setZipCode}
                      keyboardType="number-pad"
                      maxLength={10}
                    />
                  </View>
                </View>
              </View>
            </View>

            {/* Notes Field */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Notes</Text>
              <View style={[styles.inputContainer, styles.notesInputContainer]}>
                <Ionicons name="document-text-outline" size={20} color="#64748B" style={styles.notesIcon} />
                <TextInput
                  style={[styles.input, styles.notesInput]}
                  placeholder="Additional notes..."
                  placeholderTextColor="#64748B"
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  numberOfLines={3}
                />
              </View>
            </View>
          </View>

          <TouchableOpacity style={styles.rescanButton} onPress={handleScanNext}>
            <Ionicons name="scan-outline" size={20} color="#3B82F6" />
            <Text style={styles.rescanButtonText}>Rescan</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // Camera view (default)
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scan Lead</Text>
        {scanCount > 0 && (
          <View style={styles.scanCountBadge}>
            <Text style={styles.scanCountText}>{scanCount}</Text>
          </View>
        )}
        {scanCount === 0 && <View style={{ width: 44 }} />}
      </View>

      {/* Document Type Hints */}
      <View style={styles.documentHints}>
        <Text style={styles.documentHintsTitle}>Scan any of these:</Text>
        <View style={styles.documentTypeRow}>
          <View style={styles.documentType}>
            <Ionicons name="card-outline" size={16} color="#94A3B8" />
            <Text style={styles.documentTypeText}>Business Cards</Text>
          </View>
          <View style={styles.documentType}>
            <Ionicons name="document-outline" size={16} color="#94A3B8" />
            <Text style={styles.documentTypeText}>Contact Sheets</Text>
          </View>
          <View style={styles.documentType}>
            <Ionicons name="create-outline" size={16} color="#94A3B8" />
            <Text style={styles.documentTypeText}>Handwritten</Text>
          </View>
        </View>
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
              Position lead information within the frame
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

        <TouchableOpacity 
          style={styles.manualEntryButton} 
          onPress={() => router.push('/lead/new')}
        >
          <Ionicons name="create-outline" size={24} color="#FFFFFF" />
          <Text style={styles.manualEntryText}>Manual</Text>
        </TouchableOpacity>
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
  scanCountBadge: {
    backgroundColor: '#3B82F6',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanCountText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  saveHeaderButton: {
    backgroundColor: '#22C55E',
    paddingHorizontal: 20,
    paddingVertical: 10,
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
  documentHints: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  documentHintsTitle: {
    color: '#64748B',
    fontSize: 12,
    marginBottom: 8,
  },
  documentTypeRow: {
    flexDirection: 'row',
    gap: 16,
  },
  documentType: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  documentTypeText: {
    color: '#94A3B8',
    fontSize: 12,
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
    height: 200,
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
  manualEntryButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  manualEntryText: {
    color: '#94A3B8',
    fontSize: 10,
    marginTop: 2,
  },
  // Review screen styles
  confirmScrollView: {
    flex: 1,
  },
  confirmScrollContent: {
    padding: 16,
  },
  confidenceBanner: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  confidenceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  confidenceText: {
    flex: 1,
  },
  confidenceTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  confidenceSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  confidenceHint: {
    fontSize: 12,
    color: '#B45309',
    marginTop: 12,
    lineHeight: 18,
  },
  form: {
    gap: 16,
  },
  inputGroup: {
    gap: 6,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '500',
  },
  sectionLabel: {
    color: '#E2E8F0',
    fontSize: 15,
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 52,
    gap: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  inputContainerWarning: {
    borderColor: '#F59E0B',
    backgroundColor: '#FEF3C710',
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
  },
  addressSection: {
    gap: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    marginTop: 8,
  },
  addressRow: {
    flexDirection: 'row',
  },
  notesInputContainer: {
    height: 90,
    alignItems: 'flex-start',
    paddingVertical: 12,
  },
  notesIcon: {
    marginTop: 2,
  },
  notesInput: {
    textAlignVertical: 'top',
    height: 66,
  },
  rescanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    paddingVertical: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: '#3B82F6',
    borderRadius: 12,
  },
  rescanButtonText: {
    color: '#3B82F6',
    fontSize: 15,
    fontWeight: '500',
  },
  // Success screen styles
  successContainer: {
    flex: 1,
  },
  successContent: {
    padding: 20,
  },
  successBanner: {
    alignItems: 'center',
    paddingVertical: 32,
    marginBottom: 24,
  },
  successIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#22C55E20',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: 15,
    color: '#94A3B8',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
    marginTop: 8,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  quickActionCard: {
    width: '47%',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  quickActionIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  quickActionLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  moreActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    gap: 12,
  },
  moreActionText: {
    flex: 1,
    fontSize: 15,
    color: '#E2E8F0',
  },
  fastScanContainer: {
    padding: 16,
    backgroundColor: '#0F172A',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  fastScanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 16,
    gap: 10,
  },
  fastScanText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
});
