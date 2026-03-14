import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Share,
  Platform,
  Image,
  Linking,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { api } from '../../src/services/api';

// Check if we're running on web
const isWeb = Platform.OS === 'web';

interface DeliveryLogEntry {
  id: string;
  delivery_method: string;
  recipient_contact?: string;
  notes?: string;
  delivered_at: string;
  delivered_by_user: string;
}

interface ScopeData {
  id: string;
  lead_id: string;
  form_fields: Record<string, any>;
  typed_name: string;
  signature: string;
  agent_typed_name: string;
  agent_signature: string;
  pdf_base64?: string;
  created_date: string;
  created_by_user: string;
  delivery_history?: DeliveryLogEntry[];
}

export default function ScopeDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<ScopeData | null>(null);
  const [lead, setLead] = useState<any>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<'print' | 'save' | 'share' | 'preview' | null>(null);

  useEffect(() => {
    loadScope();
  }, [id]);

  const loadScope = async () => {
    try {
      const data = await api.getScope(id!);
      setScope(data);
      
      // Also load lead info
      try {
        const leadData = await api.getLead(data.lead_id);
        setLead(leadData);
      } catch (e) {
        console.log('Could not load lead');
      }
    } catch (error) {
      console.error('Error loading scope:', error);
      Alert.alert('Error', 'Failed to load document');
    } finally {
      setLoading(false);
    }
  };

  const getPdfData = async (): Promise<string | null> => {
    if (scope?.pdf_base64) {
      return scope.pdf_base64;
    }
    
    setPdfLoading(true);
    try {
      const pdfResponse = await api.getScopePdf(id!);
      if (pdfResponse.pdf_base64) {
        // Update local state with the PDF
        setScope(prev => prev ? { ...prev, pdf_base64: pdfResponse.pdf_base64 } : null);
        return pdfResponse.pdf_base64;
      }
    } catch (error) {
      console.error('Error getting PDF:', error);
    } finally {
      setPdfLoading(false);
    }
    return null;
  };

  const getFilename = () => {
    const leadName = lead?.name?.replace(/\s+/g, '_') || 'Document';
    const date = scope?.created_date 
      ? new Date(scope.created_date).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];
    return `SOA_${leadName}_${date}.pdf`;
  };

  // Save PDF to temp file and return the file path (iOS/Android only)
  const savePdfToTempFile = async (): Promise<string | null> => {
    const pdfBase64 = await getPdfData();
    if (!pdfBase64) {
      return null;
    }
    
    // On web, we can't use FileSystem the same way
    if (isWeb) {
      return null;
    }
    
    const filename = getFilename();
    const fileUri = `${FileSystem.cacheDirectory}${filename}`;
    
    await FileSystem.writeAsStringAsync(fileUri, pdfBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    
    return fileUri;
  };

  // Open PDF in browser (web only)
  const openPdfInBrowser = async () => {
    const pdfBase64 = await getPdfData();
    if (!pdfBase64) {
      Alert.alert('Error', 'Could not load PDF document');
      return;
    }
    
    // Create a data URL and open it
    const dataUrl = `data:application/pdf;base64,${pdfBase64}`;
    
    // For web, we can create a blob and open it
    try {
      const byteCharacters = atob(pdfBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
    } catch (error) {
      console.error('Error opening PDF:', error);
      // Fallback: try to download
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = getFilename();
      link.click();
    }
  };

  // iOS-native PDF preview using Sharing (opens Quick Look)
  const handlePreview = async () => {
    setActionLoading('preview');
    try {
      // On web, open in browser
      if (isWeb) {
        await openPdfInBrowser();
        setActionLoading(null);
        return;
      }
      
      const fileUri = await savePdfToTempFile();
      if (!fileUri) {
        Alert.alert('Error', 'Could not load PDF document');
        return;
      }
      
      // On iOS, expo-sharing opens the native share sheet which includes Quick Look preview
      // This is the most reliable way to preview PDFs on iOS
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'View Scope of Appointment',
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert(
          'Preview Unavailable',
          'PDF preview is not available on this device. Use Print or Save to Files instead.'
        );
      }
    } catch (error: any) {
      console.error('Preview error:', error);
      if (!error.message?.includes('canceled') && !error.message?.includes('cancelled')) {
        Alert.alert('Preview Error', 'Unable to preview document. Please try again.');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handlePrint = async () => {
    setActionLoading('print');
    try {
      const fileUri = await savePdfToTempFile();
      if (!fileUri) {
        Alert.alert('Error', 'Could not generate PDF for printing');
        return;
      }

      // Use file URI for printing (works on both iOS and Android)
      await Print.printAsync({ uri: fileUri });
    } catch (error: any) {
      console.error('Print error:', error);
      if (!error.message?.includes('canceled') && !error.message?.includes('cancelled')) {
        Alert.alert('Print Error', 'Unable to print. Please try again.');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveToFiles = async () => {
    setActionLoading('save');
    try {
      const pdfBase64 = await getPdfData();
      if (!pdfBase64) {
        Alert.alert('Error', 'Could not generate PDF');
        return;
      }

      const filename = getFilename();
      // Save to document directory for persistence
      const fileUri = `${FileSystem.documentDirectory}${filename}`;
      
      await FileSystem.writeAsStringAsync(fileUri, pdfBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      // On iOS, Sharing.shareAsync with proper UTI allows "Save to Files"
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Save Scope of Appointment',
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert(
          'Saved', 
          `Document saved to app storage:\n${filename}\n\nTo access this file, connect your device to a computer or use a file manager app.`
        );
      }
    } catch (error: any) {
      console.error('Save error:', error);
      if (!error.message?.includes('canceled') && !error.message?.includes('cancelled')) {
        Alert.alert('Save Error', 'Unable to save document. Please try again.');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const logDelivery = async (method: string, contact?: string, notes?: string) => {
    try {
      await api.logScopeDelivery(id!, {
        delivery_method: method,
        recipient_contact: contact,
        notes: notes,
      });
      // Refresh scope to get updated delivery history
      const updatedScope = await api.getScope(id!);
      setScope(updatedScope);
    } catch (error) {
      console.error('Error logging delivery:', error);
      // Don't show error to user - this is a background operation
    }
  };

  const handleShare = async () => {
    setActionLoading('share');
    try {
      const fileUri = await savePdfToTempFile();
      if (!fileUri) {
        Alert.alert('Error', 'Could not generate PDF');
        return;
      }
      
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Share Scope of Appointment',
          UTI: 'com.adobe.pdf',
        });
        // Log delivery after successful share
        await logDelivery('share', undefined, 'Shared via device share sheet');
      } else {
        // Fallback to basic share with message
        const shareMessage = `Scope of Appointment Document\n\nBeneficiary: ${scope?.typed_name || 'N/A'}\nDocument ID: ${scope?.id?.slice(0, 8).toUpperCase()}\nCreated: ${formatDate(scope?.created_date || '')}`;
        
        await Share.share({
          message: shareMessage,
          title: 'Scope of Appointment',
        });
        await logDelivery('share', undefined, 'Shared via text message');
      }
    } catch (error: any) {
      console.error('Share error:', error);
      if (!error.message?.includes('canceled') && !error.message?.includes('cancelled')) {
        Alert.alert('Share Error', 'Unable to share document. Please try again.');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleEmailDocument = async () => {
    setActionLoading('share');
    try {
      const fileUri = await savePdfToTempFile();
      if (!fileUri) {
        Alert.alert('Error', 'Could not generate PDF');
        return;
      }

      // Use share to open email with attachment
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Send via Email',
        UTI: 'com.adobe.pdf',
      });
      
      // Log delivery after user opens email dialog
      const leadEmail = lead?.email || scope?.form_fields?.beneficiary_email;
      await logDelivery('email', leadEmail, 'Sent via email');
    } catch (error: any) {
      console.error('Email error:', error);
      if (!error.message?.includes('canceled') && !error.message?.includes('cancelled')) {
        Alert.alert('Email Error', 'Unable to send email. Please try again.');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Render signature preview from base64
  const renderSignaturePreview = (signatureData: string | undefined, label: string) => {
    if (!signatureData) {
      return (
        <View style={styles.noSignatureContainer}>
          <Text style={styles.noSignatureText}>No signature</Text>
        </View>
      );
    }
    
    return (
      <View style={styles.signaturePreviewContainer}>
        <Image
          source={{ uri: signatureData }}
          style={styles.signatureImage}
          resizeMode="contain"
        />
        <Text style={styles.signaturePreviewLabel}>{label}</Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#8B5CF6" />
        <Text style={styles.loadingText}>Loading document...</Text>
      </View>
    );
  }

  if (!scope) {
    return (
      <View style={[styles.container, styles.loadingContainer, { paddingTop: insets.top }]}>
        <Ionicons name="document-text" size={64} color="#334155" />
        <Text style={styles.errorText}>Document not found</Text>
        <TouchableOpacity style={styles.backLink} onPress={() => router.back()}>
          <Text style={styles.backLinkText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const formFields = scope.form_fields || {};
  const products = [
    { key: 'medicare_advantage', label: 'Medicare Advantage Plans (Part C)' },
    { key: 'medicare_supplement', label: 'Medicare Supplement Insurance' },
    { key: 'prescription_drug', label: 'Prescription Drug Plans (Part D)' },
    { key: 'dental_vision_hearing', label: 'Dental, Vision, and Hearing Products' },
    { key: 'hospital_indemnity', label: 'Hospital Indemnity Insurance' },
  ];
  const selectedProducts = products.filter(p => formFields[p.key]);
  const hasPdf = !!scope.pdf_base64;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scope of Appointment</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Document Status Card */}
        <View style={styles.statusCard}>
          <View style={styles.statusIcon}>
            <Ionicons name="checkmark-circle" size={32} color="#22C55E" />
          </View>
          <View style={styles.statusInfo}>
            <Text style={styles.statusTitle}>Document Complete</Text>
            <Text style={styles.statusDate}>{formatDate(scope.created_date)}</Text>
          </View>
          <View style={styles.docIdBadge}>
            <Text style={styles.docIdText}>#{scope.id.slice(0, 8).toUpperCase()}</Text>
          </View>
        </View>

        {/* PDF Status & Quick Actions */}
        <View style={styles.pdfStatusCard}>
          <View style={styles.pdfStatusLeft}>
            <Ionicons 
              name={hasPdf ? "document-attach" : "cloud-download"} 
              size={24} 
              color={hasPdf ? "#22C55E" : "#F59E0B"} 
            />
            <View style={styles.pdfStatusText}>
              <Text style={styles.pdfStatusTitle}>
                {hasPdf ? 'PDF Ready' : 'PDF Available'}
              </Text>
              <Text style={styles.pdfStatusSubtitle}>
                {hasPdf ? 'Stored in lead record' : 'Tap to generate'}
              </Text>
            </View>
          </View>
          <TouchableOpacity 
            style={styles.viewPdfButton}
            onPress={handlePreview}
            disabled={actionLoading === 'preview'}
          >
            {actionLoading === 'preview' || pdfLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="eye" size={18} color="#FFFFFF" />
                <Text style={styles.viewPdfText}>View PDF</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Document Actions */}
        <View style={styles.actionsContainer}>
          <Text style={styles.actionsTitle}>Document Actions</Text>
          <View style={styles.actionsGrid}>
            <TouchableOpacity 
              style={styles.actionButton} 
              onPress={handlePrint}
              disabled={actionLoading !== null}
            >
              {actionLoading === 'print' ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="print" size={24} color="#FFFFFF" />
              )}
              <Text style={styles.actionText}>Print</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.actionButton} 
              onPress={handleSaveToFiles}
              disabled={actionLoading !== null}
            >
              {actionLoading === 'save' ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="folder-open" size={24} color="#FFFFFF" />
              )}
              <Text style={styles.actionText}>Save to Files</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.actionButton} 
              onPress={handleShare}
              disabled={actionLoading !== null}
            >
              {actionLoading === 'share' ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="share-social" size={24} color="#FFFFFF" />
              )}
              <Text style={styles.actionText}>Share</Text>
            </TouchableOpacity>
          </View>
          
          {/* Quick email action */}
          <TouchableOpacity 
            style={styles.emailButton}
            onPress={handleEmailDocument}
            disabled={actionLoading !== null}
          >
            <Ionicons name="mail" size={20} color="#3B82F6" />
            <Text style={styles.emailButtonText}>Send via Email</Text>
          </TouchableOpacity>
        </View>

        {/* Beneficiary Info */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="person" size={20} color="#8B5CF6" />
            <Text style={styles.sectionTitle}>Beneficiary</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Name</Text>
            <Text style={styles.infoValue}>{formFields.beneficiary_name || lead?.name || 'N/A'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Phone</Text>
            <Text style={styles.infoValue}>{formFields.beneficiary_phone || lead?.phone || 'N/A'}</Text>
          </View>
          {(formFields.beneficiary_address || lead?.address) && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Address</Text>
              <Text style={styles.infoValue}>{formFields.beneficiary_address || lead?.address}</Text>
            </View>
          )}
          <View style={styles.signatureRow}>
            <Text style={styles.infoLabel}>Typed Name</Text>
            <Text style={[styles.infoValue, styles.signatureText]}>{scope.typed_name}</Text>
          </View>
          
          {/* Beneficiary Signature Preview */}
          {scope.signature && (
            <View style={styles.signatureSection}>
              <Text style={styles.signatureSectionLabel}>Signature</Text>
              {renderSignaturePreview(scope.signature, 'Beneficiary Signature')}
            </View>
          )}
        </View>

        {/* Agent Info */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="briefcase" size={20} color="#8B5CF6" />
            <Text style={styles.sectionTitle}>Licensed Sales Representative</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Name</Text>
            <Text style={styles.infoValue}>{formFields.agent_name || 'N/A'}</Text>
          </View>
          {formFields.agent_license && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>License #</Text>
              <Text style={styles.infoValue}>{formFields.agent_license}</Text>
            </View>
          )}
          <View style={styles.signatureRow}>
            <Text style={styles.infoLabel}>Typed Name</Text>
            <Text style={[styles.infoValue, styles.signatureText]}>{scope.agent_typed_name || 'N/A'}</Text>
          </View>
          
          {/* Agent Signature Preview */}
          {scope.agent_signature && (
            <View style={styles.signatureSection}>
              <Text style={styles.signatureSectionLabel}>Signature</Text>
              {renderSignaturePreview(scope.agent_signature, 'Agent Signature')}
            </View>
          )}
        </View>

        {/* Products */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="list" size={20} color="#8B5CF6" />
            <Text style={styles.sectionTitle}>Products Discussed</Text>
          </View>
          {selectedProducts.length > 0 ? (
            selectedProducts.map(product => (
              <View key={product.key} style={styles.productItem}>
                <Ionicons name="checkmark-circle" size={20} color="#22C55E" />
                <Text style={styles.productText}>{product.label}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.noProductsText}>No products selected</Text>
          )}
          {formFields.other_products && (
            <View style={styles.productItem}>
              <Ionicons name="checkmark-circle" size={20} color="#22C55E" />
              <Text style={styles.productText}>Other: {formFields.other_products}</Text>
            </View>
          )}
        </View>

        {/* Delivery History */}
        {scope.delivery_history && scope.delivery_history.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="paper-plane" size={20} color="#8B5CF6" />
              <Text style={styles.sectionTitle}>Delivery History</Text>
            </View>
            {scope.delivery_history.map((entry, index) => (
              <View key={entry.id || index} style={styles.deliveryItem}>
                <View style={styles.deliveryIconContainer}>
                  <Ionicons 
                    name={entry.delivery_method === 'email' ? 'mail' : 
                          entry.delivery_method === 'sms' ? 'chatbubble' : 'share-social'} 
                    size={18} 
                    color="#3B82F6" 
                  />
                </View>
                <View style={styles.deliveryInfo}>
                  <Text style={styles.deliveryMethod}>
                    {entry.delivery_method === 'email' ? 'Sent via Email' :
                     entry.delivery_method === 'sms' ? 'Sent via SMS' :
                     entry.delivery_method === 'share' ? 'Shared' : 
                     `Sent via ${entry.delivery_method}`}
                  </Text>
                  <Text style={styles.deliveryDate}>
                    {formatDate(entry.delivered_at)}
                  </Text>
                  {entry.recipient_contact && (
                    <Text style={styles.deliveryRecipient}>To: {entry.recipient_contact}</Text>
                  )}
                </View>
                <Ionicons name="checkmark-circle" size={18} color="#22C55E" />
              </View>
            ))}
          </View>
        )}

        {/* Link to Lead */}
        {lead && (
          <TouchableOpacity 
            style={styles.leadLink}
            onPress={() => router.push(`/lead/${lead.id}`)}
          >
            <View style={styles.leadLinkLeft}>
              <View style={styles.leadAvatar}>
                <Text style={styles.leadInitial}>{lead.name?.charAt(0) || '?'}</Text>
              </View>
              <View>
                <Text style={styles.leadLinkLabel}>Stored in Lead Record</Text>
                <Text style={styles.leadLinkName}>{lead.name}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>
        )}

        {/* Footer Compliance Note */}
        <View style={styles.complianceNote}>
          <Ionicons name="shield-checkmark" size={18} color="#22C55E" />
          <Text style={styles.complianceText}>
            This document complies with CMS requirements for Medicare sales appointments. 
            Document ID: {scope.id.slice(0, 8).toUpperCase()}. Retain for a minimum of 10 years.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 16,
    fontSize: 14,
  },
  errorText: {
    color: '#94A3B8',
    marginTop: 16,
    fontSize: 16,
  },
  backLink: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#334155',
    borderRadius: 8,
  },
  backLinkText: {
    color: '#3B82F6',
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  headerRight: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#22C55E30',
  },
  statusIcon: {
    marginRight: 12,
  },
  statusInfo: {
    flex: 1,
  },
  statusTitle: {
    color: '#22C55E',
    fontSize: 16,
    fontWeight: '600',
  },
  statusDate: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 2,
  },
  docIdBadge: {
    backgroundColor: '#334155',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  docIdText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  pdfStatusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  pdfStatusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pdfStatusText: {
    gap: 2,
  },
  pdfStatusTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  pdfStatusSubtitle: {
    color: '#64748B',
    fontSize: 12,
  },
  viewPdfButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  viewPdfText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  actionsContainer: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  actionsTitle: {
    color: '#94A3B8',
    fontSize: 13,
    marginBottom: 12,
  },
  actionsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#8B5CF6',
    paddingVertical: 16,
    borderRadius: 12,
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 6,
    textAlign: 'center',
  },
  emailButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#334155',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 12,
    gap: 8,
  },
  emailButtonText: {
    color: '#3B82F6',
    fontSize: 14,
    fontWeight: '500',
  },
  section: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 10,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  infoLabel: {
    color: '#94A3B8',
    fontSize: 14,
  },
  infoValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
    maxWidth: '60%',
    textAlign: 'right',
  },
  signatureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  signatureText: {
    fontStyle: 'italic',
    color: '#3B82F6',
  },
  signatureSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  signatureSectionLabel: {
    color: '#94A3B8',
    fontSize: 12,
    marginBottom: 8,
  },
  signaturePreviewContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
  },
  signatureImage: {
    width: '100%',
    height: 80,
    backgroundColor: '#FFFFFF',
  },
  signaturePreviewLabel: {
    color: '#64748B',
    fontSize: 10,
    marginTop: 4,
  },
  noSignatureContainer: {
    backgroundColor: '#334155',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  noSignatureText: {
    color: '#64748B',
    fontSize: 12,
    fontStyle: 'italic',
  },
  productItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
  },
  productText: {
    color: '#E2E8F0',
    fontSize: 14,
    flex: 1,
  },
  noProductsText: {
    color: '#64748B',
    fontSize: 14,
    fontStyle: 'italic',
  },
  leadLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  leadLinkLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  leadAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  leadInitial: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  leadLinkLabel: {
    color: '#64748B',
    fontSize: 12,
  },
  leadLinkName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  complianceNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#22C55E10',
    borderRadius: 12,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: '#22C55E30',
  },
  complianceText: {
    flex: 1,
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 18,
  },
  // Delivery History Styles
  deliveryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  deliveryIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3B82F620',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  deliveryInfo: {
    flex: 1,
  },
  deliveryMethod: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  deliveryDate: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  deliveryRecipient: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 2,
  },
});
