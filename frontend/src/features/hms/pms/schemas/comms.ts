export type PmsMessageTemplate = {
  id: number;
  property_id: number | null;
  code: string;
  name: string;
  channel: string;
  category: string;
  subject_template: string | null;
  body_template: string;
  metadata_json: Record<string, unknown> | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PmsMessageEvent = {
  id: number;
  property_id: number;
  thread_id: number;
  template_id: number | null;
  template_name: string | null;
  direction: string;
  channel: string;
  subject: string | null;
  body_text: string;
  sender_email: string | null;
  recipient_email: string | null;
  status: string;
  sent_at: string | null;
  error_message: string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type PmsMessageThread = {
  id: number;
  property_id: number;
  reservation_id: number | null;
  guest_id: number | null;
  channel: string;
  status: string;
  subject: string | null;
  guest_name: string | null;
  guest_email: string | null;
  last_message_at: string | null;
  last_direction: string | null;
  created_at: string;
  updated_at: string;
  events: PmsMessageEvent[];
};
