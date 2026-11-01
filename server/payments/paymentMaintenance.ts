import { CryptoPaymentRepository } from "../repositories/cryptoPaymentRepository";

export interface CryptoPaymentMaintenanceResult {
  expiredInvoices: number;
  releasedReservations: number;
}

type MaintenanceRepository = Pick<
  CryptoPaymentRepository,
  "expireStaleInvoicesAndReleaseReservations"
>;

export async function maintainCryptoPaymentInvoices(
  repository: MaintenanceRepository = new CryptoPaymentRepository()
): Promise<CryptoPaymentMaintenanceResult> {
  return repository.expireStaleInvoicesAndReleaseReservations();
}
