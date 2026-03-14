import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  PanResponder,
  Dimensions,
  Modal,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, G, Text as SvgText } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';

interface Point {
  x: number;
  y: number;
}

interface SignatureCaptureProps {
  visible: boolean;
  onClose: () => void;
  onSave: (signatureBase64: string) => void;
  title: string;
  subtitle?: string;
  signerName?: string;
}

const { width: screenWidth } = Dimensions.get('window');
const CANVAS_WIDTH = screenWidth - 32;
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
  const svgRef = useRef<View>(null);
  const [paths, setPaths] = useState<string[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const x = Math.max(0, Math.min(locationX, CANVAS_WIDTH));
        const y = Math.max(0, Math.min(locationY, CANVAS_HEIGHT));
        setCurrentPath(`M ${x} ${y}`);
      },
      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const x = Math.max(0, Math.min(locationX, CANVAS_WIDTH));
        const y = Math.max(0, Math.min(locationY, CANVAS_HEIGHT));
        setCurrentPath((prev) => `${prev} L ${x} ${y}`);
      },
      onPanResponderRelease: () => {
        if (currentPath) {
          setPaths((prev) => [...prev, currentPath]);
          setCurrentPath('');
        }
      },
    })
  ).current;

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
      if (svgRef.current) {
        const uri = await captureRef(svgRef, {
          format: 'png',
          quality: 1,
          result: 'base64',
        });
        onSave(`data:image/png;base64,${uri}`);
      }
    } catch (error) {
      console.error('Error capturing signature:', error);
      // Fallback: pass the paths as SVG data
      const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}"><rect fill="white" width="100%" height="100%"/>${paths.map(p => `<path d="${p}" stroke="#000" stroke-width="2" fill="none"/>`).join('')}</svg>`;
      const base64 = btoa(svgContent);
      onSave(`data:image/svg+xml;base64,${base64}`);
    } finally {
      setIsSaving(false);
    }
  }, [paths, onSave]);

  const handleClose = useCallback(() => {
    handleClear();
    onClose();
  }, [onClose, handleClear]);

  const hasSignature = paths.length > 0;

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
            ref={svgRef}
            style={styles.canvas}
            {...panResponder.panHandlers}
            collapsable={false}
          >
            <Svg width={CANVAS_WIDTH} height={CANVAS_HEIGHT}>
              {/* Grid lines for guidance */}
              <Path
                d={`M 0 ${CANVAS_HEIGHT - 40} L ${CANVAS_WIDTH} ${CANVAS_HEIGHT - 40}`}
                stroke="#E2E8F0"
                strokeWidth="1"
                strokeDasharray="5,5"
              />
              {/* Saved paths */}
              {paths.map((path, index) => (
                <Path
                  key={index}
                  d={path}
                  stroke="#1F2937"
                  strokeWidth={2.5}
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
                  strokeWidth={2.5}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {/* X marker for signature line */}
              <SvgText
                x={10}
                y={CANVAS_HEIGHT - 50}
                fontSize={16}
                fill="#94A3B8"
              >
                ✕
              </SvgText>
            </Svg>
            {!hasSignature && !currentPath && (
              <View style={styles.placeholder}>
                <Ionicons name="create-outline" size={40} color="#CBD5E1" />
                <Text style={styles.placeholderText}>Sign here</Text>
              </View>
            )}
          </View>
          <Text style={styles.signatureLine}>Signature</Text>
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
              !hasSignature && styles.saveButtonDisabled,
            ]}
            onPress={handleSave}
            disabled={!hasSignature || isSaving}
          >
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
  },
  canvas: {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    position: 'relative',
  },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'none',
  },
  placeholderText: {
    fontSize: 14,
    color: '#CBD5E1',
    marginTop: 8,
  },
  signatureLine: {
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
