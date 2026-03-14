/**
 * SOA PDF Generator Service
 * 
 * Uses pdf-lib to generate the final Scope of Appointment PDF with all
 * typed fields and signatures permanently embedded into the document.
 * 
 * The PDF itself becomes the source of truth - not a preview or overlay.
 * Uses the exact user-uploaded form as the template.
 */

import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import Constants from 'expo-constants';

// Lazy-loaded pdf-lib to avoid bundling issues
let PDFLib = null;

async function getPdfLib() {
  if (!PDFLib) {
    PDFLib = await import('pdf-lib');
  }
  return PDFLib;
}

// SOA Template PDF as base64 (cached for offline use)
let SOA_TEMPLATE_BASE64: string | null = null;

// Get the backend URL
const getBackendUrl = () => {
  const backendUrl = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL 
    || process.env.EXPO_PUBLIC_BACKEND_URL 
    || '';
  return backendUrl;
};

interface SOAFormData {
  // Beneficiary Info
  beneficiary_name: string;
  beneficiary_phone: string;
  beneficiary_address: string;
  
  // Agent Info
  agent_name: string;
  agent_phone: string;
  agent_id_number: string;
  agent_license: string;
  
  // Appointment Info
  appointment_date: string;
  signature_date: string;
  initial_contact_method: string;
  plans_to_represent: string;
  
  // Products to discuss (checkboxes)
  medicare_advantage: boolean;
  medicare_supplement: boolean;
  prescription_drug: boolean;
  dental_vision_hearing: boolean;
  hospital_indemnity: boolean;
  other_products: string;
  
  // Authorized Representative (optional)
  auth_rep_name?: string;
  auth_rep_relationship?: string;
}

interface SignatureData {
  beneficiarySignature: string | null;  // base64 PNG
  agentSignature: string | null;         // base64 PNG
  beneficiaryTypedName: string;
  agentTypedName: string;
}

/**
 * PDF Coordinate System:
 * - PDF is 612 x 792 points (Letter size)
 * - Origin (0,0) is at BOTTOM-LEFT
 * - Y increases upward
 * 
 * Form analysis coordinates were percentages from TOP-LEFT.
 * Conversion: pdf_y = 792 - (percentage * 792)
 * 
 * Field positions are calibrated to the user's exact uploaded form (IMG_3751.jpeg)
 */

// PDF dimensions (Letter size)
const PDF_WIDTH = 612;
const PDF_HEIGHT = 792;

// Convert percentage from top to PDF Y coordinate (from bottom)
const percentToY = (topPercent: number) => PDF_HEIGHT - (topPercent / 100 * PDF_HEIGHT);
const percentToX = (leftPercent: number) => leftPercent / 100 * PDF_WIDTH;

// Field coordinates calibrated to the exact form layout
// Based on analysis of IMG_3751.jpeg - "Scope of Sales Appointment Confirmation Form"
const FIELD_COORDINATES = {
  // === PRODUCT CHECKBOXES (checkmark positions) ===
  // Left column checkboxes
  checkbox_prescription_drug: { x: percentToX(19.5), y: percentToY(23.5) },      // Part D
  checkbox_medicare_advantage: { x: percentToX(19.5), y: percentToY(26.0) },     // Part C
  checkbox_dental_vision: { x: percentToX(19.5), y: percentToY(28.5) },          // Dental/Vision/Hearing
  
  // Right column checkboxes
  checkbox_hospital_indemnity: { x: percentToX(62.0), y: percentToY(23.5) },     // Hospital Indemnity
  checkbox_medicare_supplement: { x: percentToX(62.0), y: percentToY(26.0) },    // Medigap
  
  // === BENEFICIARY SIGNATURE SECTION ===
  // Beneficiary/Authorized Rep Signature box (main signature line)
  beneficiary_signature: { 
    x: percentToX(12), 
    y: percentToY(44),  // Positioned on signature line
    width: 200, 
    height: 35 
  },
  
  // Signature Date (next to beneficiary signature)
  signature_date: { 
    x: percentToX(70), 
    y: percentToY(43), 
    fontSize: 11 
  },
  
  // === AUTHORIZED REP NAME FIELDS (below signature) ===
  // Name (First_Last) - left side
  auth_rep_name: { 
    x: percentToX(12), 
    y: percentToY(49), 
    fontSize: 10 
  },
  
  // Relationship to Beneficiary - right side
  auth_rep_relationship: { 
    x: percentToX(57), 
    y: percentToY(49), 
    fontSize: 10 
  },
  
  // === LICENSED SALES REPRESENTATIVE SECTION ===
  // Row 1: Agent Name, Phone, ID
  agent_name: { 
    x: percentToX(8), 
    y: percentToY(57), 
    fontSize: 10 
  },
  agent_phone: { 
    x: percentToX(37), 
    y: percentToY(57), 
    fontSize: 10 
  },
  agent_id: { 
    x: percentToX(64), 
    y: percentToY(57), 
    fontSize: 10 
  },
  
  // Row 2: Beneficiary Name, Phone, Appointment Date
  beneficiary_name: { 
    x: percentToX(8), 
    y: percentToY(63), 
    fontSize: 10 
  },
  beneficiary_phone: { 
    x: percentToX(37), 
    y: percentToY(63), 
    fontSize: 10 
  },
  appointment_date: { 
    x: percentToX(64), 
    y: percentToY(63), 
    fontSize: 10 
  },
  
  // Row 3: Beneficiary Address (full width)
  beneficiary_address: { 
    x: percentToX(8), 
    y: percentToY(68), 
    fontSize: 9 
  },
  
  // Row 4: Initial Contact Method and Plans
  contact_method: { 
    x: percentToX(8), 
    y: percentToY(73), 
    fontSize: 10 
  },
  plans_to_represent: { 
    x: percentToX(48), 
    y: percentToY(73), 
    fontSize: 9 
  },
  
  // === AGENT SIGNATURE (below contact method row) ===
  agent_signature: { 
    x: percentToX(12), 
    y: percentToY(78), 
    width: 220, 
    height: 30 
  },
  
  // === BOTTOM CHECKBOXES (reasons SOA not obtained prior) ===
  checkbox_unplanned_attendee: { x: percentToX(9), y: percentToY(87) },
  checkbox_new_soa_required: { x: percentToX(28), y: percentToY(87) },
  checkbox_walkin: { x: percentToX(9), y: percentToY(89.5) },
  checkbox_other: { x: percentToX(28), y: percentToY(89.5) },
};

/**
 * Load the SOA template PDF from the backend
 */
async function loadTemplate(): Promise<Uint8Array> {
  console.log('[PDFGenerator] Loading SOA template...');
  
  // Try to load from cache first
  if (SOA_TEMPLATE_BASE64) {
    console.log('[PDFGenerator] Using cached template');
    return base64ToUint8Array(SOA_TEMPLATE_BASE64);
  }
  
  // Load from backend
  try {
    const backendUrl = getBackendUrl();
    // Use relative URL on web, full URL on native
    const url = backendUrl ? `${backendUrl}/api/soa-template` : '/api/soa-template';
    console.log('[PDFGenerator] Fetching template from:', url);
    
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      SOA_TEMPLATE_BASE64 = data.template_base64;
      console.log('[PDFGenerator] Template loaded from backend, length:', SOA_TEMPLATE_BASE64?.length);
      return base64ToUint8Array(SOA_TEMPLATE_BASE64!);
    } else {
      console.error('[PDFGenerator] Backend returned:', response.status);
    }
  } catch (e: any) {
    console.error('[PDFGenerator] Failed to load from backend:', e.message);
  }
  
  // Fallback: Create a blank letter-size PDF
  console.log('[PDFGenerator] Creating blank template fallback');
  const pdfDoc = await PDFDocument.create();
  pdfDoc.addPage([PDF_WIDTH, PDF_HEIGHT]);
  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}

/**
 * Convert base64 string to Uint8Array
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Convert Uint8Array to base64 string
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binaryString = '';
  for (let i = 0; i < bytes.length; i++) {
    binaryString += String.fromCharCode(bytes[i]);
  }
  return btoa(binaryString);
}

/**
 * Extract base64 data from a data URI
 */
function extractBase64(dataUri: string): string {
  if (dataUri.includes(',')) {
    return dataUri.split(',')[1];
  }
  return dataUri;
}

/**
 * Format a date string for display on the form
 */
function formatDateForForm(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  } catch (e) {
    return dateStr;
  }
}

/**
 * Get human-readable label for contact method
 */
function getContactMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    'phone': 'Phone',
    'in_person': 'In Person',
    'email': 'Email',
    'mail': 'Direct Mail',
    'referral': 'Referral',
    'other': 'Other',
  };
  return labels[method] || method;
}

/**
 * Generate the final SOA PDF with all data and signatures embedded
 */
export async function generateSOAPdf(
  formData: SOAFormData,
  signatures: SignatureData
): Promise<string> {
  console.log('[PDFGenerator] ========== STARTING PDF GENERATION ==========');
  console.log('[PDFGenerator] Form data:', JSON.stringify(formData, null, 2));
  console.log('[PDFGenerator] Beneficiary signature present:', !!signatures.beneficiarySignature);
  console.log('[PDFGenerator] Agent signature present:', !!signatures.agentSignature);
  
  try {
    // Load pdf-lib dynamically
    const { PDFDocument, rgb, StandardFonts } = await getPdfLib();
    
    // Step 1: Load the template
    const templateBytes = await loadTemplate();
    console.log('[PDFGenerator] Template loaded, size:', templateBytes.length, 'bytes');
    
    // Step 2: Load the PDF document
    const pdfDoc = await PDFDocument.load(templateBytes);
    console.log('[PDFGenerator] PDF document loaded');
    
    // Step 3: Get the first page
    const pages = pdfDoc.getPages();
    const page = pages[0];
    const { width, height } = page.getSize();
    console.log('[PDFGenerator] Page size:', width, 'x', height);
    
    // Step 4: Embed fonts
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    console.log('[PDFGenerator] Fonts embedded');
    
    // Text color (dark blue/black for professional look)
    const textColor = rgb(0.1, 0.1, 0.2);
    const checkColor = rgb(0, 0, 0);
    
    // Step 5: Draw checkmarks for selected products
    console.log('[PDFGenerator] Drawing product checkmarks...');
    const checkmark = '✓';
    const checkSize = 14;
    
    if (formData.prescription_drug) {
      page.drawText(checkmark, {
        x: FIELD_COORDINATES.checkbox_prescription_drug.x,
        y: FIELD_COORDINATES.checkbox_prescription_drug.y,
        size: checkSize,
        font: boldFont,
        color: checkColor,
      });
      console.log('[PDFGenerator] ✓ Prescription Drug (Part D)');
    }
    
    if (formData.medicare_advantage) {
      page.drawText(checkmark, {
        x: FIELD_COORDINATES.checkbox_medicare_advantage.x,
        y: FIELD_COORDINATES.checkbox_medicare_advantage.y,
        size: checkSize,
        font: boldFont,
        color: checkColor,
      });
      console.log('[PDFGenerator] ✓ Medicare Advantage (Part C)');
    }
    
    if (formData.dental_vision_hearing) {
      page.drawText(checkmark, {
        x: FIELD_COORDINATES.checkbox_dental_vision.x,
        y: FIELD_COORDINATES.checkbox_dental_vision.y,
        size: checkSize,
        font: boldFont,
        color: checkColor,
      });
      console.log('[PDFGenerator] ✓ Dental/Vision/Hearing');
    }
    
    if (formData.hospital_indemnity) {
      page.drawText(checkmark, {
        x: FIELD_COORDINATES.checkbox_hospital_indemnity.x,
        y: FIELD_COORDINATES.checkbox_hospital_indemnity.y,
        size: checkSize,
        font: boldFont,
        color: checkColor,
      });
      console.log('[PDFGenerator] ✓ Hospital Indemnity');
    }
    
    if (formData.medicare_supplement) {
      page.drawText(checkmark, {
        x: FIELD_COORDINATES.checkbox_medicare_supplement.x,
        y: FIELD_COORDINATES.checkbox_medicare_supplement.y,
        size: checkSize,
        font: boldFont,
        color: checkColor,
      });
      console.log('[PDFGenerator] ✓ Medicare Supplement (Medigap)');
    }
    
    // Step 6: Draw signature date
    console.log('[PDFGenerator] Drawing text fields...');
    
    if (formData.signature_date) {
      const dateStr = formatDateForForm(formData.signature_date);
      page.drawText(dateStr, {
        x: FIELD_COORDINATES.signature_date.x,
        y: FIELD_COORDINATES.signature_date.y,
        size: FIELD_COORDINATES.signature_date.fontSize,
        font: font,
        color: textColor,
      });
      console.log('[PDFGenerator] Drew signature date:', dateStr);
    }
    
    // Step 7: Draw Authorized Rep fields (if applicable)
    if (formData.auth_rep_name) {
      page.drawText(formData.auth_rep_name, {
        x: FIELD_COORDINATES.auth_rep_name.x,
        y: FIELD_COORDINATES.auth_rep_name.y,
        size: FIELD_COORDINATES.auth_rep_name.fontSize,
        font: font,
        color: textColor,
      });
      console.log('[PDFGenerator] Drew auth rep name');
    }
    
    if (formData.auth_rep_relationship) {
      page.drawText(formData.auth_rep_relationship, {
        x: FIELD_COORDINATES.auth_rep_relationship.x,
        y: FIELD_COORDINATES.auth_rep_relationship.y,
        size: FIELD_COORDINATES.auth_rep_relationship.fontSize,
        font: font,
        color: textColor,
      });
      console.log('[PDFGenerator] Drew auth rep relationship');
    }
    
    // Step 8: Draw LSR Section fields
    
    // Agent Name
    if (formData.agent_name) {
      page.drawText(formData.agent_name, {
        x: FIELD_COORDINATES.agent_name.x,
        y: FIELD_COORDINATES.agent_name.y,
        size: FIELD_COORDINATES.agent_name.fontSize,
        font: font,
        color: textColor,
      });
      console.log('[PDFGenerator] Drew agent name');
    }
    
    // Agent Phone
    if (formData.agent_phone) {
      page.drawText(formData.agent_phone, {
        x: FIELD_COORDINATES.agent_phone.x,
        y: FIELD_COORDINATES.agent_phone.y,
        size: FIELD_COORDINATES.agent_phone.fontSize,
        font: font,
        color: textColor,
      });
    }
    
    // Agent ID
    if (formData.agent_id_number) {
      page.drawText(formData.agent_id_number, {
        x: FIELD_COORDINATES.agent_id.x,
        y: FIELD_COORDINATES.agent_id.y,
        size: FIELD_COORDINATES.agent_id.fontSize,
        font: font,
        color: textColor,
      });
    }
    
    // Beneficiary Name (in LSR section)
    if (formData.beneficiary_name) {
      page.drawText(formData.beneficiary_name, {
        x: FIELD_COORDINATES.beneficiary_name.x,
        y: FIELD_COORDINATES.beneficiary_name.y,
        size: FIELD_COORDINATES.beneficiary_name.fontSize,
        font: font,
        color: textColor,
      });
      console.log('[PDFGenerator] Drew beneficiary name');
    }
    
    // Beneficiary Phone
    if (formData.beneficiary_phone) {
      page.drawText(formData.beneficiary_phone, {
        x: FIELD_COORDINATES.beneficiary_phone.x,
        y: FIELD_COORDINATES.beneficiary_phone.y,
        size: FIELD_COORDINATES.beneficiary_phone.fontSize,
        font: font,
        color: textColor,
      });
    }
    
    // Appointment Date
    if (formData.appointment_date) {
      const dateStr = formatDateForForm(formData.appointment_date);
      page.drawText(dateStr, {
        x: FIELD_COORDINATES.appointment_date.x,
        y: FIELD_COORDINATES.appointment_date.y,
        size: FIELD_COORDINATES.appointment_date.fontSize,
        font: font,
        color: textColor,
      });
    }
    
    // Beneficiary Address
    if (formData.beneficiary_address) {
      // Truncate if too long
      const maxLen = 65;
      const addr = formData.beneficiary_address.length > maxLen 
        ? formData.beneficiary_address.substring(0, maxLen) + '...'
        : formData.beneficiary_address;
      page.drawText(addr, {
        x: FIELD_COORDINATES.beneficiary_address.x,
        y: FIELD_COORDINATES.beneficiary_address.y,
        size: FIELD_COORDINATES.beneficiary_address.fontSize,
        font: font,
        color: textColor,
      });
    }
    
    // Initial Contact Method
    if (formData.initial_contact_method) {
      const label = getContactMethodLabel(formData.initial_contact_method);
      page.drawText(label, {
        x: FIELD_COORDINATES.contact_method.x,
        y: FIELD_COORDINATES.contact_method.y,
        size: FIELD_COORDINATES.contact_method.fontSize,
        font: font,
        color: textColor,
      });
    }
    
    // Plans to Represent
    if (formData.plans_to_represent) {
      const maxLen = 45;
      const plans = formData.plans_to_represent.length > maxLen
        ? formData.plans_to_represent.substring(0, maxLen) + '...'
        : formData.plans_to_represent;
      page.drawText(plans, {
        x: FIELD_COORDINATES.plans_to_represent.x,
        y: FIELD_COORDINATES.plans_to_represent.y,
        size: FIELD_COORDINATES.plans_to_represent.fontSize,
        font: font,
        color: textColor,
      });
    }
    
    // Step 9: Embed and draw signatures
    console.log('[PDFGenerator] Embedding signatures...');
    
    // Beneficiary Signature
    if (signatures.beneficiarySignature && signatures.beneficiarySignature.length > 100) {
      try {
        console.log('[PDFGenerator] Processing beneficiary signature...');
        const sigBase64 = extractBase64(signatures.beneficiarySignature);
        const sigBytes = base64ToUint8Array(sigBase64);
        
        // Embed the PNG image
        const sigImage = await pdfDoc.embedPng(sigBytes);
        console.log('[PDFGenerator] Beneficiary signature embedded, dimensions:', sigImage.width, 'x', sigImage.height);
        
        // Draw onto the page at the signature coordinates
        const coords = FIELD_COORDINATES.beneficiary_signature;
        const scaledDims = sigImage.scaleToFit(coords.width, coords.height);
        
        page.drawImage(sigImage, {
          x: coords.x,
          y: coords.y,
          width: scaledDims.width,
          height: scaledDims.height,
        });
        console.log('[PDFGenerator] Beneficiary signature drawn at', coords.x, coords.y);
      } catch (e: any) {
        console.error('[PDFGenerator] Error embedding beneficiary signature:', e.message);
        // Try as JPEG if PNG fails
        try {
          const sigBase64 = extractBase64(signatures.beneficiarySignature);
          const sigBytes = base64ToUint8Array(sigBase64);
          const sigImage = await pdfDoc.embedJpg(sigBytes);
          const coords = FIELD_COORDINATES.beneficiary_signature;
          const scaledDims = sigImage.scaleToFit(coords.width, coords.height);
          page.drawImage(sigImage, {
            x: coords.x,
            y: coords.y,
            width: scaledDims.width,
            height: scaledDims.height,
          });
          console.log('[PDFGenerator] Beneficiary signature drawn as JPEG fallback');
        } catch (e2: any) {
          console.error('[PDFGenerator] JPEG fallback also failed:', e2.message);
        }
      }
    } else {
      console.log('[PDFGenerator] No beneficiary signature to embed');
    }
    
    // Agent Signature
    if (signatures.agentSignature && signatures.agentSignature.length > 100) {
      try {
        console.log('[PDFGenerator] Processing agent signature...');
        const sigBase64 = extractBase64(signatures.agentSignature);
        const sigBytes = base64ToUint8Array(sigBase64);
        
        const sigImage = await pdfDoc.embedPng(sigBytes);
        console.log('[PDFGenerator] Agent signature embedded, dimensions:', sigImage.width, 'x', sigImage.height);
        
        const coords = FIELD_COORDINATES.agent_signature;
        const scaledDims = sigImage.scaleToFit(coords.width, coords.height);
        
        page.drawImage(sigImage, {
          x: coords.x,
          y: coords.y,
          width: scaledDims.width,
          height: scaledDims.height,
        });
        console.log('[PDFGenerator] Agent signature drawn at', coords.x, coords.y);
      } catch (e: any) {
        console.error('[PDFGenerator] Error embedding agent signature:', e.message);
        // Try as JPEG if PNG fails
        try {
          const sigBase64 = extractBase64(signatures.agentSignature);
          const sigBytes = base64ToUint8Array(sigBase64);
          const sigImage = await pdfDoc.embedJpg(sigBytes);
          const coords = FIELD_COORDINATES.agent_signature;
          const scaledDims = sigImage.scaleToFit(coords.width, coords.height);
          page.drawImage(sigImage, {
            x: coords.x,
            y: coords.y,
            width: scaledDims.width,
            height: scaledDims.height,
          });
          console.log('[PDFGenerator] Agent signature drawn as JPEG fallback');
        } catch (e2: any) {
          console.error('[PDFGenerator] JPEG fallback also failed:', e2.message);
        }
      }
    } else {
      console.log('[PDFGenerator] No agent signature to embed');
    }
    
    // Step 10: Save the completed PDF
    console.log('[PDFGenerator] Saving final PDF...');
    const pdfBytes = await pdfDoc.save();
    console.log('[PDFGenerator] PDF generated, size:', pdfBytes.length, 'bytes');
    
    // Convert to base64
    const pdfBase64 = uint8ArrayToBase64(new Uint8Array(pdfBytes));
    
    console.log('[PDFGenerator] ========== PDF GENERATION COMPLETE ==========');
    console.log('[PDFGenerator] Final PDF base64 length:', pdfBase64.length);
    
    return pdfBase64;
    
  } catch (error: any) {
    console.error('[PDFGenerator] ========== PDF GENERATION FAILED ==========');
    console.error('[PDFGenerator] Error:', error.message);
    throw error;
  }
}

/**
 * Save the PDF to the device's file system
 */
export async function savePdfToDevice(pdfBase64: string, filename: string): Promise<string> {
  console.log('[PDFGenerator] Saving PDF to device...');
  
  const fileUri = `${FileSystem.documentDirectory}${filename}`;
  
  await FileSystem.writeAsStringAsync(fileUri, pdfBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  
  console.log('[PDFGenerator] PDF saved to:', fileUri);
  return fileUri;
}

/**
 * Share the PDF using the native share dialog
 */
export async function sharePdf(pdfBase64: string, filename: string): Promise<void> {
  console.log('[PDFGenerator] Sharing PDF...');
  
  // First save to a temp file
  const fileUri = await savePdfToDevice(pdfBase64, filename);
  
  // Check if sharing is available
  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('Sharing is not available on this device');
  }
  
  // Share the file
  await Sharing.shareAsync(fileUri, {
    mimeType: 'application/pdf',
    dialogTitle: 'Share Scope of Appointment',
    UTI: 'com.adobe.pdf',
  });
  
  console.log('[PDFGenerator] PDF shared successfully');
}

/**
 * Print the PDF
 */
export async function printPdf(pdfBase64: string): Promise<void> {
  console.log('[PDFGenerator] Printing PDF...');
  
  // Save to a temp file first
  const filename = `SOA_Print_${Date.now()}.pdf`;
  const fileUri = `${FileSystem.cacheDirectory}${filename}`;
  
  await FileSystem.writeAsStringAsync(fileUri, pdfBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  
  // Use the file URI for printing
  await Print.printAsync({ uri: fileUri });
  
  console.log('[PDFGenerator] Print dialog opened');
}

/**
 * Get a data URI for the PDF (for preview)
 */
export function getPdfDataUri(pdfBase64: string): string {
  return `data:application/pdf;base64,${pdfBase64}`;
}
