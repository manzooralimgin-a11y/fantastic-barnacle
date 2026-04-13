export type PmsFolioPayment = {
  id: number;
  amount: number;
  method: string;
  reference: string | null;
  status: string;
  paid_at: string | null;
};

export type PmsFolioLine = {
  id: number;
  charge_type: string;
  description: string;
  quantity: number;
  unit_price?: number;
  total_price: number;
  service_date: string | null;
  status: string;
  metadata_json?: Record<string, unknown> | null;
};

export type PmsFolio = {
  id: number;
  reservation_id: number;
  stay_id: number;
  folio_number: string;
  currency: string;
  status: string;
  total: number;
  balance_due: number;
  lines: PmsFolioLine[];
  payments: PmsFolioPayment[];
};

export type PmsInvoiceLine = {
  id: number;
  invoice_id: number;
  folio_line_id: number | null;
  line_number: number;
  charge_type: string;
  description: string;
  quantity: number;
  unit_price: number;
  net_amount: number;
  tax_rate: number;
  tax_amount: number;
  gross_amount: number;
  service_date: string | null;
  created_at: string;
  updated_at: string;
};

export type PmsInvoiceDelivery = {
  id: number;
  invoice_id: number;
  document_id: number | null;
  channel: string;
  status: string;
  recipient_email: string | null;
  subject: string | null;
  message: string | null;
  sent_at: string | null;
  error_message: string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type PmsInvoice = {
  id: number;
  property_id: number;
  reservation_id: number;
  stay_id: number | null;
  folio_id: number;
  document_id: number | null;
  invoice_number: string;
  status: string;
  currency: string;
  recipient_name: string | null;
  recipient_email: string | null;
  issued_at: string | null;
  sent_at: string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  lines: PmsInvoiceLine[];
  deliveries: PmsInvoiceDelivery[];
};

export type RechnungPreviewData = {
  rechnungs_nr: string;
  folio: string;
  reservierung_nr: string;
  datum: string;
  gast_name: string;
  gast_anrede: string;
  gast_strasse: string;
  gast_plz_stadt: string;
  gast_land: string;
  firma_name: string;
  firma_strasse: string;
  firma_plz_stadt: string;
  firma_land: string;
  firma_ust_id: string;
  zimmer: string;
  zimmer_typ: string;
  anreise: string;
  abreise: string;
  items: Array<{
    nr: number;
    datum_von: string;
    datum_bis: string;
    beschreibung: string;
    menge: number;
    netto: number;
    mwst_satz: number;
    mwst: number;
    brutto: number;
  }>;
  netto_7: number;
  mwst_7: number;
  netto_19: number;
  mwst_19: number;
  gesamtsumme: number;
  kurtaxe: number;
  anzahlung: number;
  anzahlung_label: string;
  zahlung: number;
  zahlungs_methode: "bar" | "kartenzahlung" | "booking.com" | "expedia" | "ueberweisung" | "";
  zahlungs_status: "bezahlt" | "offen" | "teilweise";
  zahlungs_datum: string;
};

export type PmsInvoicePreview = {
  invoice: PmsInvoice;
  document: {
    id: number;
    document_kind: string;
    document_number: string;
    status: string;
    subject: string | null;
    title: string;
    body_text: string;
  } | null;
  preview_data: RechnungPreviewData;
};

export type PmsCashMasterRow = {
  invoice_id: number;
  invoice_number: string;
  guest_or_company: string;
  guest_name: string | null;
  company_name: string | null;
  reservation_id: number;
  booking_id: string | null;
  room_number: string | null;
  invoice_date: string;
  status: string;
  invoice_status: string;
  payment_status: string;
  total_amount: number;
  paid_amount: number;
  balance_due: number;
  payment_method: string | null;
  currency: string;
  document_id: number | null;
  folio_id: number;
  recipient_email: string | null;
};

export type PmsCashMasterTotals = {
  currency: string;
  invoice_count: number;
  total_invoiced: number;
  total_paid: number;
  total_outstanding: number;
};

export type PmsCashMaster = {
  items: PmsCashMasterRow[];
  totals: PmsCashMasterTotals;
  page: number;
  page_size: number;
  total_count: number;
};

export type PmsInvoiceAuditEvent = {
  id: string;
  event_type: string;
  actor_type: string;
  actor_name: string;
  entity_type: string | null;
  entity_id: number | null;
  action: string;
  detail: string;
  created_at: string;
};

export type PmsInvoiceAllowedActions = {
  can_edit: boolean;
  can_add_payment: boolean;
  can_finalize: boolean;
  can_generate_invoice: boolean;
  can_generate_receipt: boolean;
  can_generate_debit_note: boolean;
  can_generate_storno: boolean;
};

export type PmsInvoiceDetail = {
  invoice: PmsInvoice;
  folio: PmsFolio;
  reservation: {
    reservation_id: number;
    booking_id: string;
    guest_name: string;
    guest_email: string | null;
    guest_phone: string | null;
    room: string | null;
    room_type_label: string | null;
    check_in: string;
    check_out: string;
    payment_status: string;
    invoice_status: string;
  };
  document: {
    id: number;
    document_kind: string;
    document_number: string;
    status: string;
    subject: string | null;
    title: string;
    body_text: string;
    issued_at?: string | null;
    metadata_json?: Record<string, unknown> | null;
  } | null;
  preview_data: RechnungPreviewData;
  status_label: string;
  payment_status: string;
  paid_amount: number;
  balance_due: number;
  payment_method: string | null;
  allowed_actions: PmsInvoiceAllowedActions;
  audit_timeline: PmsInvoiceAuditEvent[];
};
