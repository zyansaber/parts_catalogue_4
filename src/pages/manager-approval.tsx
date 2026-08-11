import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle, Eraser, FileSignature, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { FirebaseService } from '@/services/firebase';
import { EmailService } from '@/services/email';

type ApprovalApplication = Record<string, any> & { id: string };

const hiddenFields = new Set(['managerApprovalToken', 'managerSignature', 'imageUrl', 'applicationFileUrl', 'managerApprovalFileUrl']);
const labels: Record<string, string> = {
  id: 'Application ID', requesterName: 'Requester', requesterEmail: 'Requester Email', managerName: 'Manager',
  managerEmail: 'Manager Email', applicationType: 'Application Type', purchasingOrganization: 'Purchasing Organization',
  partName: 'Part Name', partCode: 'Part Code', supplier: 'Supplier', supplierSapCode: 'Supplier SAP Code',
  supplierPartCode: 'Supplier Part Code', standardPrice: 'Standard Price', wholesalePrice: 'Wholesale Price',
  retailPrice: 'Retail Price', minimumOrderQuantity: 'Minimum Order Quantity', priceEffectiveDate: 'Price Effective Date',
  leadingTime: 'Leading Time', unit: 'Unit', specifications: 'Specifications', notes: 'Notes', submittedAt: 'Requested At'
};
const labelFor = (key: string) => labels[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase());
const displayValue = (value: any) => Array.isArray(value)
  ? value.map((item) => typeof item === 'object' ? Object.entries(item).filter(([key]) => key !== 'id').map(([key, val]) => `${labelFor(key)}: ${val}`).join(', ') : String(item)).join('\n')
  : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value);

export default function ManagerApprovalPage() {
  const { applicationId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [application, setApplication] = useState<ApprovalApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [error, setError] = useState('');
  const [approved, setApproved] = useState(false);

  useEffect(() => {
    FirebaseService.getPartApplicationForManager(applicationId, token)
      .then((data) => {
        if (!data) setError('This approval link is invalid, expired, or has already been used.');
        else if (data.managerApprovedAt) setApproved(true);
        else setApplication(data);
      })
      .catch(() => setError('Unable to load this application.'))
      .finally(() => setLoading(false));
  }, [applicationId, token]);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height };
  };
  const startDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    const context = event.currentTarget.getContext('2d')!;
    const p = point(event);
    context.beginPath(); context.moveTo(p.x, p.y);
  };
  const draw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const context = event.currentTarget.getContext('2d')!;
    const p = point(event);
    context.lineWidth = 2.5; context.lineCap = 'round'; context.strokeStyle = '#111827';
    context.lineTo(p.x, p.y); context.stroke(); setHasSignature(true);
  };
  const clear = () => {
    const canvas = canvasRef.current!;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };
  const approve = async () => {
    if (!application || !hasSignature || !canvasRef.current) return;
    setSubmitting(true); setError('');
    try {
      const updated = await FirebaseService.approvePartApplicationByManager(application.id, token, canvasRef.current.toDataURL('image/png'));
      const settings = await FirebaseService.getApplicationEmailSettings();
      if (settings.notifyEmail) {
        try {
          await EmailService.sendApplicationEmail({
            emailType: 'submitted', toEmail: settings.notifyEmail, requesterName: updated.requesterName || updated.requestedBy,
            requesterEmail: updated.requesterEmail || '', applicationId: updated.id, applicationType: updated.applicationType,
            isSalesItem: updated.isSalesItem, vanCodeType: updated.vanCodeType, supplier: updated.supplier || '',
            supplierSapCode: updated.supplierSapCode || '', supplierPartCode: updated.supplierPartCode, wholesalePrice: updated.wholesalePrice,
            retailPrice: updated.retailPrice, standardPrice: updated.standardPrice || '', isPrototypePricePending: updated.isPrototypePricePending,
            estimatedPrice: updated.estimatedPrice, partName: updated.partName, priceEffectiveDate: updated.priceEffectiveDate,
            leadingTime: updated.leadingTime, unit: updated.unit, isPack: updated.isPack, packQuantity: updated.packQuantity,
            specifications: updated.specifications, notes: updated.notes, imageUrl: updated.imageUrl, submittedAt: updated.submittedAt,
            subjectPrefix: settings.subjectPrefix, serviceId: settings.serviceId, publicKey: settings.publicKey, privateKey: settings.privateKey
          });
        } catch (emailError) { console.error('Approved application notification failed:', emailError); }
      }
      setApproved(true); setApplication(null);
    } catch (approvalError) {
      setError(approvalError instanceof Error ? approvalError.message : 'Approval could not be submitted.');
    } finally { setSubmitting(false); }
  };

  if (loading) return <div className="min-h-screen grid place-items-center bg-slate-50"><LoadingSpinner size="lg" /></div>;
  if (approved) return <div className="min-h-screen grid place-items-center bg-emerald-50 p-6"><Card className="max-w-lg text-center"><CardContent className="pt-8 space-y-4"><CheckCircle className="mx-auto h-16 w-16 text-emerald-600" /><h1 className="text-2xl font-bold">Approved and submitted</h1><p className="text-gray-600">Your electronic signature has been recorded. The application is now in the normal processing queue.</p></CardContent></Card></div>;
  if (error && !application) return <div className="min-h-screen grid place-items-center bg-slate-50 p-6"><Card className="max-w-lg"><CardContent className="pt-6 text-center text-red-700">{error}</CardContent></Card></div>;

  const details = Object.entries(application || {}).filter(([key, value]) => !hiddenFields.has(key) && value !== '' && value != null && !['managerApprovalRequired', 'status'].includes(key));
  return <main className="min-h-screen bg-slate-50 py-8 px-4"><div className="mx-auto max-w-4xl space-y-6">
    <div className="space-y-2"><Badge className="bg-violet-600"><ShieldCheck className="mr-1 h-3 w-3" />Secure manager approval</Badge><h1 className="text-3xl font-bold">Review application changes</h1><p className="text-gray-600">Please verify all details, sign below, then approve the application.</p></div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><FileSignature className="h-5 w-5" />{application?.id}</CardTitle></CardHeader><CardContent className="grid grid-cols-1 gap-x-8 md:grid-cols-2">{details.map(([key, value]) => <div key={key} className="border-b py-3"><p className="text-xs font-medium uppercase tracking-wide text-gray-500">{labelFor(key)}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm">{displayValue(value)}</p></div>)}{application?.imageUrl && <div className="md:col-span-2 pt-4"><p className="mb-2 text-xs font-medium uppercase text-gray-500">Part Image</p><img src={application.imageUrl} alt="Part" className="max-h-72 rounded border object-contain" /></div>}</CardContent></Card>
    <Card><CardHeader><CardTitle>Electronic signature *</CardTitle></CardHeader><CardContent className="space-y-4"><canvas ref={canvasRef} width={800} height={200} onPointerDown={startDrawing} onPointerMove={draw} onPointerUp={() => drawing.current = false} onPointerCancel={() => drawing.current = false} className="h-48 w-full touch-none rounded-lg border-2 border-dashed bg-white" aria-label="Signature pad" /><div className="flex flex-col gap-3 sm:flex-row sm:justify-between"><Button type="button" variant="outline" onClick={clear}><Eraser className="mr-2 h-4 w-4" />Clear</Button><Button type="button" onClick={approve} disabled={!hasSignature || submitting}>{submitting ? <LoadingSpinner size="sm" /> : <CheckCircle className="mr-2 h-4 w-4" />}Sign &amp; Approve</Button></div>{error && <p className="text-sm text-red-600">{error}</p>}<p className="text-xs text-gray-500">By selecting Sign &amp; Approve, you confirm that this electronic signature represents your approval of the application shown above.</p></CardContent></Card>
  </div></main>;
}
