export * from "./generated/api";
export * from "./generated/api.schemas";
export { setBaseUrl, setAuthTokenGetter, ApiError } from "./custom-fetch";
export type { AuthTokenGetter } from "./custom-fetch";

import { CreateTaskBodyRetailer } from "./generated/api.schemas";
export const SUPPORTED_RETAILERS = Object.values(CreateTaskBodyRetailer) as [
  CreateTaskBodyRetailer,
  ...CreateTaskBodyRetailer[],
];
export type SupportedRetailer = CreateTaskBodyRetailer;
