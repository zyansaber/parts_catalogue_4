import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { PartApplication } from '@/types';
import { formatCurrency, formatDate } from '@/lib/utils';

const DEFAULT_R2_PUBLIC_BASE = 'https://pub-7e56631fd9fb4c6e9686364d876155f8.r2.dev';

const safeText = (value: unknown, fallback = 'N/A') => {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value);
};

const escapeHtml = (value: unknown) => safeText(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export class PDFService {
  static async generateApplicationPDF(application: PartApplication): Promise<void> {
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const contentWidth = pageWidth - margin * 2;

    const container = this.createBilingualPdfElement(application);
    document.body.appendChild(container);

    try {
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });

      const imgData = canvas.toDataURL('image/png');
      const imgHeight = (canvas.height * contentWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = margin;

      pdf.addImage(imgData, 'PNG', margin, position, contentWidth, imgHeight);
      heightLeft -= pageHeight - margin * 2;

      while (heightLeft > 0) {
        pdf.addPage();
        position = heightLeft - imgHeight + margin;
        pdf.addImage(imgData, 'PNG', margin, position, contentWidth, imgHeight);
        heightLeft -= pageHeight - margin * 2;
      }

      pdf.save(`${application.ticket_id}_application.pdf`);
    } finally {
      document.body.removeChild(container);
    }
  }

  private static createBilingualPdfElement(application: PartApplication): HTMLDivElement {
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-10000px';
    container.style.top = '0';
    container.style.width = '794px';
    container.style.background = '#ffffff';
    container.style.color = '#111827';
    container.style.fontFamily = 'Arial, "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
    container.style.padding = '32px';
    container.style.boxSizing = 'border-box';

    const imageUrl = this.resolveImageUrl(application);
    const statusZh = application.status === 'approved' ? '已批准' : application.status === 'rejected' ? '已拒绝' : '待处理';
    container.innerHTML = `
      <div style="border-bottom: 3px solid #2563eb; padding-bottom: 16px; margin-bottom: 24px;">
        <h1 style="margin: 0; font-size: 28px; color: #1f2937;">Part Application Form / 零件申请表</h1>
        <p style="margin: 8px 0 0; color: #6b7280;">Generated / 生成时间: ${escapeHtml(new Date().toLocaleString())}</p>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px;">
        ${this.infoBox('Application ID / 申请编号', application.ticket_id)}
        ${this.infoBox('Status / 状态', `${application.status.toUpperCase()} / ${statusZh}`)}
        ${this.infoBox('Application Date / 申请日期', formatDate(application.created_at))}
      </div>

      ${this.section('Requester Information / 申请人信息', [
        ['Requested By / 申请人', application.requested_by],
        ['Requester Email / 申请人邮箱', application.requester_email],
        ['Department / 部门', application.department],
      ])}

      ${this.section('Part Information / 零件信息', [
        ...(application.part_code ? [['Part Code / 零件编码', application.part_code] as [string, unknown]] : []),
        ['Part Name / 零件名称', application.part_name || application.part_description],
        ['Supplier / 供应商', application.supplier_name],
        ['Supplier SAP Code / 供应商SAP编码', application.supplier_sap_code],
        ['Standard Price / 标准价格', formatCurrency(application.estimated_cost || 0)],
        ['Price Effective Date / 价格生效日期', application.price_effective_date],
        ['Leading Time / 交期', application.leading_time],
        ['Unit / 单位', application.unit],
        ['Is Pack / 是否为Pack', application.is_pack ? 'Yes / 是' : 'No / 否'],
        ...(application.is_pack ? [['Pack Quantity / Pack数量', `1 pack = ${application.pack_quantity || 'N/A'} ${application.unit || 'unit'}`] as [string, unknown]] : []),
      ])}

      ${this.textSection('Specifications / 规格说明', application.technical_specs || application.part_description)}
      ${this.textSection('Notes / 备注', application.application_notes)}
      ${application.rejection_reason ? this.textSection('Rejection Reason / 拒绝原因', application.rejection_reason) : ''}

      ${imageUrl ? `
        <div style="margin-top: 24px; page-break-inside: avoid;">
          <h2 style="font-size: 18px; margin: 0 0 12px; color: #1f2937;">Part Image / 零件图片</h2>
          <div style="border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; background: #f9fafb; text-align: center;">
            <img src="${escapeHtml(imageUrl)}" alt="Part image" crossorigin="anonymous" style="max-width: 100%; max-height: 360px; object-fit: contain;" />
          </div>
        </div>` : ''}

      <div style="margin-top: 32px; border-top: 1px solid #e5e7eb; padding-top: 12px; color: #6b7280; font-size: 12px; text-align: center;">
        Parts Application System / 零件申请系统
      </div>
    `;

    return container;
  }

  private static section(title: string, rows: Array<[string, unknown]>) {
    return `
      <div style="margin-bottom: 22px; page-break-inside: avoid;">
        <h2 style="font-size: 18px; margin: 0 0 10px; color: #1f2937;">${escapeHtml(title)}</h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tbody>
            ${rows.map(([label, value]) => `
              <tr>
                <td style="width: 34%; border: 1px solid #e5e7eb; padding: 8px; background: #f9fafb; font-weight: 700;">${escapeHtml(label)}</td>
                <td style="border: 1px solid #e5e7eb; padding: 8px;">${escapeHtml(value)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  private static textSection(title: string, value?: string) {
    if (!value) return '';
    return `
      <div style="margin-bottom: 22px; page-break-inside: avoid;">
        <h2 style="font-size: 18px; margin: 0 0 10px; color: #1f2937;">${escapeHtml(title)}</h2>
        <div style="white-space: pre-wrap; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; font-size: 14px; line-height: 1.6;">${escapeHtml(value)}</div>
      </div>
    `;
  }

  private static infoBox(label: string, value: unknown) {
    return `
      <div style="border: 1px solid #dbeafe; border-radius: 10px; padding: 12px; background: #eff6ff;">
        <div style="font-size: 12px; color: #2563eb; font-weight: 700; margin-bottom: 4px;">${escapeHtml(label)}</div>
        <div style="font-size: 15px; font-weight: 700; color: #1f2937;">${escapeHtml(value)}</div>
      </div>
    `;
  }

  private static resolveImageUrl(application: PartApplication) {
    if (application.image_url) return application.image_url;

    const publicBase = (import.meta.env.VITE_CF_PUBLIC_BASE || import.meta.env.VITE_R2_PUBLIC_BASE || DEFAULT_R2_PUBLIC_BASE).trim().replace(/\/+$/, '');
    const imageKey = application.part_code || application.ticket_id;
    return publicBase && imageKey ? `${publicBase}/partsfolder/${imageKey}.png` : '';
  }
}
