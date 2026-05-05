import type { Profile } from "@workspace/db";
import type { ProxyConfig } from "../browser";
import type { ImapConfig } from "../imap";

export interface TaskInfo {
  id: number;
  retailer: string;
  productUrl: string;
  productKeywords: string;
  size: string;
  quantity: number;
  monitorDelay: number;
  retryCount: number;
  maxPrice: number | null;
}

export interface RetailerContext {
  task: TaskInfo;
  profile: Profile | null;
  proxy: ProxyConfig | null;
  token: { cancelled: boolean };
  log: (level: "INFO" | "SUCCESS" | "WARN" | "ERROR", msg: string) => void;
  setStatus: (status: string) => Promise<void>;
  /** Global IMAP config (from app Settings), used when the profile has no per-profile IMAP. */
  globalImapConfig: ImapConfig | null;
}

export interface RetailerResult {
  success: boolean;
  productName: string;
  productImage: string;
  price: string | null;
  orderNumber: string;
  errorMessage: string;
}
