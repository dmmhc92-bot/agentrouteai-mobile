import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Modal,
  Platform,
  Alert,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import SignatureScreen, { SignatureViewRef } from 'react-native-signature-canvas';

interface SignatureCaptureProps {
  visible: boolean;
  onClose: () => void;
  onSave: (signatureBase64: string) => void;
  title: string;
  subtitle?: string;
  signerName?: string;
  existingSignature?: string;
}

const { width: screenWidth } = Dimensions.get('window');
const CANVAS_WIDTH = Math.min(screenWidth - 40, 380);
const CANVAS_HEIGHT = 200;

export default function SignatureCapture({
  visible,
  onClose,
  onSave,
  title,
  subtitle,
  signerName,
  existingSignature,
}: SignatureCaptureProps) {
  const insets = useSafeAreaInsets();
  const signatureRef = useRef<SignatureViewRef>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const pendingSaveRef = useRef(false);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setIsSaving(false);
      setHasStrokes(false);
      setSignatureData(null);
      setIsDrawing(false);
      pendingSaveRef.current = false;
      
      // Show existing signature if available
      if (existingSignature && existingSignature.startsWith('data:image/')) {
        setSignatureData(existingSignature);
        setHasStrokes(true);
      }
    }
  }, [visible, existingSignature]);

  // Handle when user starts drawing
  const handleBegin = useCallback(() => {
    setIsDrawing(true);
    setHasStrokes(true);
  }, []);

  // Handle when user ends a stroke
  const handleEnd = useCallback(() => {
    setIsDrawing(false);
    // Automatically read signature after each stroke
    setTimeout(() => {
      signatureRef.current?.readSignature();
    }, 100);
  }, []);

  // Handle successful signature data from canvas
  const handleOK = useCallback((signature: string) => {
    console.log('Signature received, length:', signature?.length);
    if (signature && signature.length > 500) {
      setSignatureData(signature);
      setHasStrokes(true);
      
      // If we were waiting to save, do it now
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        setIsSaving(false);
        onSave(signature);
      }
    }
  }, [onSave]);

  // Handle empty signature
  const handleEmpty = useCallback(() => {
    console.log('Signature is empty');
    if (pendingSaveRef.current) {
      pendingSaveRef.current = false;
      setIsSaving(false);
      Alert.alert(
        'Signature Required',
        'Please draw your complete handwritten signature.',
        [{ text: 'OK' }]
      );
    }
  }, []);

  // Clear the signature
  const handleClear = useCallback(() => {
    signatureRef.current?.clearSignature();
    setHasStrokes(false);
    setSignatureData(null);
    setIsDrawing(false);
  }, []);

  // Save the signature
  const handleSave = useCallback(() => {
    if (!hasStrokes) {
      Alert.alert(
        'Signature Required',
        'Please draw your complete handwritten signature before saving.',
        [{ text: 'OK' }]
      );
      return;
    }

    // If we already have signature data, save it directly
    if (signatureData && signatureData.length > 500) {
      onSave(signatureData);
      return;
    }

    // Otherwise, read the signature and wait for callback
    setIsSaving(true);
    pendingSaveRef.current = true;
    signatureRef.current?.readSignature();
    
    // Timeout in case callback doesn't fire
    setTimeout(() => {
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        setIsSaving(false);
        Alert.alert(
          'Error',
          'Could not capture signature. Please try drawing again.',
          [{ text: 'OK' }]
        );
      }
    }, 2000);
  }, [hasStrokes, signatureData, onSave]);

  // Confirm close
  const handleClose = useCallback(() => {
    if (hasStrokes && !signatureData) {
      Alert.alert(
        'Discard Signature?',
        'Are you sure you want to discard your signature?',
        [
          { text: 'Keep Drawing', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              handleClear();
              onClose();
            },
          },
        ]
      );
    } else {
      onClose();
    }
  }, [hasStrokes, signatureData, handleClear, onClose]);

  // Signature canvas style
  const webStyle = `
    .m-signature-pad {
      box-shadow: none;
      border: none;
      background-color: #FFFFFF;
      margin: 0;
      padding: 0;
    }
    .m-signature-pad--body {
      border: none;
      background-color: #FFFFFF;
      margin: 0;
      padding: 0;
    }
    .m-signature-pad--footer {
      display: none;
      margin: 0;
      padding: 0;
    }
    body, html {
      background-color: #FFFFFF;
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
    }
    canvas {
      width: 100% !important;
      height: 100% !important;
    }
  `;

  const hasValidSignature = signatureData && signatureData.length > 500;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.headerButton}>
            <Ionicons name="close" size={28} color="#EF4444" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{title}</Text>
            {subtitle && <Text style={styles.headerSubtitle}>{subtitle}</Text>}
          </View>
          <TouchableOpacity onPress={handleClear} style={styles.headerButton}>
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        </View>

        {/* Instructions */}
        <View style={styles.instructions}>
          <Ionicons name="finger-print-outline" size={24} color="#3B82F6" />
          <Text style={styles.instructionsText}>
            Use your finger to draw your signature
          </Text>
        </View>

        {/* Signer Info */}
        {signerName && (
          <View style={styles.signerInfo}>
            <Text style={styles.signerLabel}>Signing as:</Text>
            <Text style={styles.signerName}>{signerName}</Text>
          </View>
        )}

        {/* Signature Canvas - NOT inside ScrollView */}
        <View style={styles.canvasContainer}>
          <View style={styles.canvasWrapper}>
            <SignatureScreen
              ref={signatureRef}
              onOK={handleOK}
              onEmpty={handleEmpty}
              onBegin={handleBegin}
              onEnd={handleEnd}
              autoClear={false}
              descriptionText=""
              clearText=""
              confirmText=""
              webStyle={webStyle}
              penColor="#111111"
              backgroundColor="#FFFFFF"
              dotSize={3}
              minWidth={2}
              maxWidth={4}
              trimWhitespace={true}
              imageType="image/png"
              dataURL={existingSignature}
              style={styles.signatureCanvas}
            />
            
            {/* Signature line overlay */}
            <View style={styles.signatureLineOverlay} pointerEvents="none">
              <Text style={styles.xMarker}>✕</Text>
              <View style={styles.dashedLine} />
            </View>
          </View>

          {/* Status */}
          <View style={styles.statusContainer}>
            {isDrawing ? (
              <View style={styles.statusBadgeDrawing}>
                <Ionicons name="pencil" size={14} color="#3B82F6" />
                <Text style={styles.statusTextDrawing}>Drawing...</Text>
              </View>
            ) : hasValidSignature ? (
              <View style={styles.statusBadgeValid}>
                <Ionicons name="checkmark-circle" size={14} color="#22C55E" />
                <Text style={styles.statusTextValid}>Signature captured!</Text>
              </View>
            ) : hasStrokes ? (
              <View style={styles.statusBadgePending}>
                <Ionicons name="time-outline" size={14} color="#F59E0B" />
                <Text style={styles.statusTextPending}>Keep drawing...</Text>
              </View>
            ) : (
              <View style={styles.statusBadgeEmpty}>
                <Ionicons name="create-outline" size={14} color="#94A3B8" />
                <Text style={styles.statusTextEmpty}>Draw signature above</Text>
              </View>
            )}
          </View>
        </View>

        {/* Signature Preview */}
        {hasValidSignature && (
          <View style={styles.previewSection}>
            <Text style={styles.previewLabel}>✓ Signature Preview:</Text>
            <View style={styles.previewBox}>
              <Image
                source={{ uri: signatureData }}
                style={styles.previewImage}
                resizeMode="contain"
              />
            </View>
          </View>
        )}

        {/* Legal Notice */}
        <View style={styles.legalNotice}>
          <Ionicons name="shield-checkmark-outline" size={18} color="#64748B" />
          <Text style={styles.legalText}>
            By saving, you confirm this is your legal handwritten signature for
            the Scope of Appointment document.
          </Text>
        </View>

        {/* Footer */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            style={[
              styles.saveButton,
              (!hasStrokes || isSaving) && styles.saveButtonDisabled,
            ]}
            onPress={handleSave}
            disabled={!hasStrokes || isSaving}
          >
            {isSaving ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Ionicons
                  name="checkmark-circle"
                  size={24}
                  color={hasStrokes ? '#FFFFFF' : '#94A3B8'}
                />
                <Text
                  style={[
                    styles.saveButtonText,
                    !hasStrokes && styles.saveButtonTextDisabled,
                  ]}
                >
                  Save Signature
                </Text>
              </>
            )}
          </TouchableOpacity>

          {!hasStrokes && (
            <Text style={styles.hintText}>
              Draw your signature to enable save
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  headerButton: {
    width: 60,
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  clearText: {
    fontSize: 16,
    color: '#3B82F6',
    fontWeight: '500',
  },
  instructions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 10,
  },
  instructionsText: {
    fontSize: 15,
    color: '#64748B',
  },
  signerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 10,
    gap: 8,
  },
  signerLabel: {
    fontSize: 14,
    color: '#64748B',
  },
  signerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  canvasContainer: {
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  canvasWrapper: {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 3,
    borderColor: '#3B82F6',
    overflow: 'hidden',
    position: 'relative',
  },
  signatureCanvas: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#FFFFFF',
  },
  signatureLineOverlay: {
    position: 'absolute',
    bottom: 35,
    left: 15,
    right: 15,
    flexDirection: 'row',
    alignItems: 'center',
    pointerEvents: 'none',
  },
  xMarker: {
    fontSize: 14,
    color: '#CBD5E1',
    marginRight: 6,
  },
  dashedLine: {
    flex: 1,
    height: 1,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statusContainer: {
    height: 36,
    marginTop: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusBadgeDrawing: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#DBEAFE',
    gap: 6,
  },
  statusTextDrawing: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563EB',
  },
  statusBadgeValid: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#DCFCE7',
    gap: 6,
  },
  statusTextValid: {
    fontSize: 13,
    fontWeight: '600',
    color: '#16A34A',
  },
  statusBadgePending: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#FEF3C7',
    gap: 6,
  },
  statusTextPending: {
    fontSize: 13,
    fontWeight: '600',
    color: '#D97706',
  },
  statusBadgeEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    gap: 6,
  },
  statusTextEmpty: {
    fontSize: 13,
    fontWeight: '500',
    color: '#94A3B8',
  },
  previewSection: {
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  previewLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#16A34A',
    marginBottom: 8,
  },
  previewBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#22C55E',
    padding: 8,
    alignItems: 'center',
  },
  previewImage: {
    width: CANVAS_WIDTH - 60,
    height: 70,
  },
  legalNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 10,
    marginTop: 'auto',
  },
  legalText: {
    flex: 1,
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    alignItems: 'center',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#22C55E',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 10,
    width: '100%',
    minHeight: 56,
  },
  saveButtonDisabled: {
    backgroundColor: '#E2E8F0',
  },
  saveButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  saveButtonTextDisabled: {
    color: '#94A3B8',
  },
  hintText: {
    fontSize: 13,
    color: '#F59E0B',
    marginTop: 8,
    textAlign: 'center',
  },
});
