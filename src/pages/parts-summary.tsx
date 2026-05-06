import React, { useState, useEffect, useMemo } from 'react';
import { Search, TrendingUp, TrendingDown, DollarSign, Package, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { FirebaseService } from '@/services/firebase';
import { PartSummaryData } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { useDebounce } from '@/hooks/use-debounce';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function PartsSummaryPage() {
  const [parts, setParts] = useState<PartSummaryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState<string>('all');
  const [selectedMarginFilter, setSelectedMarginFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<keyof PartSummaryData>('Invoice_Amount_2025');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50);

  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // Load parts data
  useEffect(() => {
    const loadParts = async () => {
      setLoading(true);
      try {
        // Load all parts data by getting everything from the collection
        const partsData = await FirebaseService.getAllParts();
        const partsArray = Object.entries(partsData).map(([material, part]) => ({
          ...part,
          Material: material
        })) as PartSummaryData[];
        setParts(partsArray);
      } catch (error) {
        console.error('Error loading parts:', error);
      } finally {
        setLoading(false);
      }
    };

    loadParts();
  }, []);

  // Get unique suppliers and currencies
  const suppliers = useMemo(() => {
    const supplierSet = new Set<string>();
    parts.forEach(part => {
      if (part.Supplier_Name) {
        supplierSet.add(part.Supplier_Name);
      }
    });
    return Array.from(supplierSet).sort();
  }, [parts]);

  const marginStats = useMemo(() => {
    let positiveMargin = 0;
    let negativeMargin = 0;
    let zeroMargin = 0;
    
    parts.forEach(part => {
      const dealerMargin = (part['Dealer_vs_Std_%'] || 0);
      if (dealerMargin > 0) positiveMargin++;
      else if (dealerMargin < 0) negativeMargin++;
      else zeroMargin++;
    });
    
    return { positiveMargin, negativeMargin, zeroMargin };
  }, [parts]);

  // Filter and sort parts
  const filteredAndSortedParts = useMemo(() => {
    const filtered = parts.filter(part => {
      const matchesSearch = !debouncedSearchTerm || 
        part.Material?.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        part.SPRAS_EN?.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        part.Supplier_Name?.toLowerCase().includes(debouncedSearchTerm.toLowerCase());
      
      const matchesSupplier = selectedSupplier === 'all' || part.Supplier_Name === selectedSupplier;
      const matchesMargin = selectedMarginFilter === 'all' || 
        (selectedMarginFilter === 'positive' && (part['Dealer_vs_Std_%'] || 0) > 0) ||
        (selectedMarginFilter === 'negative' && (part['Dealer_vs_Std_%'] || 0) < 0) ||
        (selectedMarginFilter === 'zero' && (part['Dealer_vs_Std_%'] || 0) === 0);

      return matchesSearch && matchesSupplier && matchesMargin;
    });

    // Sort
    filtered.sort((a, b) => {
      const aValue = a[sortField] || 0;
      const bValue = b[sortField] || 0;
      
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
      }
      
      const aNum = Number(aValue) || 0;
      const bNum = Number(bValue) || 0;
      return sortDirection === 'asc' ? aNum - bNum : bNum - aNum;
    });

    return filtered;
  }, [parts, debouncedSearchTerm, selectedSupplier, selectedMarginFilter, sortField, sortDirection]);

  // Paginate the filtered results
  const paginatedParts = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredAndSortedParts.slice(startIndex, endIndex);
  }, [filteredAndSortedParts, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredAndSortedParts.length / itemsPerPage);

  // Calculate summary statistics
  const summaryStats = useMemo(() => {
    const totalInvoiceAmount = filteredAndSortedParts.reduce((sum, part) => sum + (part.Invoice_Amount_2025 || 0), 0);
    const totalSalesQty = filteredAndSortedParts.reduce((sum, part) => sum + (part.Sales_Qty_PGI_2025 || 0), 0);
    const totalPurchaseQty = filteredAndSortedParts.reduce((sum, part) => sum + (part.Purchase_Qty_2025_to_Date || 0), 0);
    const avgDealerMargin = filteredAndSortedParts.reduce((sum, part) => sum + (part['Dealer_vs_Std_%'] || 0), 0) / filteredAndSortedParts.length;

    return {
      totalInvoiceAmount,
      totalSalesQty,
      totalPurchaseQty,
      avgDealerMargin: avgDealerMargin || 0,
      totalParts: filteredAndSortedParts.length
    };
  }, [filteredAndSortedParts]);

  const handleSort = (field: keyof PartSummaryData) => {
    if (field === sortField) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const getSortIcon = (field: keyof PartSummaryData) => {
    if (field !== sortField) return null;
    return sortDirection === 'asc' ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />;
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
          <h1 className="text-3xl font-bold text-gray-900">Parts Summary</h1>
          <p className="text-gray-600 mt-1">Comprehensive analysis of parts procurement and sales</p>
        </div>
        <Button variant="outline" className="flex items-center space-x-2">
          <Download className="h-4 w-4" />
          <span>Export Data</span>
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Package className="h-4 w-4 text-blue-600" />
              <div className="text-sm font-medium text-gray-500">Total Parts</div>
            </div>
            <div className="text-2xl font-bold">{summaryStats.totalParts.toLocaleString()}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <DollarSign className="h-4 w-4 text-green-600" />
              <div className="text-sm font-medium text-gray-500">Total Invoice Amount</div>
            </div>
            <div className="text-2xl font-bold">{formatCurrency(summaryStats.totalInvoiceAmount)}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-4 w-4 text-purple-600" />
              <div className="text-sm font-medium text-gray-500">Total Sales Qty</div>
            </div>
            <div className="text-2xl font-bold">{summaryStats.totalSalesQty.toLocaleString()}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <TrendingDown className="h-4 w-4 text-orange-600" />
              <div className="text-sm font-medium text-gray-500">Total Purchase Qty</div>
            </div>
            <div className="text-2xl font-bold">{summaryStats.totalPurchaseQty.toLocaleString()}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <DollarSign className="h-4 w-4 text-red-600" />
              <div className="text-sm font-medium text-gray-500">Avg Dealer Margin</div>
            </div>
            <div className="text-2xl font-bold">{summaryStats.avgDealerMargin.toFixed(1)}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filters & Search</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Search Parts</label>
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-3 text-gray-400" />
                <Input
                  placeholder="Search by material, description, or supplier..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Supplier Filter</label>
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
              <label className="text-sm font-medium mb-2 block">Dealer Margin Filter</label>
              <Select value={selectedMarginFilter} onValueChange={setSelectedMarginFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All margins" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Margins</SelectItem>
                  <SelectItem value="positive">Positive ({marginStats.positiveMargin})</SelectItem>
                  <SelectItem value="negative">Negative ({marginStats.negativeMargin})</SelectItem>
                  <SelectItem value="zero">Zero ({marginStats.zeroMargin})</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Scatter Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Dealer Margin vs Sales Volume Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart
                data={filteredAndSortedParts.slice(0, 200).map((part) => ({
                  x: part.Sales_Qty_PGI_2025 || 0,
                  y: part['Dealer_vs_Std_%'] || 0,
                  material: part.Material,
                  description: part.SPRAS_EN,
                  sales: part.Sales_Qty_PGI_2025 || 0,
                  margin: part['Dealer_vs_Std_%'] || 0
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  type="number" 
                  dataKey="x" 
                  name="Sales Volume" 
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(value) => value.toLocaleString()}
                />
                <YAxis 
                  type="number" 
                  dataKey="y" 
                  name="Dealer Margin %" 
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(value) => `${value}%`}
                />
                <Tooltip 
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-white p-3 border rounded-lg shadow-lg">
                          <p className="font-medium text-blue-600">{data.material}</p>
                          <p className="text-sm text-gray-600 mb-2">{data.description || 'No description'}</p>
                          <p className="text-sm">Sales Volume: <span className="font-medium">{data.sales.toLocaleString()}</span></p>
                          <p className="text-sm">Dealer Margin: <span className="font-medium">{data.margin}%</span></p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Scatter name="Parts" dataKey="y" fill="#3b82f6" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Parts Analysis Data</CardTitle>
          <div className="flex items-center space-x-2">
            <Badge variant="secondary">{filteredAndSortedParts.length} parts</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-50" 
                    onClick={() => handleSort('Material')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Material</span>
                      {getSortIcon('Material')}
                    </div>
                  </TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-50" 
                    onClick={() => handleSort('Standard_Price')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Std Price</span>
                      {getSortIcon('Standard_Price')}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-50" 
                    onClick={() => handleSort('Dealer_Price')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Dealer Price</span>
                      {getSortIcon('Dealer_Price')}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-50" 
                    onClick={() => handleSort('Customer_Price')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Customer Price</span>
                      {getSortIcon('Customer_Price')}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-50" 
                    onClick={() => handleSort('Sales_Qty_PGI_2025')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Sales Qty</span>
                      {getSortIcon('Sales_Qty_PGI_2025')}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-50" 
                    onClick={() => handleSort('Invoice_Amount_2025')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Invoice Amount</span>
                      {getSortIcon('Invoice_Amount_2025')}
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-50" 
                    onClick={() => handleSort('Dealer_vs_Std_%')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Dealer Margin %</span>
                      {getSortIcon('Dealer_vs_Std_%')}
                    </div>
                  </TableHead>
                  <TableHead>Supplier</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedParts.map((part) => (
                  <TableRow key={part.Material}>
                    <TableCell className="font-mono text-sm font-medium text-blue-600">
                      {part.Material}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {part.SPRAS_EN || 'No description'}
                    </TableCell>
                    <TableCell>
                      {formatCurrency(part.Standard_Price || 0)}
                    </TableCell>
                    <TableCell>
                      {formatCurrency(part.Dealer_Price || 0)}
                    </TableCell>
                    <TableCell>
                      {formatCurrency(part.Customer_Price || 0)}
                    </TableCell>
                    <TableCell>
                      {(part.Sales_Qty_PGI_2025 || 0).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {formatCurrency(part.Invoice_Amount_2025 || 0)}
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={
                          (part['Dealer_vs_Std_%'] || 0) > 0 ? 'default' : 
                          (part['Dealer_vs_Std_%'] || 0) < 0 ? 'destructive' : 'secondary'
                        }
                      >
                        {(part['Dealer_vs_Std_%'] || 0).toFixed(1)}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {part.Supplier_Name || 'Unknown'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-500">
                Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredAndSortedParts.length)} of {filteredAndSortedParts.length} results
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <div className="flex items-center space-x-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const page = i + 1;
                    return (
                      <Button
                        key={page}
                        variant={page === currentPage ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCurrentPage(page)}
                      >
                        {page}
                      </Button>
                    );
                  })}
                  {totalPages > 5 && (
                    <>
                      <span className="text-gray-500">...</span>
                      <Button
                        variant={currentPage === totalPages ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCurrentPage(totalPages)}
                      >
                        {totalPages}
                      </Button>
                    </>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}