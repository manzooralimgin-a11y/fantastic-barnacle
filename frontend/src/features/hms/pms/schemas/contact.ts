export type PmsContact = {
  id: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  salutation: string | null;
  birthday: string | null;
  country_code: string | null;
  country_name: string | null;
  custom_fields_json: Record<string, unknown> | null;
  reservation_count: number;
  last_stay_date: string | null;
  created_at: string;
  updated_at: string;
};

