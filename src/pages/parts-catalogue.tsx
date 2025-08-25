import React, { useState, useEffect, useMemo } from 'react';
import { Search, Eye, Package, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ImageWithFallback } from '@/components/ui/image-with-fallback';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { FirebaseService } from '@/services/firebase';
import { Part } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { useDebounce } from '@/hooks/use-debounce';

export default function PartsCataloguePage() {
  const [allParts, setAllParts] = useState<Record<string, Part>>({});
  const [displayedParts, setDisplayedParts] = useState<Record<string, Part>>({});
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('material');
  const [showInStockOnly, setShowInStockOnly] = useState(false);
  const [selectedPart, setSelectedPart] = useState<{ material: string; part: Part } | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const itemsPerPage = 50;

  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // Load initial data and handle search
  useEffect(() => {
    const load = async () => {
      if (debouncedSearchTerm) {
        setIsSearching(true);
      } else {
        setLoading(true);
      }
      
      try {
        // Always search the entire database - use getAllParts for complete data
        const partsData = debouncedSearchTerm 
          ? await FirebaseService.searchParts(debouncedSearchTerm, 10000) // Increase limit for search
          : await FirebaseService.getAllParts(); // Get all parts when no search term
        setAllParts(partsData);
      } catch (error) {
        console.error('Error loading parts:', error);
      } finally {
        setLoading(false);
        setIsSearching(false);
      }
    };
    load();
  }, [debouncedSearchTerm]);

  // Reset to page 1 when search term changes
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm]);

  const suppliers = useMemo(() => {
    const supplierSet = new Set<string>();
    Object.values(allParts).forEach(part => {
      if (part.Supplier_Name) {
        supplierSet.add(part.Supplier_Name);
      }
    });
    return Array.from(supplierSet).sort();
  }, [allParts]);

  const filteredAndSortedParts = useMemo(() => {
    const filtered = Object.entries(allParts).filter(([material, part]) => {
      // Supplier filter
      const matchesSupplier = selectedSupplier === 'all' || part.Supplier_Name === selectedSupplier;
      // Stock filter
      const matchesStock = !showInStockOnly || (part.Current_Stock_Qty || 0) > 0;
      return matchesSupplier && matchesStock;
    });

    // Sort
    filtered.sort(([materialA, partA], [materialB, partB]) => {
      switch (sortBy) {
        case 'price':
          return (partA.Standard_Price || 0) - (partB.Standard_Price || 0);
        case 'stock':
          return (partB.Current_Stock_Qty || 0) - (partA.Current_Stock_Qty || 0);
        case 'supplier':
          return (partA.Supplier_Name || '').localeCompare(partB.Supplier_Name || '');
        default:
          return materialA.localeCompare(materialB);
      }
    });

    return filtered;
  }, [allParts, selectedSupplier, sortBy, showInStockOnly]);

  // Handle pagination
  useEffect(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedParts = filteredAndSortedParts.slice(startIndex, endIndex);
    setDisplayedParts(Object.fromEntries(paginatedParts));
    setTotalPages(Math.ceil(filteredAndSortedParts.length / itemsPerPage));
  }, [filteredAndSortedParts, currentPage]);

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
          <h1 className="text-3xl font-bold text-gray-900">Parts Catalogue</h1>
          <p className="text-gray-600 mt-1">Browse and search automotive parts inventory</p>
        </div>
        <Badge variant="secondary" className="text-sm">
          {filteredAndSortedParts.length} parts found
          {totalPages > 1 && ` | Page ${currentPage} of ${totalPages}`}
        </Badge>
      </div>

      {/* Search and Filters */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Search & Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <label className="text-sm font-medium mb-2 block">Search Parts</label>
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-3 text-gray-400" />
                <Input
                  placeholder="Search by part code, description, or supplier..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
                {isSearching && (
                  <div className="absolute right-3 top-3">
                    <LoadingSpinner size="sm" />
                  </div>
                )}
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Supplier</label>
              <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
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
            
            <div>
              <label className="text-sm font-medium mb-2 block">Sort By</label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="material">Part Code</SelectItem>
                  <SelectItem value="price">Price</SelectItem>
                  <SelectItem value="stock">Stock</SelectItem>
                  <SelectItem value="supplier">Supplier</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <Checkbox
              id="inStock"
              checked={showInStockOnly}
              onCheckedChange={(checked) => setShowInStockOnly(checked as boolean)}
            />
            <label htmlFor="inStock" className="text-sm font-medium">
              Show only parts in stock
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Parts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {Object.entries(displayedParts).map(([material, part]) => (
          <Card key={material} className="hover:shadow-lg transition-shadow duration-200">
            <CardContent className="p-3">
              <div className="aspect-square mb-3 relative bg-gray-50 rounded-lg overflow-hidden">
                <ImageWithFallback
                  src={FirebaseService.getPartImageUrl(material)}
                  fallbackSrcs={FirebaseService.getPartImageUrlWithFallback(material).slice(1)}
                  alt={part.SPRAS_EN || material}
                  className="w-full h-full object-contain"
                  fallbackClassName="w-full h-full rounded-lg flex items-center justify-center text-gray-400 text-sm"
                />
                
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      size="sm"
                      className="absolute top-2 right-2 h-8 w-8 bg-white/90 hover:bg-white text-gray-700"
                      onClick={() => setSelectedPart({ material, part })}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-3xl">
                    <DialogHeader>
                      <DialogTitle>Part Details - {material}</DialogTitle>
                    </DialogHeader>
                    {selectedPart && (
                      <div className="space-y-6">
                        <div className="aspect-video bg-gray-50 rounded-lg overflow-hidden">
                          <ImageWithFallback
                            src={FirebaseService.getPartImageUrl(selectedPart.material)}
                            fallbackSrcs={FirebaseService.getPartImageUrlWithFallback(selectedPart.material).slice(1)}
                            alt={selectedPart.part.SPRAS_EN || selectedPart.material}
                            className="w-full h-full object-contain"
                            fallbackClassName="w-full h-full rounded-lg flex items-center justify-center text-gray-400"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-6">
                          <div className="space-y-4">
                            <div>
                              <label className="text-sm font-medium text-gray-500">Part Code</label>
                              <p className="font-mono text-lg">{selectedPart.material}</p>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-gray-500">Description</label>
                              <p className="text-gray-900">{selectedPart.part.SPRAS_EN || '—'}</p>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-gray-500">Supplier</label>
                              <p className="text-gray-900">{selectedPart.part.Supplier_Name || '—'}</p>
                            </div>
                            {/* Display admin-added fields */}
                            {selectedPart.part.notes && (
                              <div>
                                <label className="text-sm font-medium text-gray-500">Notes</label>
                                <p className="text-gray-900">{selectedPart.part.notes}</p>
                              </div>
                            )}
                            {selectedPart.part.year && (
                              <div>
                                <label className="text-sm font-medium text-gray-500">Year</label>
                                <p className="text-gray-900">{selectedPart.part.year}</p>
                              </div>
                            )}
                            {selectedPart.part.obsoleted_date && (
                              <div>
                                <label className="text-sm font-medium text-gray-500">Obsoleted Date</label>
                                <p className="text-red-600">{selectedPart.part.obsoleted_date}</p>
                              </div>
                            )}
                          </div>
                          <div className="space-y-4">
                            <div>
                              <label className="text-sm font-medium text-gray-500">Standard Price</label>
                              <p className="text-xl font-bold text-green-600">{formatCurrency(selectedPart.part.Standard_Price || 0)}</p>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-gray-500">Dealer Price</label>
                              <p className="text-lg font-semibold text-blue-600">{formatCurrency(selectedPart.part.Dealer_Price || 0)}</p>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-gray-500">Customer Price</label>
                              <p className="text-lg font-semibold text-purple-600">{formatCurrency(selectedPart.part.Customer_Price || 0)}</p>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-gray-500">Inventory</label>
                              <p className="text-xl font-semibold">{selectedPart.part.Current_Stock_Qty || 0} units</p>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-gray-500">Availability</label>
                              <Badge variant={selectedPart.part.Current_Stock_Qty > 0 ? "default" : "secondary"}>
                                {selectedPart.part.Current_Stock_Qty > 0 ? "In Stock" : "Out of Stock"}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </DialogContent>
                </Dialog>
              </div>
              
              <div className="space-y-2">
                <div>
                  <h3 className="font-mono text-xs font-bold text-blue-600 mb-1">{material}</h3>
                  <p className="text-xs text-gray-600 line-clamp-2 min-h-[2rem]">
                    {part.SPRAS_EN || 'No description'}
                  </p>
                </div>
                
                {/* Display admin-added info in catalogue cards */}
                {part.notes && (
                  <p className="text-xs text-amber-600 mb-1">📝 {part.notes}</p>
                )}
                {part.year && (
                  <p className="text-xs text-blue-600 mb-1">📅 Year: {part.year}</p>
                )}
                {part.obsoleted_date && (
                  <p className="text-xs text-red-600 mb-1">⚠️ Obsoleted: {part.obsoleted_date}</p>
                )}
                
                <div className="text-xs text-gray-500 truncate mb-2">
                  {part.Supplier_Name || 'Unknown Supplier'}
                </div>
                
                <div className="border-t pt-2 space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">Dealer:</span>
                    <span className="text-xs font-semibold text-blue-600">
                      {formatCurrency(part.Dealer_Price || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">Customer:</span>
                    <span className="text-xs font-semibold text-purple-600">
                      {formatCurrency(part.Customer_Price || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t">
                    <span className="text-xs text-gray-500">Stock:</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      (part.Current_Stock_Qty || 0) > 0 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {part.Current_Stock_Qty || 0}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center space-x-2 mt-8">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(1)}
            disabled={currentPage === 1}
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          <div className="flex items-center space-x-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const page = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
              if (page > totalPages) return null;
              
              return (
                <Button
                  key={page}
                  variant={currentPage === page ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCurrentPage(page)}
                  className="w-10"
                >
                  {page}
                </Button>
              );
            })}
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(totalPages)}
            disabled={currentPage === totalPages}
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {Object.keys(displayedParts).length === 0 && !loading && (
        <div className="text-center py-16">
          <Package className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No parts found</h3>
          <p className="text-gray-500">Try adjusting your search criteria or filters</p>
        </div>
      )}
    </div>
  );
}