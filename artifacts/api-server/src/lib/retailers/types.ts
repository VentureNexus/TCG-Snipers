import type { Profile } from "@workspace/db";
import type { ProxyConfig } from "../browser";

export interface TaskInfo {
  id: number;
  retailer: string;
  productUrl: string;
  productKeywords: string;
  size: string;
  quantity: number;
  monitorDelay: number;
  retryCount: number;
}

export interface RetailerContext {
  task: TaskInfo;
  profile: Profile | null;
  proxy: ProxyConfig | null;
  token: { cancelled: boolean };
  log: (level: "INFO" | "SUCCESS" | "WARN" | "ERROR", msg: string) => void;
  setStatus: (status: string) => Promise<void>;
}

export interface RetailerResult {
  success: boolean;
  productName: string;
  productImage: string;
  price: string | null;
  orderNumber: string;
  errorMessage: string;
}
