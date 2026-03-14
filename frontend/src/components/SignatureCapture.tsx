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
  existingSignature?: string; // For reloading existing signature
}

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
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
  const [hasSignature, setHasSignature] = useState(false);
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setIsSaving(false);
      setHasSignature(false);
      setSignaturePreview(null);
      setIsDrawing(false);
      
      // If there's an existing signature, show it as preview
      if (existingSignature && existingSignature.startsWith('data:image/')) {
        setSignaturePreview(existingSignature);
        setHasSignature(true);
      }
    }
  }, [visible, existingSignature]);

  // Handle when user starts drawing
  const handleBegin = useCallback(() => {
    setIsDrawing(true);
    setHasSignature(true);
  }, []);

  // Handle when user ends a stroke
  const handleEnd = useCallback(() => {
    setIsDrawing(false);
  }, []);

  // Handle successful signature capture
  const handleOK = useCallback((signature: string) => {
    if (signature && signature.length > 100) {
      // Valid signature data
      setSignaturePreview(signature);
      setHasSignature(true);
    }
  }, []);

  // Handle empty signature (shouldn't happen with our flow but safety check)
  const handleEmpty = useCallback(() => {
    setHasSignature(false);
    setSignaturePreview(null);
  }, []);

  // Clear the signature
  const handleClear = useCallback(() => {
    signatureRef.current?.clearSignature();
    setHasSignature(false);
    setSignaturePreview(null);
    setIsDrawing(false);
  }, []);

  // Read and save the signature
  const handleSave = useCallback(async () => {
    if (!hasSignature) {
      Alert.alert(
        'Signature Required',
        'Please draw your complete handwritten signature before saving.',
        [{ text: 'OK' }]
      );
      return;
    }

    setIsSaving(true);

    try {
      // Read the signature from the canvas
      signatureRef.current?.readSignature();
      
      // Give time for the callback to fire
      await new Promise(resolve => setTimeout(resolve, 300));
      
      if (signaturePreview && signaturePreview.length > 500) {
        onSave(signaturePreview);
      } else {
        // Try to read again
        signatureRef.current?.readSignature();
        await new Promise(resolve => setTimeout(resolve, 500));
        
        if (signaturePreview && signaturePreview.length > 500) {
          onSave(signaturePreview);
        } else {
          Alert.alert(
            'Signature Too Small',
            'Please draw a more complete signature. The current signature appears to be too small.',
            [{ text: 'OK' }]
          );
        }
      }
    } catch (error) {
      console.error('Error saving signature:', error);
      Alert.alert('Error', 'Failed to save signature. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [hasSignature, signaturePreview, onSave]);

  // Confirm close if signature exists
  const handleClose = useCallback(() => {
    if (hasSignature && !signaturePreview) {
      Alert.alert(
        'Discard Signature?',
        'You have drawn a signature. Are you sure you want to discard it?',
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
  }, [hasSignature, signaturePreview, handleClear, onClose]);

  // Signature canvas style - white background, dark pen
  const canvasStyle = `
    .m-signature-pad {
      box-shadow: none;
      border: none;
      background-color: #FFFFFF;
    }
    .m-signature-pad--body {
      border: none;
      background-color: #FFFFFF;
    }
    .m-signature-pad--footer {
      display: none;
    }
    body, html {
      background-color: #FFFFFF;
      margin: 0;
      padding: 0;
    }
  `;

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
            Use your finger to draw your signature below
          </Text>
        </View>

        {/* Signer Info */}
        {signerName && (
          <View style={styles.signerInfo}>
            <Text style={styles.signerLabel}>Signing as:</Text>
            <Text style={styles.signerName}>{signerName}</Text>
          </View>
        )}

        {/* Signature Canvas Container - NOT inside ScrollView */}
        <View style={styles.canvasContainer}>
          <View style={styles.canvasWrapper}>
            {/* Signature line guide */}
            <View style={styles.signatureLine} pointerEvents="none">
              <Text style={styles.xMarker}>✕</Text>
              <View style={styles.dashedLine} />
            </View>
            
            {/* The actual signature canvas */}
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
              webStyle={canvasStyle}
              penColor="#111111"
              backgroundColor="#FFFFFF"
              dotSize={3}
              minWidth={2}
              maxWidth={4}
              style={styles.signatureCanvas}
            />
          </View>

          {/* Status indicator */}
          <View style={styles.signatureStatus}>
            {isDrawing ? (
              <View style={styles.statusBadgeDrawing}>
                <Ionicons name="pencil" size={14} color="#3B82F6" />
                <Text style={styles.statusTextDrawing}>Drawing...</Text>
              </View>
            ) : hasSignature ? (
              <View style={styles.statusBadgeValid}>
                <Ionicons name="checkmark-circle" size={14} color="#22C55E" />
                <Text style={styles.statusTextValid}>Signature captured</Text>
              </View>
            ) : (
              <View style={styles.statusBadgeEmpty}>
                <Ionicons name="create-outline" size={14} color="#94A3B8" />
                <Text style={styles.statusTextEmpty}>Draw your signature above</Text>
              </View>
            )}
          </View>
        </View>

        {/* Signature Preview */}
        {signaturePreview && (
          <View style={styles.previewContainer}>
            <Text style={styles.previewLabel}>Signature Preview:</Text>
            <View style={styles.previewImageContainer}>
              <Image
                source={{ uri: signaturePreview }}
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
            By saving this signature, you acknowledge that this is your legal
            handwritten signature and agree to be bound by the associated Scope
            of Appointment document.
          </Text>
        </View>

        {/* Save Button */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            style={[
              styles.saveButton,
              !hasSignature && styles.saveButtonDisabled,
            ]}
            onPress={handleSave}
            disabled={!hasSignature || isSaving}
          >
            {isSaving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons
                  name="checkmark-circle"
                  size={24}
                  color={hasSignature ? '#FFFFFF' : '#94A3B8'}
                />
                <Text
                  style={[
                    styles.saveButtonText,
                    !hasSignature && styles.saveButtonTextDisabled,
                  ]}
                >
                  Save Signature
                </Text>
              </>
            )}
          </TouchableOpacity>

          {!hasSignature && (
            <Text style={styles.hintText}>
              Draw your signature above to enable save
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
    paddingVertical: 16,
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
    paddingBottom: 12,
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
    borderWidth: 2,
    borderColor: '#3B82F6',
    overflow: 'hidden',
    position: 'relative',
  },
  signatureCanvas: {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    backgroundColor: '#FFFFFF',
  },
  signatureLine: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1,
    pointerEvents: 'none',
  },
  xMarker: {
    fontSize: 16,
    color: '#CBD5E1',
    marginRight: 8,
  },
  dashedLine: {
    flex: 1,
    height: 1,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  signatureStatus: {
    height: 32,
    marginTop: 12,
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
    fontWeight: '500',
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
    fontWeight: '500',
    color: '#16A34A',
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
  previewContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  previewLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 8,
  },
  previewImageContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 8,
    alignItems: 'center',
  },
  previewImage: {
    width: CANVAS_WIDTH - 40,
    height: 80,
  },
  legalNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 10,
    marginTop: 'auto',
  },
  legalText: {
    flex: 1,
    fontSize: 12,
    color: '#64748B',
    lineHeight: 18,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
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
