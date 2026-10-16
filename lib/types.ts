import type { Channel, Frequency, Status, WindowId, WorkMode } from "./config";

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  telegram_chat_id: string | null;
  telegram_link_token: string;
  discord_webhook_url: string | null;
  plan: string;
  plan_status: string | null;
  created_at: string;
};

export type Alert = {
  id: string;
  user_id: string;
  role: string;
  city: string;
  country: string;
  work_mode: WorkMode;
  min_salary: number | null;
  max_experience: number | null;
  exclude_keywords: string[];
  frequency: Frequency;
  channels: Channel[];
  windows: WindowId[];
  timezone: string;
  active: boolean;
  last_checked_at: string | null;
  last_sent_at: string | null;
  created_at: string;
};

export type JobMatch = {
  id: string;
  user_id: string;
  alert_id: string | null;
  job_url: string;
  title: string | null;
  company: string | null;
  location: string | null;
  site: string | null;
  is_remote: boolean | null;
  salary: string | null;
  date_posted: string | null;
  description: string | null;
  source: "alert" | "manual";
  found_at: string;
  notified_at: string | null;
  status: Status;
  applied_at: string | null;
  resume_doc_id: string | null;
  cover_doc_id: string | null;
  notes: string | null;
  updated_at: string;
};

export type DocumentRow = {
  id: string;
  user_id: string;
  kind: "resume" | "cover_letter";
  name: string;
  storage_path: string;
  size_bytes: number | null;
  created_at: string;
};
