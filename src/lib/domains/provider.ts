export type CustomHostnameRequest = { hostname: string; storeId: string };
export type DomainProviderStatus =
  "pending_configuration" | "pending_verification" | "active" | "error" | "disabled";
export type DomainProviderResult = {
  providerReference: string;
  status: DomainProviderStatus;
  verification?: Record<string, string>;
};
export interface DomainProvider {
  createCustomHostname(input: CustomHostnameRequest): Promise<DomainProviderResult>;
  getHostnameStatus(providerReference: string): Promise<DomainProviderResult>;
  verifyHostname(providerReference: string): Promise<DomainProviderResult>;
  removeHostname(providerReference: string): Promise<void>;
}
export class DomainProviderNotConfiguredError extends Error {
  constructor() {
    super("A infraestrutura de domínio personalizado ainda precisa ser configurada pela BemMais.");
  }
}
/** Deliberately does not emulate Cloudflare or fabricate DNS records. */
export class UnconfiguredDomainProvider implements DomainProvider {
  private unavailable(): never {
    throw new DomainProviderNotConfiguredError();
  }
  async createCustomHostname(): Promise<DomainProviderResult> {
    return this.unavailable();
  }
  async getHostnameStatus(): Promise<DomainProviderResult> {
    return this.unavailable();
  }
  async verifyHostname(): Promise<DomainProviderResult> {
    return this.unavailable();
  }
  async removeHostname(): Promise<void> {
    return this.unavailable();
  }
}
export const domainProvider: DomainProvider = new UnconfiguredDomainProvider();
