export interface ApplicationEmailPayload {
  emailType: 'submitted' | 'part_code_completed';
  toEmail: string;
  requesterName: string;
  requesterEmail: string;
  applicationId: string;
  supplier: string;
  supplierSapCode: string;
  standardPrice: string;
  specifications?: string;
  notes?: string;
  partCode?: string;
  applicationFileUrl?: string;
  imageUrl?: string;
  submittedAt?: string;
  subjectPrefix?: string;
}

const EMAILJS_ENDPOINT = 'https://api.emailjs.com/api/v1.0/email/send';
const EMAILJS_TEMPLATE_ID = 'template_rij27hq';

export class EmailService {
  static async sendApplicationEmail(payload: ApplicationEmailPayload): Promise<void> {
    const serviceId = (import.meta.env.VITE_EMAILJS_SERVICE_ID || '').trim();
    const publicKey = (import.meta.env.VITE_EMAILJS_PUBLIC_KEY || '').trim();
    const privateKey = (import.meta.env.VITE_EMAILJS_PRIVATE_KEY || '').trim();

    if (!serviceId || !publicKey) {
      throw new Error('EmailJS is not configured. Set VITE_EMAILJS_SERVICE_ID and VITE_EMAILJS_PUBLIC_KEY, then rebuild/redeploy the Vite app.');
    }

    const response = await fetch(EMAILJS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: serviceId,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: publicKey,
        ...(privateKey ? { accessToken: privateKey } : {}),
        template_params: {
          email_type: payload.emailType,
          to_email: payload.toEmail,
          requester_name: payload.requesterName,
          requester_email: payload.requesterEmail,
          application_id: payload.applicationId,
          supplier: payload.supplier,
          supplier_sap_code: payload.supplierSapCode,
          standard_price: payload.standardPrice,
          specifications: payload.specifications || 'N/A',
          notes: payload.notes || 'N/A',
          part_code: payload.partCode || 'Pending',
          application_file_url: payload.applicationFileUrl || 'N/A',
          image_url: payload.imageUrl || 'N/A',
          submitted_at: payload.submittedAt || new Date().toISOString(),
          subject_prefix: payload.subjectPrefix || 'Part Application',
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`EmailJS send failed (${response.status}): ${text}`);
    }
  }
}
