import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search, Eye, Package, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, SlidersHorizontal,
  ArrowUpDown, CheckSquare, AlertTriangle, CalendarClock,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { resolvePartDescription, type Lang } from '@/lib/i18n';

export default function PartsCatalogueStandalonePage() {
  const [allParts, setAllParts] = useState<Record<string, Part>>({});
  const [displayedParts, setDisplayedParts] = useState<Record<string, Part>>({});
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<string>('material');
  const [showInStockOnly, setShowInStockOnly] = useState(false);
  const [selectedPart, setSelectedPart] = useState<{ material: string; part: Part } | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const lang: Lang = 'en';
  const itemsPerPage = 50;

  const isEmbedded = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.self !== window.top;
  }, []);
  const containerRef = useRef<HTMLDivElement>(null);

  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  useEffect(() => {
    const load = async () => {
      if (debouncedSearchTerm) {
        setIsSearching(true);
      } else {
        setLoading(true);
      }
      try {
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

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm]);

  const filteredAndSortedParts = useMemo(() => {
    const filtered = Object.entries(allParts).filter(([material, part]) => {
      if (part.show_in_catalogue === false) return false;
      const searchLower = debouncedSearchTerm.toLowerCase();
      const matchesSearch = !searchLower ||
        material.toLowerCase().includes(searchLower) ||
        (part.SPRAS_EN || '').toLowerCase().includes(searchLower) ||
        (part.SPRAS_ZH || '').toLowerCase().includes(searchLower);
      const matchesStock = !showInStockOnly || (part.Current_Stock_Qty || 0) > 0;
      return matchesSearch && matchesStock;
    });

    filtered.sort(([materialA, partA], [materialB, partB]) => {
      switch (sortBy) {
        case 'price':   return (partA.Standard_Price || 0) - (partB.Standard_Price || 0);
        case 'stock':   return (partB.Current_Stock_Qty || 0) - (partA.Current_Stock_Qty || 0);
        default:        return materialA.localeCompare(materialB);
      }
    });

    return filtered;
  }, [allParts, debouncedSearchTerm, sortBy, showInStockOnly]);



  useEffect(() => {
    if (!isEmbedded || typeof window === 'undefined') return;

    const postHeight = () => {
      const containerHeight = containerRef.current?.scrollHeight ?? 0;
      const docHeight = document.documentElement?.scrollHeight ?? 0;
      const height = Math.max(containerHeight, docHeight);
      window.parent.postMessage(
        {
          source: 'parts-catalogue-standalone',
          type: 'catalogue:height',
          height,
        },
        '*'
      );
    };

    postHeight();
    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => postHeight())
      : null;

    if (resizeObserver && containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    window.addEventListener('resize', postHeight);
    return () => {
      window.removeEventListener('resize', postHeight);
      resizeObserver?.disconnect();
    };
  }, [isEmbedded, displayedParts, currentPage, totalPages, isSearching, loading]);


  useEffect(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    setDisplayedParts(Object.fromEntries(filteredAndSortedParts.slice(startIndex, endIndex)));
    setTotalPages(Math.ceil(filteredAndSortedParts.length / itemsPerPage));
  }, [filteredAndSortedParts, currentPage]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-96 gap-3">
        <LoadingSpinner size="lg" />
        <p className="text-sm text-slate-400 tracking-wider uppercase font-mono">Loading catalogue…</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`space-y-6 ${isEmbedded ? 'p-3 md:p-4' : ''}`}>

      {/* ── Header ──────────────────────────────────────────── */}
      {!isEmbedded && (
      <div className="flex items-start justify-between border-b border-slate-200 pb-5">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 shadow-md">
            <Package className="h-6 w-6 text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Parts Catalogue</h1>
            <p className="text-sm text-slate-500 mt-0.5">Browse and search caravan parts inventory</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-slate-400 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200">
            {filteredAndSortedParts.length.toLocaleString()} parts
          </span>
          {totalPages > 1 && (
            <span className="text-xs font-mono text-slate-400 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200">
              pg {currentPage}/{totalPages}
            </span>
          )}
        </div>
      </div>
      )}

      {/* ── Filters ─────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <div className="flex items-center gap-2 mb-4">
          <SlidersHorizontal className="h-4 w-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-700 tracking-wide">Search & Filters</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Search */}
          <div className="md:col-span-8 relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <Input
              placeholder="Part code or description…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-9 h-9 bg-white border-slate-300 text-sm placeholder:text-slate-400 focus-visible:ring-slate-900"
            />
            {isSearching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <LoadingSpinner size="sm" />
              </div>
            )}
          </div>

          {/* Sort */}
          <div className="md:col-span-4">
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="h-9 bg-white border-slate-300 text-sm focus:ring-slate-900">
                <ArrowUpDown className="h-3.5 w-3.5 mr-1.5 text-slate-400 flex-shrink-0" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="material">Part Code</SelectItem>
                <SelectItem value="stock">Stock (High → Low)</SelectItem>
                <SelectItem value="price">Price (Low → High)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* In-stock toggle */}
        <div className="flex items-center gap-2.5 mt-3 pt-3 border-t border-slate-200">
          <Checkbox
            id="inStock"
            checked={showInStockOnly}
            onCheckedChange={(checked) => setShowInStockOnly(checked as boolean)}
            className="border-slate-300 data-[state=checked]:bg-slate-900 data-[state=checked]:border-slate-900"
          />
          <label htmlFor="inStock" className="text-sm text-slate-600 cursor-pointer select-none">
            Show only parts in stock
          </label>
        </div>
      </div>

      {/* ── Grid ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {Object.entries(displayedParts).map(([material, part]) => {
          const inStock = (part.Current_Stock_Qty || 0) > 0;
          const isObsolete = !!part.obsoleted_date;

          return (
            <Card
              key={material}
              className={`
                group relative overflow-hidden border transition-all duration-200
                hover:shadow-md hover:-translate-y-0.5
                ${isObsolete ? 'border-red-200 bg-red-50/30' : 'border-slate-200 bg-white'}
              `}
            >
              <CardContent className="p-0">

                {/* Image area */}
                <div className="relative aspect-square bg-slate-50 overflow-hidden border-b border-slate-100">
                  <ImageWithFallback
                    src={FirebaseService.getPartImageUrl(material)}
                    fallbackSrcs={FirebaseService.getPartImageUrlWithFallback(material).slice(1)}
                    alt={resolvePartDescription(lang, part) || material}
                    className="w-full h-full object-contain p-2 transition-transform duration-300 group-hover:scale-105"
                    fallbackClassName="w-full h-full flex items-center justify-center"
                  />

                  {/* Stock badge — top left */}
                  <div className="absolute top-2 left-2">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-mono tracking-wide ${
                      inStock
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-800 text-slate-200'
                    }`}>
                      {inStock ? `${part.Current_Stock_Qty} in stock` : 'OUT'}
                    </span>
                  </div>

                  {/* View button — top right */}
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="absolute top-1.5 right-1.5 h-7 w-7 p-0 bg-white/80 hover:bg-white border border-slate-200 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-sm"
                        onClick={() => setSelectedPart({ material, part })}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </DialogTrigger>

                    {/* ── Detail Dialog ──────────────────── */}
                    <DialogContent className="max-w-3xl p-0 overflow-hidden rounded-xl">
                      <DialogHeader className="px-6 pt-5 pb-4 border-b border-slate-100 bg-slate-50">
                        <DialogTitle className="flex items-center gap-3">
                          <span className="font-mono text-lg font-bold text-slate-900">
                            {selectedPart?.material}
                          </span>
                          {selectedPart?.part.obsoleted_date && (
                            <Badge variant="destructive" className="text-xs">Obsolete</Badge>
                          )}
                          {selectedPart && (
                            <Badge
                              variant={selectedPart.part.Current_Stock_Qty > 0 ? 'default' : 'secondary'}
                              className={`text-xs ml-auto ${selectedPart.part.Current_Stock_Qty > 0 ? 'bg-emerald-500 hover:bg-emerald-600' : ''}`}
                            >
                              {selectedPart.part.Current_Stock_Qty > 0
                                ? `${selectedPart.part.Current_Stock_Qty} In Stock`
                                : 'Out of Stock'}
                            </Badge>
                          )}
                        </DialogTitle>
                      </DialogHeader>

                      {selectedPart && (
                        <div className="flex gap-0">
                          {/* Left: image */}
                          <div className="w-64 flex-shrink-0 bg-slate-50 p-6 flex items-center justify-center border-r border-slate-100">
                            <ImageWithFallback
                              src={FirebaseService.getPartImageUrl(selectedPart.material)}
                              fallbackSrcs={FirebaseService.getPartImageUrlWithFallback(selectedPart.material).slice(1)}
                              alt={resolvePartDescription(lang, selectedPart.part) || selectedPart.material}
                              className="max-w-full max-h-48 object-contain"
                              fallbackClassName="w-48 h-48 flex items-center justify-center text-slate-300"
                            />
                          </div>

                          {/* Right: details */}
                          <div className="flex-1 p-6 space-y-5 overflow-y-auto max-h-[70vh]">

                            {/* Description */}
                            <div>
                              <p className="text-[11px] uppercase tracking-widest font-semibold text-slate-400 mb-1">Description</p>
                              <p className="text-slate-900 font-medium leading-snug">
                                {resolvePartDescription(lang, selectedPart.part) || '—'}
                              </p>
                            </div>

                            {/* Pricing */}
                            <div className="grid grid-cols-2 gap-3">
                              <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3">
                                <p className="text-[10px] uppercase tracking-widest font-semibold text-blue-400 mb-1">Dealer Price</p>
                                <p className="text-xl font-bold text-blue-700 font-mono">
                                  {formatCurrency(selectedPart.part.Dealer_Price || 0)}
                                </p>
                              </div>
                              <div className="rounded-lg bg-amber-50 border border-amber-100 px-4 py-3">
                                <p className="text-[10px] uppercase tracking-widest font-semibold text-amber-500 mb-1">Customer Price</p>
                                <p className="text-xl font-bold text-amber-700 font-mono">
                                  {formatCurrency(selectedPart.part.Customer_Price || 0)}
                                </p>
                              </div>
                            </div>

                            {/* Notes / Year / Obsoleted */}
                            {selectedPart.part.notes && (
                              <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3">
                                <CheckSquare className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                                <div>
                                  <p className="text-[10px] uppercase tracking-widest font-semibold text-amber-500 mb-0.5">Notes</p>
                                  <p className="text-sm text-amber-900">{selectedPart.part.notes}</p>
                                </div>
                              </div>
                            )}
                            {selectedPart.part.year && (
                              <div className="flex items-center gap-2 text-sm text-slate-600">
                                <CalendarClock className="h-4 w-4 text-slate-400" />
                                <span className="font-medium">Year:</span> {selectedPart.part.year}
                              </div>
                            )}
                            {selectedPart.part.obsoleted_date && (
                              <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3">
                                <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                                <div>
                                  <p className="text-[10px] uppercase tracking-widest font-semibold text-red-400 mb-0.5">Obsoleted</p>
                                  <p className="text-sm text-red-800">{selectedPart.part.obsoleted_date}</p>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </DialogContent>
                  </Dialog>
                </div>

                {/* Card body */}
                <div className="p-3 space-y-2">

                  {/* Part code */}
                  <div className="flex items-start justify-between gap-1">
                    <span className="font-mono text-[11px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded tracking-wide leading-tight">
                      {material}
                    </span>
                    {isObsolete && (
                      <AlertTriangle className="h-3.5 w-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                    )}
                  </div>

                  {/* Description */}
                  <p className="text-[11px] text-slate-600 line-clamp-2 leading-snug min-h-[2rem]">
                    {resolvePartDescription(lang, part) || 'No description'}
                  </p>

                  {/* Admin flags */}
                  {part.notes && (
                    <p className="text-[10px] text-amber-600 truncate">📝 {part.notes}</p>
                  )}
                  {part.year && (
                    <p className="text-[10px] text-slate-500">📅 {part.year}</p>
                  )}

                  {/* Prices */}
                  <div className="flex gap-1.5 pt-1.5 border-t border-slate-100">
                    <div className="flex-1 bg-blue-50 rounded px-2 py-1 min-w-0">
                      <p className="text-[9px] text-blue-400 font-semibold uppercase tracking-wide">Dealer</p>
                      <p className="text-[11px] font-bold text-blue-700 font-mono truncate">
                        {formatCurrency(part.Dealer_Price || 0)}
                      </p>
                    </div>
                    <div className="flex-1 bg-amber-50 rounded px-2 py-1 min-w-0">
                      <p className="text-[9px] text-amber-500 font-semibold uppercase tracking-wide">Customer</p>
                      <p className="text-[11px] font-bold text-amber-700 font-mono truncate">
                        {formatCurrency(part.Customer_Price || 0)}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Empty state ─────────────────────────────────────── */}
      {Object.keys(displayedParts).length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="h-16 w-16 rounded-2xl bg-slate-100 flex items-center justify-center">
            <Package className="h-8 w-8 text-slate-300" />
          </div>
          <div className="text-center">
            <h3 className="text-base font-semibold text-slate-700">No parts found</h3>
            <p className="text-sm text-slate-400 mt-1">Try adjusting your search or clearing the filters</p>
          </div>
        </div>
      )}

      {/* ── Pagination ──────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentPage(1)}
            disabled={currentPage === 1}
            className="h-8 w-8 p-0 text-slate-500 disabled:opacity-30"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            className="h-8 w-8 p-0 text-slate-500 disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-1 mx-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const page = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
              if (page > totalPages) return null;
              const isActive = currentPage === page;
              return (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`h-8 w-8 rounded-md text-xs font-semibold transition-all duration-150 ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {page}
                </button>
              );
            })}
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
            className="h-8 w-8 p-0 text-slate-500 disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentPage(totalPages)}
            disabled={currentPage === totalPages}
            className="h-8 w-8 p-0 text-slate-500 disabled:opacity-30"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
