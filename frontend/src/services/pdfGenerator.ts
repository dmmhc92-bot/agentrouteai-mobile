/**
 * SOA PDF Generator Service
 * 
 * CRITICAL: This service uses the EXACT uploaded form image as the base.
 * - NO conversion, NO recreation, NO template substitution
 * - The original uploaded JPEG is embedded directly as the PDF background
 * - Text and signatures are overlaid at precise coordinates
 * - The final PDF is the permanent, flattened source of truth
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

// Cached original form data
let ORIGINAL_FORM_CACHE = null;

// Get the backend URL
const getBackendUrl = () => {
  const backendUrl = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL 
    || process.env.EXPO_PUBLIC_BACKEND_URL 
    || 'https://secure-app-lock.preview.emergentagent.com';
  return backendUrl;
};

interface SOAFormData {
  beneficiary_name: string;
  beneficiary_phone: string;
  beneficiary_address: string;
  agent_name: string;
  agent_phone: string;
  agent_id_number: string;
  agent_license: string;
  appointment_date: string;
  signature_date: string;
  initial_contact_method: string;
  plans_to_represent: string;
  medicare_advantage: boolean;
  medicare_supplement: boolean;
  prescription_drug: boolean;
  dental_vision_hearing: boolean;
  hospital_indemnity: boolean;
  other_products: string;
  auth_rep_name?: string;
  auth_rep_relationship?: string;
}

interface SignatureData {
  beneficiarySignature: string | null;
  agentSignature: string | null;
  beneficiaryTypedName: string;
  agentTypedName: string;
}

/**
 * ORIGINAL FORM DIMENSIONS
 * These are the exact dimensions of the uploaded form (IMG_3751.jpeg)
 * DO NOT CHANGE THESE - they define the coordinate system
 */
const ORIGINAL_WIDTH = 1167;  // pixels
const ORIGINAL_HEIGHT = 1463; // pixels

/**
 * PDF DIMENSIONS
 * We create a PDF that matches the form's aspect ratio exactly
 * Using 72 DPI standard, scaled to fit reasonable print size
 */
const PDF_WIDTH = 612;  // Standard Letter width in points (8.5 inches)
const PDF_HEIGHT = Math.round(PDF_WIDTH * (ORIGINAL_HEIGHT / ORIGINAL_WIDTH)); // ~767 points

// Scale factor from original image coordinates to PDF points
const SCALE_X = PDF_WIDTH / ORIGINAL_WIDTH;
const SCALE_Y = PDF_HEIGHT / ORIGINAL_HEIGHT;

/**
 * Convert pixel coordinates from the original image to PDF points
 * Y is inverted because PDF origin is bottom-left, image origin is top-left
 */
const toX = (pixelX) => pixelX * SCALE_X;
const toY = (pixelY) => PDF_HEIGHT - (pixelY * SCALE_Y);

/**
 * FIELD COORDINATES
 * All coordinates are in ORIGINAL IMAGE PIXELS (1167 x 1463)
 * Based on exact analysis of IMG_3751.jpeg
 */
const FIELDS = {
  // Product checkboxes (pixel positions of checkbox centers)
  checkbox_prescription_drug: { x: 228, y: 334 },      // "Stand-alone Medicare Prescription Drug Plans (Part D)"
  checkbox_medicare_advantage: { x: 228, y: 370 },     // "Medicare Advantage Plans (Part C) and Cost Plans"  
  checkbox_dental_vision: { x: 228, y: 406 },          // "Dental/Vision/Hearing Products"
  checkbox_hospital_indemnity: { x: 724, y: 334 },     // "Hospital Indemnity Products"
  checkbox_medicare_supplement: { x: 724, y: 370 },    // "Medicare Supplement (Medigap) Products"

  // Beneficiary signature line (position and size)
  beneficiary_signature: { x: 140, y: 570, width: 350, height: 60 },
  
  // Signature date (next to beneficiary signature)
  signature_date: { x: 800, y: 590 },

  // Authorized rep section (below signature)
  auth_rep_name: { x: 140, y: 660 },
  auth_rep_relationship: { x: 665, y: 660 },

  // LSR Section - Row 1
  agent_name: { x: 95, y: 790 },
  agent_phone: { x: 430, y: 790 },
  agent_id: { x: 745, y: 790 },

  // LSR Section - Row 2  
  beneficiary_name: { x: 95, y: 870 },
  beneficiary_phone: { x: 430, y: 870 },
  appointment_date: { x: 745, y: 870 },

  // LSR Section - Row 3
  beneficiary_address: { x: 95, y: 950 },

  // LSR Section - Row 4
  contact_method: { x: 95, y: 1025 },
  plans_to_represent: { x: 555, y: 1025 },

  // Agent signature line
  agent_signature: { x: 140, y: 1070, width: 400, height: 50 },
};

/**
 * Load the ORIGINAL uploaded form image from the backend
 * This returns the EXACT file that was uploaded - no conversion
 */
async function loadOriginalForm() {
  console.log('[PDFGenerator] Loading ORIGINAL uploaded form...');
  
  if (ORIGINAL_FORM_CACHE) {
    console.log('[PDFGenerator] Using cached original form');
    return ORIGINAL_FORM_CACHE;
  }
  
  try {
    const backendUrl = getBackendUrl();
    const url = backendUrl ? `${backendUrl}/api/soa-template` : '/api/soa-template';
    console.log('[PDFGenerator] Fetching from:', url);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch form: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.form_base64) {
      throw new Error('No form data received from server');
    }
    
    console.log('[PDFGenerator] Original form loaded:');
    console.log('  - Format:', data.format);
    console.log('  - Dimensions:', data.width, 'x', data.height);
    console.log('  - Size:', data.form_base64.length, 'chars');
    console.log('  - Note:', data.note);
    
    ORIGINAL_FORM_CACHE = data;
    return data;
    
  } catch (error) {
    console.error('[PDFGenerator] Failed to load original form:', error);
    throw error;
  }
}

/**
 * Convert base64 string to Uint8Array
 */
function base64ToBytes(base64) {
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
function bytesToBase64(bytes) {
  let binaryString = '';
  for (let i = 0; i < bytes.length; i++) {
    binaryString += String.fromCharCode(bytes[i]);
  }
  return btoa(binaryString);
}

/**
 * Extract base64 data from a data URI
 */
function extractBase64(dataUri) {
  if (!dataUri) return null;
  if (dataUri.includes(',')) {
    return dataUri.split(',')[1];
  }
  return dataUri;
}

/**
 * Format a date string for display
 */
function formatDate(dateStr) {
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
 * Get contact method label
 */
function getContactLabel(method) {
  const labels = {
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
 * MAIN FUNCTION: Generate SOA PDF using the EXACT original form
 * 
 * Process:
 * 1. Load the ORIGINAL uploaded JPEG (no conversion)
 * 2. Create a new PDF with exact aspect ratio matching the form
 * 3. Embed the original JPEG as the full-page background
 * 4. Overlay text fields at precise coordinates
 * 5. Embed signature images at signature lines
 * 6. Save and return the final PDF
 */
export async function generateSOAPdf(formData, signatures) {
  console.log('[PDFGenerator] ========================================');
  console.log('[PDFGenerator] GENERATING PDF FROM ORIGINAL FORM');
  console.log('[PDFGenerator] ========================================');
  
  try {
    // Step 1: Load pdf-lib
    const { PDFDocument, rgb, StandardFonts } = await getPdfLib();
    console.log('[PDFGenerator] pdf-lib loaded');
    
    // Step 2: Load the ORIGINAL uploaded form
    const originalForm = await loadOriginalForm();
    const formImageBytes = base64ToBytes(originalForm.form_base64);
    console.log('[PDFGenerator] Original form image loaded:', formImageBytes.length, 'bytes');
    
    // Step 3: Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    console.log('[PDFGenerator] Created new PDF document');
    
    // Step 4: Add a page with EXACT dimensions matching the form's aspect ratio
    const page = pdfDoc.addPage([PDF_WIDTH, PDF_HEIGHT]);
    console.log('[PDFGenerator] Added page:', PDF_WIDTH, 'x', PDF_HEIGHT, 'points');
    
    // Step 5: Embed the ORIGINAL form image as JPEG
    const formImage = await pdfDoc.embedJpg(formImageBytes);
    console.log('[PDFGenerator] Embedded original JPEG:', formImage.width, 'x', formImage.height);
    
    // Step 6: Draw the original form as the FULL PAGE background
    // This ensures the form layout is EXACTLY preserved
    page.drawImage(formImage, {
      x: 0,
      y: 0,
      width: PDF_WIDTH,
      height: PDF_HEIGHT,
    });
    console.log('[PDFGenerator] Drew original form as full-page background');
    
    // Step 7: Embed fonts for text overlay
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Text styling
    const textColor = rgb(0, 0, 0);
    const fontSize = 9;
    const checkSize = 12;
    
    // Step 8: Draw checkmarks for selected products
    console.log('[PDFGenerator] Drawing product checkmarks...');
    const checkmark = '✓';
    
    if (formData.prescription_drug) {
      page.drawText(checkmark, {
        x: toX(FIELDS.checkbox_prescription_drug.x),
        y: toY(FIELDS.checkbox_prescription_drug.y),
        size: checkSize,
        font: boldFont,
        color: textColor,
      });
      console.log('[PDFGenerator] ✓ Prescription Drug');
    }
    
    if (formData.medicare_advantage) {
      page.drawText(checkmark, {
        x: toX(FIELDS.checkbox_medicare_advantage.x),
        y: toY(FIELDS.checkbox_medicare_advantage.y),
        size: checkSize,
        font: boldFont,
        color: textColor,
      });
      console.log('[PDFGenerator] ✓ Medicare Advantage');
    }
    
    if (formData.dental_vision_hearing) {
      page.drawText(checkmark, {
        x: toX(FIELDS.checkbox_dental_vision.x),
        y: toY(FIELDS.checkbox_dental_vision.y),
        size: checkSize,
        font: boldFont,
        color: textColor,
      });
      console.log('[PDFGenerator] ✓ Dental/Vision/Hearing');
    }
    
    if (formData.hospital_indemnity) {
      page.drawText(checkmark, {
        x: toX(FIELDS.checkbox_hospital_indemnity.x),
        y: toY(FIELDS.checkbox_hospital_indemnity.y),
        size: checkSize,
        font: boldFont,
        color: textColor,
      });
      console.log('[PDFGenerator] ✓ Hospital Indemnity');
    }
    
    if (formData.medicare_supplement) {
      page.drawText(checkmark, {
        x: toX(FIELDS.checkbox_medicare_supplement.x),
        y: toY(FIELDS.checkbox_medicare_supplement.y),
        size: checkSize,
        font: boldFont,
        color: textColor,
      });
      console.log('[PDFGenerator] ✓ Medicare Supplement');
    }
    
    // Step 9: Draw signature date
    if (formData.signature_date) {
      page.drawText(formatDate(formData.signature_date), {
        x: toX(FIELDS.signature_date.x),
        y: toY(FIELDS.signature_date.y),
        size: fontSize,
        font: font,
        color: textColor,
      });
    }
    
    // Step 10: Draw authorized rep fields (if applicable)
    if (formData.auth_rep_name) {
      page.drawText(formData.auth_rep_name, {
        x: toX(FIELDS.auth_rep_name.x),
        y: toY(FIELDS.auth_rep_name.y),
        size: fontSize,
        font: font,
        color: textColor,
      });
    }
    
    if (formData.auth_rep_relationship) {
      page.drawText(formData.auth_rep_relationship, {
        x: toX(FIELDS.auth_rep_relationship.x),
        y: toY(FIELDS.auth_rep_relationship.y),
        size: fontSize,
        font: font,
        color: textColor,
      });
    }
    
    // Step 11: Draw LSR section fields
    console.log('[PDFGenerator] Drawing LSR section fields...');
    
    if (formData.agent_name) {
      page.drawText(formData.agent_name, {
        x: toX(FIELDS.agent_name.x),
        y: toY(FIELDS.agent_name.y),
        size: fontSize,
        font: font,
        color: textColor,
      });
    }
    
    if (formData.agent_phone) {
      page.drawText(formData.agent_phone, {
        x: toX(FIELDS.agent_phone.x),
        y: toY(FIELDS.agent_phone.y),
        size: fontSize,
        font: font,
        color: textColor,
      });
    }
    
    if (formData.agent_id_number) {
      page.drawText(formData.agent_id_number, {
        x: toX(FIELDS.agent_id.x),
        y: toY(FIELDS.agent_id.y),
        size: fontSize,
        font: font,
        color: textColor,
      });
    }
    
    if (formData.beneficiary_name) {
      page.drawText(formData.beneficiary_name, {
        x: toX(FIELDS.beneficiary_name.x),
        y: toY(FIELDS.beneficiary_name.y),
        size: fontSize,
        font: font,
        color: textColor,
      });
    }
    
    if (formData.beneficiary_phone) {
      page.drawText(formData.beneficiary_phone, {
        x: toX(FIELDS.beneficiary_phone.x),
        y: toY(FIELDS.beneficiary_phone.y),
        size: fontSize,
        font: font,
        color: textColor,
      });
    }
    
    if (formData.appointment_date) {
      page.drawText(formatDate(formData.appointment_date), {
        x: toX(FIELDS.appointment_date.x),
        y: toY(FIELDS.appointment_date.y),
        size: fontSize,
        font: font,
        color: textColor,
      });
    }
    
    if (formData.beneficiary_address) {
      const addr = formData.beneficiary_address.substring(0, 70);
      page.drawText(addr, {
        x: toX(FIELDS.beneficiary_address.x),
        y: toY(FIELDS.beneficiary_address.y),
        size: fontSize - 1,
        font: font,
        color: textColor,
      });
    }
    
    if (formData.initial_contact_method) {
      page.drawText(getContactLabel(formData.initial_contact_method), {
        x: toX(FIELDS.contact_method.x),
        y: toY(FIELDS.contact_method.y),
        size: fontSize,
        font: font,
        color: textColor,
      });
    }
    
    if (formData.plans_to_represent) {
      const plans = formData.plans_to_represent.substring(0, 50);
      page.drawText(plans, {
        x: toX(FIELDS.plans_to_represent.x),
        y: toY(FIELDS.plans_to_represent.y),
        size: fontSize - 1,
        font: font,
        color: textColor,
      });
    }
    
    // Step 12: EMBED SIGNATURES AS IMAGES
    console.log('[PDFGenerator] Embedding signatures...');
    
    // Beneficiary signature
    if (signatures.beneficiarySignature && signatures.beneficiarySignature.length > 500) {
      console.log('[PDFGenerator] Processing beneficiary signature...');
      try {
        const sigBase64 = extractBase64(signatures.beneficiarySignature);
        const sigBytes = base64ToBytes(sigBase64);
        
        // Embed as PNG (signatures are captured as PNG)
        const sigImage = await pdfDoc.embedPng(sigBytes);
        console.log('[PDFGenerator] Beneficiary signature embedded:', sigImage.width, 'x', sigImage.height);
        
        // Calculate position and scale
        const field = FIELDS.beneficiary_signature;
        const pdfX = toX(field.x);
        const pdfY = toY(field.y + field.height); // Adjust for bottom-left origin
        const pdfWidth = field.width * SCALE_X;
        const pdfHeight = field.height * SCALE_Y;
        
        // Scale signature to fit the field while maintaining aspect ratio
        const scaled = sigImage.scaleToFit(pdfWidth, pdfHeight);
        
        page.drawImage(sigImage, {
          x: pdfX,
          y: pdfY,
          width: scaled.width,
          height: scaled.height,
        });
        console.log('[PDFGenerator] ✓ Beneficiary signature drawn at', pdfX, pdfY);
      } catch (error) {
        console.error('[PDFGenerator] Failed to embed beneficiary signature:', error);
      }
    } else {
      console.log('[PDFGenerator] No beneficiary signature to embed');
    }
    
    // Agent signature
    if (signatures.agentSignature && signatures.agentSignature.length > 500) {
      console.log('[PDFGenerator] Processing agent signature...');
      try {
        const sigBase64 = extractBase64(signatures.agentSignature);
        const sigBytes = base64ToBytes(sigBase64);
        
        const sigImage = await pdfDoc.embedPng(sigBytes);
        console.log('[PDFGenerator] Agent signature embedded:', sigImage.width, 'x', sigImage.height);
        
        const field = FIELDS.agent_signature;
        const pdfX = toX(field.x);
        const pdfY = toY(field.y + field.height);
        const pdfWidth = field.width * SCALE_X;
        const pdfHeight = field.height * SCALE_Y;
        
        const scaled = sigImage.scaleToFit(pdfWidth, pdfHeight);
        
        page.drawImage(sigImage, {
          x: pdfX,
          y: pdfY,
          width: scaled.width,
          height: scaled.height,
        });
        console.log('[PDFGenerator] ✓ Agent signature drawn at', pdfX, pdfY);
      } catch (error) {
        console.error('[PDFGenerator] Failed to embed agent signature:', error);
      }
    } else {
      console.log('[PDFGenerator] No agent signature to embed');
    }
    
    // Step 13: Save the final PDF
    console.log('[PDFGenerator] Saving final PDF...');
    const pdfBytes = await pdfDoc.save();
    const pdfBase64 = bytesToBase64(new Uint8Array(pdfBytes));
    
    console.log('[PDFGenerator] ========================================');
    console.log('[PDFGenerator] PDF GENERATION COMPLETE');
    console.log('[PDFGenerator] Final size:', pdfBytes.length, 'bytes');
    console.log('[PDFGenerator] Base64 length:', pdfBase64.length);
    console.log('[PDFGenerator] ========================================');
    
    return pdfBase64;
    
  } catch (error) {
    console.error('[PDFGenerator] ========================================');
    console.error('[PDFGenerator] PDF GENERATION FAILED');
    console.error('[PDFGenerator] Error:', error.message || error);
    console.error('[PDFGenerator] ========================================');
    throw error;
  }
}

/**
 * Save PDF to device file system
 */
export async function savePdfToDevice(pdfBase64, filename) {
  console.log('[PDFGenerator] Saving PDF to device:', filename);
  const fileUri = `${FileSystem.documentDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(fileUri, pdfBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  console.log('[PDFGenerator] Saved to:', fileUri);
  return fileUri;
}

/**
 * Share PDF using native share dialog
 */
export async function sharePdf(pdfBase64, filename) {
  console.log('[PDFGenerator] Sharing PDF...');
  const fileUri = await savePdfToDevice(pdfBase64, filename);
  
  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('Sharing is not available on this device');
  }
  
  await Sharing.shareAsync(fileUri, {
    mimeType: 'application/pdf',
    dialogTitle: 'Share Scope of Appointment',
    UTI: 'com.adobe.pdf',
  });
  
  console.log('[PDFGenerator] PDF shared successfully');
}

/**
 * Print PDF
 */
export async function printPdf(pdfBase64) {
  console.log('[PDFGenerator] Printing PDF...');
  
  const filename = `SOA_Print_${Date.now()}.pdf`;
  const fileUri = `${FileSystem.cacheDirectory}${filename}`;
  
  await FileSystem.writeAsStringAsync(fileUri, pdfBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  
  await Print.printAsync({ uri: fileUri });
  console.log('[PDFGenerator] Print dialog opened');
}

/**
 * Get PDF as data URI for preview
 */
export function getPdfDataUri(pdfBase64) {
  return `data:application/pdf;base64,${pdfBase64}`;
}
