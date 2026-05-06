import type { Profile, CreditCard } from "@workspace/db";
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
  monitorDelayMax: number | null;
  retryCount: number;
  maxPrice: number | null;
  stopAfterMs: number | null;
}

/** Decrypted retailer account credentials fetched from retailer_accounts table. */
export interface RetailerAccountCredentials {
  email: string;
  password: string;
}

export interface RetailerContext {
  task: TaskInfo;
  profile: Profile | null;
  /** The specific credit card to use for this checkout run. Provided by the
   *  task worker after cycling through all cards on the profile. Runners must
   *  NOT query the DB for cards themselves — always use this field. */
  card: CreditCard | null;
  proxy: ProxyConfig | null;
  token: { cancelled: boolean };
  log: (level: "INFO" | "SUCCESS" | "WARN" | "ERROR", msg: string) => void;
  setStatus: (status: string) => Promise<void>;
  setRetryProgress: (attempt: number, total: number | null) => void;
  /** Global IMAP config (from app Settings), used when the profile has no per-profile IMAP. */
  globalImapConfig: ImapConfig | null;
  /** Decrypted credentials for the retailer account (email + password). Null if not configured. */
  retailerAccount: RetailerAccountCredentials | null;
}

export interface RetailerResult {
  success: boolean;
  productName: string;
  productImage: string;
  price: string | null;
  orderNumber: string;
  errorMessage: string;
  /** Set to true when the task was paused due to a CAPTCHA / bot-detection
   *  challenge.  The taskWorker uses this flag to avoid overwriting the
   *  "paused_captcha" status with "failed" at the end of the run. */
  captchaPaused?: boolean;
  /** Set to true when the visual navigator was invoked during this run
   *  (i.e. at least one selector fallback used Claude vision). */
  visualAssist?: boolean;
}
