import React, { useState, useEffect } from 'react';
import { FileText, Download, Plus, Eye, CheckCircle, Image, XCircle, AlertTriangle, Printer, Trash2 } from 'lucide-react';
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
import { Part } from '@/types';

interface PartApplication {
  id: string;
  requestedBy: string;
  department: string;
  priority: 'low' | 'medium' | 'high';
  specifications: string;
  supplier: string;
  standardPrice: string;
  isPrototypePricePending?: boolean;
  estimatedPrice?: string;
  prototypePriceReminderSentAt?: string;
  partName: string;
  priceEffectiveDate: string;
  leadingTime: string;
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
  supplierPartCode?: string;
  wholesalePrice?: string;
  retailPrice?: string;
  applicationFileUrl?: string;
  applicationFileName?: string;
  managerApprovalFileUrl?: string;
  managerApprovalFileName?: string;
  applicationType?: 'single' | 'van_code' | 'price_supplier_change';
  isSalesItem?: boolean;
  vanCodeType?: 'semivan' | 'finished_goods' | '';
  purchasingOrganization?: string;
  priceBreaks?: PriceBreakRow[];
  previousPriceBreaks?: PriceBreakRow[];
  originalSupplier?: string;
  originalSupplierSapCode?: string;
  originalSupplierPartCode?: string;
  originalWholesalePrice?: string;
  originalRetailPrice?: string;
  originalPrice?: string;
  newSupplier?: string;
  newPrice?: string;
  minimumOrderQuantity?: string;
  changeField?: PriceSupplierChangeField;
  priceChangeDirection?: 'increase' | 'decrease' | '';
  rejectionReason?: string;
  rejectedAt?: string;
}

type PriceSupplierChangeField = '' | 'partName' | 'supplier' | 'price' | 'priceBreaks' | 'leadingTime' | 'retailPrice' | 'wholesalePrice' | 'standardPrice' | 'unit' | 'isPack';

interface PriceBreakRow {
  id: string;
  quantityOver: string;
  netPriceAud: string;
}

interface VanCodeApplicationRow {
  id: string;
  vanCodeType: 'semivan' | 'finished_goods' | '';
  partName: string;
  priceEffectiveDate: string;
  estimatedPrice: string;
}

const todayDateString = () => new Date().toISOString().slice(0, 10);

interface ApplicationRequester {
  id: string;
  name: string;
  email: string;
}

interface ApplicationEmailSettings {
  notifyEmail: string;
  pricePendingNotifyEmail?: string;
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
  const [priceBreakRows, setPriceBreakRows] = useState<PriceBreakRow[]>([{ id: crypto.randomUUID(), quantityOver: '', netPriceAud: '' }]);
  const [previousPriceBreakRows, setPreviousPriceBreakRows] = useState<PriceBreakRow[]>([{ id: crypto.randomUUID(), quantityOver: '', netPriceAud: '' }]);
  const [vanCodeRows, setVanCodeRows] = useState<VanCodeApplicationRow[]>([{ id: crypto.randomUUID(), vanCodeType: '', partName: '', priceEffectiveDate: todayDateString(), estimatedPrice: '' }]);
  const [managerApprovalFile, setManagerApprovalFile] = useState<File | null>(null);
  const [partCodeDrafts, setPartCodeDrafts] = useState<Record<string, string>>({});
  const [submissionMode, setSubmissionMode] = useState<'single' | 'van_code' | 'price_supplier_change'>('single');
  const [applicationStatusFilter, setApplicationStatusFilter] = useState<'all' | 'pending' | 'approved' | 'prototype_price_pending' | 'price_supplier_change'>('pending');
  const [prototypePassword, setPrototypePassword] = useState('');
  const [foundPart, setFoundPart] = useState<Part | null>(null);
  const [isLookingUpPart, setIsLookingUpPart] = useState(false);
  const [partLookupStatus, setPartLookupStatus] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    requesterId: '',
    requestedBy: '',
    department: '',
    priority: 'medium' as 'low' | 'medium' | 'high',
    specifications: '',
    partCode: '',
    purchasingOrganization: 'Snowy River Pty Ltd',
    applicationType: 'single' as 'single' | 'van_code' | 'price_supplier_change',
    isSalesItem: false,
    vanCodeType: '' as 'semivan' | 'finished_goods' | '',
    originalSupplier: '',
    originalSupplierSapCode: '',
    originalSupplierPartCode: '',
    originalWholesalePrice: '',
    originalRetailPrice: '',
    originalPrice: '',
    newSupplier: '',
    newPrice: '',
    minimumOrderQuantity: '',
    changeField: '' as PriceSupplierChangeField,
    priceChangeDirection: '' as 'increase' | 'decrease' | '',
    supplier: '',
    supplierSapCode: '',
    supplierPartCode: '',
    wholesalePrice: '',
    retailPrice: '',
    standardPrice: '',
    isPrototypePricePending: false,
    estimatedPrice: '',
    partName: '',
    priceEffectiveDate: '',
    leadingTime: '',
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

  useEffect(() => {
    checkPrototypePricePendingReminders();
  }, [applications, emailSettings.pricePendingNotifyEmail]);

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
      partCode: '',
      purchasingOrganization: 'Snowy River Pty Ltd',
      applicationType: 'single',
      isSalesItem: false,
      vanCodeType: '',
      originalSupplier: '',
      originalSupplierSapCode: '',
      originalSupplierPartCode: '',
      originalWholesalePrice: '',
      originalRetailPrice: '',
      originalPrice: '',
      newSupplier: '',
      newPrice: '',
      minimumOrderQuantity: '',
      changeField: '' as PriceSupplierChangeField,
      priceChangeDirection: '' as 'increase' | 'decrease' | '',
      supplier: '',
      supplierSapCode: '',
      supplierPartCode: '',
      wholesalePrice: '',
      retailPrice: '',
      standardPrice: '',
      isPrototypePricePending: false,
      estimatedPrice: '',
      partName: '',
      priceEffectiveDate: '',
      leadingTime: '',
      unit: '',
      isPack: false,
      packQuantity: '',
      notes: '',
      requesterEmail: ''
    });
    setSelectedFile(null);
    setImagePreview(null);
    setPriceBreakRows([{ id: crypto.randomUUID(), quantityOver: '', netPriceAud: '' }]);
    setPreviousPriceBreakRows([{ id: crypto.randomUUID(), quantityOver: '', netPriceAud: '' }]);
    setVanCodeRows([{ id: crypto.randomUUID(), vanCodeType: '', partName: '', priceEffectiveDate: todayDateString(), estimatedPrice: '' }]);
    setManagerApprovalFile(null);
    setSubmissionMode('single');
    setPrototypePassword('');
    setFoundPart(null);
    setPartLookupStatus('');
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

  const checkPrototypePricePendingReminders = async () => {
    if (!emailSettings.pricePendingNotifyEmail || applications.length === 0) return;

    const now = Date.now();
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
    const overdueApplications = applications.filter((application) => {
      const submittedTime = new Date(application.submittedAt).getTime();
      return application.isPrototypePricePending
        && !application.standardPrice
        && !application.prototypePriceReminderSentAt
        && Number.isFinite(submittedTime)
        && now - submittedTime >= fourteenDaysMs;
    });

    for (const application of overdueApplications) {
      try {
        const reminderSentAt = new Date().toISOString();
        await EmailService.sendApplicationEmail({
          emailType: 'price_pending_reminder',
          toEmail: emailSettings.pricePendingNotifyEmail,
          requesterName: application.requesterName || application.requestedBy,
          requesterEmail: application.requesterEmail || '',
          applicationId: application.id,
          supplier: application.supplier,
          supplierSapCode: application.supplierSapCode || '',
          supplierPartCode: application.supplierPartCode || '',
          wholesalePrice: application.wholesalePrice || '',
          retailPrice: application.retailPrice || '',
          standardPrice: application.standardPrice,
          isPrototypePricePending: application.isPrototypePricePending,
          estimatedPrice: application.estimatedPrice,
          partCode: application.partCode,
          partName: application.partName,
          priceEffectiveDate: application.priceEffectiveDate,
          leadingTime: application.leadingTime,
          unit: application.unit,
          isPack: application.isPack,
          packQuantity: application.packQuantity,
          specifications: application.specifications,
          notes: `${application.notes || ''}\n\nPrototype price pending has not been maintained 14 days after submission.`.trim(),
          applicationFileUrl: application.applicationFileUrl,
          imageUrl: application.imageUrl,
          submittedAt: application.submittedAt,
          subjectPrefix: emailSettings.subjectPrefix,
          serviceId: emailSettings.serviceId,
          publicKey: emailSettings.publicKey,
          privateKey: emailSettings.privateKey,
        });
        await FirebaseService.savePartApplication({ ...application, prototypePriceReminderSentAt: reminderSentAt });
        setApplications((prev) => prev.map((item) => item.id === application.id ? { ...item, prototypePriceReminderSentAt: reminderSentAt } : item));
      } catch (error) {
        console.error('Prototype price pending reminder failed:', error);
      }
    }
  };

  const sendSubmissionEmail = async (application: PartApplication, applicationFileUrl = '', managerApprovalFileUrl = application.managerApprovalFileUrl || '') => {
    if (!emailSettings.notifyEmail) return;

    await EmailService.sendApplicationEmail({
      emailType: 'submitted',
      toEmail: emailSettings.notifyEmail,
      requesterName: application.requesterName || application.requestedBy,
      requesterEmail: application.requesterEmail || '',
      applicationId: application.id,
      supplier: application.supplier,
      supplierSapCode: application.supplierSapCode || '',
      supplierPartCode: application.supplierPartCode || '',
      wholesalePrice: application.wholesalePrice || '',
      retailPrice: application.retailPrice || '',
      standardPrice: application.standardPrice,
      isPrototypePricePending: application.isPrototypePricePending,
      estimatedPrice: application.estimatedPrice,
      partName: application.partName,
      priceEffectiveDate: application.priceEffectiveDate,
      leadingTime: application.leadingTime,
      unit: application.unit,
      isPack: application.isPack,
      packQuantity: application.packQuantity,
      specifications: application.specifications,
      notes: application.notes,
      applicationType: application.applicationType,
      isSalesItem: application.isSalesItem,
      vanCodeType: application.vanCodeType,
      originalSupplier: application.originalSupplier,
      originalPrice: application.originalPrice,
      newSupplier: application.newSupplier,
      newPrice: application.newPrice,
      applicationFileUrl,
      managerApprovalFileUrl,
      imageUrl: application.imageUrl,
      submittedAt: application.submittedAt,
      subjectPrefix: emailSettings.subjectPrefix,
      serviceId: emailSettings.serviceId,
      publicKey: emailSettings.publicKey,
      privateKey: emailSettings.privateKey,
    });
  };



  const lookupPartForChange = async (partCodeValue: string) => {
    const code = partCodeValue.trim();
    if (!code) {
      setFoundPart(null);
      setPartLookupStatus('');
      return;
    }

    setIsLookingUpPart(true);
    try {
      const part = await FirebaseService.getPartByMaterial(code);
      setFoundPart(part);
      if (part) {
        setPartLookupStatus('Part found in catalogue. Current details are shown below.');
        setFormData(prev => ({
          ...prev,
          partName: prev.changeField === 'partName' ? prev.partName : part.SPRAS_EN || prev.partName,
          supplier: prev.changeField === 'supplier' ? prev.supplier : prev.supplier,
          originalSupplier: part.Supplier_Name || prev.originalSupplier,
          originalPrice: part.Standard_Price !== undefined ? String(part.Standard_Price) : prev.originalPrice,
          originalRetailPrice: part.Customer_Price !== undefined ? String(part.Customer_Price) : prev.originalRetailPrice,
          originalWholesalePrice: part.Dealer_Price !== undefined ? String(part.Dealer_Price) : prev.originalWholesalePrice,
          unit: prev.changeField === 'unit' ? prev.unit : part.Sales_Unit || prev.unit,
        }));
      } else {
        setPartLookupStatus('Part not found in catalogue. Please fill previous price manually when changing Price.');
      }
    } catch (error) {
      console.error('Part lookup failed:', error);
      setFoundPart(null);
      setPartLookupStatus('Part lookup failed. Please try again or enter previous values manually.');
    } finally {
      setIsLookingUpPart(false);
    }
  };

  const standardPriceComparison = () => {
    const newPrice = Number(formData.standardPrice);
    const previousPrice = Number(foundPart?.Standard_Price ?? formData.originalPrice);
    if (!Number.isFinite(newPrice) || !Number.isFinite(previousPrice) || !formData.standardPrice || (!foundPart && !formData.originalPrice)) return '';
    if (newPrice > previousPrice) return 'increase';
    if (newPrice < previousPrice) return 'decrease';
    return 'decrease';
  };

  const requiresManagerApproval = () => {
    if (submissionMode !== 'price_supplier_change') return true;
    if (formData.changeField === 'supplier') return true;
    if (['retailPrice', 'wholesalePrice', 'standardPrice'].includes(formData.changeField)) return true;
    if (formData.changeField === 'price') return standardPriceComparison() === 'increase';
    if (formData.changeField === 'priceBreaks') return formData.priceChangeDirection === 'increase';
    return false;
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

    if (!formData.purchasingOrganization) {
      showMessage('error', 'Please select Purchasing Organization');
      return;
    }

    const priceBreaks = cleanPriceBreakRows(priceBreakRows);
    const previousPriceBreaks = cleanPriceBreakRows(previousPriceBreakRows);
    const hasIncompletePriceBreak = priceBreakRows.some((row) => (row.quantityOver.trim() || row.netPriceAud.trim()) && (!row.quantityOver.trim() || !row.netPriceAud.trim()));
    const hasIncompletePreviousPriceBreak = previousPriceBreakRows.some((row) => (row.quantityOver.trim() || row.netPriceAud.trim()) && (!row.quantityOver.trim() || !row.netPriceAud.trim()));

    if (hasIncompletePriceBreak || hasIncompletePreviousPriceBreak) {
      showMessage('error', 'Please complete both Quantity Over and Net Price AUD for each price break row, or clear the row');
      return;
    }

    if (submissionMode === 'single' && (!formData.minimumOrderQuantity || !formData.supplier || !formData.supplierSapCode || (!formData.standardPrice && !formData.isPrototypePricePending) || !formData.partName || !formData.priceEffectiveDate || !formData.leadingTime || !formData.unit || !formData.specifications || (formData.isPack && !formData.packQuantity) || (formData.isSalesItem && (!formData.wholesalePrice || !formData.retailPrice)) || !selectedFile)) {
      showMessage('error', 'Please fill in all required fields and upload a part image. Minimum Order Quantity is required. Wholesale Price and Retail Price are required for sales items.');
      return;
    }

    if (requiresManagerApproval() && !managerApprovalFile) {
      showMessage('error', 'Please upload the signed Manager Approval file');
      return;
    }

    if (submissionMode === 'van_code' && vanCodeRows.some((row) => !row.vanCodeType || !row.partName.trim() || !row.priceEffectiveDate || !row.estimatedPrice)) {
      showMessage('error', 'Please select Type and fill Part Name, Price Effective Date, and Estimated Price for every Van Code row');
      return;
    }

    if (submissionMode === 'price_supplier_change') {
      if (!formData.partCode || !formData.changeField) {
        showMessage('error', 'Please fill Part Code and select the content to change');
        return;
      }
      const missingChangeFields = [
        formData.changeField === 'partName' && !formData.partName ? 'Part Name' : '',
        formData.changeField === 'supplier' && (!formData.supplier || !formData.supplierSapCode) ? 'Supplier and Supplier Code' : '',
        formData.changeField === 'price' && (!formData.standardPrice || (!foundPart && !formData.originalPrice)) ? 'New Price and Previous Price' : '',
        formData.changeField === 'priceBreaks' && (priceBreaks.length === 0 || !formData.priceChangeDirection) ? 'Price Breaks and increase/decrease direction' : '',
        formData.changeField === 'retailPrice' && !formData.retailPrice ? 'Retail Price' : '',
        formData.changeField === 'wholesalePrice' && !formData.wholesalePrice ? 'Wholesale Price' : '',
        formData.changeField === 'standardPrice' && !formData.standardPrice ? 'Standard Price' : '',
        formData.changeField === 'leadingTime' && !formData.leadingTime ? 'Leading Time' : '',
        formData.changeField === 'unit' && !formData.unit ? 'Unit' : '',
        formData.changeField === 'isPack' && formData.isPack && !formData.packQuantity ? 'Pack Quantity' : '',
      ].filter(Boolean);
      if (missingChangeFields.length > 0) {
        showMessage('error', `Please fill required change field(s): ${missingChangeFields.join(', ')}`);
        return;
      }
    }

    setIsSubmitting(true);

    try {
      if (submissionMode === 'van_code') {
        const managerApprovalFileUrl = await FirebaseService.uploadApplicationAttachment(managerApprovalFile, `MANAGER-${Date.now()}`);
        const createdApplications: PartApplication[] = [];

        for (const [index, row] of vanCodeRows.entries()) {
          const applicationId = generateApplicationId(index);
          const newApplication: PartApplication = {
            ...formData,
            purchasingOrganization: formData.purchasingOrganization,
            priceBreaks: [],
            previousPriceBreaks: [],
            id: applicationId,
            applicationType: 'van_code',
            vanCodeType: row.vanCodeType,
            partName: row.partName.trim(),
            priceEffectiveDate: row.priceEffectiveDate,
            estimatedPrice: row.estimatedPrice,
            standardPrice: '',
            isPrototypePricePending: true,
            specifications: `${row.vanCodeType === 'finished_goods' ? 'Finished Goods' : row.vanCodeType === 'semivan' ? 'Semivan' : 'Unspecified'} van code application`,
            supplier: '',
            supplierSapCode: '',
            supplierPartCode: '',
            wholesalePrice: '',
            retailPrice: '',
            leadingTime: '',
            unit: '',
            isPack: false,
            packQuantity: '',
            requestedBy: selectedRequester.name,
            requesterName: selectedRequester.name,
            requesterEmail: selectedRequester.email,
            submittedAt: new Date().toISOString(),
            status: 'pending',
            imageUrl: '',
            applicationFileUrl: '',
            applicationFileName: '',
            managerApprovalFileUrl,
            managerApprovalFileName: managerApprovalFile.name,
          };

          await FirebaseService.savePartApplication(newApplication);
          createdApplications.push(newApplication);
        }

        let emailWarning = '';
        try {
          await sendSubmissionEmail({
            ...createdApplications[0],
            id: createdApplications.length === 1 ? createdApplications[0].id : `${createdApplications[0].id} - ${createdApplications[createdApplications.length - 1].id}`,
            applicationType: 'van_code',
            vanCodeType: createdApplications.length === 1 ? createdApplications[0].vanCodeType : '',
            supplier: `Van code application (${createdApplications.length} applications)`,
            supplierSapCode: 'N/A',
            supplierPartCode: 'N/A',
            wholesalePrice: 'N/A',
            retailPrice: 'N/A',
            standardPrice: '',
            isPrototypePricePending: true,
            estimatedPrice: createdApplications.length === 1 ? createdApplications[0].estimatedPrice : 'Multiple',
            partName: createdApplications.length === 1 ? createdApplications[0].partName : 'Multiple',
            priceEffectiveDate: createdApplications.length === 1 ? createdApplications[0].priceEffectiveDate : 'Multiple',
            leadingTime: 'N/A',
            unit: 'N/A',
            isPack: false,
            packQuantity: '',
            specifications: `Van code application: ${createdApplications.map((app) => app.partName).join(', ')}`,
            managerApprovalFileUrl,
            managerApprovalFileName: managerApprovalFile.name,
          }, '', managerApprovalFileUrl);
        } catch (emailError) {
          console.error('Van code submission email failed:', emailError);
          emailWarning = ` Email failed: ${emailError instanceof Error ? emailError.message : 'Unknown EmailJS error'}`;
        }

        await loadApplications();
        showMessage(emailWarning ? 'error' : 'success', `${createdApplications.length} van code applications submitted.${emailWarning}`);
        resetForm();
        return;
      }

      const applicationId = generateApplicationId();
      const imageUrl = selectedFile ? await FirebaseService.uploadPartApplicationImage(selectedFile, applicationId) : '';
      const managerApprovalFileUrl = managerApprovalFile ? await FirebaseService.uploadApplicationAttachment(managerApprovalFile, `MANAGER-${applicationId}-${Date.now()}`) : '';

      const newApplication: PartApplication = {
        ...formData,
        priceBreaks,
        previousPriceBreaks: submissionMode === 'price_supplier_change' ? previousPriceBreaks : [],
        id: applicationId,
        requestedBy: selectedRequester.name,
        requesterName: selectedRequester.name,
        requesterEmail: selectedRequester.email,
        submittedAt: new Date().toISOString(),
        applicationType: submissionMode,
        purchasingOrganization: formData.purchasingOrganization,
        isPrototypePricePending: formData.isPrototypePricePending,
        standardPrice: formData.standardPrice,
        specifications: submissionMode === 'price_supplier_change' ? `Price/supplier change for ${formData.partCode}` : formData.specifications,
        supplier: formData.supplier,
        newSupplier: submissionMode === 'price_supplier_change' ? formData.supplier : formData.newSupplier,
        newPrice: submissionMode === 'price_supplier_change' ? formData.standardPrice : formData.newPrice,
        status: 'pending',
        imageUrl,
        applicationFileUrl: '',
        applicationFileName: '',
        managerApprovalFileUrl,
        managerApprovalFileName: managerApprovalFile?.name || ''
      };

      await FirebaseService.savePartApplication(newApplication);
      let emailWarning = '';
      try {
        await sendSubmissionEmail(newApplication, '', managerApprovalFileUrl);
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
            supplierPartCode: application.supplierPartCode || '',
            wholesalePrice: application.wholesalePrice || '',
            retailPrice: application.retailPrice || '',
            standardPrice: application.standardPrice,
            specifications: application.specifications,
            notes: application.notes,
            partCode: code,
            imageUrl: partImageUrl || application.imageUrl,
            partName: application.partName,
            priceEffectiveDate: application.priceEffectiveDate,
            leadingTime: application.leadingTime,
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

  const updatePriceBreakRow = (rowId: string, field: keyof Omit<PriceBreakRow, 'id'>, value: string) => {
    setPriceBreakRows((prev) => prev.map((row) => row.id === rowId ? { ...row, [field]: value } : row));
  };

  const addPriceBreakRow = () => {
    setPriceBreakRows((prev) => [...prev, { id: crypto.randomUUID(), quantityOver: '', netPriceAud: '' }]);
  };

  const removePriceBreakRow = (rowId: string) => {
    setPriceBreakRows((prev) => prev.length === 1 ? prev : prev.filter((row) => row.id !== rowId));
  };

  const updatePreviousPriceBreakRow = (rowId: string, field: keyof Omit<PriceBreakRow, 'id'>, value: string) => {
    setPreviousPriceBreakRows((prev) => prev.map((row) => row.id === rowId ? { ...row, [field]: value } : row));
  };

  const addPreviousPriceBreakRow = () => {
    setPreviousPriceBreakRows((prev) => [...prev, { id: crypto.randomUUID(), quantityOver: '', netPriceAud: '' }]);
  };

  const removePreviousPriceBreakRow = (rowId: string) => {
    setPreviousPriceBreakRows((prev) => prev.length === 1 ? prev : prev.filter((row) => row.id !== rowId));
  };

  const cleanPriceBreakRows = (rows: PriceBreakRow[]) => rows
    .filter((row) => row.quantityOver.trim() || row.netPriceAud.trim())
    .map((row) => ({ id: row.id, quantityOver: row.quantityOver.trim(), netPriceAud: row.netPriceAud.trim() }));

  const updateVanCodeRow = (rowId: string, field: keyof Omit<VanCodeApplicationRow, 'id'>, value: string) => {
    setVanCodeRows((prev) => prev.map((row) => row.id === rowId ? { ...row, [field]: value } : row));
  };

  const addVanCodeRow = () => {
    setVanCodeRows((prev) => [...prev, { id: crypto.randomUUID(), vanCodeType: '', partName: '', priceEffectiveDate: todayDateString(), estimatedPrice: '' }]);
  };

  const removeVanCodeRow = (rowId: string) => {
    setVanCodeRows((prev) => prev.length === 1 ? prev : prev.filter((row) => row.id !== rowId));
  };

  const escapePrintHtml = (value: unknown) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const printApplicationForm = (application: Partial<PartApplication> & { vanCodeItems?: VanCodeApplicationRow[] }) => {
    const vanCodeTypeLabel = application.vanCodeType === 'finished_goods'
      ? 'Finished Goods'
      : application.vanCodeType === 'semivan'
        ? 'Semivan'
        : 'Multiple Items';
    const applicationType = application.applicationType === 'van_code'
      ? `Van Code Application - ${vanCodeTypeLabel}`
      : application.applicationType === 'price_supplier_change'
        ? 'Price/Supplier Change'
        : 'Single Part Application';
    const applicationPriceBreaks = application.priceBreaks || [];
    const applicationPreviousPriceBreaks = application.previousPriceBreaks || [];
    const applicationVanCodeItems = application.vanCodeItems || [];
    const hasValue = (value: unknown) => value !== '' && value !== undefined && value !== null;
    const compactRows = (rows: Array<[string, unknown]>) => rows.filter(([, value]) => hasValue(value));
    const baseRows = compactRows([
      ['Application Type', applicationType],
      ['Requester', application.requesterName || application.requestedBy || formData.requestedBy || ''],
      ['Requester Email', application.requesterEmail || formData.requesterEmail || ''],
      ['Purchasing Organization', application.purchasingOrganization || formData.purchasingOrganization || ''],
      ['Application ID', application.id || 'New Application'],
      ['Printed', new Date().toLocaleString()],
    ]);
    const partRows = compactRows([
      ['Parts Code', application.partCode || ''],
      ['Part Name', application.partName || ''],
      ['Supplier', application.supplier || application.newSupplier || ''],
      ['Supplier SAP Code', application.supplierSapCode || ''],
      ['Supplier Part Code', application.supplierPartCode || ''],
      ['Price Effective Date', application.priceEffectiveDate || ''],
      ['Leading Time', application.leadingTime || ''],
      ['Unit', application.unit || ''],
      ['Is Pack', application.isPack ? `Yes - ${application.packQuantity || ''}` : 'No'],
    ]);
    const pricingRows = compactRows([
      ['Will Enter Sales', application.isSalesItem ? 'Yes' : 'No'],
      ['Wholesale Price', application.wholesalePrice || ''],
      ['Retail Price', application.retailPrice || ''],
      ['Standard/New Price', application.standardPrice || application.newPrice || ''],
      ['Estimated Price', application.estimatedPrice || ''],
    ]);
    const changeRows = compactRows([
      ['Previous Supplier', application.originalSupplier || ''],
      ['Previous Supplier SAP Code', application.originalSupplierSapCode || ''],
      ['Previous Supplier Part Code', application.originalSupplierPartCode || ''],
      ['Previous Wholesale Price', application.originalWholesalePrice || ''],
      ['Previous Retail Price', application.originalRetailPrice || ''],
      ['Previous Standard Price', application.originalPrice || ''],
      ['Changed Supplier', application.newSupplier || (application.applicationType === 'price_supplier_change' ? application.supplier : '') || ''],
      ['Changed Standard Price', application.newPrice || (application.applicationType === 'price_supplier_change' ? application.standardPrice : '') || ''],
    ]);
    const noteRows = compactRows([
      ['Specifications', application.specifications || ''],
      ['Notes', application.notes || ''],
    ]);
    const renderKeyValueSection = (title: string, rows: Array<[string, unknown]>) => rows.length ? `
      <section class="section">
        <h2>${escapePrintHtml(title)}</h2>
        <div class="kv-grid">
          ${rows.map(([label, value]) => `<div class="kv"><div class="k">${escapePrintHtml(label)}</div><div class="v">${escapePrintHtml(value)}</div></div>`).join('')}
        </div>
      </section>` : '';
    const renderPriceBreakSection = (title: string, rows: PriceBreakRow[]) => rows.length ? `
      <section class="section compact-section">
        <h2>${escapePrintHtml(title)}</h2>
        <table class="detail-table"><thead><tr><th>Quantity Over</th><th>Net Price (AUD)</th></tr></thead><tbody>
          ${rows.map((row) => `<tr><td>${escapePrintHtml(row.quantityOver)}</td><td>${escapePrintHtml(row.netPriceAud)}</td></tr>`).join('')}
        </tbody></table>
      </section>` : '';
    const renderVanCodeSection = () => applicationVanCodeItems.length ? `
      <section class="section compact-section">
        <h2>Van Code Items</h2>
        <table class="detail-table"><thead><tr><th>#</th><th>Type</th><th>Part Name</th><th>Price Effective Date</th><th>Estimated Price</th></tr></thead><tbody>
          ${applicationVanCodeItems.map((item, index) => `<tr><td>${index + 1}</td><td>${escapePrintHtml(item.vanCodeType === 'finished_goods' ? 'Finished Goods' : item.vanCodeType === 'semivan' ? 'Semivan' : 'N/A')}</td><td>${escapePrintHtml(item.partName || 'N/A')}</td><td>${escapePrintHtml(item.priceEffectiveDate || 'N/A')}</td><td>${escapePrintHtml(item.estimatedPrice || 'N/A')} AUD</td></tr>`).join('')}
        </tbody></table>
      </section>` : '';
    const printableSections = [
      renderKeyValueSection('Application', baseRows),
      renderVanCodeSection(),
      renderKeyValueSection('Part Details', partRows),
      renderKeyValueSection('Pricing', pricingRows),
      renderPriceBreakSection('Price Breaks (if applicable)', applicationPriceBreaks),
      renderKeyValueSection('Price / Supplier Change', changeRows),
      renderPriceBreakSection('Previous Price Breaks', applicationPreviousPriceBreaks),
      renderKeyValueSection('Notes', noteRows),
    ].join('');

    const printWindow = window.open('', '_blank', 'width=900,height=1100');
    if (!printWindow) {
      showMessage('error', 'Unable to open print window. Please allow pop-ups and try again.');
      return;
    }

    printWindow.document.write(`<!doctype html>
<html>
<head>
  <title>${escapePrintHtml(applicationType)} - Manager Approval</title>
  <style>
    * { box-sizing: border-box; }
    @page { size: A4; margin: 8mm; }
    body { margin: 0; padding: 16px; color: #111827; font-family: Arial, sans-serif; background: #f3f4f6; }
    .page { max-width: 1060px; margin: 0 auto; background: #fff; border: 1px solid #d1d5db; border-radius: 14px; overflow: hidden; }
    .header { padding: 16px 22px; color: #fff; background: linear-gradient(135deg, #1d4ed8, #0f766e); }
    .eyebrow { font-size: 10px; letter-spacing: .12em; text-transform: uppercase; opacity: .85; }
    h1 { margin: 6px 0 0; font-size: 22px; }
    .meta { display: flex; justify-content: space-between; gap: 12px; margin-top: 8px; font-size: 11px; opacity: .95; }
    .content { padding: 14px 18px; }
    .section { break-inside: avoid; margin-bottom: 10px; }
    h2 { margin: 0 0 6px; padding-bottom: 3px; border-bottom: 1px solid #bfdbfe; color: #1d4ed8; font-size: 13px; text-transform: uppercase; letter-spacing: .04em; }
    .kv-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
    .kv { display: grid; grid-template-columns: 38% 62%; min-height: 27px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; font-size: 11px; }
    .k { padding: 6px 8px; background: #f9fafb; color: #4b5563; font-weight: 700; }
    .v { padding: 6px 8px; white-space: pre-line; }
    .detail-table { width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; font-size: 11px; }
    th { padding: 6px 8px; background: #eff6ff; color: #1e3a8a; text-align: left; }
    td { padding: 6px 8px; border-top: 1px solid #e5e7eb; vertical-align: top; white-space: pre-line; }
    .approval { margin-top: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; break-inside: avoid; }
    .sign-box { min-height: 62px; padding: 9px; border: 1px dashed #9ca3af; border-radius: 10px; }
    .sign-title { color: #374151; font-weight: 700; font-size: 11px; }
    .line { margin-top: 28px; border-top: 1px solid #111827; padding-top: 5px; font-size: 10px; color: #6b7280; }
    .footer { padding: 0 18px 12px; color: #6b7280; font-size: 10px; }
    @media print { body { background: #fff; padding: 0; } .page { border-radius: 0; border: 0; } .content { padding: 10px 12px; } }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="eyebrow">Parts Application</div>
      <h1>${escapePrintHtml(applicationType)}</h1>
      <div class="meta"><span>Application ID: ${escapePrintHtml(application.id || 'New Application')}</span><span>Printed: ${escapePrintHtml(new Date().toLocaleString())}</span></div>
    </div>
    <div class="content">
      ${printableSections}
      <div class="approval">
        <div class="sign-box"><div class="sign-title">Requester Signature</div><div class="line">Name / Date</div></div>
        <div class="sign-box"><div class="sign-title">Manager Approval</div><div class="line">Name / Date</div></div>
      </div>
    </div>
    <div class="footer">Please sign this form, scan or save it, then upload it as the signed Manager Approval attachment.</div>
  </div>
  <script>window.onload = () => { window.print(); };</script>
</body>
</html>`);
    printWindow.document.close();
  };

  const printCurrentApplicationForm = (row?: VanCodeApplicationRow) => {
    if (submissionMode === 'van_code') {
      const targetRow = row || vanCodeRows[0];
      printApplicationForm({
        applicationType: 'van_code',
        vanCodeType: row ? targetRow.vanCodeType : (vanCodeRows.length === 1 ? targetRow.vanCodeType : ''),
        requestedBy: formData.requestedBy,
        requesterName: formData.requestedBy,
        requesterEmail: formData.requesterEmail,
        partName: row ? targetRow.partName : `${vanCodeRows.length} van code item(s)`,
        vanCodeItems: row ? [targetRow] : vanCodeRows,
        priceEffectiveDate: row ? targetRow.priceEffectiveDate : 'See Van Code Items',
        estimatedPrice: row ? targetRow.estimatedPrice : 'See Van Code Items',
        standardPrice: '',
        priceBreaks: [],
        previousPriceBreaks: [],
        isPrototypePricePending: true,
        specifications: row
          ? `${targetRow.vanCodeType === 'finished_goods' ? 'Finished Goods' : targetRow.vanCodeType === 'semivan' ? 'Semivan' : 'Unspecified'} van code application`
          : 'Multiple van code item application',
      });
      return;
    }

    printApplicationForm({
      ...formData,
      applicationType: submissionMode,
      requestedBy: formData.requestedBy,
      requesterName: formData.requestedBy,
      requesterEmail: formData.requesterEmail,
      supplier: formData.supplier,
      newSupplier: submissionMode === 'price_supplier_change' ? formData.supplier : formData.newSupplier,
      standardPrice: formData.standardPrice,
      priceBreaks: cleanPriceBreakRows(priceBreakRows),
      previousPriceBreaks: submissionMode === 'price_supplier_change' ? cleanPriceBreakRows(previousPriceBreakRows) : [],
      newPrice: submissionMode === 'price_supplier_change' ? formData.standardPrice : formData.newPrice,
      specifications: submissionMode === 'price_supplier_change' ? `Price/supplier change for ${formData.partCode}` : formData.specifications,
    });
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
            supplierPartCode: rejectDialog.application.supplierPartCode || '',
            wholesalePrice: rejectDialog.application.wholesalePrice || '',
            retailPrice: rejectDialog.application.retailPrice || '',
            standardPrice: rejectDialog.application.standardPrice,
            partName: rejectDialog.application.partName,
            priceEffectiveDate: rejectDialog.application.priceEffectiveDate,
            leadingTime: rejectDialog.application.leadingTime,
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

  const handlePriceSupplierChangeDone = async (application: PartApplication) => {
    setIsSubmitting(true);
    try {
      await FirebaseService.savePartApplication({
        ...application,
        status: 'approved',
        partCode: application.partCode || '',
      });
      await loadApplications();
      showMessage('success', `Price/Supplier Change ${application.id} approved and completed.`);
    } catch (error) {
      console.error('Error completing price/supplier change:', error);
      showMessage('error', 'Failed to complete price/supplier change');
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
        part_number: application.partCode || '',
        part_name: application.partName,
        price_effective_date: application.priceEffectiveDate,
        leading_time: application.leadingTime,
        unit: application.unit,
        is_pack: application.isPack,
        pack_quantity: application.packQuantity,
        supplier_sap_code: application.supplierSapCode,
        supplier_part_code: application.supplierPartCode,
        wholesale_price: application.wholesalePrice,
        retail_price: application.retailPrice,
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

  const hasDisplayValue = (value: unknown) => value !== undefined && value !== null && value !== '';

  const getApplicationTypeLabel = (application: PartApplication) => application.applicationType === 'van_code'
    ? `Van Code Application${application.vanCodeType === 'finished_goods' ? ' - Finished Goods' : application.vanCodeType === 'semivan' ? ' - Semivan' : ''}`
    : application.applicationType === 'price_supplier_change'
      ? 'Price/Supplier Change'
      : 'Single Application';

  const renderInfoLine = (label: string, value: unknown, formatter?: (value: unknown) => string) => {
    if (!hasDisplayValue(value)) return null;
    return <p><strong>{label}:</strong> {formatter ? formatter(value) : String(value)}</p>;
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
  const prototypePricePendingApplications = applications.filter((app) => app.isPrototypePricePending && !app.standardPrice);
  const priceSupplierChangeApplications = applications.filter((app) => app.applicationType === 'price_supplier_change');
  const visibleApplications = applicationStatusFilter === 'all'
    ? applications
    : applicationStatusFilter === 'prototype_price_pending'
      ? prototypePricePendingApplications
      : applicationStatusFilter === 'price_supplier_change'
        ? priceSupplierChangeApplications
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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 rounded-lg border p-2">
                  <Button
                    type="button"
                    variant={submissionMode === 'single' ? 'default' : 'outline'}
                    onClick={() => setSubmissionMode('single')}
                  >
                    Single Application
                  </Button>
                  <Button
                    type="button"
                    variant={submissionMode === 'van_code' ? 'default' : 'outline'}
                    onClick={() => setSubmissionMode('van_code')}
                  >
                    Van Code Application
                  </Button>
                  <Button
                    type="button"
                    variant={submissionMode === 'price_supplier_change' ? 'default' : 'outline'}
                    onClick={() => setSubmissionMode('price_supplier_change')}
                  >
                    Price/Supplier Change
                  </Button>
                </div>

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

                <div>
                  <Label htmlFor="purchasingOrganization">Purchasing Organization *</Label>
                  <Select value={formData.purchasingOrganization} onValueChange={(value) => setFormData(prev => ({ ...prev, purchasingOrganization: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select purchasing organization" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Regent RV PTY Ltd">Regent RV PTY Ltd</SelectItem>
                      <SelectItem value="Snowy River Pty Ltd">Snowy River Pty Ltd</SelectItem>
                      <SelectItem value="Leisure Lion Pty Ltd">Leisure Lion Pty Ltd</SelectItem>
                      <SelectItem value="United RV Pty Ltd">United RV Pty Ltd</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {submissionMode !== 'van_code' ? (
                  <>
                    {submissionMode === 'price_supplier_change' && (
                      <div className="space-y-4 rounded-xl border border-purple-200 bg-purple-50 p-4">
                        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
                          <div>
                            <Label htmlFor="changePartCode">Part Code *</Label>
                            <Input id="changePartCode" value={formData.partCode} onChange={(e) => setFormData(prev => ({ ...prev, partCode: e.target.value }))} onBlur={(e) => lookupPartForChange(e.target.value)} required />
                          </div>
                          <Button type="button" variant="outline" onClick={() => lookupPartForChange(formData.partCode)} disabled={isLookingUpPart || !formData.partCode.trim()}>{isLookingUpPart ? 'Searching...' : 'Lookup Part'}</Button>
                        </div>
                        {partLookupStatus && <p className="text-xs text-purple-700">{partLookupStatus}</p>}
                        {foundPart && (
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 rounded-lg border bg-white p-3 text-sm">
                            <div><strong>Part Name:</strong> {foundPart.SPRAS_EN || 'N/A'}</div>
                            <div><strong>Supplier:</strong> {foundPart.Supplier_Name || 'N/A'}</div>
                            <div><strong>Standard Price:</strong> {foundPart.Standard_Price ?? 'N/A'}</div>
                            <div><strong>Unit:</strong> {foundPart.Sales_Unit || 'N/A'}</div>
                          </div>
                        )}
                        <div>
                          <Label>Change Content *</Label>
                          <Select value={formData.changeField} onValueChange={(value: PriceSupplierChangeField) => setFormData(prev => ({ ...prev, changeField: value }))}>
                            <SelectTrigger><SelectValue placeholder="Select content to change" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="partName">Part Name</SelectItem><SelectItem value="supplier">Supplier</SelectItem><SelectItem value="price">Price</SelectItem><SelectItem value="priceBreaks">Price Breaks</SelectItem><SelectItem value="leadingTime">Leading Time</SelectItem><SelectItem value="retailPrice">Retail Price</SelectItem><SelectItem value="wholesalePrice">Wholesale Price</SelectItem><SelectItem value="standardPrice">Standard Price</SelectItem><SelectItem value="unit">Unit</SelectItem><SelectItem value="isPack">Is Pack</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {formData.changeField === 'partName' && <div><Label htmlFor="partNameTop">Part Name *</Label><Input id="partNameTop" value={formData.partName} onChange={(e) => setFormData(prev => ({ ...prev, partName: e.target.value }))} required /></div>}
                        {formData.changeField === 'supplier' && <div className="grid grid-cols-1 md:grid-cols-2 gap-3"><div><Label htmlFor="supplier">Supplier *</Label><Input id="supplier" value={formData.supplier} onChange={(e) => setFormData(prev => ({ ...prev, supplier: e.target.value }))} required /></div><div><Label htmlFor="supplierSapCode">Supplier Code *</Label><Input id="supplierSapCode" value={formData.supplierSapCode} onChange={(e) => setFormData(prev => ({ ...prev, supplierSapCode: e.target.value }))} required /></div></div>}
                        {formData.changeField === 'price' && <div className="grid grid-cols-1 md:grid-cols-3 gap-3"><div><Label htmlFor="standardPrice">New Price *</Label><Input id="standardPrice" type="number" step="0.01" value={formData.standardPrice} onChange={(e) => setFormData(prev => ({ ...prev, standardPrice: e.target.value }))} required /></div>{!foundPart && <div><Label htmlFor="originalPrice">Previous Price *</Label><Input id="originalPrice" type="number" step="0.01" value={formData.originalPrice} onChange={(e) => setFormData(prev => ({ ...prev, originalPrice: e.target.value }))} required /></div>}<div className="self-end text-sm font-medium">Direction: {standardPriceComparison() || 'Enter prices'}</div></div>}
                        {formData.changeField === 'priceBreaks' && <div className="space-y-3"><Select value={formData.priceChangeDirection} onValueChange={(value: 'increase' | 'decrease') => setFormData(prev => ({ ...prev, priceChangeDirection: value }))}><SelectTrigger><SelectValue placeholder="Increase or decrease? *" /></SelectTrigger><SelectContent><SelectItem value="increase">Increase</SelectItem><SelectItem value="decrease">Decrease</SelectItem></SelectContent></Select>{priceBreakRows.map((row) => <div key={row.id} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3"><Input type="number" placeholder="Quantity Over" value={row.quantityOver} onChange={(e) => updatePriceBreakRow(row.id, 'quantityOver', e.target.value)} /><Input type="number" step="0.01" placeholder="Net Price (AUD)" value={row.netPriceAud} onChange={(e) => updatePriceBreakRow(row.id, 'netPriceAud', e.target.value)} /><Button type="button" variant="outline" onClick={() => removePriceBreakRow(row.id)} disabled={priceBreakRows.length === 1}><Trash2 className="h-4 w-4" /></Button></div>)}<Button type="button" variant="outline" size="sm" onClick={addPriceBreakRow}>Add Row</Button></div>}
                        {formData.changeField === 'retailPrice' && <div><Label htmlFor="retailPrice">Retail Price *</Label><Input id="retailPrice" type="number" step="0.01" value={formData.retailPrice} onChange={(e) => setFormData(prev => ({ ...prev, retailPrice: e.target.value }))} required /></div>}
                        {formData.changeField === 'wholesalePrice' && <div><Label htmlFor="wholesalePrice">Wholesale Price *</Label><Input id="wholesalePrice" type="number" step="0.01" value={formData.wholesalePrice} onChange={(e) => setFormData(prev => ({ ...prev, wholesalePrice: e.target.value }))} required /></div>}
                        {formData.changeField === 'standardPrice' && <div><Label htmlFor="standardPrice">Standard Price *</Label><Input id="standardPrice" type="number" step="0.01" value={formData.standardPrice} onChange={(e) => setFormData(prev => ({ ...prev, standardPrice: e.target.value }))} required /></div>}
                        {formData.changeField === 'leadingTime' && <div><Label htmlFor="leadingTime">Leading Time *</Label><Input id="leadingTime" value={formData.leadingTime} onChange={(e) => setFormData(prev => ({ ...prev, leadingTime: e.target.value }))} required /></div>}
                        {formData.changeField === 'unit' && <div><Label htmlFor="unit">Unit *</Label><Input id="unit" value={formData.unit} onChange={(e) => setFormData(prev => ({ ...prev, unit: e.target.value }))} required /></div>}
                        {formData.changeField === 'isPack' && <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={formData.isPack} onChange={(e) => setFormData(prev => ({ ...prev, isPack: e.target.checked, packQuantity: e.target.checked ? prev.packQuantity : '' }))} /> Is Pack?</label>}
                        {formData.changeField === 'isPack' && formData.isPack && <div><Label htmlFor="packQuantity">Pack Quantity *</Label><Input id="packQuantity" type="number" value={formData.packQuantity} onChange={(e) => setFormData(prev => ({ ...prev, packQuantity: e.target.value }))} required /></div>}
                        <p className="text-xs text-purple-700">Signed file is required for Supplier, price increases, Price Break increases, Retail Price, Wholesale Price, and Standard Price changes.</p>
                      </div>
                    )}

                    {submissionMode === 'single' && <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-lg border p-3">
                      <div>
                        <Label htmlFor="partNameTop">Part Name *</Label>
                        <Input id="partNameTop" value={formData.partName} onChange={(e) => setFormData(prev => ({ ...prev, partName: e.target.value }))} placeholder="Enter part name" required />
                      </div>
                      <div>
                        <Label htmlFor="minimumOrderQuantity">Minimum Order Quantity *</Label>
                        <Input id="minimumOrderQuantity" type="number" min="1" step="1" value={formData.minimumOrderQuantity} onChange={(e) => setFormData(prev => ({ ...prev, minimumOrderQuantity: e.target.value }))} placeholder="Enter MOQ" required />
                      </div>
                    </div>}

                    {submissionMode === 'single' && <label htmlFor="isSalesItem" className="flex items-center gap-2 rounded-lg border p-3 text-sm font-medium">
                      <input
                        id="isSalesItem"
                        type="checkbox"
                        checked={formData.isSalesItem}
                        onChange={(e) => setFormData(prev => ({ ...prev, isSalesItem: e.target.checked }))}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      Will this item enter sales?
                    </label>}

                    {submissionMode === 'single' && <>
                    <div className="rounded-lg border p-3 space-y-3">
                      <h3 className="text-sm font-semibold text-gray-800">Supplier</h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <Label htmlFor="supplier">{submissionMode === 'single' ? 'Preferred Supplier *' : 'New Supplier'}</Label>
                        <Input
                          id="supplier"
                          value={formData.supplier}
                          onChange={(e) => setFormData(prev => ({ ...prev, supplier: e.target.value }))}
                          placeholder="Enter supplier name"
                          required={submissionMode === 'single'}
                        />
                      </div>

                      <div>
                        <Label htmlFor="supplierSapCode">{submissionMode === 'single' ? 'Preferred Supplier SAP Code *' : 'New Supplier SAP Code'}</Label>
                        <Input
                          id="supplierSapCode"
                          value={formData.supplierSapCode}
                          onChange={(e) => setFormData(prev => ({ ...prev, supplierSapCode: e.target.value }))}
                          placeholder="Enter supplier SAP code"
                          required={submissionMode === 'single'}
                        />
                        </div>
                        <div>
                          <Label htmlFor="supplierPartCode">Supplier Part Code</Label>
                          <Input
                            id="supplierPartCode"
                            value={formData.supplierPartCode}
                            onChange={(e) => setFormData(prev => ({ ...prev, supplierPartCode: e.target.value }))}
                            placeholder="Enter supplier part code"
                          />
                        </div>
                      </div>
                    </div>
                    </>}

                    {submissionMode === 'single' && <>
                    <div className="rounded-lg border p-3 space-y-3">
                      <h3 className="text-sm font-semibold text-gray-800">Price</h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor="wholesalePrice">Wholesale Price{formData.isSalesItem ? ' *' : ''}</Label>
                        <Input
                          id="wholesalePrice"
                          type="number"
                          step="0.01"
                          value={formData.wholesalePrice}
                          onChange={(e) => setFormData(prev => ({ ...prev, wholesalePrice: e.target.value }))}
                          placeholder="Enter wholesale price"
                          required={submissionMode === 'single' && formData.isSalesItem}
                        />
                      </div>

                      <div>
                        <Label htmlFor="retailPrice">Retail Price{formData.isSalesItem ? ' *' : ''}</Label>
                        <Input
                          id="retailPrice"
                          type="number"
                          step="0.01"
                          value={formData.retailPrice}
                          onChange={(e) => setFormData(prev => ({ ...prev, retailPrice: e.target.value }))}
                          placeholder="Enter retail price"
                          required={submissionMode === 'single' && formData.isSalesItem}
                        />
                      </div>
                    </div>


                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div>
                        <Label htmlFor="standardPrice">{submissionMode === 'single' ? 'Standard Price *' : 'New Standard Price'}</Label>
                        <Input
                          id="standardPrice"
                          type="number"
                          step="0.01"
                          value={formData.standardPrice}
                          onChange={(e) => setFormData(prev => ({ ...prev, standardPrice: e.target.value }))}
                          placeholder="Enter standard price"
                          required={submissionMode === 'single' && !formData.isPrototypePricePending}
                        />
                      </div>

                      <div>
                        <Label htmlFor="priceEffectiveDate">Price Effective Date{submissionMode === 'single' ? ' *' : ''}</Label>
                        <Input
                          id="priceEffectiveDate"
                          type="date"
                          value={formData.priceEffectiveDate}
                          onChange={(e) => setFormData(prev => ({ ...prev, priceEffectiveDate: e.target.value }))}
                          required={submissionMode === 'single'}
                        />
                      </div>

                      <div>
                        <Label htmlFor="leadingTime">Leading Time{submissionMode === 'single' ? ' *' : ''}</Label>
                        <Input
                          id="leadingTime"
                          value={formData.leadingTime}
                          onChange={(e) => setFormData(prev => ({ ...prev, leadingTime: e.target.value }))}
                          placeholder="e.g. 14 days"
                          required={submissionMode === 'single'}
                        />
                      </div>
                    </div>

                    </div>

                    <div className="space-y-3 rounded-lg border p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Price Breaks (if applicable)</Label>
                          <p className="text-xs text-gray-500">Enter quantity over and net price in AUD.</p>
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={addPriceBreakRow}>
                          <Plus className="h-4 w-4 mr-1" />
                          Add Row
                        </Button>
                      </div>
                      {priceBreakRows.map((row, index) => (
                        <div key={row.id} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
                          <div>
                            <Label htmlFor={`priceBreakQty-${row.id}`}>Quantity Over</Label>
                            <Input id={`priceBreakQty-${row.id}`} type="number" min="0" step="1" value={row.quantityOver} onChange={(e) => updatePriceBreakRow(row.id, 'quantityOver', e.target.value)} placeholder="e.g. 10" />
                          </div>
                          <div>
                            <Label htmlFor={`priceBreakNet-${row.id}`}>Net Price (AUD)</Label>
                            <Input id={`priceBreakNet-${row.id}`} type="number" min="0" step="0.01" value={row.netPriceAud} onChange={(e) => updatePriceBreakRow(row.id, 'netPriceAud', e.target.value)} placeholder="e.g. 95.00" />
                          </div>
                          <Button type="button" variant="outline" size="sm" onClick={() => removePriceBreakRow(row.id)} disabled={priceBreakRows.length === 1}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    </>}

                    {submissionMode === 'price_supplier_change' && cleanPriceBreakRows(priceBreakRows).length > 0 && (
                      <div className="space-y-3 rounded-lg border border-purple-200 bg-purple-50 p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <Label>Previous Price Breaks *</Label>
                            <p className="text-xs text-purple-700">Required because new price breaks were entered.</p>
                          </div>
                          <Button type="button" variant="outline" size="sm" onClick={addPreviousPriceBreakRow}>
                            <Plus className="h-4 w-4 mr-1" />
                            Add Previous Row
                          </Button>
                        </div>
                        {previousPriceBreakRows.map((row) => (
                          <div key={row.id} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
                            <div>
                              <Label htmlFor={`previousPriceBreakQty-${row.id}`}>Previous Quantity Over</Label>
                              <Input id={`previousPriceBreakQty-${row.id}`} type="number" min="0" step="1" value={row.quantityOver} onChange={(e) => updatePreviousPriceBreakRow(row.id, 'quantityOver', e.target.value)} placeholder="e.g. 10" />
                            </div>
                            <div>
                              <Label htmlFor={`previousPriceBreakNet-${row.id}`}>Previous Net Price (AUD)</Label>
                              <Input id={`previousPriceBreakNet-${row.id}`} type="number" min="0" step="0.01" value={row.netPriceAud} onChange={(e) => updatePreviousPriceBreakRow(row.id, 'netPriceAud', e.target.value)} placeholder="e.g. 100.00" />
                            </div>
                            <Button type="button" variant="outline" size="sm" onClick={() => removePreviousPriceBreakRow(row.id)} disabled={previousPriceBreakRows.length === 1}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 rounded-lg border p-3">
                      <div>
                        <Label htmlFor="unit">Unit{submissionMode === 'single' ? ' *' : ''}</Label>
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

                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-3">
                      <label htmlFor="prototypePricePending" className="flex items-center gap-2 text-sm font-medium text-amber-900">
                        <input
                          id="prototypePricePending"
                          type="checkbox"
                          checked={formData.isPrototypePricePending}
                          onChange={(e) => {
                            if (!e.target.checked) {
                              setFormData(prev => ({ ...prev, isPrototypePricePending: false, estimatedPrice: '' }));
                              setPrototypePassword('');
                            }
                          }}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        Prototype price pending
                      </label>
                      {!formData.isPrototypePricePending && (
                        <div>
                          <Label htmlFor="prototypePassword">Prototype password</Label>
                          <Input
                            id="prototypePassword"
                            type="password"
                            value={prototypePassword}
                            onChange={(e) => {
                              const value = e.target.value;
                              setPrototypePassword(value);
                              if (value === 'prototype') {
                                setFormData(prev => ({ ...prev, isPrototypePricePending: true, standardPrice: '' }));
                              }
                            }}
                            placeholder="Enter password to enable prototype price pending"
                          />
                        </div>
                      )}
                      {formData.isPrototypePricePending && (
                        <div>
                          <Label htmlFor="estimatedPrice">Estimated Price</Label>
                          <Input
                            id="estimatedPrice"
                            type="number"
                            step="0.01"
                            value={formData.estimatedPrice}
                            onChange={(e) => setFormData(prev => ({ ...prev, estimatedPrice: e.target.value }))}
                            placeholder="Optional estimate until standard price is maintained"
                          />
                          <p className="mt-1 text-xs text-amber-800">Standard Price can stay blank for prototype price pending applications.</p>
                        </div>
                      )}
                    </div>

                    <div>
                      <Label htmlFor="specifications">Specifications{submissionMode === 'single' ? ' *' : ''}</Label>
                      <Textarea
                        id="specifications"
                        value={formData.specifications}
                        onChange={(e) => setFormData(prev => ({ ...prev, specifications: e.target.value }))}
                        placeholder="Describe the part specifications and requirements"
                        rows={3}
                        required={submissionMode === 'single'}
                      />
                    </div>

                    <div>
                      <Label htmlFor="image">Part Image{submissionMode === 'single' ? ' *' : ''}</Label>
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
                  <div className="space-y-4 rounded-lg border p-4">

                    <div className="space-y-3">
                      {vanCodeRows.map((row, index) => (
                        <div key={row.id} className="rounded-lg border bg-gray-50 p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-sm font-semibold text-gray-700">Van Code Item #{index + 1}</span>
                            <div className="flex gap-2">
                              <Button type="button" variant="outline" size="sm" onClick={() => printCurrentApplicationForm(row)}>
                                <Printer className="h-4 w-4 mr-1" />
                                Print
                              </Button>
                              <Button type="button" variant="outline" size="sm" onClick={() => removeVanCodeRow(row.id)} disabled={vanCodeRows.length === 1}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div>
                              <Label htmlFor={`vanCodeType-${row.id}`}>Type *</Label>
                              <Select value={row.vanCodeType} onValueChange={(value: 'semivan' | 'finished_goods') => updateVanCodeRow(row.id, 'vanCodeType', value)}>
                                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="semivan">Semivan</SelectItem>
                                  <SelectItem value="finished_goods">Finished Goods</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label htmlFor={`vanPartName-${row.id}`}>Part Name *</Label>
                              <Input id={`vanPartName-${row.id}`} value={row.partName} onChange={(e) => updateVanCodeRow(row.id, 'partName', e.target.value)} required={submissionMode === 'van_code'} />
                            </div>
                            <div>
                              <Label htmlFor={`vanPriceEffectiveDate-${row.id}`}>Price Effective Date *</Label>
                              <Input id={`vanPriceEffectiveDate-${row.id}`} type="date" value={row.priceEffectiveDate} onChange={(e) => updateVanCodeRow(row.id, 'priceEffectiveDate', e.target.value)} required={submissionMode === 'van_code'} />
                            </div>
                            <div>
                              <Label htmlFor={`vanEstimatedPrice-${row.id}`}>Estimated Price *</Label>
                              <Input id={`vanEstimatedPrice-${row.id}`} type="number" step="0.01" value={row.estimatedPrice} onChange={(e) => updateVanCodeRow(row.id, 'estimatedPrice', e.target.value)} required={submissionMode === 'van_code'} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <Button type="button" variant="outline" onClick={addVanCodeRow}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Van Code Row
                    </Button>
                  </div>
                )}

                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-semibold text-blue-900">Print application form for signature</p>
                      <p className="text-xs text-blue-700">Print this form, get the manager signature, then upload the signed Manager Approval file below.</p>
                    </div>
                    <Button type="button" variant="outline" onClick={() => printCurrentApplicationForm()}>
                      <Printer className="h-4 w-4 mr-2" />
                      Print Current Form
                    </Button>
                  </div>
                </div>

                <div className="rounded-lg border p-4">
                  <Label htmlFor="managerApprovalFile">Signed Manager Approval{requiresManagerApproval() ? ' *' : ''}</Label>
                  <Input id="managerApprovalFile" type="file" onChange={(e) => setManagerApprovalFile(e.target.files?.[0] || null)} required={requiresManagerApproval()} className="mt-2" />
                  {managerApprovalFile && <p className="text-xs text-gray-500 mt-1">Selected: {managerApprovalFile.name}</p>}
                </div>

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
                  onClick={() => setApplicationStatusFilter(applicationStatusFilter === 'prototype_price_pending' ? 'all' : 'prototype_price_pending')}
                  className={`rounded-lg border p-3 text-left transition ${applicationStatusFilter === 'prototype_price_pending' ? 'border-amber-500 bg-amber-50' : 'hover:bg-gray-50'}`}
                >
                  <p className="text-xs text-amber-700">Price Pending</p>
                  <p className="text-xl font-bold text-amber-700">{prototypePricePendingApplications.length}</p>
                </button>
                <button
                  type="button"
                  onClick={() => setApplicationStatusFilter(applicationStatusFilter === 'price_supplier_change' ? 'all' : 'price_supplier_change')}
                  className={`rounded-lg border p-3 text-left transition ${applicationStatusFilter === 'price_supplier_change' ? 'border-purple-500 bg-purple-50' : 'hover:bg-gray-50'}`}
                >
                  <p className="text-xs text-purple-700">Price/Supplier Change</p>
                  <p className="text-xl font-bold text-purple-700">{priceSupplierChangeApplications.length}</p>
                </button>
              </div>

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
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-mono text-sm font-bold text-blue-600">
                            {app.id}
                          </div>
                          <Badge variant="outline" className="border-indigo-300 bg-indigo-50 px-2 py-1 text-sm font-bold text-indigo-700 shadow-sm">
                            {getApplicationTypeLabel(app)}
                          </Badge>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Badge variant="outline" className={getStatusColor(app.status)}>
                            {app.status}
                          </Badge>
                          {app.isPrototypePricePending && !app.standardPrice && (
                            <Badge variant="outline" className="bg-amber-50 text-amber-700">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Price pending
                            </Badge>
                          )}
                          {app.partCode && (
                            <Badge variant="outline" className="bg-green-50 text-green-700">
                              {app.partCode}
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="text-xs text-gray-600">
                        {renderInfoLine('Requested by', app.requesterName || app.requestedBy)}
                        {renderInfoLine('Email', app.requesterEmail)}
                        {renderInfoLine('Purchasing Organization', app.purchasingOrganization)}
                        {renderInfoLine('Supplier', app.supplier)}
                        {renderInfoLine('Supplier SAP Code', app.supplierSapCode)}
                        {renderInfoLine('Supplier Part Code', app.supplierPartCode)}
                        {renderInfoLine('Wholesale Price', app.wholesalePrice, (value) => `$${value}`)}
                        {renderInfoLine('Retail Price', app.retailPrice, (value) => `$${value}`)}
                        {app.priceBreaks?.length ? <p><strong>Price Breaks:</strong> {app.priceBreaks.map((row) => `Qty over ${row.quantityOver}: $${row.netPriceAud} AUD`).join('; ')}</p> : null}
                        {app.previousPriceBreaks?.length ? <p><strong>Previous Price Breaks:</strong> {app.previousPriceBreaks.map((row) => `Qty over ${row.quantityOver}: $${row.netPriceAud} AUD`).join('; ')}</p> : null}
                        {app.applicationType === 'price_supplier_change' && <>{renderInfoLine('Previous Supplier', app.originalSupplier)}{renderInfoLine('Previous Supplier SAP Code', app.originalSupplierSapCode)}{renderInfoLine('Previous Supplier Part Code', app.originalSupplierPartCode)}{renderInfoLine('Previous Wholesale Price', app.originalWholesalePrice)}{renderInfoLine('Previous Retail Price', app.originalRetailPrice)}{renderInfoLine('Previous Standard Price', app.originalPrice)}{renderInfoLine('New Supplier', app.newSupplier)}{renderInfoLine('New Price', app.newPrice)}</>}
                        {hasDisplayValue(app.standardPrice) ? renderInfoLine('Standard Price', app.standardPrice, (value) => `$${value}`) : (app.isPrototypePricePending ? <p><strong>Standard Price:</strong> Prototype price pending</p> : null)}
                        {app.isPrototypePricePending ? renderInfoLine('Estimated Price', app.estimatedPrice, (value) => `$${value}`) : null}
                        {renderInfoLine('Part Code', app.partCode)}
                        {renderInfoLine('Part Name', app.partName)}
                        {renderInfoLine('Price Effective Date', app.priceEffectiveDate)}
                        {renderInfoLine('Leading Time', app.leadingTime)}
                        {renderInfoLine('Unit', app.unit)}
                        {app.isPack ? <p><strong>Is Pack:</strong> Yes ({app.packQuantity || '-'} {app.unit || 'unit'} per pack)</p> : null}
                        {renderInfoLine('Reject Reason', app.rejectionReason)}
                      </div>

                      {app.managerApprovalFileUrl && (
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span>Manager Approval: {app.managerApprovalFileName || 'uploaded file'}</span>
                          <Button variant="ghost" size="sm" onClick={() => window.open(app.managerApprovalFileUrl, '_blank', 'noopener,noreferrer')} className="h-6 px-2 text-xs">
                            <Download className="h-3 w-3 mr-1" />
                            Open
                          </Button>
                        </div>
                      )}

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
                        app.applicationType === 'price_supplier_change' ? (
                          <Button size="sm" onClick={() => handlePriceSupplierChangeDone(app)} disabled={isSubmitting} className="w-full">
                            Approve and Done
                          </Button>
                        ) : (
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
                        )
                      )}

                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className={getPriorityColor(app.priority)}>
                          {app.priority} priority
                        </Badge>

                        <div className="flex space-x-1">
                          <Button variant="outline" size="sm" onClick={() => printApplicationForm(app)}>
                            <Printer className="h-3 w-3" />
                          </Button>
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
                                  <div><strong>Supplier Part Code:</strong> {app.supplierPartCode || 'N/A'}</div>
                                  <div><strong>Wholesale Price:</strong> {app.wholesalePrice ? `$${app.wholesalePrice}` : 'N/A'}</div>
                                  <div><strong>Retail Price:</strong> {app.retailPrice ? `$${app.retailPrice}` : 'N/A'}</div>
                                  <div><strong>Standard Price:</strong> {app.standardPrice ? `$${app.standardPrice}` : (app.isPrototypePricePending ? 'Prototype price pending' : 'N/A')}</div>
                                  {app.isPrototypePricePending && <div><strong>Estimated Price:</strong> {app.estimatedPrice ? `$${app.estimatedPrice}` : 'N/A'}</div>}
                                  <div><strong>Part Name:</strong> {app.partName || 'N/A'}</div>
                                  <div><strong>Price Effective Date:</strong> {app.priceEffectiveDate || 'N/A'}</div>
                                  <div><strong>Leading Time:</strong> {app.leadingTime || 'N/A'}</div>
                                  <div><strong>Unit:</strong> {app.unit || 'N/A'}</div>
                                  <div><strong>Is Pack:</strong> {app.isPack ? `Yes (${app.packQuantity || '-'} ${app.unit || 'unit'} per pack)` : 'No'}</div>
                                  <div><strong>Status:</strong> {app.status}</div>
                                </div>
                                <div><strong>Specifications:</strong> {app.specifications}</div>
                                {app.notes && <div><strong>Notes:</strong> {app.notes}</div>}
                                {app.rejectionReason && <div><strong>Reject Reason:</strong> {app.rejectionReason}</div>}
                                {app.managerApprovalFileUrl && (
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span>Manager Approval: {app.managerApprovalFileName || 'uploaded file'}</span>
                          <Button variant="ghost" size="sm" onClick={() => window.open(app.managerApprovalFileUrl, '_blank', 'noopener,noreferrer')} className="h-6 px-2 text-xs">
                            <Download className="h-3 w-3 mr-1" />
                            Open
                          </Button>
                        </div>
                      )}

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
