import type { PmsContact } from "@/features/hms/pms/schemas/contact";
import type { PmsFolio } from "@/features/hms/pms/schemas/payment";
import type { HotelDocument, HotelStay, HousekeepingTask } from "@/lib/hms";

export type ReservationFormValues = {
  anrede: string;
  guest_name: string;
  email: string;
  phone: string;
  room_type: string;
  room: string;
  check_in: string;
  check_out: string;
  adults: string;
  children: string;
  special_requests: string;
  zahlungs_methode: string;
  zahlungs_status: string;
};

export type PmsReservationSummary = {
  reservation_id: number;
  property_id: number;
  booking_id: string;
  guest_name: string;
  guest_email: string | null;
  guest_phone: string | null;
  guest_id: number | null;
  anrede: string | null;
  status: string;
  room: string | null;
  room_type_label: string | null;
  check_in: string;
  check_out: string;
  adults: number;
  children: number;
  total_amount: number;
  currency: string;
  payment_status: string | null;
  invoice_state: string | null;
  folio_id: number | null;
  folio_number: string | null;
  folio_balance_due: number | null;
  stay_id: number | null;
  stay_status: string | null;
  booking_source: string | null;
  color_tag: string | null;
  special_requests: string | null;
  zahlungs_methode: string | null;
  zahlungs_status: string | null;
  quick_actions: string[];
};

export type PmsCockpitItem = {
  reservation_id: number;
  booking_id: string;
  guest_name: string;
  status: string;
  room: string | null;
  room_type_label: string | null;
  check_in: string;
  check_out: string;
  adults: number;
  children: number;
  total_amount: number;
  payment_status: string | null;
  folio_status: string | null;
  stay_status: string | null;
};

export type PmsCockpit = {
  property_id: number;
  focus_date: string;
  arrivals: PmsCockpitItem[];
  in_house: PmsCockpitItem[];
  departures: PmsCockpitItem[];
  reservations: PmsCockpitItem[];
  live_log: PmsCockpitItem[];
};

export type PmsReservationWorkspace = {
  reservation: Partial<PmsReservationSummary>;
  stay: Partial<HotelStay>;
  guests: PmsContact[];
  folio_summary: Partial<PmsFolio>;
  tasks: HousekeepingTask[];
  documents: HotelDocument[];
};

export const emptyReservationForm: ReservationFormValues = {
  anrede: "",
  guest_name: "",
  email: "",
  phone: "",
  room_type: "",
  room: "",
  check_in: "",
  check_out: "",
  adults: "1",
  children: "0",
  special_requests: "",
  zahlungs_methode: "",
  zahlungs_status: "offen",
};
