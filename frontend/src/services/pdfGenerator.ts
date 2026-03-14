/**
 * SOA PDF Generator Service
 * 
 * Uses pdf-lib to generate the final Scope of Appointment PDF with all
 * typed fields and signatures permanently embedded into the document.
 * 
 * The PDF itself becomes the source of truth - not a preview or overlay.
 */

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';

// SOA Template PDF as base64 (embedded for offline use)
// This is loaded from the backend on first use and cached
let SOA_TEMPLATE_BASE64: string | null = null;

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
  
  // Products to discuss
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

// Field coordinates on the PDF template (x, y from bottom-left)
// These are calibrated for the official SOA form layout
const FIELD_COORDINATES = {
  // Beneficiary section (in the LSR grid)
  beneficiary_name: { x: 45, y: 285, fontSize: 10 },
  beneficiary_phone: { x: 225, y: 285, fontSize: 10 },
  beneficiary_address: { x: 45, y: 259, fontSize: 9 },
  
  // Agent section (in the LSR grid)
  agent_name: { x: 45, y: 311, fontSize: 10 },
  agent_phone: { x: 225, y: 311, fontSize: 10 },
  agent_id: { x: 385, y: 311, fontSize: 10 },
  
  // Appointment date
  appointment_date: { x: 385, y: 285, fontSize: 10 },
  
  // Contact method
  contact_method: { x: 45, y: 233, fontSize: 10 },
  
  // Plans to represent
  plans_to_represent: { x: 285, y: 233, fontSize: 9 },
  
  // Signature date (in beneficiary signature section)
  signature_date: { x: 320, y: 370, fontSize: 11 },
  
  // Authorized rep fields
  auth_rep_name: { x: 45, y: 400, fontSize: 10 },
  auth_rep_relationship: { x: 285, y: 400, fontSize: 10 },
  
  // Beneficiary signature box coordinates
  beneficiary_signature: { x: 40, y: 355, width: 170, height: 38 },
  
  // Agent signature box coordinates
  agent_signature: { x: 40, y: 145, width: 500, height: 25 },
  
  // Product checkboxes (checkmark positions)
  checkbox_prescription_drug: { x: 58, y: 534 },
  checkbox_medicare_advantage: { x: 58, y: 518 },
  checkbox_dental_vision: { x: 58, y: 502 },
  checkbox_hospital_indemnity: { x: 308, y: 534 },
  checkbox_medicare_supplement: { x: 308, y: 518 },
};

/**
 * Load the SOA template PDF
 */
async function loadTemplate(): Promise<Uint8Array> {
  console.log('[PDFGenerator] Loading SOA template...');
  
  // Try to load from cache first
  if (SOA_TEMPLATE_BASE64) {
    console.log('[PDFGenerator] Using cached template');
    const binaryString = atob(SOA_TEMPLATE_BASE64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }
  
  // Load from backend
  try {
    const response = await fetch('/api/soa-template');
    if (response.ok) {
      const data = await response.json();
      SOA_TEMPLATE_BASE64 = data.template_base64;
      console.log('[PDFGenerator] Template loaded from backend');
      return loadTemplate(); // Recurse to use the cached version
    }
  } catch (e) {
    console.log('[PDFGenerator] Could not load from backend, using embedded');
  }
  
  // Fallback: Create a blank letter-size PDF
  console.log('[PDFGenerator] Creating blank template');
  const pdfDoc = await PDFDocument.create();
  pdfDoc.addPage([612, 792]); // Letter size
  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
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
 * Generate the final SOA PDF with all data and signatures embedded
 */
export async function generateSOAPdf(
  formData: SOAFormData,
  signatures: SignatureData
): Promise<string> {
  console.log('[PDFGenerator] ========== STARTING PDF GENERATION ==========');
  console.log('[PDFGenerator] Form data received:', JSON.stringify(formData, null, 2));
  console.log('[PDFGenerator] Beneficiary signature present:', !!signatures.beneficiarySignature);
  console.log('[PDFGenerator] Agent signature present:', !!signatures.agentSignature);
  
  try {
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
    
    // Step 4: Embed font for text
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    console.log('[PDFGenerator] Fonts embedded');
    
    // Step 5: Draw all text fields onto the PDF
    console.log('[PDFGenerator] Drawing text fields...');
    
    // Beneficiary info
    if (formData.beneficiary_name) {
      page.drawText(formData.beneficiary_name, {
        x: FIELD_COORDINATES.beneficiary_name.x,
        y: FIELD_COORDINATES.beneficiary_name.y,
        size: FIELD_COORDINATES.beneficiary_name.fontSize,
        font: font,
        color: rgb(0, 0, 0),
      });
      console.log('[PDFGenerator] Drew beneficiary name');
    }
    
    if (formData.beneficiary_phone) {
      page.drawText(formData.beneficiary_phone, {
        x: FIELD_COORDINATES.beneficiary_phone.x,
        y: FIELD_COORDINATES.beneficiary_phone.y,
        size: FIELD_COORDINATES.beneficiary_phone.fontSize,
        font: font,
        color: rgb(0, 0, 0),
      });
    }
    
    if (formData.beneficiary_address) {
      page.drawText(formData.beneficiary_address.substring(0, 60), {
        x: FIELD_COORDINATES.beneficiary_address.x,
        y: FIELD_COORDINATES.beneficiary_address.y,
        size: FIELD_COORDINATES.beneficiary_address.fontSize,
        font: font,
        color: rgb(0, 0, 0),
      });
    }
    
    // Agent info
    if (formData.agent_name) {
      page.drawText(formData.agent_name, {
        x: FIELD_COORDINATES.agent_name.x,
        y: FIELD_COORDINATES.agent_name.y,
        size: FIELD_COORDINATES.agent_name.fontSize,
        font: font,
        color: rgb(0, 0, 0),
      });
    }
    
    if (formData.agent_phone) {
      page.drawText(formData.agent_phone, {
        x: FIELD_COORDINATES.agent_phone.x,
        y: FIELD_COORDINATES.agent_phone.y,
        size: FIELD_COORDINATES.agent_phone.fontSize,
        font: font,
        color: rgb(0, 0, 0),
      });
    }
    
    if (formData.agent_id_number) {
      page.drawText(formData.agent_id_number, {
        x: FIELD_COORDINATES.agent_id.x,
        y: FIELD_COORDINATES.agent_id.y,
        size: FIELD_COORDINATES.agent_id.fontSize,
        font: font,
        color: rgb(0, 0, 0),
      });
    }
    
    // Appointment date
    if (formData.appointment_date) {
      let dateStr = formData.appointment_date;
      try {
        const d = new Date(formData.appointment_date);
        dateStr = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
      } catch (e) {}
      
      page.drawText(dateStr, {
        x: FIELD_COORDINATES.appointment_date.x,
        y: FIELD_COORDINATES.appointment_date.y,
        size: FIELD_COORDINATES.appointment_date.fontSize,
        font: font,
        color: rgb(0, 0, 0),
      });
    }
    
    // Signature date
    if (formData.signature_date) {
      let dateStr = formData.signature_date;
      try {
        const d = new Date(formData.signature_date);
        dateStr = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
      } catch (e) {}
      
      page.drawText(dateStr, {
        x: FIELD_COORDINATES.signature_date.x,
        y: FIELD_COORDINATES.signature_date.y,
        size: FIELD_COORDINATES.signature_date.fontSize,
        font: font,
        color: rgb(0, 0, 0),
      });
    }
    
    // Contact method
    if (formData.initial_contact_method) {
      const contactLabels: Record<string, string> = {
        'phone': 'Phone',
        'in_person': 'In Person',
        'email': 'Email',
        'mail': 'Direct Mail',
        'referral': 'Referral',
      };
      page.drawText(contactLabels[formData.initial_contact_method] || formData.initial_contact_method, {
        x: FIELD_COORDINATES.contact_method.x,
        y: FIELD_COORDINATES.contact_method.y,
        size: FIELD_COORDINATES.contact_method.fontSize,
        font: font,
        color: rgb(0, 0, 0),
      });
    }
    
    // Plans to represent
    if (formData.plans_to_represent) {
      page.drawText(formData.plans_to_represent.substring(0, 40), {
        x: FIELD_COORDINATES.plans_to_represent.x,
        y: FIELD_COORDINATES.plans_to_represent.y,
        size: FIELD_COORDINATES.plans_to_represent.fontSize,
        font: font,
        color: rgb(0, 0, 0),
      });
    }
    
    // Draw checkmarks for selected products
    console.log('[PDFGenerator] Drawing product checkmarks...');
    const checkmark = '✓';
    
    if (formData.prescription_drug) {
      page.drawText(checkmark, {
        x: FIELD_COORDINATES.checkbox_prescription_drug.x,
        y: FIELD_COORDINATES.checkbox_prescription_drug.y,
        size: 12,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
    }
    
    if (formData.medicare_advantage) {
      page.drawText(checkmark, {
        x: FIELD_COORDINATES.checkbox_medicare_advantage.x,
        y: FIELD_COORDINATES.checkbox_medicare_advantage.y,
        size: 12,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
    }
    
    if (formData.dental_vision_hearing) {
      page.drawText(checkmark, {
        x: FIELD_COORDINATES.checkbox_dental_vision.x,
        y: FIELD_COORDINATES.checkbox_dental_vision.y,
        size: 12,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
    }
    
    if (formData.hospital_indemnity) {
      page.drawText(checkmark, {
        x: FIELD_COORDINATES.checkbox_hospital_indemnity.x,
        y: FIELD_COORDINATES.checkbox_hospital_indemnity.y,
        size: 12,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
    }
    
    if (formData.medicare_supplement) {
      page.drawText(checkmark, {
        x: FIELD_COORDINATES.checkbox_medicare_supplement.x,
        y: FIELD_COORDINATES.checkbox_medicare_supplement.y,
        size: 12,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
    }
    
    // Step 6: Embed and draw signatures
    console.log('[PDFGenerator] Embedding signatures...');
    
    // Beneficiary signature
    if (signatures.beneficiarySignature && signatures.beneficiarySignature.length > 100) {
      try {
        console.log('[PDFGenerator] Processing beneficiary signature...');
        const sigBase64 = extractBase64(signatures.beneficiarySignature);
        const sigBytes = Uint8Array.from(atob(sigBase64), c => c.charCodeAt(0));
        
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
      }
    }
    
    // Agent signature
    if (signatures.agentSignature && signatures.agentSignature.length > 100) {
      try {
        console.log('[PDFGenerator] Processing agent signature...');
        const sigBase64 = extractBase64(signatures.agentSignature);
        const sigBytes = Uint8Array.from(atob(sigBase64), c => c.charCodeAt(0));
        
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
      }
    }
    
    // Step 7: Save the completed PDF
    console.log('[PDFGenerator] Saving final PDF...');
    const pdfBytes = await pdfDoc.save();
    console.log('[PDFGenerator] PDF generated, size:', pdfBytes.length, 'bytes');
    
    // Convert to base64
    let binaryString = '';
    const bytes = new Uint8Array(pdfBytes);
    for (let i = 0; i < bytes.length; i++) {
      binaryString += String.fromCharCode(bytes[i]);
    }
    const pdfBase64 = btoa(binaryString);
    
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
  
  const htmlContent = `
    <html>
      <head>
        <style>
          @page { margin: 0; }
          body { margin: 0; padding: 0; }
          embed { width: 100%; height: 100%; }
        </style>
      </head>
      <body>
        <embed src="data:application/pdf;base64,${pdfBase64}" type="application/pdf" />
      </body>
    </html>
  `;
  
  await Print.printAsync({
    html: htmlContent,
  });
  
  console.log('[PDFGenerator] Print dialog opened');
}

/**
 * View the PDF using a data URI
 */
export function getPdfDataUri(pdfBase64: string): string {
  return `data:application/pdf;base64,${pdfBase64}`;
}
