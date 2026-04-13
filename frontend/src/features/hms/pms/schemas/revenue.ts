export type PmsRateSeason = {
  id: number;
  property_id: number;
  name: string;
  start_date: string;
  end_date: string;
  color_hex: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PmsRatePlan = {
  id: number;
  property_id: number;
  room_type_id: number;
  room_type_name: string | null;
  code: string;
  name: string;
  currency: string;
  base_price: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PmsRateMatrixEntry = {
  rate_date: string;
  price: number;
  season_id: number | null;
  season_name: string | null;
  closed: boolean;
  closed_to_arrival: boolean;
  closed_to_departure: boolean;
  min_stay: number | null;
  max_stay: number | null;
  notes: string | null;
};

export type PmsRateMatrix = {
  property_id: number;
  plan: PmsRatePlan;
  start_date: string;
  days: number;
  items: PmsRateMatrixEntry[];
};
