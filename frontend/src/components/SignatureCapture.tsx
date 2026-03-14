import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Modal,
  Alert,
  Image,
  ActivityIndicator,
  PanResponder,
  GestureResponderEvent,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Rect } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface SignatureCaptureProps {
  visible: boolean;
  onClose: () => void;
  onSave: (signatureBase64: string) => void;
  title: string;
  subtitle?: string;
  signerName?: string;
  existingSignature?: string;
}

interface Point {
  x: number;
  y: number;
}

const { width: screenWidth } = Dimensions.get('window');
const CANVAS_WIDTH = Math.min(screenWidth - 40, 360);
const CANVAS_HEIGHT = 180;

// Minimum requirements for a valid signature
const MIN_POINTS = 10;
const MIN_PATHS = 1;

// Storage key prefix for signature persistence
const SIGNATURE_STORAGE_KEY = '@soa_signature_';

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
  const canvasRef = useRef<View>(null);
  const [paths, setPaths] = useState<string[]>([]);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  const [totalPoints, setTotalPoints] = useState(0);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'capturing' | 'validating' | 'success' | 'error'>('idle');
  
  // Use refs for values that PanResponder needs to access
  const isDrawingRef = useRef(false);
  const currentPointsRef = useRef<Point[]>([]);
  const signatureImageRef = useRef<string | null>(null);
  const pathsRef = useRef<string[]>([]);

  // Sync refs with state
  useEffect(() => {
    currentPointsRef.current = currentPoints;
  }, [currentPoints]);

  useEffect(() => {
    signatureImageRef.current = signatureImage;
  }, [signatureImage]);
  
  useEffect(() => {
    pathsRef.current = paths;
  }, [paths]);

  // Reset when modal opens
  useEffect(() => {
    if (visible) {
      console.log(`[SignatureCapture] Modal opened for: ${title}`);
      setPaths([]);
      setCurrentPoints([]);
      setIsSaving(false);
      setTotalPoints(0);
      setSaveStatus('idle');
      isDrawingRef.current = false;
      currentPointsRef.current = [];
      pathsRef.current = [];
      
      // Load existing signature if available
      if (existingSignature && existingSignature.startsWith('data:image/') && existingSignature.length > 500) {
        console.log(`[SignatureCapture] Loading existing signature: ${existingSignature.length} chars`);
        setSignatureImage(existingSignature);
        signatureImageRef.current = existingSignature;
      } else {
        setSignatureImage(null);
        signatureImageRef.current = null;
      }
    }
  }, [visible, existingSignature, title]);

  // Convert points to SVG path string
  const pointsToPath = useCallback((points: Point[]): string => {
    if (points.length === 0) return '';
    if (points.length === 1) {
      return `M ${points[0].x} ${points[0].y} L ${points[0].x + 0.5} ${points[0].y + 0.5}`;
    }
    
    let path = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)}`;
    }
    return path;
  }, []);

  // PanResponder with proper event handling
  const panResponder = useMemo(() => PanResponder.create({
    // Always claim the touch
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponderCapture: () => true,
    
    // Touch start
    onPanResponderGrant: (event: GestureResponderEvent) => {
      const { locationX, locationY } = event.nativeEvent;
      console.log(`[SignatureCapture] Touch START: ${locationX.toFixed(0)}, ${locationY.toFixed(0)}`);
      
      isDrawingRef.current = true;
      const point = { x: locationX, y: locationY };
      currentPointsRef.current = [point];
      setCurrentPoints([point]);
      setSaveStatus('idle');
      
      // Clear existing saved image since user is drawing new
      if (signatureImageRef.current) {
        setSignatureImage(null);
        signatureImageRef.current = null;
      }
    },
    
    // Touch move
    onPanResponderMove: (event: GestureResponderEvent, gestureState) => {
      if (!isDrawingRef.current) return;
      
      const { locationX, locationY } = event.nativeEvent;
      
      // Clamp to canvas bounds
      const x = Math.max(0, Math.min(locationX, CANVAS_WIDTH));
      const y = Math.max(0, Math.min(locationY, CANVAS_HEIGHT));
      
      const newPoint = { x, y };
      const newPoints = [...currentPointsRef.current, newPoint];
      currentPointsRef.current = newPoints;
      setCurrentPoints(newPoints);
    },
    
    // Touch end
    onPanResponderRelease: () => {
      console.log(`[SignatureCapture] Touch END, points: ${currentPointsRef.current.length}`);
      
      if (currentPointsRef.current.length > 0) {
        const pathStr = pointsToPath(currentPointsRef.current);
        if (pathStr) {
          const newPaths = [...pathsRef.current, pathStr];
          pathsRef.current = newPaths;
          setPaths(newPaths);
          setTotalPoints(prev => prev + currentPointsRef.current.length);
        }
      }
      
      currentPointsRef.current = [];
      setCurrentPoints([]);
      isDrawingRef.current = false;
    },
    
    // Touch cancelled
    onPanResponderTerminate: () => {
      console.log('[SignatureCapture] Touch TERMINATED');
      
      if (currentPointsRef.current.length > 0) {
        const pathStr = pointsToPath(currentPointsRef.current);
        if (pathStr) {
          const newPaths = [...pathsRef.current, pathStr];
          pathsRef.current = newPaths;
          setPaths(newPaths);
          setTotalPoints(prev => prev + currentPointsRef.current.length);
        }
      }
      
      currentPointsRef.current = [];
      setCurrentPoints([]);
      isDrawingRef.current = false;
    },
    
    // Prevent termination
    onPanResponderTerminationRequest: () => false,
  }), [pointsToPath]);

  // Clear signature
  const handleClear = useCallback(() => {
    console.log('[SignatureCapture] Clearing signature');
    setPaths([]);
    setCurrentPoints([]);
    setTotalPoints(0);
    setSignatureImage(null);
    signatureImageRef.current = null;
    pathsRef.current = [];
    isDrawingRef.current = false;
    currentPointsRef.current = [];
    setSaveStatus('idle');
  }, []);

  // Check if signature is valid
  const hasValidSignature = (paths.length >= MIN_PATHS && totalPoints >= MIN_POINTS) || 
                            (signatureImage && signatureImage.length > 500);

  const hasDrawnAnything = paths.length > 0 || currentPoints.length > 0;

  // Generate SVG string for fallback
  const generateSvgDataUri = useCallback((): string | null => {
    const currentPaths = pathsRef.current;
    if (currentPaths.length === 0) return null;
    
    console.log(`[SignatureCapture] Generating SVG from ${currentPaths.length} paths`);
    
    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}">
      <rect width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" fill="white"/>
      ${currentPaths.map(d => `<path d="${d}" stroke="#111111" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}
    </svg>`;
    
    // Use btoa for base64 encoding (works in React Native)
    try {
      const base64 = btoa(unescape(encodeURIComponent(svgContent)));
      const dataUri = `data:image/svg+xml;base64,${base64}`;
      console.log(`[SignatureCapture] SVG generated: ${dataUri.length} chars`);
      return dataUri;
    } catch (e) {
      console.error('[SignatureCapture] SVG generation failed:', e);
      return null;
    }
  }, []);

  // Save signature - with multiple fallback methods and robust validation
  const handleSave = useCallback(async () => {
    console.log('[SignatureCapture] ========== SAVE INITIATED ==========');
    console.log(`[SignatureCapture] Title: ${title}`);
    console.log(`[SignatureCapture] Paths: ${pathsRef.current.length}`);
    console.log(`[SignatureCapture] Total points: ${totalPoints}`);
    console.log(`[SignatureCapture] Has uploaded image: ${!!signatureImageRef.current}`);

    if (!hasValidSignature) {
      Alert.alert(
        'Signature Required',
        'Please draw your complete handwritten signature or upload an image.',
        [{ text: 'OK' }]
      );
      return;
    }

    setIsSaving(true);
    setSaveStatus('capturing');

    let finalSignatureData: string | null = null;

    try {
      // Method 1: Use existing uploaded/captured image
      if (signatureImageRef.current && pathsRef.current.length === 0) {
        console.log('[SignatureCapture] Using existing/uploaded image');
        finalSignatureData = signatureImageRef.current;
      } else {
        // Method 2: Try to capture the canvas as PNG
        console.log('[SignatureCapture] Attempting PNG capture via captureRef...');
        
        try {
          if (canvasRef.current) {
            // Add a small delay for iOS to ensure view is rendered
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const uri = await captureRef(canvasRef, {
              format: 'png',
              quality: 1,
              result: 'base64',
            });
            
            if (uri && uri.length > 100) {
              finalSignatureData = `data:image/png;base64,${uri}`;
              console.log(`[SignatureCapture] PNG capture SUCCESS: ${finalSignatureData.length} chars`);
            } else {
              console.warn('[SignatureCapture] PNG capture returned empty/short result');
            }
          }
        } catch (captureError: any) {
          console.warn(`[SignatureCapture] PNG capture failed: ${captureError?.message || captureError}`);
        }
        
        // Method 3: Fallback to SVG if PNG capture failed
        if (!finalSignatureData || finalSignatureData.length < 500) {
          console.log('[SignatureCapture] PNG failed, using SVG fallback...');
          finalSignatureData = generateSvgDataUri();
          if (finalSignatureData) {
            console.log(`[SignatureCapture] SVG fallback: ${finalSignatureData.length} chars`);
          }
        }
      }
      
      // Validate final data
      setSaveStatus('validating');
      
      if (!finalSignatureData) {
        throw new Error('Failed to capture signature - no data generated');
      }
      
      if (finalSignatureData.length < 500) {
        throw new Error('Signature data is too small - may be corrupted');
      }
      
      if (!finalSignatureData.startsWith('data:image/')) {
        throw new Error('Invalid signature format - must be a data URI');
      }

      console.log('[SignatureCapture] ========== VALIDATION PASSED ==========');
      console.log(`[SignatureCapture] Final signature type: ${finalSignatureData.substring(5, 25)}`);
      console.log(`[SignatureCapture] Final signature length: ${finalSignatureData.length}`);
      
      // Store in AsyncStorage as backup
      try {
        const storageKey = `${SIGNATURE_STORAGE_KEY}${title.replace(/\s/g, '_')}`;
        await AsyncStorage.setItem(storageKey, finalSignatureData);
        console.log(`[SignatureCapture] Signature backed up to AsyncStorage: ${storageKey}`);
      } catch (storageError) {
        console.warn('[SignatureCapture] AsyncStorage backup failed:', storageError);
      }
      
      setSignatureImage(finalSignatureData);
      signatureImageRef.current = finalSignatureData;
      setSaveStatus('success');
      
      // Small delay to show success state
      await new Promise(resolve => setTimeout(resolve, 300));
      
      console.log('[SignatureCapture] Calling onSave callback...');
      onSave(finalSignatureData);
      console.log('[SignatureCapture] ========== SAVE COMPLETE ==========');
      
    } catch (error: any) {
      console.error('[SignatureCapture] ========== SAVE ERROR ==========');
      console.error(`[SignatureCapture] Error: ${error?.message || error}`);
      setSaveStatus('error');
      
      Alert.alert(
        'Capture Failed', 
        `Failed to capture your signature: ${error?.message || 'Unknown error'}. Please try again or use the upload option.`,
        [{ text: 'OK' }]
      );
    } finally {
      setIsSaving(false);
    }
  }, [hasValidSignature, totalPoints, onSave, generateSvgDataUri, title]);

  // Upload signature image from device
  const handleUploadImage = useCallback(async () => {
    try {
      console.log('[SignatureCapture] Opening image picker...');
      
      // Request permission
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please allow access to your photo library to upload a signature image.',
          [{ text: 'OK' }]
        );
        return;
      }

      // Pick image
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [2, 1],
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0].base64) {
        const dataUri = `data:image/png;base64,${result.assets[0].base64}`;
        console.log(`[SignatureCapture] Image picked: ${dataUri.length} chars`);
        
        setSignatureImage(dataUri);
        signatureImageRef.current = dataUri;
        // Clear any drawn paths since we're using uploaded image
        setPaths([]);
        pathsRef.current = [];
        setCurrentPoints([]);
        setTotalPoints(0);
        setSaveStatus('idle');
      }
    } catch (error: any) {
      console.error('[SignatureCapture] Image picker error:', error);
      Alert.alert('Error', 'Failed to load image. Please try again.');
    }
  }, []);

  // Close handler
  const handleClose = useCallback(() => {
    if (pathsRef.current.length > 0 && !signatureImageRef.current) {
      Alert.alert(
        'Discard Signature?',
        'You have an unsaved signature. Discard it?',
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
  }, [handleClear, onClose]);

  // Current path SVG string
  const currentPathStr = pointsToPath(currentPoints);

  // Status badge
  const getStatusBadge = () => {
    if (saveStatus === 'capturing') {
      return { icon: 'camera', color: '#2563EB', bg: '#DBEAFE', text: 'Capturing...' };
    }
    if (saveStatus === 'validating') {
      return { icon: 'checkmark-done', color: '#2563EB', bg: '#DBEAFE', text: 'Validating...' };
    }
    if (saveStatus === 'success') {
      return { icon: 'checkmark-circle', color: '#16A34A', bg: '#DCFCE7', text: 'Captured!' };
    }
    if (saveStatus === 'error') {
      return { icon: 'alert-circle', color: '#DC2626', bg: '#FEE2E2', text: 'Failed - Try Again' };
    }
    if (currentPoints.length > 0) {
      return { icon: 'pencil', color: '#2563EB', bg: '#DBEAFE', text: 'Drawing...' };
    }
    if (hasValidSignature) {
      return { icon: 'checkmark-circle', color: '#16A34A', bg: '#DCFCE7', text: 'Ready to save' };
    }
    if (hasDrawnAnything) {
      return { icon: 'time-outline', color: '#D97706', bg: '#FEF3C7', text: 'Keep drawing...' };
    }
    return { icon: 'hand-left-outline', color: '#94A3B8', bg: '#F1F5F9', text: 'Touch to draw' };
  };

  const statusBadge = getStatusBadge();

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
          <TouchableOpacity onPress={handleClose} style={styles.headerBtn}>
            <Ionicons name="close" size={28} color="#EF4444" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{title}</Text>
            {subtitle && <Text style={styles.headerSubtitle}>{subtitle}</Text>}
          </View>
          <TouchableOpacity onPress={handleClear} style={styles.headerBtn}>
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        </View>

        {/* Instructions */}
        <View style={styles.instructions}>
          <Ionicons name="finger-print-outline" size={20} color="#3B82F6" />
          <Text style={styles.instructionsText}>
            Draw with your finger or upload image
          </Text>
        </View>

        {/* Signer name */}
        {signerName && (
          <View style={styles.signerRow}>
            <Text style={styles.signerLabel}>Signing as:</Text>
            <Text style={styles.signerName}>{signerName}</Text>
          </View>
        )}

        {/* Canvas Container */}
        <View style={styles.canvasOuter}>
          <View
            ref={canvasRef}
            style={styles.canvas}
            collapsable={false}
            {...panResponder.panHandlers}
          >
            <Svg
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              style={StyleSheet.absoluteFill}
            >
              {/* White background */}
              <Rect
                x="0"
                y="0"
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                fill="#FFFFFF"
              />
              
              {/* Completed paths */}
              {paths.map((pathD, index) => (
                <Path
                  key={`path-${index}`}
                  d={pathD}
                  stroke="#111111"
                  strokeWidth={3}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
              
              {/* Current drawing path */}
              {currentPathStr && (
                <Path
                  d={currentPathStr}
                  stroke="#111111"
                  strokeWidth={3}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </Svg>

            {/* Signature line */}
            <View style={styles.sigLine} pointerEvents="none">
              <Text style={styles.xMark}>✕</Text>
              <View style={styles.dashed} />
            </View>

            {/* Placeholder */}
            {!hasDrawnAnything && !signatureImage && (
              <View style={styles.placeholder} pointerEvents="none">
                <Ionicons name="create-outline" size={36} color="#CBD5E1" />
                <Text style={styles.placeholderText}>Draw your signature here</Text>
              </View>
            )}
          </View>

          {/* Status row */}
          <View style={styles.statusRow}>
            <View style={[styles.badge, { backgroundColor: statusBadge.bg }]}>
              <Ionicons name={statusBadge.icon as any} size={14} color={statusBadge.color} />
              <Text style={[styles.badgeText, { color: statusBadge.color }]}>{statusBadge.text}</Text>
            </View>
            {paths.length > 0 && (
              <Text style={styles.statsText}>
                {paths.length} stroke{paths.length !== 1 ? 's' : ''}, {totalPoints} points
              </Text>
            )}
          </View>

          {/* Upload button */}
          <TouchableOpacity style={styles.uploadBtn} onPress={handleUploadImage}>
            <Ionicons name="image-outline" size={18} color="#3B82F6" />
            <Text style={styles.uploadText}>Or upload signature image</Text>
          </TouchableOpacity>
        </View>

        {/* Signature Preview */}
        {signatureImage && (
          <View style={styles.previewSection}>
            <Text style={styles.previewLabel}>✓ Captured Signature Preview:</Text>
            <View style={styles.previewBox}>
              <Image
                source={{ uri: signatureImage }}
                style={styles.previewImg}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.previewSize}>{signatureImage.length.toLocaleString()} bytes</Text>
          </View>
        )}

        {/* Legal text */}
        <View style={styles.legalBox}>
          <Ionicons name="shield-checkmark-outline" size={16} color="#64748B" />
          <Text style={styles.legalText}>
            By saving, you confirm this is your legal handwritten signature for the Scope of Appointment document.
          </Text>
        </View>

        {/* Save button */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            style={[
              styles.saveBtn, 
              !hasValidSignature && styles.saveBtnDisabled,
              saveStatus === 'success' && styles.saveBtnSuccess,
              saveStatus === 'error' && styles.saveBtnError,
            ]}
            onPress={handleSave}
            disabled={!hasValidSignature || isSaving}
          >
            {isSaving ? (
              <>
                <ActivityIndicator color="#FFFFFF" size="small" />
                <Text style={styles.saveBtnText}>
                  {saveStatus === 'capturing' ? 'Capturing...' : 'Validating...'}
                </Text>
              </>
            ) : saveStatus === 'success' ? (
              <>
                <Ionicons name="checkmark-circle" size={24} color="#FFFFFF" />
                <Text style={styles.saveBtnText}>Signature Saved!</Text>
              </>
            ) : (
              <>
                <Ionicons
                  name="checkmark-circle"
                  size={24}
                  color={hasValidSignature ? '#FFFFFF' : '#94A3B8'}
                />
                <Text style={[styles.saveBtnText, !hasValidSignature && styles.saveBtnTextDisabled]}>
                  Save Signature
                </Text>
              </>
            )}
          </TouchableOpacity>

          {!hasValidSignature && !signatureImage && (
            <Text style={styles.hint}>
              Draw at least {MIN_POINTS} points or upload an image
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
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  headerBtn: {
    width: 56,
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1F2937',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  clearText: {
    fontSize: 15,
    color: '#3B82F6',
    fontWeight: '500',
  },
  instructions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 8,
  },
  instructionsText: {
    fontSize: 14,
    color: '#64748B',
  },
  signerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 8,
    gap: 6,
  },
  signerLabel: {
    fontSize: 13,
    color: '#64748B',
  },
  signerName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
  },
  canvasOuter: {
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  canvas: {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 3,
    borderColor: '#3B82F6',
    overflow: 'hidden',
    position: 'relative',
  },
  sigLine: {
    position: 'absolute',
    bottom: 30,
    left: 15,
    right: 15,
    flexDirection: 'row',
    alignItems: 'center',
  },
  xMark: {
    fontSize: 14,
    color: '#CBD5E1',
    marginRight: 6,
  },
  dashed: {
    flex: 1,
    height: 1,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 13,
    color: '#CBD5E1',
    marginTop: 6,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 32,
    marginTop: 10,
    gap: 12,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    gap: 5,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statsText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    gap: 6,
  },
  uploadText: {
    fontSize: 13,
    color: '#3B82F6',
    fontWeight: '500',
  },
  previewSection: {
    paddingHorizontal: 20,
    paddingTop: 10,
    alignItems: 'center',
  },
  previewLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#16A34A',
    marginBottom: 6,
    alignSelf: 'flex-start',
  },
  previewBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#22C55E',
    padding: 6,
    alignItems: 'center',
    width: '100%',
  },
  previewImg: {
    width: CANVAS_WIDTH - 50,
    height: 60,
  },
  previewSize: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 4,
  },
  legalBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 8,
    marginTop: 'auto',
  },
  legalText: {
    flex: 1,
    fontSize: 11,
    color: '#64748B',
    lineHeight: 16,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    alignItems: 'center',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#22C55E',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 8,
    width: '100%',
    minHeight: 52,
  },
  saveBtnDisabled: {
    backgroundColor: '#E2E8F0',
  },
  saveBtnSuccess: {
    backgroundColor: '#16A34A',
  },
  saveBtnError: {
    backgroundColor: '#DC2626',
  },
  saveBtnText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  saveBtnTextDisabled: {
    color: '#94A3B8',
  },
  hint: {
    fontSize: 12,
    color: '#F59E0B',
    marginTop: 6,
    textAlign: 'center',
  },
});
