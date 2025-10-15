export type Payment = {
  id: number;
  payer_name: string;
  plate: string;
  payment_date: string;   // "YYYY-MM-DD"
  amount: number;
  installment_number?: number | null;
  proof_url?: string | null;
  status: "pending" | "confirmed" | "rejected";
  created_at: string;
  updated_at: string;
};
