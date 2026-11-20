export const CNIC_REGEX = /^\d{5}-\d{7}-\d$/;

export function formatCnicInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 13);
  if (digits.length <= 5) return digits;
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

export function isValidCnic(cnic: string): boolean {
  return CNIC_REGEX.test(cnic.trim());
}

export function isCnicExpired(expiryDate: string): boolean {
  if (!expiryDate) return false;
  const today = new Date().toISOString().slice(0, 10);
  return expiryDate < today;
}

export function validateAttachmentFile(file: File): string | null {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (!allowedTypes.includes(file.type)) {
    return 'Unsupported file type. Allowed: JPG, PNG, WEBP, or PDF.';
  }
  const maxBytes = 2 * 1024 * 1024; // 2 MB
  if (file.size > maxBytes) {
    return 'File exceeds 2 MB limit.';
  }
  return null;
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}
