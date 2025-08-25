import React, { useState, useEffect } from 'react';
import { FileText, Download, Plus, Eye, CheckCircle, Image } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { TranslationService } from '@/services/translation';
import { PDFService } from '@/services/pdf';
import { FirebaseService } from '@/services/firebase';

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
  
  // Form state
  const [formData, setFormData] = useState({
    requestedBy: '',
    department: '',
    priority: 'medium' as 'low' | 'medium' | 'high',
    specifications: '',
    supplier: '',
    standardPrice: '',
    notes: ''
  });

  // Load applications from Firebase on component mount
  useEffect(() => {
    loadApplications();
  }, []);

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
      requestedBy: '',
      department: '',
      priority: 'medium',
      specifications: '',
      supplier: '',
      standardPrice: '',
      notes: ''
    });
    setSelectedFile(null);
    setImagePreview(null);
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

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    if (!formData.requestedBy || !formData.department || !formData.specifications || !formData.supplier || !formData.standardPrice) {
      showMessage('error', 'Please fill in all required fields');
      return;
    }

    if (!selectedFile) {
      showMessage('error', 'Please upload an image');
      return;
    }

    setIsSubmitting(true);

    try {
      // Generate application ID
      const applicationId = generateApplicationId();
      
      // Upload image with application ID as filename
      const imageUrl = await FirebaseService.uploadPartApplicationImage(selectedFile, applicationId);

      // Create application object
      const newApplication: PartApplication = {
        ...formData,
        id: applicationId,
        submittedAt: new Date().toISOString(),
        status: 'pending',
        imageUrl
      };

      // Save to Firebase
      await FirebaseService.savePartApplication(newApplication);

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

  const handleApprove = async () => {
    if (!approveDialog.application || !partCode.trim()) {
      showMessage('error', 'Please enter a part code');
      return;
    }

    setIsSubmitting(true);
    try {
      // Update application status and part code
      await FirebaseService.approvePartApplication(approveDialog.application.id, partCode.trim());
      
      // Rename image file to part code
      if (approveDialog.application.imageUrl) {
        await FirebaseService.renamePartApplicationImage(approveDialog.application.id, partCode.trim());
      }

      // Reload applications
      await loadApplications();
      
      showMessage('success', `Application ${approveDialog.application.id} approved with part code ${partCode}`);
      setApproveDialog({ open: false, application: null });
      setPartCode('');
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="requestedBy">Requested By *</Label>
                    <Input
                      id="requestedBy"
                      value={formData.requestedBy}
                      onChange={(e) => setFormData(prev => ({ ...prev, requestedBy: e.target.value }))}
                      placeholder="Enter your name"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="department">Department *</Label>
                    <Input
                      id="department"
                      value={formData.department}
                      onChange={(e) => setFormData(prev => ({ ...prev, department: e.target.value }))}
                      placeholder="Enter department"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="priority">Priority</Label>
                    <Select value={formData.priority} onValueChange={(value: 'low' | 'medium' | 'high') => 
                      setFormData(prev => ({ ...prev, priority: value }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
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
                </div>

                <div>
                  <Label htmlFor="specifications">Specifications *</Label>
                  <Textarea
                    id="specifications"
                    value={formData.specifications}
                    onChange={(e) => setFormData(prev => ({ ...prev, specifications: e.target.value }))}
                    placeholder="Describe the part specifications and requirements"
                    rows={3}
                    required
                  />
                </div>

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
                  <Label htmlFor="image">Part Image *</Label>
                  <div className="space-y-3">
                    <Input
                      id="image"
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      required
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
                        <p><strong>Requested by:</strong> {app.requestedBy}</p>
                        <p><strong>Department:</strong> {app.department}</p>
                        <p><strong>Supplier:</strong> {app.supplier}</p>
                        <p><strong>Standard Price:</strong> ${app.standardPrice}</p>
                      </div>
                      
                      {app.imageUrl && (
                        <div className="flex items-center space-x-1 text-xs text-gray-500">
                          <Image className="h-3 w-3" />
                          <span>Image uploaded</span>
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
                                {app.imageUrl && (
                                  <div>
                                    <strong>Part Image:</strong>
                                    <div className="mt-2">
                                      <img
                                        src={app.imageUrl}
                                        alt="Part image"
                                        className="max-w-full max-h-60 object-contain border rounded"
                                      />
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Application - {approveDialog.application?.id}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="partCode">Part Code *</Label>
              <Input
                id="partCode"
                value={partCode}
                onChange={(e) => setPartCode(e.target.value)}
                placeholder="Enter part code"
                required
              />
            </div>
            <div className="flex justify-end space-x-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setApproveDialog({ open: false, application: null });
                  setPartCode('');
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
                    Approve
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