import React, { useRef, useState, useCallback, useEffect } from 'react';
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
  PanResponderGestureState,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Rect } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';

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
const MIN_POINTS = 15;
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
  const [currentPath, setCurrentPath] = useState<Point[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  const [totalPoints, setTotalPoints] = useState(0);
  const canvasLayoutRef = useRef({ x: 0, y: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT });

  // Reset when modal opens
  useEffect(() => {
    if (visible) {
      setPaths([]);
      setCurrentPath([]);
      setIsDrawing(false);
      setIsSaving(false);
      setTotalPoints(0);
      
      // Load existing signature if available
      if (existingSignature && existingSignature.startsWith('data:image/')) {
        setSignatureImage(existingSignature);
      } else {
        setSignatureImage(null);
      }
    }
  }, [visible, existingSignature]);

  // Convert points to SVG path string
  const pointsToPath = useCallback((points: Point[]): string => {
    if (points.length === 0) return '';
    if (points.length === 1) {
      return `M ${points[0].x} ${points[0].y} L ${points[0].x + 0.1} ${points[0].y + 0.1}`;
    }
    
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x} ${points[i].y}`;
    }
    return path;
  }, []);

  // Handle touch start
  const handleTouchStart = useCallback((event: GestureResponderEvent) => {
    const { locationX, locationY } = event.nativeEvent;
    setIsDrawing(true);
    setCurrentPath([{ x: locationX, y: locationY }]);
    // Clear any existing saved image since user is drawing new
    if (signatureImage) {
      setSignatureImage(null);
    }
  }, [signatureImage]);

  // Handle touch move
  const handleTouchMove = useCallback((event: GestureResponderEvent) => {
    if (!isDrawing) return;
    
    const { locationX, locationY } = event.nativeEvent;
    // Clamp to canvas bounds
    const x = Math.max(0, Math.min(locationX, CANVAS_WIDTH));
    const y = Math.max(0, Math.min(locationY, CANVAS_HEIGHT));
    
    setCurrentPath(prev => [...prev, { x, y }]);
  }, [isDrawing]);

  // Handle touch end
  const handleTouchEnd = useCallback(() => {
    if (currentPath.length > 0) {
      const pathStr = pointsToPath(currentPath);
      if (pathStr) {
        setPaths(prev => [...prev, pathStr]);
        setTotalPoints(prev => prev + currentPath.length);
      }
    }
    setCurrentPath([]);
    setIsDrawing(false);
  }, [currentPath, pointsToPath]);

  // PanResponder for native touch handling
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => {
        handleTouchStart(event);
      },
      onPanResponderMove: (event) => {
        handleTouchMove(event);
      },
      onPanResponderRelease: () => {
        handleTouchEnd();
      },
      onPanResponderTerminate: () => {
        handleTouchEnd();
      },
    })
  ).current;

  // Clear signature
  const handleClear = useCallback(() => {
    setPaths([]);
    setCurrentPath([]);
    setTotalPoints(0);
    setSignatureImage(null);
    setIsDrawing(false);
  }, []);

  // Check if signature is valid
  const hasValidSignature = useCallback(() => {
    return (paths.length >= MIN_PATHS && totalPoints >= MIN_POINTS) || 
           (signatureImage && signatureImage.length > 500);
  }, [paths.length, totalPoints, signatureImage]);

  // Save signature
  const handleSave = useCallback(async () => {
    if (!hasValidSignature()) {
      Alert.alert(
        'Signature Required',
        'Please draw your complete handwritten signature. A simple tap or small mark is not sufficient.',
        [{ text: 'OK' }]
      );
      return;
    }

    setIsSaving(true);

    try {
      // If we already have a saved image (from existing), use it
      if (signatureImage && paths.length === 0) {
        onSave(signatureImage);
        return;
      }

      // Capture the canvas as PNG
      const uri = await captureRef(canvasRef, {
        format: 'png',
        quality: 1,
        result: 'base64',
      });

      const dataUri = `data:image/png;base64,${uri}`;
      setSignatureImage(dataUri);
      onSave(dataUri);
    } catch (error) {
      console.error('Error capturing signature:', error);
      Alert.alert('Error', 'Failed to capture signature. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [hasValidSignature, signatureImage, paths.length, onSave]);

  // Close handler
  const handleClose = useCallback(() => {
    if (paths.length > 0 && !signatureImage) {
      Alert.alert(
        'Discard Signature?',
        'You have drawn a signature. Discard it?',
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
  }, [paths.length, signatureImage, handleClear, onClose]);

  // Get current path as SVG string
  const currentPathStr = pointsToPath(currentPath);
  const isValid = hasValidSignature();
  const hasDrawnAnything = paths.length > 0 || currentPath.length > 0;

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
          <Ionicons name="finger-print-outline" size={22} color="#3B82F6" />
          <Text style={styles.instructionsText}>
            Draw your signature with your finger
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
              style={styles.svg}
            >
              {/* White background */}
              <Rect
                x="0"
                y="0"
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                fill="#FFFFFF"
              />
              
              {/* Saved paths */}
              {paths.map((path, index) => (
                <Path
                  key={`path-${index}`}
                  d={path}
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

            {/* Signature line guide */}
            <View style={styles.sigLine} pointerEvents="none">
              <Text style={styles.xMark}>✕</Text>
              <View style={styles.dashed} />
            </View>

            {/* Placeholder when empty */}
            {!hasDrawnAnything && !signatureImage && (
              <View style={styles.placeholder} pointerEvents="none">
                <Ionicons name="create-outline" size={40} color="#CBD5E1" />
                <Text style={styles.placeholderText}>Draw here</Text>
              </View>
            )}
          </View>

          {/* Status badge */}
          <View style={styles.statusRow}>
            {isDrawing ? (
              <View style={[styles.badge, styles.badgeDrawing]}>
                <Ionicons name="pencil" size={14} color="#2563EB" />
                <Text style={[styles.badgeText, styles.badgeTextDrawing]}>Drawing...</Text>
              </View>
            ) : isValid ? (
              <View style={[styles.badge, styles.badgeValid]}>
                <Ionicons name="checkmark-circle" size={14} color="#16A34A" />
                <Text style={[styles.badgeText, styles.badgeTextValid]}>Signature ready!</Text>
              </View>
            ) : hasDrawnAnything ? (
              <View style={[styles.badge, styles.badgePending]}>
                <Ionicons name="time-outline" size={14} color="#D97706" />
                <Text style={[styles.badgeText, styles.badgePending]}>Keep drawing...</Text>
              </View>
            ) : (
              <View style={[styles.badge, styles.badgeEmpty]}>
                <Ionicons name="hand-left-outline" size={14} color="#94A3B8" />
                <Text style={[styles.badgeText, styles.badgeTextEmpty]}>Touch to draw</Text>
              </View>
            )}
          </View>
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
            By saving, you confirm this is your legal handwritten signature
            for the Scope of Appointment document.
          </Text>
        </View>

        {/* Save button */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            style={[styles.saveBtn, !isValid && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!isValid || isSaving}
          >
            {isSaving ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Ionicons
                  name="checkmark-circle"
                  size={24}
                  color={isValid ? '#FFFFFF' : '#94A3B8'}
                />
                <Text style={[styles.saveBtnText, !isValid && styles.saveBtnTextDisabled]}>
                  Save Signature
                </Text>
              </>
            )}
          </TouchableOpacity>

          {!isValid && !signatureImage && (
            <Text style={styles.hint}>
              Draw your signature above to continue
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
    paddingVertical: 12,
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
  svg: {
    backgroundColor: 'transparent',
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
    height: 34,
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
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  badgeTextDrawing: {
    color: '#2563EB',
  },
  badgeTextValid: {
    color: '#16A34A',
  },
  badgeTextPending: {
    color: '#D97706',
  },
  badgeTextEmpty: {
    color: '#94A3B8',
  },
  previewSection: {
    paddingHorizontal: 20,
    paddingTop: 12,
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
    paddingVertical: 12,
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
