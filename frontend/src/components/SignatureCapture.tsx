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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Rect } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import * as ImagePicker from 'expo-image-picker';

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
  
  // Use refs for values that PanResponder needs to access
  const isDrawingRef = useRef(false);
  const currentPointsRef = useRef<Point[]>([]);
  const signatureImageRef = useRef<string | null>(null);

  // Sync refs with state
  useEffect(() => {
    currentPointsRef.current = currentPoints;
  }, [currentPoints]);

  useEffect(() => {
    signatureImageRef.current = signatureImage;
  }, [signatureImage]);

  // Reset when modal opens
  useEffect(() => {
    if (visible) {
      setPaths([]);
      setCurrentPoints([]);
      setIsSaving(false);
      setTotalPoints(0);
      isDrawingRef.current = false;
      currentPointsRef.current = [];
      
      // Load existing signature if available
      if (existingSignature && existingSignature.startsWith('data:image/')) {
        setSignatureImage(existingSignature);
        signatureImageRef.current = existingSignature;
      } else {
        setSignatureImage(null);
        signatureImageRef.current = null;
      }
    }
  }, [visible, existingSignature]);

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
      console.log('Touch START:', locationX, locationY);
      
      isDrawingRef.current = true;
      const point = { x: locationX, y: locationY };
      currentPointsRef.current = [point];
      setCurrentPoints([point]);
      
      // Clear existing saved image since user is drawing new
      if (signatureImageRef.current) {
        setSignatureImage(null);
        signatureImageRef.current = null;
      }
    },
    
    // Touch move - this is the critical handler for continuous drawing
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
      
      // Log every 10th point for debugging
      if (newPoints.length % 10 === 0) {
        console.log('Touch MOVE point count:', newPoints.length);
      }
    },
    
    // Touch end
    onPanResponderRelease: () => {
      console.log('Touch END, total points:', currentPointsRef.current.length);
      
      if (currentPointsRef.current.length > 0) {
        const pathStr = pointsToPath(currentPointsRef.current);
        if (pathStr) {
          setPaths(prev => [...prev, pathStr]);
          setTotalPoints(prev => prev + currentPointsRef.current.length);
        }
      }
      
      currentPointsRef.current = [];
      setCurrentPoints([]);
      isDrawingRef.current = false;
    },
    
    // Touch cancelled
    onPanResponderTerminate: () => {
      console.log('Touch TERMINATED');
      
      if (currentPointsRef.current.length > 0) {
        const pathStr = pointsToPath(currentPointsRef.current);
        if (pathStr) {
          setPaths(prev => [...prev, pathStr]);
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
    setPaths([]);
    setCurrentPoints([]);
    setTotalPoints(0);
    setSignatureImage(null);
    signatureImageRef.current = null;
    isDrawingRef.current = false;
    currentPointsRef.current = [];
  }, []);

  // Check if signature is valid
  const hasValidSignature = (paths.length >= MIN_PATHS && totalPoints >= MIN_POINTS) || 
                            (signatureImage && signatureImage.length > 500);

  const hasDrawnAnything = paths.length > 0 || currentPoints.length > 0;

  // Save signature
  const handleSave = useCallback(async () => {
    if (!hasValidSignature) {
      Alert.alert(
        'Signature Required',
        'Please draw your complete handwritten signature or upload an image.',
        [{ text: 'OK' }]
      );
      return;
    }

    setIsSaving(true);
    console.log('=== SAVING SIGNATURE ===');
    console.log('Paths count:', paths.length);
    console.log('Total points:', totalPoints);
    console.log('Has uploaded image:', !!signatureImage);

    try {
      // If we have an uploaded/existing image and no new drawing, use it
      if (signatureImage && paths.length === 0) {
        console.log('Using uploaded/existing image');
        console.log('Image data length:', signatureImage.length);
        onSave(signatureImage);
        return;
      }

      // Capture the canvas as PNG
      console.log('Capturing canvas as PNG...');
      const uri = await captureRef(canvasRef, {
        format: 'png',
        quality: 1,
        result: 'base64',
      });

      const dataUri = `data:image/png;base64,${uri}`;
      console.log('Signature captured successfully');
      console.log('Data URI length:', dataUri.length);
      console.log('Data URI prefix:', dataUri.substring(0, 50));
      
      setSignatureImage(dataUri);
      onSave(dataUri);
      
      console.log('Signature saved and callback invoked');
    } catch (error) {
      console.error('=== SIGNATURE CAPTURE ERROR ===');
      console.error('Error:', error);
      Alert.alert('Error', 'Failed to capture signature. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [hasValidSignature, signatureImage, paths.length, totalPoints, onSave]);

  // Upload signature image from device
  const handleUploadImage = useCallback(async () => {
    try {
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
        setSignatureImage(dataUri);
        signatureImageRef.current = dataUri;
        // Clear any drawn paths since we're using uploaded image
        setPaths([]);
        setCurrentPoints([]);
        setTotalPoints(0);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to load image. Please try again.');
    }
  }, []);

  // Close handler
  const handleClose = useCallback(() => {
    if (paths.length > 0 && !signatureImage) {
      Alert.alert(
        'Discard Signature?',
        'Discard your drawn signature?',
        [
          { text: 'Keep', style: 'cancel' },
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
  }, [paths.length, signatureImage, handleClear, onClose]);

  // Current path SVG string
  const currentPathStr = pointsToPath(currentPoints);

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

        {/* Canvas Container - NO ScrollView parent, pointerEvents box-none */}
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
                <Text style={styles.placeholderText}>Draw here</Text>
              </View>
            )}
          </View>

          {/* Status row */}
          <View style={styles.statusRow}>
            {currentPoints.length > 0 ? (
              <View style={[styles.badge, styles.badgeDrawing]}>
                <Ionicons name="pencil" size={14} color="#2563EB" />
                <Text style={styles.badgeTextBlue}>Drawing ({currentPoints.length} pts)...</Text>
              </View>
            ) : hasValidSignature ? (
              <View style={[styles.badge, styles.badgeValid]}>
                <Ionicons name="checkmark-circle" size={14} color="#16A34A" />
                <Text style={styles.badgeTextGreen}>Signature ready!</Text>
              </View>
            ) : hasDrawnAnything ? (
              <View style={[styles.badge, styles.badgePending]}>
                <Ionicons name="time-outline" size={14} color="#D97706" />
                <Text style={styles.badgeTextOrange}>Keep drawing...</Text>
              </View>
            ) : (
              <View style={[styles.badge, styles.badgeEmpty]}>
                <Ionicons name="hand-left-outline" size={14} color="#94A3B8" />
                <Text style={styles.badgeTextGray}>Touch to draw</Text>
              </View>
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
            <Text style={styles.previewLabel}>✓ Captured Signature:</Text>
            <View style={styles.previewBox}>
              <Image
                source={{ uri: signatureImage }}
                style={styles.previewImg}
                resizeMode="contain"
              />
            </View>
          </View>
        )}

        {/* Legal text */}
        <View style={styles.legalBox}>
          <Ionicons name="shield-checkmark-outline" size={16} color="#64748B" />
          <Text style={styles.legalText}>
            By saving, you confirm this is your legal signature for the Scope of Appointment.
          </Text>
        </View>

        {/* Save button */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            style={[styles.saveBtn, !hasValidSignature && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!hasValidSignature || isSaving}
          >
            {isSaving ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
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
              Draw signature or upload image to continue
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
    height: 32,
    marginTop: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    gap: 5,
  },
  badgeDrawing: {
    backgroundColor: '#DBEAFE',
  },
  badgeValid: {
    backgroundColor: '#DCFCE7',
  },
  badgePending: {
    backgroundColor: '#FEF3C7',
  },
  badgeEmpty: {
    backgroundColor: '#F1F5F9',
  },
  badgeTextBlue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
  },
  badgeTextGreen: {
    fontSize: 12,
    fontWeight: '600',
    color: '#16A34A',
  },
  badgeTextOrange: {
    fontSize: 12,
    fontWeight: '600',
    color: '#D97706',
  },
  badgeTextGray: {
    fontSize: 12,
    fontWeight: '600',
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
  },
  previewLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#16A34A',
    marginBottom: 6,
  },
  previewBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#22C55E',
    padding: 6,
    alignItems: 'center',
  },
  previewImg: {
    width: CANVAS_WIDTH - 50,
    height: 60,
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
