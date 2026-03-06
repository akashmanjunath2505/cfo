export interface Transaction {
  id: string;
  date: string;
  amount: number;
  category: string;
  merchant: string;
  status: 'pending' | 'completed' | 'failed';
  account_id: string;
}

export interface Budget {
  id: string;
  name: string;
  allocated: number;
  spent: number;
  period: string;
}

export interface FinancialStats {
  totalCash: number;
  monthlyBurn: number;
  runwayMonths: number;
  healthScore: number;
}

export interface AIDecision {
  id: string;
  timestamp: string;
  action: string;
  reasoning: string;
  status: 'pending' | 'executed' | 'rejected';
  impact_score: number;
}

export interface Bill {
  id: string;
  date: string;
  due_date: string;
  amount: number;
  vendor: string;
  category: string;
  status: 'pending' | 'approved' | 'paid' | 'rejected';
  file_url?: string;
  extracted_data?: any;
}

export interface ApprovalRequest {
  id: string;
  type: 'bill_payment' | 'budget_change' | 'allocation';
  target_id: string;
  requested_at: string;
  status: 'pending' | 'approved' | 'rejected';
  requested_by: string;
  approver_note?: string;
  vendor?: string; // Joined from bills
  amount?: number; // Joined from bills
  due_date?: string; // Joined from bills
}

export interface Investor {
  id: string;
  name: string;
  firm: string;
  stage: string;
  focus: string;
  last_contact: string;
  status: 'Lead' | 'Interested' | 'Passed' | 'Contacted';
}

export interface TreasuryStrategy {
  id: string;
  name: string;
  description: string;
  potential_yield: number;
  risk_level: 'None' | 'Low' | 'Medium' | 'High';
  status: 'Active' | 'Inactive' | 'Proposed';
  last_executed?: string;
}
