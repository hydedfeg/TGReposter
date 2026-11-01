export const CRYPTO_PAYMENT_NETWORKS = ["bsc", "ethereum", "ton"] as const;
export type CryptoPaymentNetwork = (typeof CRYPTO_PAYMENT_NETWORKS)[number];

export type CryptoPaymentNetworkFamily = "evm" | "ton";
export type CryptoPaymentAsset = "USDT";

export type CryptoPaymentInvoiceStatus =
  | "pending"
  | "detected"
  | "confirming"
  | "paid"
  | "expired"
  | "underpaid"
  | "overpaid"
  | "failed"
  | "cancelled";

export type CryptoPaymentTransactionStatus =
  | "detected"
  | "confirming"
  | "confirmed"
  | "rejected";

export interface CryptoPaymentNetworkConfig {
  id: CryptoPaymentNetwork;
  family: CryptoPaymentNetworkFamily;
  asset: CryptoPaymentAsset;
  enabled: boolean;
  rpcUrl: string;
  apiKey?: string;
  receivingAddress: string;
  tokenIdentifier: string;
  requiredConfirmations: number;
  maxBlocksPerScan: number;
  requestTimeoutMs: number;
}

export interface CryptoPaymentTransferObservation {
  network: CryptoPaymentNetwork;
  txHash: string;
  eventIndex: string;
  tokenIdentifier: string;
  fromAddress?: string;
  toAddress: string;
  amount: string;
  blockReference?: string;
  confirmations: number;
  observedAt: string;
}

export interface CryptoPaymentScanRequest {
  receivingAddress: string;
  tokenIdentifier: string;
  cursor?: string;
  maxBlocks?: number;
}

export interface CryptoPaymentScanResult {
  observations: CryptoPaymentTransferObservation[];
  nextCursor: string;
  scannedFrom?: string;
  scannedTo?: string;
}

export interface CryptoPaymentNetworkAdapter {
  readonly network: CryptoPaymentNetwork;
  getAssetDecimals(): Promise<number>;
  scanTransfers(
    request: CryptoPaymentScanRequest
  ): Promise<CryptoPaymentScanResult>;
}
