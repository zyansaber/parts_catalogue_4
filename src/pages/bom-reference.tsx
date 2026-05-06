import React, { useState, useEffect, useMemo } from 'react';
import { Search, FileText, Car } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { FirebaseService } from '@/services/firebase';
import { Part, BoMComponent } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { useDebounce } from '@/hooks/use-debounce';

export default function BomReferencePage() {
  const [bomModels, setBomModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [bomComponents, setBomComponents] = useState<Record<string, BoMComponent>>({});
  const [parts, setParts] = useState<Record<string, Part>>({});
  const [loading, setLoading] = useState(false);
  const [loadingComponents, setLoadingComponents] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState<string>('all');

  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // Load available BoM models on component mount
  useEffect(() => {
    const loadBoMModels = async () => {
      setLoading(true);
      try {
        const models = await FirebaseService.getAllBoMModels();
        setBomModels(models);
        if (models.length > 0) {
          setSelectedModel(models[0]); // Auto-select first model
        }
      } catch (error) {
        console.error('Error loading BoM models:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadBoMModels();
  }, []);

  // Load BoM components when model is selected
  useEffect(() => {
    if (!selectedModel) return;

    const loadBoMComponents = async () => {
      setLoadingComponents(true);
      try {
        // Load BoM components for selected model
        const bomData = await FirebaseService.getBoMComponents(selectedModel);
        setBomComponents(bomData);
        
        // Load parts data for all components
        const materialCodes = Object.values(bomData).map(comp => comp.Component_Material);
        const partsData: Record<string, Part> = {};
        
        // Load parts data in parallel
        const uniqueMaterials = [...new Set(materialCodes)];
        const partPromises = uniqueMaterials.map(async (material) => {
          try {
            const searchResult = await FirebaseService.searchParts(material, 1);
            if (searchResult[material]) {
              partsData[material] = searchResult[material];
            }
          } catch (error) {
            console.warn(`Failed to load part data for ${material}`);
          }
        });
        
        await Promise.all(partPromises);
        setParts(partsData);
      } catch (error) {
        console.error('Error loading BoM components:', error);
      } finally {
        setLoadingComponents(false);
      }
    };
    
    loadBoMComponents();
  }, [selectedModel]);

  // Note: Search filtering is handled in the filteredComponents useMemo hook

  const suppliers = useMemo(() => {
    const supplierSet = new Set<string>();
    Object.values(bomComponents).forEach(comp => {
      const material = comp?.Component_Material || '';
      if (material) {
        const part = parts[material];
        if (part?.Supplier_Name) {
          supplierSet.add(part.Supplier_Name);
        }
      }
    });
    return Array.from(supplierSet).sort();
  }, [bomComponents, parts]);

  const filteredComponents = useMemo(() => {
    let filtered = Object.values(bomComponents).filter(comp => comp && comp.Component_Material);
    
    // Apply search filter
    if (debouncedSearchTerm) {
      filtered = filtered.filter(comp => {
        const material = comp.Component_Material || '';
        const description = comp.Component_Description || '';
        const supplier = parts[material]?.Supplier_Name || '';
        
        return material.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
               description.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
               supplier.toLowerCase().includes(debouncedSearchTerm.toLowerCase());
      });
    }
    
    // Apply supplier filter
    if (selectedSupplier !== 'all') {
      filtered = filtered.filter(comp => {
        const material = comp.Component_Material || '';
        const part = parts[material];
        return part?.Supplier_Name === selectedSupplier;
      });
    }
    
    return filtered.sort((a, b) => (a.Component_Material || '').localeCompare(b.Component_Material || ''));
  }, [bomComponents, parts, selectedSupplier, debouncedSearchTerm]);

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
          <h1 className="text-3xl font-bold text-gray-900">BoM Reference</h1>
          <p className="text-gray-600 mt-1">Bill of Materials component reference</p>
        </div>
        <div className="flex items-center space-x-4">
          {selectedModel && (
            <Badge variant="outline" className="text-sm">
              <Car className="h-3 w-3 mr-1" />
              {selectedModel}
            </Badge>
          )}
          <Badge variant="secondary" className="text-sm">
            {filteredComponents.length} components
          </Badge>
        </div>
      </div>

      {/* Model Selection and Filters */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Model Selection & Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Model Selection */}
          <div>
            <label className="text-sm font-medium mb-2 block">Select BoM Model</label>
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a model..." />
              </SelectTrigger>
              <SelectContent>
                {bomModels.map(model => (
                  <SelectItem key={model} value={model}>
                    <div className="flex items-center">
                      <Car className="h-4 w-4 mr-2" />
                      {model}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {loadingComponents && (
              <div className="flex items-center mt-2">
                <LoadingSpinner size="sm" />
                <span className="ml-2 text-sm text-gray-600">Loading components...</span>
              </div>
            )}
          </div>

          {/* Search and Supplier Filter */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Search Components</label>
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-3 text-gray-400" />
                <Input
                  placeholder="Search by component code, description, or supplier..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  disabled={!selectedModel}
                />
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Supplier Filter</label>
              <Select value={selectedSupplier} onValueChange={setSelectedSupplier} disabled={!selectedModel}>
                <SelectTrigger>
                  <SelectValue placeholder="All suppliers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Suppliers</SelectItem>
                  {suppliers.map(supplier => (
                    <SelectItem key={supplier} value={supplier}>{supplier}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Compact BoM Components List */}
      <div className="space-y-2">
        {filteredComponents.map((component) => {
          const part = parts[component.Component_Material];
          return (
            <Card key={component.Component_Material} className="hover:shadow-md transition-shadow duration-200">
              <CardContent className="p-4">
                <div className="flex items-center space-x-4">
                  {/* Small Image */}
                  <div className="w-16 h-16 bg-gray-50 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center">
                    <img
                      src={FirebaseService.getPartImageUrl(component.Component_Material)}
                      alt={component.Component_Material}
                      className="max-w-full max-h-full object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0yMCAyNEg0NFYzNkgyMFYyNFoiIGZpbGw9IiM5Q0EzQUYiLz4KPC9zdmc+Cg==';
                      }}
                    />
                  </div>

                  {/* Component Information */}
                  <div className="flex-1 min-w-0">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                      {/* Material Code */}
                      <div>
                        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Material Code</label>
                        <p className="font-mono text-sm font-bold text-blue-600">{component.Component_Material}</p>
                      </div>
                      
                      {/* Component Description */}
                      <div className="md:col-span-2">
                        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Component Description</label>
                        <p className="text-sm text-gray-900 line-clamp-2">{component.Component_Description || part?.SPRAS_EN || 'No description'}</p>
                      </div>
                      
                      {/* Standard Price */}
                      <div>
                        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Std Price</label>
                        <p className="text-sm text-gray-900 font-medium">{formatCurrency(component.Standard_Price || 0)}</p>
                      </div>
                      
                      {/* Supplier */}
                      <div>
                        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Supplier</label>
                        <p className="text-sm text-gray-900">{component.Supplier || 'Unknown'}</p>
                      </div>
                    </div>
                    
                    {/* Additional Info Row */}
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                      <div className="flex items-center space-x-6 text-xs text-gray-500">
                        <span>Inventory: <span className="font-medium text-gray-900">{part?.Current_Stock_Qty || 0}</span></span>
                        <span>Price: <span className="font-medium text-green-600">{formatCurrency(part?.Standard_Price || 0)}</span></span>
                        {part?.year && <span>Year: <span className="font-medium text-blue-600">{part.year}</span></span>}
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        {part?.obsoleted_date && (
                          <Badge variant="destructive" className="text-xs">Obsoleted</Badge>
                        )}
                        <Badge variant={part?.Current_Stock_Qty && part.Current_Stock_Qty > 0 ? "default" : "secondary"} className="text-xs">
                          {part?.Current_Stock_Qty && part.Current_Stock_Qty > 0 ? "In Stock" : "Out of Stock"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {!selectedModel && bomModels.length > 0 && (
        <div className="text-center py-16">
          <Car className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Select a Model</h3>
          <p className="text-gray-500">Choose a BoM model from the dropdown to view its components</p>
        </div>
      )}

      {selectedModel && filteredComponents.length === 0 && !loadingComponents && (
        <div className="text-center py-16">
          <FileText className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No components found</h3>
          <p className="text-gray-500">Try adjusting your search criteria or filters</p>
        </div>
      )}

      {bomModels.length === 0 && !loading && (
        <div className="text-center py-16">
          <FileText className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No BoM models available</h3>
          <p className="text-gray-500">No Bill of Materials data found in the database</p>
        </div>
      )}
    </div>
  );
}