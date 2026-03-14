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
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { api } from '../../src/services/api';

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
}

export default function ScopeDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<ScopeData | null>(null);
  const [lead, setLead] = useState<any>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<'print' | 'save' | 'share' | null>(null);

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

  const handlePrint = async () => {
    setActionLoading('print');
    try {
      const pdfBase64 = await getPdfData();
      if (!pdfBase64) {
        Alert.alert('Error', 'Could not generate PDF for printing');
        return;
      }

      // Convert base64 to data URI
      const pdfUri = `data:application/pdf;base64,${pdfBase64}`;
      
      await Print.printAsync({
        uri: pdfUri,
      });
    } catch (error: any) {
      console.error('Print error:', error);
      Alert.alert('Print Error', 'Unable to print. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSave = async () => {
    setActionLoading('save');
    try {
      const pdfBase64 = await getPdfData();
      if (!pdfBase64) {
        Alert.alert('Error', 'Could not generate PDF');
        return;
      }

      const filename = `SOA_${lead?.name?.replace(/\s+/g, '_') || 'Document'}_${new Date().toISOString().split('T')[0]}.pdf`;
      const fileUri = `${FileSystem.documentDirectory}${filename}`;
      
      await FileSystem.writeAsStringAsync(fileUri, pdfBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      // Check if we can share (which allows saving to Files)
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Save Scope of Appointment',
        });
      } else {
        Alert.alert('Success', `Document saved to app storage:\n${filename}`);
      }
    } catch (error: any) {
      console.error('Save error:', error);
      Alert.alert('Save Error', 'Unable to save document. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleShare = async () => {
    setActionLoading('share');
    try {
      const pdfBase64 = await getPdfData();
      if (!pdfBase64) {
        Alert.alert('Error', 'Could not generate PDF');
        return;
      }

      const filename = `SOA_${lead?.name?.replace(/\s+/g, '_') || 'Document'}_${new Date().toISOString().split('T')[0]}.pdf`;
      const fileUri = `${FileSystem.cacheDirectory}${filename}`;
      
      await FileSystem.writeAsStringAsync(fileUri, pdfBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Share Scope of Appointment',
        });
      } else {
        // Fallback to basic share
        await Share.share({
          message: `Scope of Appointment for ${lead?.name || 'Client'} - Document ID: ${scope?.id.slice(0, 8).toUpperCase()}`,
          title: 'Scope of Appointment',
        });
      }
    } catch (error: any) {
      console.error('Share error:', error);
      if (!error.message?.includes('canceled')) {
        Alert.alert('Share Error', 'Unable to share document. Please try again.');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
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
    { key: 'dental_vision', label: 'Dental, Vision, and Hearing Products' },
  ];
  const selectedProducts = products.filter(p => formFields[p.key]);

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

        {/* Quick Actions */}
        <View style={styles.actionsContainer}>
          <Text style={styles.actionsTitle}>Document Actions</Text>
          <View style={styles.actionsRow}>
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
              onPress={handleSave}
              disabled={actionLoading !== null}
            >
              {actionLoading === 'save' ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="download" size={24} color="#FFFFFF" />
              )}
              <Text style={styles.actionText}>Save</Text>
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
          <View style={styles.signatureIndicator}>
            <Ionicons name="create" size={16} color="#22C55E" />
            <Text style={styles.signedIndicatorText}>Signature on file</Text>
          </View>
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
          {scope.agent_signature && (
            <View style={styles.signatureIndicator}>
              <Ionicons name="create" size={16} color="#22C55E" />
              <Text style={styles.signedIndicatorText}>Signature on file</Text>
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
                <Text style={styles.leadLinkLabel}>Associated Lead</Text>
                <Text style={styles.leadLinkName}>{lead.name}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#64748B" />
          </TouchableOpacity>
        )}

        {/* Footer Compliance Note */}
        <View style={styles.complianceNote}>
          <Ionicons name="information-circle" size={18} color="#64748B" />
          <Text style={styles.complianceText}>
            This document complies with CMS requirements for Medicare sales appointments. 
            Retain for a minimum of 10 years.
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
    marginBottom: 16,
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
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  actionButton: {
    alignItems: 'center',
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 12,
    minWidth: 90,
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 6,
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
  signatureIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  signedIndicatorText: {
    color: '#22C55E',
    fontSize: 13,
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
    backgroundColor: '#334155',
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  complianceText: {
    flex: 1,
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 18,
  },
});
