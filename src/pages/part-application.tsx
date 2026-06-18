import React, { useState, useEffect } from 'react';
import { FileText, Download, Plus, Eye, CheckCircle, Image, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { TranslationService } from '@/services/translation';
import { PDFService } from '@/services/pdf';
import { FirebaseService } from '@/services/firebase';
import { EmailService } from '@/services/email';

interface PartApplication {
  id: string;
  requestedBy: string;
  department: string;
  priority: 'low' | 'medium' | 'high';
  specifications: string;
  supplier: string;
  standardPrice: string;
  partName: string;
  priceEffectiveDate: string;
  unit: string;
  isPack: boolean;
  packQuantity: string;
  notes: string;
  submittedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  imageUrl?: string;
  partCode?: string;
  requesterId?: string;
  requesterName?: string;
  requesterEmail?: string;
  supplierSapCode?: string;
  applicationFileUrl?: string;
  applicationFileName?: string;
  rejectionReason?: string;
  rejectedAt?: string;
}

interface ApplicationRequester {
  id: string;
  name: string;
  email: string;
}

interface ApplicationEmailSettings {
  notifyEmail: string;
  subjectPrefix?: string;
  serviceId?: string;
  publicKey?: string;
  privateKey?: string;
}

export default function PartApplicationPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [applications, setApplications] = useState<PartApplication[]>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [approveDialog, setApproveDialog] = useState<{ open: boolean; application: PartApplication | null }>({
    open: false,
    application: null
  });
  const [partCode, setPartCode] = useState('');
  const [partCodeImage, setPartCodeImage] = useState<File | null>(null);
  const [partCodeImagePreview, setPartCodeImagePreview] = useState<string | null>(null);
  const [rejectDialog, setRejectDialog] = useState<{ open: boolean; application: PartApplication | null }>({
    open: false,
    application: null
  });
  const [rejectionReason, setRejectionReason] = useState('');
  const [requesters, setRequesters] = useState<ApplicationRequester[]>([]);
  const [emailSettings, setEmailSettings] = useState<ApplicationEmailSettings>({ notifyEmail: '' });
  const [applicationFile, setApplicationFile] = useState<File | null>(null);
  const [partCodeDrafts, setPartCodeDrafts] = useState<Record<string, string>>({});
  const [submissionMode, setSubmissionMode] = useState<'single' | 'bulk'>('single');
  const [applicationStatusFilter, setApplicationStatusFilter] = useState<'all' | 'pending' | 'approved'>('pending');

  // Form state
  const [formData, setFormData] = useState({
    requesterId: '',
    requestedBy: '',
    department: '',
    priority: 'medium' as 'low' | 'medium' | 'high',
    specifications: '',
    supplier: '',
    supplierSapCode: '',
    standardPrice: '',
    partName: '',
    priceEffectiveDate: '',
    unit: '',
    isPack: false,
    packQuantity: '',
    notes: '',
    requesterEmail: ''
  });

  // Load applications from Firebase on component mount
  useEffect(() => {
    loadApplications();
    loadApplicationConfig();
  }, []);

  const loadApplicationConfig = async () => {
    const [loadedRequesters, loadedEmailSettings] = await Promise.all([
      FirebaseService.getApplicationRequesters(),
      FirebaseService.getApplicationEmailSettings()
    ]);
    setRequesters(loadedRequesters);
    setEmailSettings(loadedEmailSettings);
  };

  const loadApplications = async () => {
    setLoading(true);
    try {
      const apps = await FirebaseService.getPartApplications();
      setApplications(apps);
    } catch (error) {
      console.error('Error loading applications:', error);
      showMessage('error', 'Failed to load applications');
    } finally {
      setLoading(false);
    }
  };

  // Generate next application ID
  const generateApplicationId = (offset = 0) => {
    const nextNumber = applications.length + 1 + offset;
    return `APP${nextNumber.toString().padStart(4, '0')}`;
  };

  const resetForm = () => {
    setFormData({
      requesterId: '',
      requestedBy: '',
      department: '',
      priority: 'medium',
      specifications: '',
      supplier: '',
      supplierSapCode: '',
      standardPrice: '',
      partName: '',
      priceEffectiveDate: '',
      unit: '',
      isPack: false,
      packQuantity: '',
      notes: '',
      requesterEmail: ''
    });
    setSelectedFile(null);
    setImagePreview(null);
    setApplicationFile(null);
    setSubmissionMode('single');
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type.startsWith('image/')) {
        setSelectedFile(file);
        const reader = new FileReader();
        reader.onload = (e) => {
          setImagePreview(e.target?.result as string);
        };
        reader.readAsDataURL(file);
      } else {
        showMessage('error', 'Please select an image file');
      }
    }
  };

  const handlePartCodeImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type.startsWith('image/')) {
        setPartCodeImage(file);
        const reader = new FileReader();
        reader.onload = (e) => {
          setPartCodeImagePreview(e.target?.result as string);
        };
        reader.readAsDataURL(file);
      } else {
        showMessage('error', 'Please select an image file');
      }
    }
  };

  // 修改下载方法：直接打开新窗口，让浏览器处理下载
  const downloadImage = (imageUrl: string, filename: string) => {
    try {
      // 创建一个隐藏的链接元素
      const link = document.createElement('a');
      link.href = imageUrl;
      link.download = filename;
      link.target = '_blank'; // 在新窗口打开，避免CORS问题
      link.rel = 'noopener noreferrer';

      // 添加到DOM，点击，然后移除
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showMessage('success', `Opening download for ${filename}. If download doesn't start, right-click the image and select "Save image as..."`);
    } catch (error) {
      console.error('Error downloading image:', error);
      showMessage('error', 'Failed to download image. Please right-click the image and select "Save image as..."');
    }
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const parseCsvLine = (line: string) => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      const next = line[i + 1];
      if (char === '"' && inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  };

  const parseBulkApplicationFile = async (file: File) => {
    const text = await file.text();
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length < 2) {
      throw new Error('Bulk upload CSV must include a header row and at least one data row.');
    }

    const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase().replace(/\s+/g, '_'));
    const rows = lines.slice(1).map((line, index) => {
      const values = parseCsvLine(line);
      const row = headers.reduce((acc, header, headerIndex) => {
        acc[header] = values[headerIndex] || '';
        return acc;
      }, {} as Record<string, string>);

      const supplier = row.preferred_supplier || row.supplier || '';
      const supplierSapCode = row.preferred_supplier_sap_code || row.supplier_sap_code || '';
      const standardPrice = row.standard_price || row.price || '';
      const partName = row.part_name || row.name || '';
      const priceEffectiveDate = row.price_effective_date || row.effective_date || '';
      const unit = row.unit || '';
      const isPack = ['yes', 'true', '1', 'y'].includes((row.is_pack || row.pack || '').toLowerCase());
      const packQuantity = row.pack_quantity || row.pack_qty || '';
      if (!supplier || !supplierSapCode || !standardPrice || !partName || !priceEffectiveDate || !unit || (isPack && !packQuantity)) {
        throw new Error(`Row ${index + 2} is missing Preferred Supplier, Preferred Supplier SAP Code, Standard Price, Part Name, Price Effective Date, Unit, or Pack Quantity when Is Pack is yes.`);
      }

      return {
        supplier,
        supplierSapCode,
        standardPrice,
        partName,
        priceEffectiveDate,
        unit,
        isPack,
        packQuantity,
        specifications: row.specifications || '',
        notes: row.notes || '',
      };
    });

    return rows;
  };

  const sendSubmissionEmail = async (application: PartApplication, applicationFileUrl = '') => {
    if (!emailSettings.notifyEmail) return;

    await EmailService.sendApplicationEmail({
      emailType: 'submitted',
      toEmail: emailSettings.notifyEmail,
      requesterName: application.requesterName || application.requestedBy,
      requesterEmail: application.requesterEmail || '',
      applicationId: application.id,
      supplier: application.supplier,
      supplierSapCode: application.supplierSapCode || '',
      standardPrice: application.standardPrice,
      partName: application.partName,
      priceEffectiveDate: application.priceEffectiveDate,
      unit: application.unit,
      isPack: application.isPack,
      packQuantity: application.packQuantity,
      specifications: application.specifications,
      notes: application.notes,
      applicationFileUrl,
      imageUrl: application.imageUrl,
      submittedAt: application.submittedAt,
      subjectPrefix: emailSettings.subjectPrefix,
      serviceId: emailSettings.serviceId,
      publicKey: emailSettings.publicKey,
      privateKey: emailSettings.privateKey,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isManualRequester = formData.requesterId === 'manual';
    const selectedRequester = isManualRequester
      ? { id: 'manual', name: formData.requestedBy.trim(), email: formData.requesterEmail.trim() }
      : requesters.find((requester) => requester.id === formData.requesterId);

    if (!formData.requesterId || !selectedRequester) {
      showMessage('error', 'Please select a requester or choose manual entry');
      return;
    }

    if (isManualRequester && (!formData.requestedBy.trim() || !formData.requesterEmail.trim())) {
      showMessage('error', 'Please enter requester name and email');
      return;
    }

    if (submissionMode === 'single' && (!formData.supplier || !formData.supplierSapCode || !formData.standardPrice || !formData.partName || !formData.priceEffectiveDate || !formData.unit || (formData.isPack && !formData.packQuantity) || !selectedFile)) {
      showMessage('error', 'Please fill in all required fields and upload a part image');
      return;
    }

    if (submissionMode === 'bulk' && !applicationFile) {
      showMessage('error', 'Please upload the bulk application file');
      return;
    }

    setIsSubmitting(true);

    try {
      if (submissionMode === 'bulk') {
        if (!applicationFile || !applicationFile.name.toLowerCase().endsWith('.csv')) {
          throw new Error('Bulk upload currently supports CSV files generated from the template.');
        }

        const rows = await parseBulkApplicationFile(applicationFile);
        const uploadedFileUrl = await FirebaseService.uploadApplicationAttachment(applicationFile, `BULK-${Date.now()}`);
        const createdApplications: PartApplication[] = [];

        for (const [index, row] of rows.entries()) {
          const applicationId = generateApplicationId(index);
          const newApplication: PartApplication = {
            ...formData,
            ...row,
            id: applicationId,
            requestedBy: selectedRequester.name,
            requesterName: selectedRequester.name,
            requesterEmail: selectedRequester.email,
            submittedAt: new Date().toISOString(),
            status: 'pending',
            imageUrl: '',
            applicationFileUrl: uploadedFileUrl,
            applicationFileName: applicationFile.name,
          };

          await FirebaseService.savePartApplication(newApplication);
          createdApplications.push(newApplication);
        }

        let emailWarning = '';
        try {
          await sendSubmissionEmail({
            ...createdApplications[0],
            id: `${createdApplications[0].id} - ${createdApplications[createdApplications.length - 1].id}`,
            supplier: `Bulk upload (${createdApplications.length} applications)`,
            supplierSapCode: 'Multiple',
            standardPrice: 'Multiple',
            partName: 'Multiple',
            priceEffectiveDate: 'Multiple',
            unit: 'Multiple',
            isPack: false,
            packQuantity: '',
            specifications: `Bulk upload file: ${applicationFile.name}`,
          }, uploadedFileUrl);
        } catch (emailError) {
          console.error('Bulk submission email failed:', emailError);
          emailWarning = ` Email failed: ${emailError instanceof Error ? emailError.message : 'Unknown EmailJS error'}`;
        }

        await loadApplications();
        showMessage(emailWarning ? 'error' : 'success', `${createdApplications.length} part applications submitted from bulk upload.${emailWarning}`);
        resetForm();
        return;
      }

      const applicationId = generateApplicationId();
      const imageUrl = selectedFile ? await FirebaseService.uploadPartApplicationImage(selectedFile, applicationId) : '';

      const newApplication: PartApplication = {
        ...formData,
        id: applicationId,
        requestedBy: selectedRequester.name,
        requesterName: selectedRequester.name,
        requesterEmail: selectedRequester.email,
        submittedAt: new Date().toISOString(),
        status: 'pending',
        imageUrl,
        applicationFileUrl: '',
        applicationFileName: ''
      };

      await FirebaseService.savePartApplication(newApplication);
      let emailWarning = '';
      try {
        await sendSubmissionEmail(newApplication);
      } catch (emailError) {
        console.error('Submission email failed:', emailError);
        emailWarning = ` Email failed: ${emailError instanceof Error ? emailError.message : 'Unknown EmailJS error'}`;
      }
      await loadApplications();
      showMessage(emailWarning ? 'error' : 'success', `Part application ${applicationId} submitted successfully!${emailWarning}`);
      resetForm();

    } catch (error) {
      console.error('Error submitting application:', error);
      showMessage('error', error instanceof Error ? error.message : 'Failed to submit part application');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInlinePartCodeSave = async (application: PartApplication) => {
    const code = (partCodeDrafts[application.id] || '').trim();
    if (!code) {
      showMessage('error', 'Please enter a part code');
      return;
    }
    setIsSubmitting(true);
    try {
      const partImageUrl = await FirebaseService.approvePartApplication(application.id, code);
      let emailWarning = '';
      if (application.requesterEmail) {
        try {
          await EmailService.sendApplicationEmail({
            emailType: 'part_code_completed',
            toEmail: application.requesterEmail,
            requesterName: application.requesterName || application.requestedBy,
            requesterEmail: application.requesterEmail,
            applicationId: application.id,
            supplier: application.supplier,
            supplierSapCode: application.supplierSapCode || '',
            standardPrice: application.standardPrice,
            specifications: application.specifications,
            notes: application.notes,
            partCode: code,
            imageUrl: partImageUrl || application.imageUrl,
            partName: application.partName,
            priceEffectiveDate: application.priceEffectiveDate,
            unit: application.unit,
            isPack: application.isPack,
            packQuantity: application.packQuantity,
            applicationFileUrl: application.applicationFileUrl,
            submittedAt: application.submittedAt,
            subjectPrefix: emailSettings.subjectPrefix,
            serviceId: emailSettings.serviceId,
            publicKey: emailSettings.publicKey,
            privateKey: emailSettings.privateKey,
          });
        } catch (emailError) {
          console.error('Part code completion email failed:', emailError);
          emailWarning = ` Email failed: ${emailError instanceof Error ? emailError.message : 'Unknown EmailJS error'}`;
        }
      }
      await loadApplications();
      setPartCodeDrafts((prev) => ({ ...prev, [application.id]: '' }));
      showMessage(emailWarning ? 'error' : 'success', `Application ${application.id} completed with part code ${code}.${emailWarning}`);
    } catch (error) {
      console.error('Error saving part code:', error);
      showMessage('error', 'Failed to save part code');
    } finally {
      setIsSubmitting(false);
    }
  };

  const downloadTemplate = () => {
    const content = [
      'Preferred Supplier,Preferred Supplier SAP Code,Standard Price,Part Name,Price Effective Date,Unit,Is Pack,Pack Quantity,Specifications,Notes',
      'Example Supplier,SAP12345,100.00,Example part name,2026-06-18,PCS,yes,10,Example specification,Example note'
    ].join('\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'part-application-template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  const handleApprove = async () => {
    if (!approveDialog.application || !partCode.trim()) {
      showMessage('error', 'Please enter a part code');
      return;
    }

    setIsSubmitting(true);
    try {
      let replacementImageUrl = '';
      if (partCodeImage) {
        replacementImageUrl = await FirebaseService.uploadPartImageWithCode(partCodeImage, partCode.trim());
      }

      await FirebaseService.approvePartApplication(
        approveDialog.application.id,
        partCode.trim(),
        replacementImageUrl,
      );

      showMessage('success', `Application ${approveDialog.application.id} approved with part code ${partCode}. Image saved to the parts catalogue as ${partCode}.png.`);

      await loadApplications();

      setApproveDialog({ open: false, application: null });
      setPartCode('');
      setPartCodeImage(null);
      setPartCodeImagePreview(null);
    } catch (error) {
      console.error('Error approving application:', error);
      showMessage('error', 'Failed to approve application');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!rejectDialog.application) {
      return;
    }

    const reason = rejectionReason.trim();
    if (!reason) {
      showMessage('error', 'Please enter a rejection reason');
      return;
    }

    setIsSubmitting(true);
    try {
      await FirebaseService.rejectPartApplication(rejectDialog.application.id, reason);
      let emailWarning = '';
      if (rejectDialog.application.requesterEmail) {
        try {
          await EmailService.sendApplicationEmail({
            emailType: 'rejected',
            toEmail: rejectDialog.application.requesterEmail,
            requesterName: rejectDialog.application.requesterName || rejectDialog.application.requestedBy,
            requesterEmail: rejectDialog.application.requesterEmail,
            applicationId: rejectDialog.application.id,
            supplier: rejectDialog.application.supplier,
            supplierSapCode: rejectDialog.application.supplierSapCode || '',
            standardPrice: rejectDialog.application.standardPrice,
            partName: rejectDialog.application.partName,
            priceEffectiveDate: rejectDialog.application.priceEffectiveDate,
            unit: rejectDialog.application.unit,
            isPack: rejectDialog.application.isPack,
            packQuantity: rejectDialog.application.packQuantity,
            specifications: rejectDialog.application.specifications,
            notes: rejectDialog.application.notes,
            rejectionReason: reason,
            imageUrl: rejectDialog.application.imageUrl,
            submittedAt: rejectDialog.application.submittedAt,
            subjectPrefix: emailSettings.subjectPrefix,
            serviceId: emailSettings.serviceId,
            publicKey: emailSettings.publicKey,
            privateKey: emailSettings.privateKey,
          });
        } catch (emailError) {
          console.error('Rejection email failed:', emailError);
          emailWarning = ` Email failed: ${emailError instanceof Error ? emailError.message : 'Unknown EmailJS error'}`;
        }
      }

      await loadApplications();
      setRejectDialog({ open: false, application: null });
      setRejectionReason('');
      showMessage(emailWarning ? 'error' : 'success', `Application ${rejectDialog.application.id} rejected.${emailWarning}`);
    } catch (error) {
      console.error('Error rejecting application:', error);
      showMessage('error', 'Failed to reject application');
    } finally {
      setIsSubmitting(false);
    }
  };

  const downloadPDF = async (application: PartApplication) => {
    try {
      setIsSubmitting(true);

      // Convert to the expected PartApplication format from types/index.ts
      const pdfApplication = {
        ticket_id: application.id,
        supplier_name: application.supplier || 'N/A',
        part_description: application.specifications || application.partName,
        part_number: application.partCode || `APP-${application.id}`,
        part_name: application.partName,
        price_effective_date: application.priceEffectiveDate,
        unit: application.unit,
        is_pack: application.isPack,
        pack_quantity: application.packQuantity,
        supplier_sap_code: application.supplierSapCode,
        requester_email: application.requesterEmail,
        rejection_reason: application.rejectionReason,
        requested_by: application.requesterName || application.requestedBy,
        department: application.department,
        urgency: application.priority,
        technical_specs: application.specifications,
        application_notes: application.notes,
        estimated_cost: parseFloat(application.standardPrice) || 0,
        justification: 'Part application request',
        status: application.status,
        created_at: new Date(application.submittedAt).getTime(),
        image_url: application.imageUrl, // Ensure image URL is included
        part_code: application.partCode
      };

      await PDFService.generateApplicationPDF(pdfApplication);
      showMessage('success', 'PDF downloaded successfully');
    } catch (error) {
      console.error('Error generating PDF:', error);
      showMessage('error', 'Failed to generate PDF');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'pending': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const pendingApplications = applications.filter((app) => app.status === 'pending');
  const approvedApplications = applications.filter((app) => app.status === 'approved');
  const visibleApplications = applicationStatusFilter === 'all'
    ? applications
    : applications.filter((app) => app.status === applicationStatusFilter);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Part Application</h1>
        <p className="text-gray-600 mt-1">Submit requests for new automotive parts</p>
      </div>

      {/* Message Alert */}
      {message && (
        <Alert className={message.type === 'success' ? 'border-green-500' : 'border-red-500'}>
          <AlertDescription className={message.type === 'success' ? 'text-green-700' : 'text-red-700'}>
            {message.text}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Application Form */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <FileText className="h-5 w-5" />
                <span>New Part Application</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="requester">Requester *</Label>
                  <Select value={formData.requesterId} onValueChange={(value) => {
                    const requester = requesters.find((item) => item.id === value);
                    setFormData(prev => ({
                      ...prev,
                      requesterId: value,
                      requestedBy: value === 'manual' ? prev.requestedBy : requester?.name || '',
                      requesterEmail: value === 'manual' ? prev.requesterEmail : requester?.email || ''
                    }));
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder={requesters.length ? 'Select requester' : 'Select requester or enter manually'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual entry</SelectItem>
                      {requesters.map((requester) => (
                        <SelectItem key={requester.id} value={requester.id}>
                          {requester.name} ({requester.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {formData.requesterId === 'manual' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                      <div>
                        <Label htmlFor="manualRequesterName">Requester Name *</Label>
                        <Input
                          id="manualRequesterName"
                          value={formData.requestedBy}
                          onChange={(e) => setFormData(prev => ({ ...prev, requestedBy: e.target.value }))}
                          placeholder="Enter requester name"
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="manualRequesterEmail">Requester Email *</Label>
                        <Input
                          id="manualRequesterEmail"
                          type="email"
                          value={formData.requesterEmail}
                          onChange={(e) => setFormData(prev => ({ ...prev, requesterEmail: e.target.value }))}
                          placeholder="name@example.com"
                          required
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 rounded-lg border p-2">
                  <Button
                    type="button"
                    variant={submissionMode === 'single' ? 'default' : 'outline'}
                    onClick={() => setSubmissionMode('single')}
                  >
                    Single Application
                  </Button>
                  <Button
                    type="button"
                    variant={submissionMode === 'bulk' ? 'default' : 'outline'}
                    onClick={() => setSubmissionMode('bulk')}
                  >
                    Bulk Upload
                  </Button>
                </div>

                {submissionMode === 'single' ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="supplier">Preferred Supplier *</Label>
                        <Input
                          id="supplier"
                          value={formData.supplier}
                          onChange={(e) => setFormData(prev => ({ ...prev, supplier: e.target.value }))}
                          placeholder="Enter supplier name"
                          required={submissionMode === 'single'}
                        />
                      </div>

                      <div>
                        <Label htmlFor="supplierSapCode">Preferred Supplier SAP Code *</Label>
                        <Input
                          id="supplierSapCode"
                          value={formData.supplierSapCode}
                          onChange={(e) => setFormData(prev => ({ ...prev, supplierSapCode: e.target.value }))}
                          placeholder="Enter supplier SAP code"
                          required={submissionMode === 'single'}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor="standardPrice">Standard Price *</Label>
                        <Input
                          id="standardPrice"
                          type="number"
                          step="0.01"
                          value={formData.standardPrice}
                          onChange={(e) => setFormData(prev => ({ ...prev, standardPrice: e.target.value }))}
                          placeholder="Enter standard price"
                          required={submissionMode === 'single'}
                        />
                      </div>

                      <div>
                        <Label htmlFor="partName">Part Name *</Label>
                        <Input
                          id="partName"
                          value={formData.partName}
                          onChange={(e) => setFormData(prev => ({ ...prev, partName: e.target.value }))}
                          placeholder="Enter part name"
                          required={submissionMode === 'single'}
                        />
                      </div>

                      <div>
                        <Label htmlFor="priceEffectiveDate">Price Effective Date *</Label>
                        <Input
                          id="priceEffectiveDate"
                          type="date"
                          value={formData.priceEffectiveDate}
                          onChange={(e) => setFormData(prev => ({ ...prev, priceEffectiveDate: e.target.value }))}
                          required={submissionMode === 'single'}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 rounded-lg border p-3">
                      <div>
                        <Label htmlFor="unit">Unit *</Label>
                        <Input
                          id="unit"
                          value={formData.unit}
                          onChange={(e) => setFormData(prev => ({ ...prev, unit: e.target.value }))}
                          placeholder="e.g. PCS, SET, M"
                          required={submissionMode === 'single'}
                        />
                      </div>

                      <label htmlFor="isPack" className="flex items-center gap-2 pt-6 text-sm font-medium">
                        <input
                          id="isPack"
                          type="checkbox"
                          checked={formData.isPack}
                          onChange={(e) => setFormData(prev => ({
                            ...prev,
                            isPack: e.target.checked,
                            packQuantity: e.target.checked ? prev.packQuantity : ''
                          }))}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        Is Pack?
                      </label>

                      {formData.isPack && (
                        <div>
                          <Label htmlFor="packQuantity">Pack Quantity *</Label>
                          <Input
                            id="packQuantity"
                            type="number"
                            min="0"
                            step="1"
                            value={formData.packQuantity}
                            onChange={(e) => setFormData(prev => ({ ...prev, packQuantity: e.target.value }))}
                            placeholder={`How many ${formData.unit || 'units'} per pack`}
                            required={submissionMode === 'single' && formData.isPack}
                          />
                          <p className="mt-1 text-xs text-gray-500">1 pack = {formData.packQuantity || '?'} {formData.unit || 'unit'}</p>
                        </div>
                      )}
                    </div>

                    <div>
                      <Label htmlFor="specifications">Specifications</Label>
                      <Textarea
                        id="specifications"
                        value={formData.specifications}
                        onChange={(e) => setFormData(prev => ({ ...prev, specifications: e.target.value }))}
                        placeholder="Describe the part specifications and requirements"
                        rows={3}
                      />
                    </div>

                    <div>
                      <Label htmlFor="image">Part Image *</Label>
                      <div className="space-y-3">
                        <Input
                          id="image"
                          type="file"
                          accept="image/*"
                          onChange={handleFileSelect}
                          required={submissionMode === 'single'}
                        />
                        {imagePreview && (
                          <div className="border rounded-lg p-3">
                            <img
                              src={imagePreview}
                              alt="Part preview"
                              className="max-w-full max-h-40 object-contain mx-auto"
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="notes">Additional Notes</Label>
                      <Textarea
                        id="notes"
                        value={formData.notes}
                        onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                        placeholder="Any additional information or special requirements"
                        rows={2}
                      />
                    </div>
                  </>
                ) : (
                  <div className="space-y-3 rounded-lg border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <Label htmlFor="applicationFile">Bulk Application File *</Label>
                        <p className="text-xs text-gray-500">Use this instead of filling a single application. CSV rows become separate applications for the selected requester.</p>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
                        <Download className="h-4 w-4 mr-2" />
                        Download Template
                      </Button>
                    </div>
                    <Input
                      id="applicationFile"
                      type="file"
                      accept=".csv"
                      onChange={(e) => setApplicationFile(e.target.files?.[0] || null)}
                      required={submissionMode === 'bulk'}
                    />
                    {applicationFile && <p className="text-xs text-gray-500 mt-1">Selected: {applicationFile.name}</p>}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full"
                >
                  {isSubmitting ? (
                    <>
                      <LoadingSpinner size="sm" />
                      <span className="ml-2">Submitting...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Submit Application
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Application List */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Application List</span>
                <Badge variant="secondary">{visibleApplications.length} shown</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => setApplicationStatusFilter(applicationStatusFilter === 'pending' ? 'all' : 'pending')}
                  className={`rounded-lg border p-3 text-left transition ${applicationStatusFilter === 'pending' ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'}`}
                >
                  <p className="text-xs text-blue-700">Pending</p>
                  <p className="text-xl font-bold text-blue-700">{pendingApplications.length}</p>
                </button>
                <button
                  type="button"
                  onClick={() => setApplicationStatusFilter(applicationStatusFilter === 'approved' ? 'all' : 'approved')}
                  className={`rounded-lg border p-3 text-left transition ${applicationStatusFilter === 'approved' ? 'border-green-500 bg-green-50' : 'hover:bg-gray-50'}`}
                >
                  <p className="text-xs text-green-700">Approved</p>
                  <p className="text-xl font-bold text-green-700">{approvedApplications.length}</p>
                </button>
              </div>

              {loading ? (
                <div className="text-center py-8">
                  <LoadingSpinner size="md" />
                  <p className="text-gray-500 mt-2">Loading applications...</p>
                </div>
              ) : visibleApplications.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <FileText className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                  <p>{applications.length === 0 ? 'No applications yet' : `No ${applicationStatusFilter} applications`}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {visibleApplications.map((app) => (
                    <div key={app.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="font-mono text-sm font-bold text-blue-600">
                          {app.id}
                        </div>
                        <div className="flex items-center space-x-2">
                          <Badge variant="outline" className={getStatusColor(app.status)}>
                            {app.status}
                          </Badge>
                          {app.partCode && (
                            <Badge variant="outline" className="bg-green-50 text-green-700">
                              {app.partCode}
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="text-xs text-gray-600">
                        <p><strong>Requested by:</strong> {app.requesterName || app.requestedBy}</p>
                        <p><strong>Email:</strong> {app.requesterEmail || 'N/A'}</p>
                        <p><strong>Supplier:</strong> {app.supplier}</p>
                        <p><strong>Supplier SAP Code:</strong> {app.supplierSapCode || 'N/A'}</p>
                        <p><strong>Standard Price:</strong> ${app.standardPrice}</p>
                        <p><strong>Part Name:</strong> {app.partName || 'N/A'}</p>
                        <p><strong>Price Effective Date:</strong> {app.priceEffectiveDate || 'N/A'}</p>
                        <p><strong>Unit:</strong> {app.unit || 'N/A'}</p>
                        <p><strong>Is Pack:</strong> {app.isPack ? `Yes (${app.packQuantity || '-'} ${app.unit || 'unit'} per pack)` : 'No'}</p>
                        {app.rejectionReason && <p><strong>Reject Reason:</strong> {app.rejectionReason}</p>}
                      </div>

                      {app.applicationFileUrl && (
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span>Application: {app.applicationFileName || 'uploaded file'}</span>
                          <Button variant="ghost" size="sm" onClick={() => window.open(app.applicationFileUrl, '_blank', 'noopener,noreferrer')} className="h-6 px-2 text-xs">
                            <Download className="h-3 w-3 mr-1" />
                            Open
                          </Button>
                        </div>
                      )}

                      {app.imageUrl && (
                        <div className="rounded-lg border bg-gray-50 p-2">
                          <img
                            src={app.imageUrl}
                            alt={`${app.partName || app.id} image`}
                            className="h-28 w-full rounded-md object-contain bg-white"
                          />
                          <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                            <div className="flex items-center space-x-1">
                              <Image className="h-3 w-3" />
                              <span>Image preview</span>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => downloadImage(app.imageUrl!, `${app.partCode || app.id}.png`)}
                              className="h-6 px-2 text-xs"
                            >
                              <Download className="h-3 w-3 mr-1" />
                              Open
                            </Button>
                          </div>
                        </div>
                      )}

                      {app.status === 'pending' && (
                        <div className="flex gap-2">
                          <Input
                            value={partCodeDrafts[app.id] || ''}
                            onChange={(e) => setPartCodeDrafts((prev) => ({ ...prev, [app.id]: e.target.value }))}
                            placeholder="Enter part code"
                            className="h-8 text-xs"
                          />
                          <Button size="sm" onClick={() => handleInlinePartCodeSave(app)} disabled={isSubmitting}>
                            Save
                          </Button>
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className={getPriorityColor(app.priority)}>
                          {app.priority} priority
                        </Badge>

                        <div className="flex space-x-1">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm">
                                <Eye className="h-3 w-3" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                              <DialogHeader>
                                <DialogTitle>Application Details - {app.id}</DialogTitle>
                                <DialogDescription>
                                  View complete application information and part image
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                  <div><strong>Requested by:</strong> {app.requestedBy}</div>
                                  <div><strong>Department:</strong> {app.department}</div>
                                  <div><strong>Priority:</strong> {app.priority}</div>
                                  <div><strong>Supplier:</strong> {app.supplier}</div>
                                  <div><strong>Standard Price:</strong> ${app.standardPrice}</div>
                                  <div><strong>Part Name:</strong> {app.partName || 'N/A'}</div>
                                  <div><strong>Price Effective Date:</strong> {app.priceEffectiveDate || 'N/A'}</div>
                                  <div><strong>Unit:</strong> {app.unit || 'N/A'}</div>
                                  <div><strong>Is Pack:</strong> {app.isPack ? `Yes (${app.packQuantity || '-'} ${app.unit || 'unit'} per pack)` : 'No'}</div>
                                  <div><strong>Status:</strong> {app.status}</div>
                                </div>
                                <div><strong>Specifications:</strong> {app.specifications}</div>
                                {app.notes && <div><strong>Notes:</strong> {app.notes}</div>}
                                {app.rejectionReason && <div><strong>Reject Reason:</strong> {app.rejectionReason}</div>}
                                {app.applicationFileUrl && (
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span>Application: {app.applicationFileName || 'uploaded file'}</span>
                          <Button variant="ghost" size="sm" onClick={() => window.open(app.applicationFileUrl, '_blank', 'noopener,noreferrer')} className="h-6 px-2 text-xs">
                            <Download className="h-3 w-3 mr-1" />
                            Open
                          </Button>
                        </div>
                      )}

                      {app.imageUrl && (
                                  <div>
                                    <strong>Part Image:</strong>
                                    <div className="mt-2 space-y-2">
                                      <img
                                        src={app.imageUrl}
                                        alt="Part image"
                                        className="max-w-full max-h-60 object-contain border rounded"
                                      />
                                      <div className="flex space-x-2">
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => downloadImage(app.imageUrl!, `${app.id}.png`)}
                                        >
                                          <Download className="h-4 w-4 mr-2" />
                                          Open Image
                                        </Button>
                                        <p className="text-xs text-gray-500 flex items-center">
                                          Right-click image → "Save image as..." if download doesn't work
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                )}
                                <div className="text-xs text-gray-500">
                                  Submitted: {new Date(app.submittedAt).toLocaleString()}
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>

                          {app.status === 'pending' && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setApproveDialog({ open: true, application: app })}
                                className="text-green-600 hover:text-green-700"
                              >
                                <CheckCircle className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setRejectDialog({ open: true, application: app });
                                  setRejectionReason('');
                                }}
                                className="text-red-600 hover:text-red-700"
                              >
                                <XCircle className="h-3 w-3" />
                              </Button>
                            </>
                          )}

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => downloadPDF(app)}
                            disabled={isSubmitting}
                          >
                            <Download className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Approve Dialog */}
      <Dialog open={approveDialog.open} onOpenChange={(open) => setApproveDialog({ open, application: null })}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Approve Application - {approveDialog.application?.id}</DialogTitle>
            <DialogDescription>
              Enter the part code and optionally upload the image with the part code name.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="partCode">Part Code *</Label>
              <Input
                id="partCode"
                value={partCode}
                onChange={(e) => setPartCode(e.target.value)}
                placeholder="Enter part code (e.g., ABC123)"
                required
              />
            </div>

            {approveDialog.application?.imageUrl && (
              <div className="space-y-2">
                <Label>Original Image</Label>
                <div className="flex items-center justify-between p-2 border rounded">
                  <span className="text-sm text-gray-600">Open original image in new tab</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => downloadImage(approveDialog.application!.imageUrl!, `${approveDialog.application!.id}.png`)}
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Open
                  </Button>
                </div>
                <p className="text-xs text-gray-500">
                  Tip: Right-click the image and select "Save image as..." to save it with the part code name
                </p>
              </div>
            )}

            <div>
              <Label htmlFor="partCodeImage">Replace Approved Part Image (Optional)</Label>
              <Input
                id="partCodeImage"
                type="file"
                accept="image/*"
                onChange={handlePartCodeImageSelect}
                className="mt-1"
              />
              {partCodeImagePreview && (
                <div className="mt-2 border rounded-lg p-2">
                  <img
                    src={partCodeImagePreview}
                    alt="Part code image preview"
                    className="max-w-full max-h-32 object-contain mx-auto"
                  />
                </div>
              )}
              <p className="text-xs text-gray-500 mt-1">
                This image will be saved as {partCode || 'partCode'}.png
              </p>
            </div>

            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => {
                  setApproveDialog({ open: false, application: null });
                  setPartCode('');
                  setPartCodeImage(null);
                  setPartCodeImagePreview(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleApprove}
                disabled={isSubmitting || !partCode.trim()}
              >
                {isSubmitting ? (
                  <>
                    <LoadingSpinner size="sm" />
                    <span className="ml-2">Approving...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Approve Application
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialog.open} onOpenChange={(open) => {
        setRejectDialog({ open, application: open ? rejectDialog.application : null });
        if (!open) setRejectionReason('');
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Reject Application - {rejectDialog.application?.id}</DialogTitle>
            <DialogDescription>
              Enter the rejection reason. The requester will receive this reason by email.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="rejectionReason">Rejection Reason *</Label>
              <Textarea
                id="rejectionReason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Explain why this application is rejected"
                rows={4}
                required
              />
            </div>
            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => {
                  setRejectDialog({ open: false, application: null });
                  setRejectionReason('');
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={isSubmitting || !rejectionReason.trim()}
              >
                {isSubmitting ? (
                  <>
                    <LoadingSpinner size="sm" />
                    <span className="ml-2">Rejecting...</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 mr-2" />
                    Reject Application
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
