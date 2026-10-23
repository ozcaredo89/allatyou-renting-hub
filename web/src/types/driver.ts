export type Driver = {
  id: number;
  full_name: string;
  document_number: string;
  phone: string;
  email: string | null;
  address: string | null;
  status: "active" | "inactive" | "suspended";
  notes: string | null;
  date_of_birth: string | null;
  created_at: string;
  // Archivos
  photo_url: string | null;
  cv_url: string | null;
  id_front_url: string | null;
  id_back_url: string | null;
  license_front_url: string | null;
  license_back_url: string | null;
  contract_url: string | null;
  deposit_amount: number | null;
  deposit_receipt_url: string | null;
};

export const EMPTY_DRIVER: Omit<Driver, "id" | "created_at"> = {
  full_name: "",
  document_number: "",
  phone: "",
  email: "",
  address: "",
  status: "active",
  notes: "",
  date_of_birth: null,
  photo_url: null,
  cv_url: null,
  id_front_url: null,
  id_back_url: null,
  license_front_url: null,
  license_back_url: null,
  contract_url: null,
  deposit_amount: 300000,
  deposit_receipt_url: null,
};
