import { loadCryptoPaymentNetworkConfigs } from "../payments/paymentConfig";

/** Resolve a server-trusted chain-specific finality threshold.
 *
 * Checkout workers are not allowed to treat a DB row marked "confirmed" as
 * sufficient if its recorded confirmations fall below the configured network
 * threshold. A disabled/misconfigured network is a fail-closed condition,
 * not a reason to default to one confirmation.
 */
export function requiredBillingConfirmations(
  network: string,
  env: Record<string,string|undefined> = process.env
): number {
  const config=loadCryptoPaymentNetworkConfigs(env).find(item=>item.id===network);
  if(!config || !Number.isSafeInteger(config.requiredConfirmations) ||
     config.requiredConfirmations < 1){
    throw new Error("Billing confirmation network is not configured.");
  }
  return config.requiredConfirmations;
}
