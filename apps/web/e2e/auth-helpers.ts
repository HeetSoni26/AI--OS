export const AIOS_E2E_AUTH_BYPASS = process.env.AIOS_E2E_AUTH_BYPASS === "development-shell";

export interface E2EConfig {
  auth: string;
  bypass: boolean;
}
