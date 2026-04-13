"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchPmsCashMaster } from "@/features/hms/pms/api/billing";

export type CashMasterFilters = {
  search?: string;
  invoice_status?: string;
  payment_status?: string;
  payment_method?: string;
  room?: string;
  guest_company?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
  sort_by?: string;
  sort_dir?: string;
};

export function useCashMaster(filters: CashMasterFilters) {
  return useQuery({
    queryKey: ["pms", "cash-master", filters],
    queryFn: () => fetchPmsCashMaster(filters),
  });
}
