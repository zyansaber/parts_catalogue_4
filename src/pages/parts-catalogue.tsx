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
import { getLang, resolvePartDescription, t, type Lang } from '@/lib/i18n';
import { LanguageSwitcher } from '@/components/ui/language-switcher';

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
  const [lang, setLang] = useState<Lang>(getLang());
  const itemsPerPage = 50;

  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  
  useEffect(() => {
    const fn = () => setLang(getLang());
    window.addEventListener('language-change', fn);
    return () => window.removeEventListener('language-change', fn);
  }, []);

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
          ? await FirebaseService.searchParts(debouncedSearchTerm, 10000)
          : await FirebaseService.getAllParts();
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
      const isHidden = part.show_in_catalogue === false;
      if (isHidden) return false;
      
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
          <h1 className="text-3xl font-bold text-gray-900">{t(lang, 'partsCatalogue')}</h1>
          <p className="text-gray-600 mt-1">
            {lang === 'zh' ? '浏览和搜索汽车零件库存' : 'Browse and search automotive parts inventory'}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Badge variant="secondary" className="text-sm whitespace-nowrap">
            {filteredAndSortedParts.length} {t(lang, 'partsFound')}
            {totalPages > 1 && ` | ${t(lang, 'page')} ${currentPage} ${t(lang, 'of')} ${totalPages}`}
          </Badge>
          <LanguageSwitcher />
        </div>
      </div>

      {/* Search and Filters */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">{t(lang, 'searchAndFilters')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <label className="text-sm font-medium mb-2 block">{t(lang, 'searchParts')}</label>
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-3 text-gray-400" />
                <Input
                  placeholder={t(lang, 'searchPlaceholder')}
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
              <label className="text-sm font-medium mb-2 block">{t(lang, 'supplier')}</label>
              <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                <SelectTrigger>
                  <SelectValue placeholder={t(lang, 'allSuppliers')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t(lang, 'allSuppliers')}</SelectItem>
                  {suppliers.map(supplier => (
                    <SelectItem key={supplier} value={supplier}>{supplier}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">{t(lang, 'sortBy')}</label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="material">{t(lang, 'sortMaterial')}</SelectItem>
                  <SelectItem value="price">{t(lang, 'sortPrice')}</SelectItem>
                  <SelectItem value="stock">{t(lang, 'sortStock')}</SelectItem>
                  <SelectItem value="supplier">{t(lang, 'sortSupplier')}</SelectItem>
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
            <label htmlFor="inStock" className="text-sm font-medium cursor-pointer">
              {t(lang, 'inStockOnly')}
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Parts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(displayedParts).map(([material, part]) => (
          <Card key={material} className="flex flex-col hover:shadow-lg transition-shadow">
            <CardContent className="flex-1 p-4 flex flex-col">
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  {part.Part_Image_Url && (
                    <ImageWithFallback
                      src={part.Part_Image_Url}
                      alt={material}
                      className="w-full h-48 object-cover rounded-md mb-2"
                    />
                  )}
                </div>
                
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedPart({ material, part })}
                      className="ml-2"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  {selectedPart?.material === material && (
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>{t(lang, 'partCodeValue')} {selectedPart.material}</DialogTitle>
                      </DialogHeader>
                      {selectedPart && (
                        <div className="grid grid-cols-2 gap-6">
                          <div className="space-y-4">
                            {selectedPart.part.Part_Image_Url && (
                              <div>
                                <ImageWithFallback
                                  src={selectedPart.part.Part_Image_Url}
                                  alt={selectedPart.material}
                                  className="w-full h-80 object-cover rounded-md"
                                />
                              </div>
                            )}
                            <div>
                              <label className="text-sm font-medium text-gray-500">{t(lang, 'description')}</label>
                              <p className="text-gray-900">{resolvePartDescription(lang, selectedPart.part) || '—'}</p>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-gray-500">{t(lang, 'supplier')}</label>
                              <p className="text-gray-900">{selectedPart.part.Supplier_Name || '—'}</p>
                            </div>
                            {/* Display admin-added fields */}
                            {selectedPart.part.notes && (
                              <div>
                                <label className="text-sm font-medium text-gray-500">{t(lang, 'notes')}</label>
                                <p className="text-gray-900">{selectedPart.part.notes}</p>
                              </div>
                            )}
                            {selectedPart.part.year && (
                              <div>
                                <label className="text-sm font-medium text-gray-500">{t(lang, 'year')}</label>
                                <p className="text-gray-900">{selectedPart.part.year}</p>
                              </div>
                            )}
                            {selectedPart.part.obsoleted_date && (
                              <div>
                                <label className="text-sm font-medium text-gray-500">{t(lang, 'obsoletedDate')}</label>
                                <p className="text-red-600">{selectedPart.part.obsoleted_date}</p>
                              </div>
                            )}
                          </div>
                          <div className="space-y-4">
                            <div>
                              <label className="text-sm font-medium text-gray-500">{t(lang, 'standardPrice')}</label>
                              <p className="text-xl font-bold text-green-600">{formatCurrency(selectedPart.part.Standard_Price || 0)}</p>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-gray-500">{t(lang, 'dealerPrice')}</label>
                              <p className="text-lg font-semibold text-blue-600">{formatCurrency(selectedPart.part.Dealer_Price || 0)}</p>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-gray-500">{t(lang, 'customerPrice')}</label>
                              <p className="text-lg font-semibold text-purple-600">{formatCurrency(selectedPart.part.Customer_Price || 0)}</p>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-gray-500">{t(lang, 'inventory')}</label>
                              <p className="text-xl font-semibold">{selectedPart.part.Current_Stock_Qty || 0} {t(lang, 'units')}</p>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-gray-500">{t(lang, 'availability')}</label>
                              <Badge variant={selectedPart.part.Current_Stock_Qty > 0 ? "default" : "secondary"}>
                                {selectedPart.part.Current_Stock_Qty > 0 ? t(lang, 'inStock') : t(lang, 'outOfStock')}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      )}
                    </DialogContent>
                  )}
                </Dialog>
              </div>
              
              <div className="space-y-2">
                <div>
                  <h3 className="font-mono text-xs font-bold text-blue-600 mb-1">{material}</h3>
                  <p className="text-xs text-gray-600 line-clamp-2 min-h-[2rem]">
                    {resolvePartDescription(lang, part) || t(lang, 'noDescription')}
                  </p>
                </div>
                
                {/* Display admin-added info in catalogue cards */}
                {part.notes && (
                  <p className="text-xs text-amber-600 mb-1">📝 {part.notes}</p>
                )}
                {part.year && (
                  <p className="text-xs text-blue-600 mb-1">📅 {t(lang, 'year')}: {part.year}</p>
                )}
                {part.obsoleted_date && (
                  <p className="text-xs text-red-600 mb-1">⚠️ {t(lang, 'obsoletedDate')}: {part.obsoleted_date}</p>
                )}
                
                <div className="text-xs text-gray-500 truncate mb-2">
                  {part.Supplier_Name || 'Unknown Supplier'}
                </div>
                
                <div className="border-t pt-2 space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">{t(lang, 'dealer')}:</span>
                    <span className="text-xs font-semibold text-blue-600">
                      {formatCurrency(part.Dealer_Price || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">{t(lang, 'customer')}:</span>
                    <span className="text-xs font-semibold text-purple-600">
                      {formatCurrency(part.Customer_Price || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t">
                    <span className="text-xs text-gray-500">{t(lang, 'stock')}:</span>
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
          <h3 className="text-lg font-medium text-gray-900 mb-2">{t(lang, 'noPartsFound')}</h3>
          <p className="text-gray-500">{t(lang, 'tryAdjustingSearch')}</p>
        </div>
      )}
    </div>
  );
}
