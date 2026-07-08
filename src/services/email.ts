export interface ApplicationEmailPayload {
  emailType: 'submitted' | 'part_code_completed' | 'rejected' | 'price_pending_reminder';
  toEmail: string;
  requesterName: string;
  requesterEmail: string;
  applicationId: string;
  supplier: string;
  supplierSapCode: string;
  standardPrice: string;
  isPrototypePricePending?: boolean;
  estimatedPrice?: string;
  partName?: string;
  priceEffectiveDate?: string;
  leadingTime?: string;
  unit?: string;
  isPack?: boolean;
  packQuantity?: string;
  specifications?: string;
  notes?: string;
  partCode?: string;
  applicationFileUrl?: string;
  imageUrl?: string;
  rejectionReason?: string;
  submittedAt?: string;
  subjectPrefix?: string;
  serviceId?: string;
  publicKey?: string;
  privateKey?: string;
}

const EMAILJS_ENDPOINT = 'https://api.emailjs.com/api/v1.0/email/send';
const EMAILJS_TEMPLATE_ID = 'template_rij27hq';


const escapeHtml = (value: unknown) => String(value ?? 'N/A')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const statusMeta = (payload: ApplicationEmailPayload) => {
  if (payload.emailType === 'rejected') {
    return { label: 'Rejected / 已拒绝', color: '#dc2626', bg: '#fef2f2' };
  }
  if (payload.emailType === 'part_code_completed') {
    return { label: 'Completed / 已完成', color: '#16a34a', bg: '#f0fdf4' };
  }
  if (payload.emailType === 'price_pending_reminder') {
    return { label: 'Prototype Price Pending / Prototype价格待维护', color: '#d97706', bg: '#fffbeb' };
  }
  return { label: 'Submitted / 已提交', color: '#2563eb', bg: '#eff6ff' };
};

const detailRow = (label: string, value: unknown) => `
  <tr>
    <td style="width: 38%; padding: 10px 12px; border-bottom: 1px solid #e5e7eb; color: #6b7280; font-weight: 600;">${escapeHtml(label)}</td>
    <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; color: #111827;">${escapeHtml(value || 'N/A')}</td>
  </tr>
`;

const buildEmailHtml = (payload: ApplicationEmailPayload) => {
  const status = statusMeta(payload);
  const packText = payload.isPack
    ? `Yes - 1 pack = ${payload.packQuantity || 'N/A'} ${payload.unit || 'unit'}`
    : 'No';

  return `
  <div style="margin:0; padding:0; background:#f3f4f6; font-family:Arial, 'Microsoft YaHei', sans-serif;">
    <div style="max-width:720px; margin:0 auto; padding:24px;">
      <div style="background:#ffffff; border-radius:18px; overflow:hidden; box-shadow:0 10px 30px rgba(15,23,42,0.08);">
        <div style="padding:28px 32px; background:linear-gradient(135deg,#1d4ed8,#0f766e); color:#ffffff;">
          <div style="font-size:13px; letter-spacing:0.08em; text-transform:uppercase; opacity:0.85;">Parts Application / 零件申请</div>
          <h1 style="margin:10px 0 0; font-size:26px; line-height:1.25;">${escapeHtml(buildEmailTitle(payload))}</h1>
          <div style="margin-top:16px; display:inline-block; padding:7px 12px; border-radius:999px; background:${status.bg}; color:${status.color}; font-weight:700;">${escapeHtml(status.label)}</div>
        </div>

        <div style="padding:28px 32px;">
          <p style="margin:0 0 18px; color:#374151; font-size:15px; line-height:1.7;">
            Please review the application details below. / 请查看以下申请详情。
          </p>

          <table style="width:100%; border-collapse:collapse; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden; font-size:14px;">
            <tbody>
              ${detailRow('Application ID / 申请编号', payload.applicationId)}
              ${detailRow('Requester / 申请人', payload.requesterName)}
              ${detailRow('Requester Email / 申请人邮箱', payload.requesterEmail)}
              ${detailRow('Supplier / 供应商', payload.supplier)}
              ${detailRow('Supplier SAP Code / 供应商SAP编码', payload.supplierSapCode)}
              ${detailRow('Part Name / 零件名称', payload.partName)}
              ${detailRow('Part Code / 零件编码', payload.partCode || 'Pending')}
              ${detailRow('Standard Price / 标准价格', payload.standardPrice || (payload.isPrototypePricePending ? 'Prototype price pending' : 'N/A'))}
              ${payload.isPrototypePricePending ? detailRow('Estimated Price / 预估价格', payload.estimatedPrice || 'N/A') : ''}
              ${detailRow('Price Pending / 价格待维护', payload.isPrototypePricePending ? 'Yes' : 'No')}
              ${detailRow('Price Effective Date / 价格生效日期', payload.priceEffectiveDate)}
              ${detailRow('Leading Time / 交期', payload.leadingTime)}
              ${detailRow('Unit / 单位', payload.unit)}
              ${detailRow('Is Pack / 是否Pack', packText)}
              ${detailRow('Submitted At / 提交时间', payload.submittedAt || new Date().toISOString())}
            </tbody>
          </table>

          <div style="margin-top:22px;">
            <h2 style="margin:0 0 10px; font-size:16px; color:#111827;">Specifications / 规格说明</h2>
            <div style="padding:14px; background:#f9fafb; border:1px solid #e5e7eb; border-radius:12px; white-space:pre-wrap; color:#374151; line-height:1.6;">${escapeHtml(payload.specifications || 'N/A')}</div>
          </div>

          <div style="margin-top:18px;">
            <h2 style="margin:0 0 10px; font-size:16px; color:#111827;">Notes / 备注</h2>
            <div style="padding:14px; background:#f9fafb; border:1px solid #e5e7eb; border-radius:12px; white-space:pre-wrap; color:#374151; line-height:1.6;">${escapeHtml(payload.notes || 'N/A')}</div>
          </div>

          ${payload.rejectionReason ? `
          <div style="margin-top:18px; padding:14px; border-radius:12px; background:#fef2f2; border:1px solid #fecaca; color:#991b1b;">
            <strong>Rejection Reason / 拒绝原因:</strong><br />${escapeHtml(payload.rejectionReason)}
          </div>` : ''}

          <div style="margin-top:22px; display:flex; gap:12px; flex-wrap:wrap;">
            ${payload.applicationFileUrl ? `<a href="${escapeHtml(payload.applicationFileUrl)}" style="display:inline-block; padding:10px 14px; border-radius:10px; background:#2563eb; color:#ffffff; text-decoration:none; font-weight:700;">Open Application File</a>` : ''}
            ${payload.imageUrl ? `<a href="${escapeHtml(payload.imageUrl)}" style="display:inline-block; padding:10px 14px; border-radius:10px; background:#0f766e; color:#ffffff; text-decoration:none; font-weight:700;">Open Part Image</a>` : ''}
          </div>
        </div>

        <div style="padding:18px 32px; background:#f9fafb; color:#6b7280; font-size:12px; text-align:center;">
          Parts Application System / 零件申请系统
        </div>
      </div>
    </div>
  </div>`;
};

const buildEmailTitle = (payload: ApplicationEmailPayload) => {
  if (payload.emailType === 'rejected') return `Part Application ${payload.applicationId} Rejected`;
  if (payload.emailType === 'part_code_completed') return `Part Application ${payload.applicationId} Completed`;
  if (payload.emailType === 'price_pending_reminder') return `Prototype Price Pending ${payload.applicationId} Needs Maintenance`;
  return `New Part Application ${payload.applicationId}`;
};

const buildEmailBody = (payload: ApplicationEmailPayload) => {
  const lines = [
    `Application ID: ${payload.applicationId}`,
    `Status: ${payload.emailType}`,
    `Requester: ${payload.requesterName}`,
    `Requester Email: ${payload.requesterEmail || 'N/A'}`,
    `Supplier: ${payload.supplier || 'N/A'}`,
    `Supplier SAP Code: ${payload.supplierSapCode || 'N/A'}`,
    `Part Name: ${payload.partName || 'N/A'}`,
    `Part Code: ${payload.partCode || 'Pending'}`,
    `Standard Price: ${payload.standardPrice || (payload.isPrototypePricePending ? 'Prototype price pending' : 'N/A')}`,
    `Price Pending: ${payload.isPrototypePricePending ? 'Yes' : 'No'}`,
    `Estimated Price: ${payload.estimatedPrice || 'N/A'}`,
    `Price Effective Date: ${payload.priceEffectiveDate || 'N/A'}`,
    `Leading Time: ${payload.leadingTime || 'N/A'}`,
    `Unit: ${payload.unit || 'N/A'}`,
    `Is Pack: ${payload.isPack ? 'Yes' : 'No'}`,
    `Pack Quantity: ${payload.isPack ? payload.packQuantity || 'N/A' : 'N/A'}`,
    `Specifications: ${payload.specifications || 'N/A'}`,
    `Notes: ${payload.notes || 'N/A'}`,
    `Rejection Reason: ${payload.rejectionReason || 'N/A'}`,
    `Application File: ${payload.applicationFileUrl || 'N/A'}`,
    `Image URL: ${payload.imageUrl || 'N/A'}`,
    `Submitted At: ${payload.submittedAt || new Date().toISOString()}`,
  ];

  return lines.join('\n');
};

export class EmailService {
  static async sendApplicationEmail(payload: ApplicationEmailPayload): Promise<void> {
    const serviceId = (payload.serviceId || import.meta.env.VITE_EMAILJS_SERVICE_ID || '').trim();
    const publicKey = (payload.publicKey || import.meta.env.VITE_EMAILJS_PUBLIC_KEY || '').trim();
    const privateKey = (payload.privateKey || import.meta.env.VITE_EMAILJS_PRIVATE_KEY || '').trim();

    if (!serviceId || !publicKey) {
      throw new Error('EmailJS is not configured. Fill EmailJS Service ID and Public Key in /admin, or set VITE_EMAILJS_SERVICE_ID and VITE_EMAILJS_PUBLIC_KEY before rebuilding.');
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
          email_title: buildEmailTitle(payload),
          email_body: buildEmailBody(payload),
          email_html: buildEmailHtml(payload),
          email_type: payload.emailType,
          to_email: payload.toEmail,
          requester_name: payload.requesterName,
          requester_email: payload.requesterEmail,
          application_id: payload.applicationId,
          supplier: payload.supplier,
          supplier_sap_code: payload.supplierSapCode,
          standard_price: payload.standardPrice || (payload.isPrototypePricePending ? 'Prototype price pending' : 'N/A'),
          is_prototype_price_pending: payload.isPrototypePricePending ? 'Yes' : 'No',
          estimated_price: payload.estimatedPrice || 'N/A',
          part_name: payload.partName || 'N/A',
          price_effective_date: payload.priceEffectiveDate || 'N/A',
          leading_time: payload.leadingTime || 'N/A',
          unit: payload.unit || 'N/A',
          is_pack: payload.isPack ? 'Yes' : 'No',
          pack_quantity: payload.isPack ? payload.packQuantity || 'N/A' : 'N/A',
          specifications: payload.specifications || 'N/A',
          notes: payload.notes || 'N/A',
          part_code: payload.partCode || 'Pending',
          application_file_url: payload.applicationFileUrl || 'N/A',
          image_url: payload.imageUrl || 'N/A',
          rejection_reason: payload.rejectionReason || 'N/A',
          submitted_at: payload.submittedAt || new Date().toISOString(),
          subject_prefix: payload.subjectPrefix || 'Part Application',
          subject: `${payload.subjectPrefix || 'Part Application'} - ${buildEmailTitle(payload)}`,
          message: buildEmailBody(payload),
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`EmailJS send failed (${response.status}): ${text}`);
    }
  }
}
