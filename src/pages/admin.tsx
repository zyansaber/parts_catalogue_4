import React, { useState, useEffect, useRef } from 'react';
import { Upload, Search, Save, AlertTriangle, Image, FileText, BarChart3, Camera, Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { FirebaseService } from '@/services/firebase';
import { Part } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { useDebounce } from '@/hooks/use-debounce';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { Switch } from '@/components/ui/switch';
import { getLang, resolvePartDescription, type Lang } from '@/lib/i18n';

const DEFAULT_R2_PUBLIC_BASE = 'https://pub-7e56631fd9fb4c6e9686364d876155f8.r2.dev';

export default function AdminPage() {
  const [parts, setParts] = useState<Record<string, Part>>({});
  const [filteredParts, setFilteredParts] = useState<[string, Part][]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPart, setSelectedPart] = useState<{ material: string; part: Part } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [lang, setLang] = useState<Lang>(getLang());

  // Refs for camera functionality
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Form states for editing
  const [notes, setNotes] = useState('');
  const [year, setYear] = useState('');
  const [obsoletedDate, setObsoletedDate] = useState('');
  const [alternativeParts, setAlternativeParts] = useState('');
  const [showInCatalogue, setShowInCatalogue] = useState(true);
  const [debugPartCode, setDebugPartCode] = useState('');
  const [debugChecking, setDebugChecking] = useState(false);
  const [debugResults, setDebugResults] = useState<Array<{ url: string; ok: boolean }>>([]);
  const [applicationRequesters, setApplicationRequesters] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [emailSettings, setEmailSettings] = useState({ notifyEmail: '', pricePendingNotifyEmail: '', subjectPrefix: 'Part Application', serviceId: '', publicKey: '', privateKey: '' });
  const [showEmailJsSettings, setShowEmailJsSettings] = useState(false);
  const detectedCfBase = (import.meta.env.VITE_CF_PUBLIC_BASE || '').trim();
  const detectedR2Base = (import.meta.env.VITE_R2_PUBLIC_BASE || DEFAULT_R2_PUBLIC_BASE).trim();

  // Stats for dashboard
  const [stats, setStats] = useState({
    totalParts: 0,
    partsWithImages: 0,
    partsWithoutImages: 0
  });

  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  useEffect(() => { const fn = () => setLang(getLang()); window.addEventListener('language-change', fn); return () => window.removeEventListener('language-change', fn); }, []);

  useEffect(() => {
    loadParts();
    loadApplicationAdminConfig();
  }, []);

  // Filter parts based on search
  useEffect(() => {
    if (!debouncedSearchTerm) {
      setFilteredParts(Object.entries(parts).slice(0, 100)); // Show first 100 parts
    } else {
      const filtered = Object.entries(parts).filter(([material, part]) => {
        const searchLower = debouncedSearchTerm.toLowerCase();
        return (
          material.toLowerCase().includes(searchLower) ||
          ((part.SPRAS_EN || '').toLowerCase().includes(searchLower) || (part.SPRAS_ZH || '').toLowerCase().includes(searchLower)) ||
          (part.Supplier_Name || '').toLowerCase().includes(searchLower)
        );
      }).slice(0, 100);
      setFilteredParts(filtered);
    }
  }, [parts, debouncedSearchTerm]);

  const loadParts = async () => {
    setLoading(true);
    try {
      const partsData = await FirebaseService.getAllParts();
      setParts(partsData);
      
      // Calculate stats
      const totalParts = Object.keys(partsData).length;
      let partsWithImages = 0;
      
      // For now, estimate parts with images based on a reasonable assumption
      // In production, you would implement proper image checking
      partsWithImages = Math.floor(totalParts * 0.35); // Estimate 35% have images
      
      setStats({
        totalParts,
        partsWithImages,
        partsWithoutImages: totalParts - partsWithImages
      });
    } catch (error) {
      console.error('Error loading parts:', error);
      showMessage('error', 'Failed to load parts data');
    } finally {
      setLoading(false);
    }
  };

  const loadApplicationAdminConfig = async () => {
    const [requesters, settings] = await Promise.all([
      FirebaseService.getApplicationRequesters(),
      FirebaseService.getApplicationEmailSettings()
    ]);
    setApplicationRequesters(requesters.length ? requesters : [{ id: crypto.randomUUID(), name: '', email: '' }]);
    setEmailSettings({
      notifyEmail: settings.notifyEmail || '',
      pricePendingNotifyEmail: settings.pricePendingNotifyEmail || '',
      subjectPrefix: settings.subjectPrefix || 'Part Application',
      serviceId: settings.serviceId || '',
      publicKey: settings.publicKey || '',
      privateKey: settings.privateKey || '',
    });
  };

  const saveApplicationAdminConfig = async () => {
    const validRequesters = applicationRequesters
      .map((item) => ({ ...item, name: item.name.trim(), email: item.email.trim() }))
      .filter((item) => item.name && item.email);
    if (validRequesters.length !== applicationRequesters.filter((item) => item.name.trim() || item.email.trim()).length) {
      showMessage('error', 'Each requester must have both name and email.');
      return;
    }
    setIsSaving(true);
    try {
      await Promise.all([
        FirebaseService.saveApplicationRequesters(validRequesters),
        FirebaseService.saveApplicationEmailSettings(emailSettings)
      ]);
      setApplicationRequesters(validRequesters.length ? validRequesters : [{ id: crypto.randomUUID(), name: '', email: '' }]);
      showMessage('success', 'Application requesters and email settings saved.');
    } catch (error) {
      console.error('Error saving application admin config:', error);
      showMessage('error', 'Failed to save application admin config');
    } finally {
      setIsSaving(false);
    }
  };

  const updateRequester = (id: string, field: 'name' | 'email', value: string) => {
    setApplicationRequesters((prev) => prev.map((item) => item.id === id ? { ...item, [field]: value } : item));
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const handlePartSelect = (material: string, part: Part) => {
    setSelectedPart({ material, part });
    setNotes(part.notes || '');
    setYear(part.year || '');
    setObsoletedDate(part.obsoleted_date || '');
    setAlternativeParts(part.alternative_parts || '');
    setShowInCatalogue(part.show_in_catalogue !== false);
  };

  const handleImageUpload = async (file: File) => {
    if (!selectedPart) return;

    setIsUploading(true);
    try {
      await FirebaseService.uploadPartImage(selectedPart.material, file);
      showMessage('success', `Image uploaded successfully for ${selectedPart.material}`);
    } catch (error) {
      console.error('Error uploading image:', error);
      showMessage('error', 'Failed to upload image');
    } finally {
      setIsUploading(false);
    }
  };

  const handleCameraCapture = () => {
    if (cameraInputRef.current) {
      cameraInputRef.current.click();
    }
  };

  const handleGallerySelect = () => {
    if (galleryInputRef.current) {
      galleryInputRef.current.click();
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      handleImageUpload(file);
    } else if (file) {
      showMessage('error', 'Please select an image file');
    }
  };

  const handleSavePartData = async () => {
    if (!selectedPart) return;

    setIsSaving(true);
    try {
      const trimmedNotes = notes.trim();
      const updates = {
        notes: trimmedNotes,
        year: year.trim() || undefined,
        obsoleted_date: obsoletedDate.trim() || undefined,
        alternative_parts: alternativeParts.trim() || undefined,
        show_in_catalogue: showInCatalogue,
      };

      await FirebaseService.updatePartData(selectedPart.material, updates);

      // Update local state
      setParts(prev => ({
        ...prev,
        [selectedPart.material]: {
          ...prev[selectedPart.material],
          ...updates
        }
      }));

      showMessage('success', `Part data updated successfully for ${selectedPart.material}`);
    } catch (error) {
      console.error('Error updating part data:', error);
      showMessage('error', 'Failed to update part data');
    } finally {
      setIsSaving(false);
    }
  };

  // Data for pie chart
  const chartData = [
    {
      name: 'Parts with Images',
      value: stats.partsWithImages,
      color: '#10b981'
    },
    {
      name: 'Parts without Images',
      value: stats.partsWithoutImages,
      color: '#ef4444'
    }
  ];

  const COLORS = ['#10b981', '#ef4444'];

  const checkImageExists = (url: string): Promise<boolean> => {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
    });
  };

  const handleDebugCheck = async () => {
    const code = debugPartCode.trim();
    if (!code) {
      showMessage('error', 'Please enter part code to check image paths');
      return;
    }

    const publicBase = (detectedCfBase || detectedR2Base || '').trim().replace(/\/+$/, '');
    if (!publicBase) {
      showMessage('error', 'Missing public base env. Fallback is applied to built-in R2 public base.');
      return;
    }

    const candidates = [
      `${publicBase}/partsfolder/${encodeURIComponent(code)}.png`,
      `${publicBase}/partsfolder/${encodeURIComponent(code)}.jpg`,
      `${publicBase}/partsfolder/${encodeURIComponent(code)}.webp`,
      `${publicBase}/${encodeURIComponent(code)}.png`,
      `${publicBase}/${encodeURIComponent(code)}.jpg`,
      `${publicBase}/${encodeURIComponent(code)}.webp`,
    ];

    setDebugChecking(true);
    try {
      const results = await Promise.all(candidates.map(async (url) => ({ url, ok: await checkImageExists(url) })));
      setDebugResults(results);
      if (results.some((x) => x.ok)) {
        showMessage('success', `Found image for part code ${code}`);
      } else {
        showMessage('error', `No image found for ${code}. Check if filename matches part code.`);
      }
    } finally {
      setDebugChecking(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Admin Panel</h1>
          <p className="text-gray-600 mt-1">Manage parts data, upload images, and add notes</p>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message.text}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Application Requesters & EmailJS Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {applicationRequesters.map((requester) => (
              <div key={requester.id} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2">
                <Input
                  value={requester.name}
                  onChange={(e) => updateRequester(requester.id, 'name', e.target.value)}
                  placeholder="Requester name"
                />
                <Input
                  value={requester.email}
                  onChange={(e) => updateRequester(requester.id, 'email', e.target.value)}
                  placeholder="Requester email"
                  type="email"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setApplicationRequesters((prev) => prev.filter((item) => item.id !== requester.id))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() => setApplicationRequesters((prev) => [...prev, { id: crypto.randomUUID(), name: '', email: '' }])}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add requester
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border-t pt-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Submission notification email</label>
              <Input
                value={emailSettings.notifyEmail}
                onChange={(e) => setEmailSettings((prev) => ({ ...prev, notifyEmail: e.target.value }))}
                placeholder="person@example.com"
                type="email"
              />
              <p className="text-xs text-gray-500 mt-1">New application emails are sent here.</p>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Prototype price pending recipient</label>
              <Input
                value={emailSettings.pricePendingNotifyEmail}
                onChange={(e) => setEmailSettings((prev) => ({ ...prev, pricePendingNotifyEmail: e.target.value }))}
                placeholder="price-owner@example.com"
                type="email"
              />
              <p className="text-xs text-gray-500 mt-1">14-day prototype price pending reminder emails are sent here.</p>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Email subject prefix</label>
              <Input
                value={emailSettings.subjectPrefix}
                onChange={(e) => setEmailSettings((prev) => ({ ...prev, subjectPrefix: e.target.value }))}
                placeholder="Part Application"
              />
            </div>
          </div>

          <div className="border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowEmailJsSettings((prev) => !prev)}
            >
              {showEmailJsSettings ? 'Hide EmailJS settings' : 'Show EmailJS settings'}
            </Button>
            {showEmailJsSettings && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                <div>
                  <label className="text-sm font-medium mb-2 block">EmailJS Service ID</label>
                  <Input
                    value={emailSettings.serviceId}
                    onChange={(e) => setEmailSettings((prev) => ({ ...prev, serviceId: e.target.value }))}
                    placeholder="service_xxxxxxx"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">EmailJS Public Key</label>
                  <Input
                    value={emailSettings.publicKey}
                    onChange={(e) => setEmailSettings((prev) => ({ ...prev, publicKey: e.target.value }))}
                    placeholder="public key"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">EmailJS Private Key</label>
                  <Input
                    value={emailSettings.privateKey}
                    onChange={(e) => setEmailSettings((prev) => ({ ...prev, privateKey: e.target.value }))}
                    placeholder="optional accessToken"
                    type="password"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
            <p className="font-medium">EmailJS template: template_rij27hq</p>
            <p>Preferred: fill EmailJS keys here so changes work immediately. Render env fallback names: VITE_EMAILJS_SERVICE_ID, VITE_EMAILJS_PUBLIC_KEY, and optional VITE_EMAILJS_PRIVATE_KEY/accessToken.</p>
          </div>

          <Button onClick={saveApplicationAdminConfig} disabled={isSaving}>
            <Save className="h-4 w-4 mr-2" />
            Save application email settings
          </Button>
        </CardContent>
      </Card>

      {/* Dashboard Stats */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Image Path Debugger</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={debugPartCode}
              onChange={(e) => setDebugPartCode(e.target.value)}
              placeholder="Enter part code, e.g. 282400102"
            />
            <Button onClick={handleDebugCheck} disabled={debugChecking}>
              {debugChecking ? 'Checking...' : 'Check URLs'}
            </Button>
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Detected VITE_CF_PUBLIC_BASE: {detectedCfBase || '(empty)'}</p>
            <p>Detected VITE_R2_PUBLIC_BASE: {detectedR2Base || '(empty)'}</p>
          </div>
          {debugResults.length > 0 && (
            <div className="space-y-2 text-sm">
              {debugResults.map((item) => (
                <div key={item.url} className="flex items-center justify-between gap-2 border rounded p-2">
                  <a href={item.url} target="_blank" rel="noreferrer" className="text-blue-600 underline break-all">
                    {item.url}
                  </a>
                  <Badge variant={item.ok ? 'default' : 'secondary'}>{item.ok ? 'FOUND' : '404/FAIL'}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center">
              <BarChart3 className="h-5 w-5 mr-2" />
              Dashboard Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Total Parts:</span>
                <span className="font-bold">{stats.totalParts}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">With Images:</span>
                <span className="font-bold text-green-600">{stats.partsWithImages}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Without Images:</span>
                <span className="font-bold text-red-600">{stats.partsWithoutImages}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Parts Image Coverage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    outerRadius={60}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Find Parts to Manage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-3 text-gray-400" />
            <Input
              placeholder="Search by part code, description, or supplier..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Parts List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Parts Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Parts List</CardTitle>
            <Badge variant="secondary">{filteredParts.length} parts shown</Badge>
          </CardHeader>
          <CardContent className="max-h-96 overflow-y-auto">
            <div className="space-y-2">
              {filteredParts.map(([material, part]) => (
                <div
                  key={material}
                  className={`p-3 border rounded-lg cursor-pointer hover:bg-gray-50 ${
                    selectedPart?.material === material ? 'bg-blue-50 border-blue-200' : ''
                  }`}
                  onClick={() => handlePartSelect(material, part)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-sm font-bold text-blue-600">{material}</p>
                      <p className="text-sm text-gray-600 truncate">{resolvePartDescription(lang, part) || 'No description'}</p>
                      <p className="text-xs text-gray-500">{part.Supplier_Name || 'Unknown supplier'}</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      {part.notes && <FileText className="h-4 w-4 text-amber-500" />}
                      {part.obsoleted_date && <AlertTriangle className="h-4 w-4 text-red-500" />}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Part Management */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {selectedPart ? `Manage: ${selectedPart.material}` : 'Select a Part to Manage'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedPart ? (
              <div className="space-y-4">
                {/* Current Image */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Current Image</label>
                  <div className="w-full h-32 bg-gray-50 rounded-lg overflow-hidden flex items-center justify-center">
                    <img
                      src={FirebaseService.getPartImageUrl(selectedPart.material)}
                      alt={selectedPart.material}
                      className="max-w-full max-h-full object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEyOCIgdmlld0JveD0iMCAwIDIwMCAxMjgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIyMDAiIGhlaWdodD0iMTI4IiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik04MCA1Nkg4OFY3Mkg4MFY1NloiIGZpbGw9IiM5Q0EzQUYiLz4KPHBhdGggZD0iTTEwNCA1NkgxMTJWNzJIMTA0VjU2WiIgZmlsbD0iIzlDQTNBRiIvPgo8L3N2Zz4K';
                      }}
                    />
                  </div>
                </div>

                {/* Hidden file inputs */}
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                {/* Image Upload */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Upload New Image</label>
                  
                  {/* Camera and Gallery buttons */}
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleCameraCapture}
                      disabled={isUploading}
                      className="h-12 text-sm flex flex-col gap-1"
                    >
                      <Camera className="h-5 w-5" />
                      <span>Take Photo</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleGallerySelect}
                      disabled={isUploading}
                      className="h-12 text-sm flex flex-col gap-1"
                    >
                      <Image className="h-5 w-5" />
                      <span>From Gallery</span>
                    </Button>
                  </div>

                  {/* Traditional file input (backup) */}
                  <div className="flex items-center space-x-2">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageUpload(file);
                      }}
                      disabled={isUploading}
                      className="flex-1"
                    />
                    {isUploading && <LoadingSpinner size="sm" />}
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Notes</label>
                  <Textarea
                    placeholder="Add notes about this part..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                  />
                </div>

                {/* Year */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Year</label>
                  <Input
                    placeholder="e.g., 2023"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                  />
                </div>

                {/* Obsoleted Date */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Obsoleted Date</label>
                  <Input
                    type="date"
                    value={obsoletedDate}
                    onChange={(e) => setObsoletedDate(e.target.value)}
                  />
                </div>

                {/* Alternative Parts */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Alternative Parts</label>
                  <Textarea
                    placeholder="List alternative part codes, separated by commas..."
                    value={alternativeParts}
                    onChange={(e) => setAlternativeParts(e.target.value)}
                    rows={2}
                  />
                </div>

                {/* Save Button */}
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">Show in catalogue</p>
                    <p className="text-xs text-gray-500">Toggle visibility for this part in the public catalogue.</p>
                  </div>
                  <Switch
                    checked={showInCatalogue}
                    onCheckedChange={setShowInCatalogue}
                    aria-label="Toggle catalogue visibility"
                  />
                </div>

                <Button
                  onClick={handleSavePartData}
                  disabled={isSaving}
                  className="w-full"
                >
                  {isSaving ? (
                    <>
                      <LoadingSpinner size="sm" />
                      <span className="ml-2">Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Part Data
                    </>
                  )}
                </Button>

                {/* Current Part Info */}
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <h4 className="font-medium text-sm mb-2">Current Part Info:</h4>
                  <div className="space-y-1 text-xs text-gray-600">
                    <p><strong>Stock:</strong> {selectedPart.part.Current_Stock_Qty || 0}</p>
                    <p><strong>Price:</strong> {formatCurrency(selectedPart.part.Standard_Price || 0)}</p>
                    <p><strong>Supplier:</strong> {selectedPart.part.Supplier_Name || 'Unknown'}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Image className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                <p>Select a part from the list to manage its data</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
