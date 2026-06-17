import React, { useState, useEffect } from 'react';
import { FileText, Download, Plus, Eye, CheckCircle, Image, Upload } from 'lucide-react';
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
import { ref, get, set } from 'firebase/database';
import { database } from '@/lib/firebase';

interface PartApplication {
  id: string;
  requestedBy: string;
  department: string;
  priority: 'low' | 'medium' | 'high';
  specifications: string;
  supplier: string;
  standardPrice: string;
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
}

interface ApplicationRequester {
  id: string;
  name: string;
  email: string;
}

interface ApplicationEmailSettings {
  notifyEmail: string;
  subjectPrefix?: string;
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
  const [requesters, setRequesters] = useState<ApplicationRequester[]>([]);
  const [emailSettings, setEmailSettings] = useState<ApplicationEmailSettings>({ notifyEmail: '' });
  const [applicationFile, setApplicationFile] = useState<File | null>(null);
  const [partCodeDrafts, setPartCodeDrafts] = useState<Record<string, string>>({});
  
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
    notes: ''
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
  const generateApplicationId = () => {
    const nextNumber = applications.length + 1;
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
      notes: ''
    });
    setSelectedFile(null);
    setImagePreview(null);
    setApplicationFile(null);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    if (!formData.requesterId || !formData.supplier || !formData.supplierSapCode || !formData.standardPrice || !applicationFile) {
      showMessage('error', 'Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);

    try {
      // Generate application ID
      const applicationId = generateApplicationId();
      
      const selectedRequester = requesters.find((requester) => requester.id === formData.requesterId);
      const imageUrl = selectedFile ? await FirebaseService.uploadPartApplicationImage(selectedFile, applicationId) : '';
      const applicationFileUrl = await FirebaseService.uploadApplicationAttachment(applicationFile, applicationId);

      // Create application object
      const newApplication: PartApplication = {
        ...formData,
        id: applicationId,
        requestedBy: selectedRequester?.name || formData.requestedBy,
        requesterName: selectedRequester?.name || formData.requestedBy,
        requesterEmail: selectedRequester?.email || '',
        submittedAt: new Date().toISOString(),
        status: 'pending',
        imageUrl,
        applicationFileUrl,
        applicationFileName: applicationFile.name
      };

      // Save to Firebase
      await FirebaseService.savePartApplication(newApplication);

      if (emailSettings.notifyEmail) {
        await EmailService.sendApplicationEmail({
          emailType: 'submitted',
          toEmail: emailSettings.notifyEmail,
          requesterName: newApplication.requesterName || newApplication.requestedBy,
          requesterEmail: newApplication.requesterEmail || '',
          applicationId,
          supplier: newApplication.supplier,
          supplierSapCode: newApplication.supplierSapCode || '',
          standardPrice: newApplication.standardPrice,
          specifications: newApplication.specifications,
          notes: newApplication.notes,
          applicationFileUrl,
          imageUrl,
          submittedAt: newApplication.submittedAt,
          subjectPrefix: emailSettings.subjectPrefix,
        });
      }

      // Reload applications from database
      await loadApplications();

      showMessage('success', `Part application ${applicationId} submitted successfully!`);
      resetForm();

    } catch (error) {
      console.error('Error submitting application:', error);
      showMessage('error', 'Failed to submit part application');
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
      await FirebaseService.approvePartApplication(application.id, code);
      if (application.requesterEmail) {
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
          applicationFileUrl: application.applicationFileUrl,
          imageUrl: application.imageUrl,
          submittedAt: application.submittedAt,
          subjectPrefix: emailSettings.subjectPrefix,
        });
      }
      await loadApplications();
      setPartCodeDrafts((prev) => ({ ...prev, [application.id]: '' }));
      showMessage('success', `Application ${application.id} completed with part code ${code}.`);
    } catch (error) {
      console.error('Error saving part code:', error);
      showMessage('error', 'Failed to save part code');
    } finally {
      setIsSubmitting(false);
    }
  };

  const downloadTemplate = () => {
    const content = ['Requested By,Requester Email,Preferred Supplier,Preferred Supplier SAP Code,Standard Price,Specifications,Notes', ''].join('\n');
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
      // Update application status and part code
      await FirebaseService.approvePartApplication(approveDialog.application.id, partCode.trim());
      
      // If user uploaded a new image for the part code, upload it
      if (partCodeImage) {
        try {
          const newImageUrl = await FirebaseService.uploadPartImageWithCode(partCodeImage, partCode.trim());
          
          // Update the application with the new part code image URL
          const appRef = ref(database, `partApplications/${approveDialog.application.id}`);
          const appSnapshot = await get(appRef);
          if (appSnapshot.exists()) {
            const currentData = appSnapshot.val();
            const updatedData = {
              ...currentData,
              partCodeImageUrl: newImageUrl
            };
            await set(appRef, updatedData);
          }
          
          showMessage('success', `Application ${approveDialog.application.id} approved! Part code image uploaded as ${partCode}.png successfully.`);
        } catch (uploadError) {
          console.error('Error uploading part code image:', uploadError);
          showMessage('success', `Application ${approveDialog.application.id} approved with part code ${partCode}. Image upload failed but approval succeeded.`);
        }
      } else {
        showMessage('success', `Application ${approveDialog.application.id} approved with part code ${partCode}. You can manually download the original image and save it with the part code name.`);
      }

      // Reload applications to reflect the changes
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

  const downloadPDF = async (application: PartApplication) => {
    try {
      setIsSubmitting(true);
      
      // Convert to the expected PartApplication format from types/index.ts
      const pdfApplication = {
        ticket_id: application.id,
        supplier_name: application.supplier || 'N/A',
        part_description: application.specifications,
        part_number: `APP-${application.id}`,
        requested_by: application.requestedBy,
        department: application.department,
        urgency: application.priority,
        technical_specs: application.specifications,
        application_notes: application.notes,
        estimated_cost: parseFloat(application.standardPrice) || 0,
        justification: 'Part application request',
        status: application.status,
        created_at: new Date(application.submittedAt).getTime(),
        image_url: application.imageUrl // Ensure image URL is included
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
                      requestedBy: requester?.name || ''
                    }));
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder={requesters.length ? 'Select requester' : 'No requesters configured in /admin'} />
                    </SelectTrigger>
                    <SelectContent>
                      {requesters.map((requester) => (
                        <SelectItem key={requester.id} value={requester.id}>
                          {requester.name} ({requester.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="supplier">Preferred Supplier *</Label>
                    <Input
                      id="supplier"
                      value={formData.supplier}
                      onChange={(e) => setFormData(prev => ({ ...prev, supplier: e.target.value }))}
                      placeholder="Enter supplier name"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="supplierSapCode">Preferred Supplier SAP Code *</Label>
                    <Input
                      id="supplierSapCode"
                      value={formData.supplierSapCode}
                      onChange={(e) => setFormData(prev => ({ ...prev, supplierSapCode: e.target.value }))}
                      placeholder="Enter supplier SAP code"
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="standardPrice">Standard Price *</Label>
                  <Input
                    id="standardPrice"
                    type="number"
                    step="0.01"
                    value={formData.standardPrice}
                    onChange={(e) => setFormData(prev => ({ ...prev, standardPrice: e.target.value }))}
                    placeholder="Enter standard price"
                    required
                  />
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
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="applicationFile">Application File *</Label>
                    <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
                      <Download className="h-4 w-4 mr-2" />
                      Download Template
                    </Button>
                  </div>
                  <Input
                    id="applicationFile"
                    type="file"
                    accept=".csv,.xlsx,.xls,.pdf,.doc,.docx,image/*"
                    onChange={(e) => setApplicationFile(e.target.files?.[0] || null)}
                    required
                  />
                  {applicationFile && <p className="text-xs text-gray-500 mt-1">Selected: {applicationFile.name}</p>}
                </div>

                <div>
                  <Label htmlFor="image">Part Image (optional)</Label>
                  <div className="space-y-3">
                    <Input
                      id="image"
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
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
                <Badge variant="secondary">{applications.length} applications</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">
                  <LoadingSpinner size="md" />
                  <p className="text-gray-500 mt-2">Loading applications...</p>
                </div>
              ) : applications.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <FileText className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                  <p>No applications yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {applications.map((app) => (
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
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <div className="flex items-center space-x-1">
                            <Image className="h-3 w-3" />
                            <span>Image uploaded</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => downloadImage(app.imageUrl!, `${app.id}.png`)}
                            className="h-6 px-2 text-xs"
                          >
                            <Download className="h-3 w-3 mr-1" />
                            Open
                          </Button>
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
                                  <div><strong>Status:</strong> {app.status}</div>
                                </div>
                                <div><strong>Specifications:</strong> {app.specifications}</div>
                                {app.notes && <div><strong>Notes:</strong> {app.notes}</div>}
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
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => setApproveDialog({ open: true, application: app })}
                              className="text-green-600 hover:text-green-700"
                            >
                              <CheckCircle className="h-3 w-3" />
                            </Button>
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
              <Label htmlFor="partCodeImage">Upload Image with Part Code Name (Optional)</Label>
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
    </div>
  );
}
