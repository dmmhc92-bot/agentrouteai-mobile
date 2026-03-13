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
}

export default function ScopeDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [scope, setScope] = useState<Scope | null>(null);
  const [lead, setLead] = useState<Lead | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

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

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      const response = await api.getScopePdf(id!);
      const base64Data = response.pdf_base64;
      const filename = response.filename;

      if (Platform.OS === 'web') {
        // For web, create a download link
        const link = document.createElement('a');
        link.href = `data:application/pdf;base64,${base64Data}`;
        link.download = filename;
        link.click();
      } else {
        // For mobile, save to file and share
        const fileUri = `${FileSystem.documentDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(fileUri, base64Data, {
          encoding: FileSystem.EncodingType.Base64,
        });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri);
        } else {
          Alert.alert('Success', 'PDF saved to device');
        }
      }
    } catch (error) {
      console.log('Export error:', error);
      Alert.alert('Error', 'Failed to export PDF');
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

  if (!scope) {
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
        <TouchableOpacity
          style={styles.exportButton}
          onPress={handleExportPDF}
          disabled={isExporting}
        >
          {isExporting ? (
            <ActivityIndicator size="small" color="#3B82F6" />
          ) : (
            <Ionicons name="download-outline" size={24} color="#3B82F6" />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Document Header */}
        <View style={styles.documentHeader}>
          <Ionicons name="document-text" size={40} color="#8B5CF6" />
          <View style={styles.documentInfo}>
            <Text style={styles.documentTitle}>Scope of Appointment</Text>
            <Text style={styles.documentDate}>
              Created {format(new Date(scope.created_date), 'MMM d, yyyy h:mm a')}
            </Text>
          </View>
        </View>

        {/* Lead Info */}
        <TouchableOpacity
          style={styles.leadCard}
          onPress={() => router.push(`/lead/${scope.lead_id}`)}
        >
          <View style={styles.leadAvatar}>
            <Text style={styles.leadInitial}>{lead?.name?.charAt(0) || '?'}</Text>
          </View>
          <View style={styles.leadInfo}>
            <Text style={styles.leadLabel}>Associated Lead</Text>
            <Text style={styles.leadName}>{lead?.name || 'Unknown'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#64748B" />
        </TouchableOpacity>

        {/* Beneficiary Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Beneficiary Information</Text>
          <View style={styles.infoCard}>
            <InfoRow label="Name" value={fields.beneficiary_name || 'Not provided'} />
            <InfoRow label="Phone" value={fields.beneficiary_phone || 'Not provided'} />
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
            <ProductItem
              label="Medicare Advantage Plans (Part C)"
              selected={fields.medicare_advantage}
            />
            <ProductItem
              label="Medicare Supplement Insurance"
              selected={fields.medicare_supplement}
            />
            <ProductItem
              label="Prescription Drug Plans (Part D)"
              selected={fields.prescription_drug}
            />
            <ProductItem
              label="Dental/Vision/Hearing Products"
              selected={fields.dental_vision}
            />
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

        {/* Export Button */}
        <TouchableOpacity
          style={styles.exportPdfButton}
          onPress={handleExportPDF}
          disabled={isExporting}
        >
          {isExporting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="document-outline" size={24} color="#FFFFFF" />
              <Text style={styles.exportPdfText}>Export as PDF</Text>
            </>
          )}
        </TouchableOpacity>
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
  exportButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'flex-end',
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
  exportPdfButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8B5CF6',
    borderRadius: 12,
    paddingVertical: 16,
    gap: 8,
  },
  exportPdfText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
