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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Text as SvgText, Rect, G } from 'react-native-svg';
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
  const isDrawingRef = useRef(false);
  const canvasRef = useRef<View>(null);
  const viewShotRef = useRef<ViewShot>(null);
  const layoutRef = useRef({ x: 0, y: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT });

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setPaths([]);
      setCurrentPath('');
      setIsSaving(false);
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
    const { x, y } = getCoordinates(event);
    setCurrentPath(`M ${x.toFixed(1)} ${y.toFixed(1)}`);
  }, [getCoordinates]);

  const handleTouchMove = useCallback((event: GestureResponderEvent) => {
    if (!isDrawingRef.current) return;
    const { x, y } = getCoordinates(event);
    setCurrentPath(prev => `${prev} L ${x.toFixed(1)} ${y.toFixed(1)}`);
  }, [getCoordinates]);

  const handleTouchEnd = useCallback(() => {
    if (isDrawingRef.current && currentPath) {
      setPaths(prev => [...prev, currentPath]);
      setCurrentPath('');
    }
    isDrawingRef.current = false;
  }, [currentPath]);

  const handleClear = useCallback(() => {
    setPaths([]);
    setCurrentPath('');
  }, []);

  const handleSave = useCallback(async () => {
    if (paths.length === 0) {
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
      
      // Fallback: Generate a simple SVG with explicit dimensions
      // Convert to PNG-compatible format using a cleaner SVG
      try {
        const pathsStr = paths.map(p => 
          `<path d="${p}" stroke="#000000" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
        ).join('');
        
        const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}"><rect fill="#FFFFFF" width="100%" height="100%"/>${pathsStr}</svg>`;
        
        // Use TextEncoder for proper encoding
        const base64 = btoa(unescape(encodeURIComponent(svgContent)));
        const dataUri = `data:image/svg+xml;base64,${base64}`;
        
        onSave(dataUri);
      } catch (fallbackError) {
        console.error('Fallback signature save failed:', fallbackError);
      }
    } finally {
      setIsSaving(false);
    }
  }, [paths, onSave]);

  const handleClose = useCallback(() => {
    handleClear();
    onClose();
  }, [onClose, handleClear]);

  const handleCanvasLayout = useCallback((event: any) => {
    canvasRef.current?.measureInWindow((x, y, width, height) => {
      layoutRef.current = { x, y, width, height };
    });
  }, []);

  const hasSignature = paths.length > 0 || currentPath.length > 0;

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
            Use your finger to sign in the box below
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
                <Text style={styles.placeholderText}>Sign here</Text>
              </View>
            )}
          </View>
          <Text style={styles.signatureLabel}>Signature</Text>
        </View>

        {/* Legal Notice */}
        <View style={styles.legalNotice}>
          <Ionicons name="shield-checkmark-outline" size={18} color="#64748B" />
          <Text style={styles.legalText}>
            By saving this signature, you acknowledge this is your legal signature and agree to be bound by the associated document.
          </Text>
        </View>

        {/* Save Button */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            style={[
              styles.saveButton,
              (!hasSignature || paths.length === 0) && styles.saveButtonDisabled,
            ]}
            onPress={handleSave}
            disabled={paths.length === 0 || isSaving}
          >
            <Ionicons
              name="checkmark-circle"
              size={24}
              color={paths.length > 0 ? '#FFFFFF' : '#94A3B8'}
            />
            <Text
              style={[
                styles.saveButtonText,
                paths.length === 0 && styles.saveButtonTextDisabled,
              ]}
            >
              {isSaving ? 'Saving...' : 'Save Signature'}
            </Text>
          </TouchableOpacity>
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
  signatureLabel: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 8,
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
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#22C55E',
    borderRadius: 12,
    paddingVertical: 16,
    gap: 10,
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
});
