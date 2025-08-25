import React, { useState, useRef } from 'react';
import { Camera, Upload, Save, X, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { FirebaseService } from '@/services/firebase';

export default function TakePhotoPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [partCode, setPartCode] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
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

  const handleUpload = async () => {
    if (!selectedFile) {
      showMessage('error', 'Please select or take a photo first');
      return;
    }

    if (!partCode.trim()) {
      showMessage('error', 'Please enter a part code');
      return;
    }

    setIsUploading(true);
    try {
      // Upload image with part code as filename
      const imageUrl = await FirebaseService.uploadPartImageWithCode(selectedFile, partCode.trim());
      
      showMessage('success', `Photo uploaded successfully as ${partCode}`);
      
      // Reset form
      setSelectedFile(null);
      setImagePreview(null);
      setPartCode('');
      
      // Clear file inputs
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (galleryInputRef.current) galleryInputRef.current.value = '';
      
    } catch (error) {
      console.error('Error uploading photo:', error);
      showMessage('error', 'Failed to upload photo');
    } finally {
      setIsUploading(false);
    }
  };

  const clearPhoto = () => {
    setSelectedFile(null);
    setImagePreview(null);
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Take Photo</h1>
        <p className="text-gray-600 mt-1">Capture or upload part images with part code naming</p>
      </div>

      {/* Message Alert */}
      {message && (
        <Alert className={message.type === 'success' ? 'border-green-500' : 'border-red-500'}>
          <AlertDescription className={message.type === 'success' ? 'text-green-700' : 'text-red-700'}>
            {message.text}
          </AlertDescription>
        </Alert>
      )}

      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Camera className="h-5 w-5" />
              <span>Photo Capture</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
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

            {/* Camera and Gallery buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleCameraCapture}
                className="h-20 text-lg flex flex-col gap-3"
                disabled={isUploading}
              >
                <Camera className="h-8 w-8" />
                <span>Take Photo</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleGallerySelect}
                className="h-20 text-lg flex flex-col gap-3"
                disabled={isUploading}
              >
                <Upload className="h-8 w-8" />
                <span>From Gallery</span>
              </Button>
            </div>

            {/* Image preview */}
            {imagePreview && (
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 bg-gray-50 relative">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearPhoto}
                  className="absolute top-2 right-2 h-8 w-8 p-0"
                  disabled={isUploading}
                >
                  <X className="h-4 w-4" />
                </Button>
                <img
                  src={imagePreview}
                  alt="Selected photo"
                  className="max-w-full max-h-80 object-contain mx-auto rounded-lg"
                />
                <p className="text-center text-sm text-gray-600 mt-3">Photo ready for upload</p>
              </div>
            )}

            {/* Part Code input */}
            <div>
              <Label htmlFor="partCode" className="text-base font-medium">Part Code *</Label>
              <Input
                id="partCode"
                value={partCode}
                onChange={(e) => setPartCode(e.target.value)}
                placeholder="Enter part code for filename"
                className="h-12 text-base"
                disabled={isUploading}
                required
              />
              <p className="text-sm text-gray-500 mt-1">
                The photo will be saved with this part code as the filename
              </p>
            </div>

            {/* Upload button */}
            <Button
              onClick={handleUpload}
              disabled={isUploading || !selectedFile || !partCode.trim()}
              className="w-full h-14 text-lg font-medium"
            >
              {isUploading ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span className="ml-3">Uploading...</span>
                </>
              ) : (
                <>
                  <Save className="h-5 w-5 mr-3" />
                  Upload Photo
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}