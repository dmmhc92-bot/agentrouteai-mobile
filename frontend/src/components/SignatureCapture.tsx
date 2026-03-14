import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Modal,
  GestureResponderEvent,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Rect, G } from 'react-native-svg';
import ViewShot, { captureRef } from 'react-native-view-shot';

interface SignatureCaptureProps {
  visible: boolean;
  onClose: () => void;
  onSave: (signatureBase64: string) => void;
  title: string;
  subtitle?: string;
  signerName?: string;
}

const { width: screenWidth } = Dimensions.get('window');
const CANVAS_WIDTH = Math.min(screenWidth - 32, 400);
const CANVAS_HEIGHT = 200;

// Minimum stroke data required for a valid signature
const MIN_STROKE_POINTS = 20;
const MIN_PATH_COUNT = 1;

export default function SignatureCapture({
  visible,
  onClose,
  onSave,
  title,
  subtitle,
  signerName,
}: SignatureCaptureProps) {
  const insets = useSafeAreaInsets();
  const [paths, setPaths] = useState<string[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [totalPoints, setTotalPoints] = useState(0);
  const isDrawingRef = useRef(false);
  const canvasRef = useRef<View>(null);
  const viewShotRef = useRef<ViewShot>(null);
  const layoutRef = useRef({ x: 0, y: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT });
  const pointCountRef = useRef(0);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setPaths([]);
      setCurrentPath('');
      setIsSaving(false);
      setTotalPoints(0);
      pointCountRef.current = 0;
    }
  }, [visible]);

  const getCoordinates = useCallback((event: GestureResponderEvent) => {
    const { pageX, pageY } = event.nativeEvent;
    const { x: layoutX, y: layoutY } = layoutRef.current;
    
    let x = pageX - layoutX;
    let y = pageY - layoutY;
    
    // Clamp to canvas bounds
    x = Math.max(0, Math.min(x, CANVAS_WIDTH));
    y = Math.max(0, Math.min(y, CANVAS_HEIGHT));
    
    return { x, y };
  }, []);

  const handleTouchStart = useCallback((event: GestureResponderEvent) => {
    isDrawingRef.current = true;
    pointCountRef.current = 1;
    const { x, y } = getCoordinates(event);
    setCurrentPath(`M ${x.toFixed(1)} ${y.toFixed(1)}`);
  }, [getCoordinates]);

  const handleTouchMove = useCallback((event: GestureResponderEvent) => {
    if (!isDrawingRef.current) return;
    pointCountRef.current += 1;
    const { x, y } = getCoordinates(event);
    setCurrentPath(prev => `${prev} L ${x.toFixed(1)} ${y.toFixed(1)}`);
  }, [getCoordinates]);

  const handleTouchEnd = useCallback(() => {
    if (isDrawingRef.current && currentPath) {
      setPaths(prev => [...prev, currentPath]);
      setTotalPoints(prev => prev + pointCountRef.current);
      setCurrentPath('');
    }
    isDrawingRef.current = false;
    pointCountRef.current = 0;
  }, [currentPath]);

  const handleClear = useCallback(() => {
    setPaths([]);
    setCurrentPath('');
    setTotalPoints(0);
    pointCountRef.current = 0;
  }, []);

  // Validate that a real signature exists (not just a tap or small scribble)
  const isValidSignature = useCallback(() => {
    return paths.length >= MIN_PATH_COUNT && totalPoints >= MIN_STROKE_POINTS;
  }, [paths.length, totalPoints]);

  const handleSave = useCallback(async () => {
    // Validate signature has enough stroke data
    if (!isValidSignature()) {
      Alert.alert(
        'Signature Required',
        'Please draw your complete handwritten signature. A simple tap or small mark is not sufficient for legal documents.',
        [{ text: 'OK' }]
      );
      return;
    }

    setIsSaving(true);
    
    try {
      // Capture the signature canvas as a PNG image using view-shot
      // This creates a proper raster image that ReportLab can handle
      const uri = await captureRef(viewShotRef, {
        format: 'png',
        quality: 1,
        result: 'base64',
      });
      
      // Return as proper PNG data URI that backend can decode
      const dataUri = `data:image/png;base64,${uri}`;
      onSave(dataUri);
    } catch (error) {
      console.error('Error capturing signature:', error);
      
      // Fallback: Generate a simple PNG-compatible SVG
      try {
        const pathsStr = paths.map(p => 
          `<path d="${p}" stroke="#000000" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
        ).join('');
        
        // Create SVG with white background
        const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}"><rect fill="#FFFFFF" width="100%" height="100%"/>${pathsStr}</svg>`;
        
        // Use TextEncoder for proper encoding
        const base64 = btoa(unescape(encodeURIComponent(svgContent)));
        const dataUri = `data:image/svg+xml;base64,${base64}`;
        
        onSave(dataUri);
      } catch (fallbackError) {
        console.error('Fallback signature save failed:', fallbackError);
        Alert.alert('Error', 'Failed to save signature. Please try again.');
      }
    } finally {
      setIsSaving(false);
    }
  }, [paths, onSave, isValidSignature]);

  const handleClose = useCallback(() => {
    // Warn if user has started drawing
    if (paths.length > 0) {
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
            }
          }
        ]
      );
    } else {
      onClose();
    }
  }, [onClose, handleClear, paths.length]);

  const handleCanvasLayout = useCallback((event: any) => {
    canvasRef.current?.measureInWindow((x, y, width, height) => {
      layoutRef.current = { x, y, width, height };
    });
  }, []);

  const hasSignature = paths.length > 0 || currentPath.length > 0;
  const validSignature = isValidSignature();

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

        {/* Signature Canvas */}
        <View style={styles.canvasContainer}>
          <View
            ref={canvasRef}
            style={styles.canvas}
            onLayout={handleCanvasLayout}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={handleTouchStart}
            onResponderMove={handleTouchMove}
            onResponderRelease={handleTouchEnd}
            onResponderTerminate={handleTouchEnd}
          >
            {/* ViewShot wrapper to capture the signature as PNG */}
            <ViewShot 
              ref={viewShotRef} 
              options={{ format: 'png', quality: 1 }}
              style={styles.viewShot}
            >
              <Svg 
                width={CANVAS_WIDTH} 
                height={CANVAS_HEIGHT}
                style={styles.svg}
              >
                {/* White background - important for PDF */}
                <Rect x="0" y="0" width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="#FFFFFF" />
                
                {/* Signature paths group */}
                <G>
                  {/* Saved signature paths */}
                  {paths.map((path, index) => (
                    <Path
                      key={`path-${index}`}
                      d={path}
                      stroke="#1F2937"
                      strokeWidth={3}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
                  
                  {/* Current path being drawn */}
                  {currentPath && (
                    <Path
                      d={currentPath}
                      stroke="#1F2937"
                      strokeWidth={3}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                </G>
              </Svg>
            </ViewShot>
            
            {/* Signature line guide - outside viewshot so it's not captured */}
            <View style={styles.signatureLine} pointerEvents="none">
              <Text style={styles.xMarker}>✕</Text>
              <View style={styles.dashedLine} />
            </View>
            
            {/* Placeholder when empty */}
            {!hasSignature && (
              <View style={styles.placeholder} pointerEvents="none">
                <Ionicons name="create-outline" size={40} color="#CBD5E1" />
                <Text style={styles.placeholderText}>Draw your signature here</Text>
              </View>
            )}
          </View>
          
          {/* Signature status indicator */}
          <View style={styles.signatureStatus}>
            {hasSignature && (
              <View style={[
                styles.statusBadge,
                validSignature ? styles.statusValid : styles.statusIncomplete
              ]}>
                <Ionicons 
                  name={validSignature ? "checkmark-circle" : "alert-circle"} 
                  size={14} 
                  color={validSignature ? "#22C55E" : "#F59E0B"} 
                />
                <Text style={[
                  styles.statusText,
                  validSignature ? styles.statusTextValid : styles.statusTextIncomplete
                ]}>
                  {validSignature ? "Signature captured" : "Keep drawing..."}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Legal Notice */}
        <View style={styles.legalNotice}>
          <Ionicons name="shield-checkmark-outline" size={18} color="#64748B" />
          <Text style={styles.legalText}>
            By saving this signature, you acknowledge that this is your legal handwritten signature 
            and agree to be bound by the associated Scope of Appointment document. This signature 
            will be embedded into the final PDF document.
          </Text>
        </View>

        {/* Save Button */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            style={[
              styles.saveButton,
              !validSignature && styles.saveButtonDisabled,
            ]}
            onPress={handleSave}
            disabled={!validSignature || isSaving}
          >
            <Ionicons
              name="checkmark-circle"
              size={24}
              color={validSignature ? '#FFFFFF' : '#94A3B8'}
            />
            <Text
              style={[
                styles.saveButtonText,
                !validSignature && styles.saveButtonTextDisabled,
              ]}
            >
              {isSaving ? 'Saving...' : 'Save Signature'}
            </Text>
          </TouchableOpacity>
          
          {!validSignature && hasSignature && (
            <Text style={styles.hintText}>
              Please draw a complete signature to continue
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
    paddingHorizontal: 16,
    marginTop: 8,
    alignItems: 'center',
  },
  canvas: {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#3B82F6',
    overflow: 'hidden',
    position: 'relative',
  },
  viewShot: {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    backgroundColor: '#FFFFFF',
  },
  svg: {
    backgroundColor: '#FFFFFF',
  },
  signatureLine: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  xMarker: {
    fontSize: 16,
    color: '#94A3B8',
    marginRight: 8,
  },
  dashedLine: {
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
    fontSize: 14,
    color: '#CBD5E1',
    marginTop: 8,
  },
  signatureStatus: {
    height: 28,
    marginTop: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  statusValid: {
    backgroundColor: '#DCFCE7',
  },
  statusIncomplete: {
    backgroundColor: '#FEF3C7',
  },
  statusText: {
    fontSize: 13,
    fontWeight: '500',
  },
  statusTextValid: {
    color: '#16A34A',
  },
  statusTextIncomplete: {
    color: '#D97706',
  },
  legalNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 10,
  },
  legalText: {
    flex: 1,
    fontSize: 12,
    color: '#64748B',
    lineHeight: 18,
  },
  footer: {
    marginTop: 'auto',
    paddingHorizontal: 16,
    paddingTop: 16,
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
