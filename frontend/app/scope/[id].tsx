import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { api } from '../../src/services/api';
import { format } from 'date-fns';

interface Scope {
  id: string;
  lead_id: string;
  form_fields: Record<string, any>;
  typed_name: string;
  signature: string;
  created_date: string;
}

interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
}

export default function ScopeDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [scope, setScope] = useState<Scope | null>(null);
  const [lead, setLead] = useState<Lead | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      const scopeData = await api.getScope(id!);
      setScope(scopeData);
      const leadData = await api.getLead(scopeData.lead_id);
      setLead(leadData);
    } catch (error) {
      console.log('Error loading scope:', error);
      Alert.alert('Error', 'Failed to load scope document');
    } finally {
      setIsLoading(false);
    }
  };

  const generateHtmlContent = () => {
    if (!scope || !lead) return '';
    
    const fields = scope.form_fields;
    
    const productChecked = (key: string) => fields[key] ? '☑' : '☐';
    
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Scope of Appointment - ${lead.name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; color: #1a1a1a; }
    .header { text-align: center; border: 2px solid #1E40AF; padding: 20px; margin-bottom: 30px; }
    .header h1 { color: #1E40AF; font-size: 24px; margin-bottom: 5px; }
    .header p { color: #64748B; font-size: 12px; }
    .doc-info { display: flex; justify-content: space-between; font-size: 10px; color: #64748B; margin-top: 10px; }
    .section { margin-bottom: 25px; }
    .section-title { color: #1E40AF; font-size: 14px; font-weight: bold; border-bottom: 1px solid #1E40AF; padding-bottom: 5px; margin-bottom: 15px; }
    .field-row { display: flex; margin-bottom: 10px; }
    .field-label { font-weight: 500; width: 150px; color: #64748B; }
    .field-value { flex: 1; }
    .checkbox-item { display: flex; align-items: center; margin: 8px 0; }
    .checkbox { font-size: 16px; margin-right: 10px; }
    .consent-box { background: #f8fafc; padding: 15px; border-radius: 8px; font-size: 12px; line-height: 1.6; color: #475569; margin-bottom: 15px; }
    .signature-section { display: flex; justify-content: space-between; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; }
    .signature-block { text-align: center; }
    .signature-line { width: 200px; border-bottom: 1px solid #1a1a1a; margin-bottom: 5px; height: 40px; display: flex; align-items: flex-end; justify-content: center; }
    .signature-label { font-size: 10px; color: #64748B; }
    .signature-value { font-weight: bold; }
    .footer { margin-top: 40px; text-align: center; font-size: 10px; color: #94A3B8; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>SCOPE OF APPOINTMENT</h1>
    <p>Medicare Sales Appointment Confirmation Document</p>
    <div class="doc-info">
      <span>Document ID: ${scope.id.substring(0, 8).toUpperCase()}</span>
      <span>Date: ${format(new Date(scope.created_date), 'MMMM d, yyyy')}</span>
    </div>
  </div>

  <div class="section">
    <div class="section-title">SECTION 1: BENEFICIARY INFORMATION</div>
    <div class="field-row">
      <span class="field-label">Beneficiary Name:</span>
      <span class="field-value">${fields.beneficiary_name || lead.name}</span>
    </div>
    <div class="field-row">
      <span class="field-label">Phone:</span>
      <span class="field-value">${fields.beneficiary_phone || lead.phone || 'N/A'}</span>
    </div>
    <div class="field-row">
      <span class="field-label">Address:</span>
      <span class="field-value">${lead.address || 'N/A'}</span>
    </div>
  </div>

  <div class="section">
    <div class="section-title">SECTION 2: AGENT/BROKER INFORMATION</div>
    <div class="field-row">
      <span class="field-label">Agent/Broker Name:</span>
      <span class="field-value">${fields.agent_name || 'N/A'}</span>
    </div>
    <div class="field-row">
      <span class="field-label">License Number:</span>
      <span class="field-value">${fields.agent_license || 'N/A'}</span>
    </div>
  </div>

  <div class="section">
    <div class="section-title">SECTION 3: PRODUCTS TO BE DISCUSSED</div>
    <p style="font-size: 12px; color: #64748B; margin-bottom: 15px;">Please indicate the type(s) of product(s) you want the agent/broker to discuss:</p>
    
    <div class="checkbox-item">
      <span class="checkbox">${productChecked('medicare_advantage')}</span>
      <span>Medicare Advantage Plans (Part C) - HMO, PPO, PFFS, SNP</span>
    </div>
    <div class="checkbox-item">
      <span class="checkbox">${productChecked('medicare_supplement')}</span>
      <span>Medicare Supplement (Medigap) Insurance</span>
    </div>
    <div class="checkbox-item">
      <span class="checkbox">${productChecked('prescription_drug')}</span>
      <span>Medicare Prescription Drug Plans (Part D)</span>
    </div>
    <div class="checkbox-item">
      <span class="checkbox">${productChecked('dental_vision')}</span>
      <span>Dental, Vision, and/or Hearing Products</span>
    </div>
    ${fields.other_products ? `
    <div class="checkbox-item">
      <span class="checkbox">☑</span>
      <span>Other: ${fields.other_products}</span>
    </div>
    ` : ''}
  </div>

  <div class="section">
    <div class="section-title">SECTION 4: BENEFICIARY CONSENT AND ACKNOWLEDGMENT</div>
    <div class="consent-box">
      By signing this form, I agree to a meeting with a sales agent to discuss the types of products I have selected above. I understand that this is not an enrollment form and that I am under no obligation to enroll in any plan. The agent may only discuss the products I have indicated above.
      <br><br>
      I understand that the Centers for Medicare & Medicaid Services (CMS) requires agents to document the specific product types I want to discuss prior to any appointment for Medicare sales.
    </div>
  </div>

  <div class="section">
    <div class="section-title">SECTION 5: SIGNATURE</div>
    <div class="signature-section">
      <div class="signature-block">
        <div class="signature-line">
          ${scope.signature ? '<span style="font-style: italic;">Signed Electronically</span>' : ''}
        </div>
        <div class="signature-label">Beneficiary Signature</div>
      </div>
      <div class="signature-block">
        <div class="signature-line">
          <span class="signature-value">${format(new Date(scope.created_date), 'MM/dd/yyyy')}</span>
        </div>
        <div class="signature-label">Date</div>
      </div>
      <div class="signature-block">
        <div class="signature-line">
          <span class="signature-value">${scope.typed_name}</span>
        </div>
        <div class="signature-label">Printed Name</div>
      </div>
    </div>
  </div>

  <div class="footer">
    <p>This document is valid for the appointment date listed above.</p>
    <p>Generated by AgentRoute AI - Document ID: ${scope.id}</p>
  </div>
</body>
</html>
    `;
  };

  const handlePrint = async () => {
    setIsPrinting(true);
    try {
      const html = generateHtmlContent();
      await Print.printAsync({ html });
    } catch (error) {
      console.log('Print error:', error);
      Alert.alert('Error', 'Failed to print document');
    } finally {
      setIsPrinting(false);
    }
  };

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      const response = await api.getScopePdf(id!);
      const base64Data = response.pdf_base64;
      const filename = response.filename;

      if (Platform.OS === 'web') {
        // For web, create download link
        const link = document.createElement('a');
        link.href = `data:application/pdf;base64,${base64Data}`;
        link.download = filename;
        link.click();
        Alert.alert('Success', 'PDF downloaded');
      } else {
        // For mobile, save to file system
        const fileUri = `${FileSystem.documentDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(fileUri, base64Data, {
          encoding: FileSystem.EncodingType.Base64,
        });
        Alert.alert('Success', `PDF saved to Files`, [
          { text: 'OK' },
          { text: 'Share', onPress: () => shareFile(fileUri) },
        ]);
      }
    } catch (error) {
      console.log('Export error:', error);
      Alert.alert('Error', 'Failed to export PDF');
    } finally {
      setIsExporting(false);
    }
  };

  const shareFile = async (fileUri: string) => {
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Share Scope of Appointment',
        });
      }
    } catch (error) {
      console.log('Share error:', error);
    }
  };

  const handleShare = async () => {
    setIsExporting(true);
    try {
      const response = await api.getScopePdf(id!);
      const base64Data = response.pdf_base64;
      const filename = response.filename;

      if (Platform.OS === 'web') {
        // For web, trigger download
        handleExportPDF();
        return;
      }

      // Save temporarily and share
      const fileUri = `${FileSystem.cacheDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Share Scope of Appointment',
        });
      } else {
        Alert.alert('Error', 'Sharing not available on this device');
      }
    } catch (error) {
      console.log('Share error:', error);
      Alert.alert('Error', 'Failed to share document');
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  if (!scope || !lead) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
        <View style={styles.errorState}>
          <Text style={styles.errorText}>Scope document not found</Text>
        </View>
      </View>
    );
  }

  const fields = scope.form_fields;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scope Document</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Document Header */}
        <View style={styles.documentHeader}>
          <Ionicons name="document-text" size={40} color="#8B5CF6" />
          <View style={styles.documentInfo}>
            <Text style={styles.documentTitle}>Scope of Appointment</Text>
            <Text style={styles.documentDate}>
              {format(new Date(scope.created_date), 'MMMM d, yyyy h:mm a')}
            </Text>
          </View>
        </View>

        {/* Lead Info */}
        <TouchableOpacity
          style={styles.leadCard}
          onPress={() => router.push(`/lead/${scope.lead_id}`)}
        >
          <View style={styles.leadAvatar}>
            <Text style={styles.leadInitial}>{lead.name.charAt(0)}</Text>
          </View>
          <View style={styles.leadInfo}>
            <Text style={styles.leadLabel}>Associated Lead</Text>
            <Text style={styles.leadName}>{lead.name}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#64748B" />
        </TouchableOpacity>

        {/* Beneficiary Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Beneficiary Information</Text>
          <View style={styles.infoCard}>
            <InfoRow label="Name" value={fields.beneficiary_name || lead.name} />
            <InfoRow label="Phone" value={fields.beneficiary_phone || lead.phone || 'Not provided'} />
            <InfoRow label="Address" value={lead.address || 'Not provided'} />
          </View>
        </View>

        {/* Agent Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Agent Information</Text>
          <View style={styles.infoCard}>
            <InfoRow label="Agent Name" value={fields.agent_name || 'Not provided'} />
            <InfoRow label="License" value={fields.agent_license || 'Not provided'} />
          </View>
        </View>

        {/* Products Discussed */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Products to be Discussed</Text>
          <View style={styles.productsCard}>
            <ProductItem label="Medicare Advantage Plans (Part C)" selected={fields.medicare_advantage} />
            <ProductItem label="Medicare Supplement Insurance" selected={fields.medicare_supplement} />
            <ProductItem label="Prescription Drug Plans (Part D)" selected={fields.prescription_drug} />
            <ProductItem label="Dental/Vision/Hearing Products" selected={fields.dental_vision} />
            {fields.other_products && (
              <View style={styles.otherProducts}>
                <Text style={styles.otherLabel}>Other:</Text>
                <Text style={styles.otherValue}>{fields.other_products}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Signature */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Signature</Text>
          <View style={styles.signatureCard}>
            <View style={styles.signatureRow}>
              <Text style={styles.signatureLabel}>Signed by:</Text>
              <Text style={styles.signatureName}>{scope.typed_name}</Text>
            </View>
            <View style={styles.signatureRow}>
              <Text style={styles.signatureLabel}>Date:</Text>
              <Text style={styles.signatureDate}>
                {format(new Date(scope.created_date), 'MMMM d, yyyy')}
              </Text>
            </View>
            {scope.signature && (
              <View style={styles.signatureStatus}>
                <Ionicons name="checkmark-circle" size={20} color="#22C55E" />
                <Text style={styles.signatureStatusText}>Digital signature captured</Text>
              </View>
            )}
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handlePrint}
            disabled={isPrinting}
          >
            {isPrinting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="print" size={20} color="#FFFFFF" />
                <Text style={styles.actionButtonText}>Print</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonSecondary]}
            onPress={handleExportPDF}
            disabled={isExporting}
          >
            {isExporting ? (
              <ActivityIndicator color="#8B5CF6" />
            ) : (
              <>
                <Ionicons name="download" size={20} color="#8B5CF6" />
                <Text style={[styles.actionButtonText, styles.actionButtonTextSecondary]}>
                  Save PDF
                </Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonSecondary]}
            onPress={handleShare}
            disabled={isExporting}
          >
            <Ionicons name="share" size={20} color="#8B5CF6" />
            <Text style={[styles.actionButtonText, styles.actionButtonTextSecondary]}>Share</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function ProductItem({ label, selected }: { label: string; selected: boolean }) {
  return (
    <View style={styles.productItem}>
      <View style={[styles.productCheckbox, selected && styles.productCheckboxSelected]}>
        {selected && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
      </View>
      <Text style={[styles.productLabel, selected && styles.productLabelSelected]}>{label}</Text>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  errorState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 16,
  },
  documentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  documentInfo: {
    marginLeft: 16,
    flex: 1,
  },
  documentTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 4,
  },
  documentDate: {
    color: '#94A3B8',
    fontSize: 14,
  },
  leadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  leadAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  leadInitial: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  leadInfo: {
    flex: 1,
  },
  leadLabel: {
    color: '#94A3B8',
    fontSize: 12,
  },
  leadName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  infoCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
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
    flex: 1,
    textAlign: 'right',
  },
  productsCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
  },
  productItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  productCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#475569',
    justifyContent: 'center',
    alignItems: 'center',
  },
  productCheckboxSelected: {
    backgroundColor: '#22C55E',
    borderColor: '#22C55E',
  },
  productLabel: {
    color: '#64748B',
    fontSize: 14,
    flex: 1,
  },
  productLabelSelected: {
    color: '#FFFFFF',
  },
  otherProducts: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  otherLabel: {
    color: '#94A3B8',
    fontSize: 12,
    marginBottom: 4,
  },
  otherValue: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  signatureCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
  },
  signatureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  signatureLabel: {
    color: '#94A3B8',
    fontSize: 14,
  },
  signatureName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  signatureDate: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  signatureStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  signatureStatusText: {
    color: '#22C55E',
    fontSize: 14,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8B5CF6',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  actionButtonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#8B5CF6',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  actionButtonTextSecondary: {
    color: '#8B5CF6',
  },
});
