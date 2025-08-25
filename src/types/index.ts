export interface Part {
  Material?: string;
  SPRAS_EN?: string;
  Standard_Price?: number;
  Current_Stock_Qty?: number;
  Sales_Qty_PGI_2025?: number;
  Sales_Qty_SO_2025?: number;
  Invoice_Amount_2025?: number;
  Invoice_Currency?: string;
  Sales_Currency?: string;
  Sales_Unit?: string;
  Dealer_Price?: number;
  Customer_Price?: number;
  'Dealer_vs_Std_%'?: number;
  'Customer_vs_Std_%'?: number;
  Purchase_Qty_2025_to_Date?: number;
  Supplier_Name?: string;
  notes?: string;
  year?: string;
  obsoleted_date?: string;
  alternative_parts?: string;
}

export interface PartSummaryData {
  Material: string;
  SPRAS_EN: string;
  Standard_Price: number;
  Current_Stock_Qty: number;
  Sales_Qty_PGI_2025: number;
  Sales_Qty_SO_2025: number;
  Invoice_Amount_2025: number;
  Invoice_Currency: string;
  Sales_Currency: string;
  Sales_Unit: string;
  Dealer_Price: number;
  Customer_Price: number;
  'Dealer_vs_Std_%': number;
  'Customer_vs_Std_%': number;
  Purchase_Qty_2025_to_Date: number;
  Supplier_Name: string;
}

export interface BoMComponent {
  Component_Material: string;
  Component_Description: string;
  Standard_Price: number;
  Supplier: string;
  Component_Quantity?: number;
}

export interface PartApplication {
  ticket_id: string;
  supplier_name: string;
  part_description: string;
  part_number: string;
  requested_by: string;
  department: string;
  urgency: 'low' | 'medium' | 'high';
  technical_specs: string;
  application_notes: string;
  estimated_cost: number;
  justification: string;
  image_url?: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: number;
}