import { CryptoPaymentRepository } from "../repositories/cryptoPaymentRepository";
import type {
  CryptoPaymentInvoiceRecord,
} from "../repositories/cryptoPaymentRepository";
import type {
  CryptoPaymentNetworkAdapter,
  CryptoPaymentNetworkConfig,
  CryptoPaymentTransferObservation,
  CryptoPaymentTransactionStatus,
} from "./types";

export interface CryptoPaymentWatcherRepository {
  getNetworkCursor(input: {
    network: CryptoPaymentNetworkConfig["id"];
    tokenIdentifier: string;
    receivingAddress: string;
  }): Promise<string | null>;
  saveNetworkCursor(input: {
    network: CryptoPaymentNetworkConfig["id"];
    tokenIdentifier: string;
    receivingAddress: string;
    cursor: string;
  }): Promise<void>;
  findInvoicesMatchingObservation(
    observation: CryptoPaymentTransferObservation
  ): Promise<CryptoPaymentInvoiceRecord[]>;
  getTransactionAssignment(input: {
    network: CryptoPaymentNetworkConfig["id"];
    txHash: string;
    eventIndex: string;
  }): Promise<{ ownerPrincipal: string; invoiceId: string } | null>;
  getInvoice(
    ownerPrincipal: string,
    invoiceId: string
  ): Promise<CryptoPaymentInvoiceRecord | null>;
  upsertObservedTransfer(
    ownerPrincipal: string,
    invoiceId: string,
    observation: CryptoPaymentTransferObservation,
    status: CryptoPaymentTransactionStatus
  ): Promise<string>;
  appendEvent(input: {
    ownerPrincipal: string;
    invoiceId: string;
    transactionId?: string;
    source: "system" | CryptoPaymentNetworkConfig["id"];
    sourceEventId: string;
    eventType: string;
    occurredAt?: string;
  }): Promise<boolean>;
  updateInvoiceStatus(
    ownerPrincipal: string,
    invoiceId: string,
    status: CryptoPaymentInvoiceRecord["status"]
  ): Promise<CryptoPaymentInvoiceRecord | null>;
}

export interface CryptoPaymentWatcherRunResult {
  network: CryptoPaymentNetworkConfig["id"];
  scannedFrom?: string;
  scannedTo?: string;
  nextCursor: string;
  observations: number;
  matched: number;
  confirming: number;
  confirmed: number;
  unmatched: number;
  ambiguous: number;
  replayed: number;
}

function isOpenInvoice(invoice: CryptoPaymentInvoiceRecord): boolean {
  return (
    invoice.status === "pending" ||
    invoice.status === "detected" ||
    invoice.status === "confirming"
  );
}

export class CryptoPaymentWatcher {
  constructor(
    private readonly config: CryptoPaymentNetworkConfig,
    private readonly adapter: CryptoPaymentNetworkAdapter,
    private readonly repository: CryptoPaymentWatcherRepository =
      new CryptoPaymentRepository()
  ) {
    if (adapter.network !== config.id) {
      throw new Error("Crypto payment watcher adapter/config network mismatch.");
    }
  }

  async runOnce(): Promise<CryptoPaymentWatcherRunResult> {
    const cursor = await this.repository.getNetworkCursor({
      network: this.config.id,
      tokenIdentifier: this.config.tokenIdentifier,
      receivingAddress: this.config.receivingAddress,
    });

    const scan = await this.adapter.scanTransfers({
      receivingAddress: this.config.receivingAddress,
      tokenIdentifier: this.config.tokenIdentifier,
      cursor: cursor ?? undefined,
      maxBlocks: this.config.maxBlocksPerScan,
    });

    const result: CryptoPaymentWatcherRunResult = {
      network: this.config.id,
      scannedFrom: scan.scannedFrom,
      scannedTo: scan.scannedTo,
      nextCursor: scan.nextCursor,
      observations: scan.observations.length,
      matched: 0,
      confirming: 0,
      confirmed: 0,
      unmatched: 0,
      ambiguous: 0,
      replayed: 0,
    };

    for (const observation of scan.observations) {
      const existingAssignment =
        await this.repository.getTransactionAssignment({
          network: observation.network,
          txHash: observation.txHash,
          eventIndex: observation.eventIndex,
        });

      if (existingAssignment) {
        const invoice = await this.repository.getInvoice(
          existingAssignment.ownerPrincipal,
          existingAssignment.invoiceId
        );

        if (!invoice || !isOpenInvoice(invoice)) {
          result.replayed += 1;
          continue;
        }

        await this.applyObservation(invoice, observation, result);
        continue;
      }

      const matches =
        await this.repository.findInvoicesMatchingObservation(
          observation
        );

      if (matches.length === 0) {
        result.unmatched += 1;
        continue;
      }

      if (matches.length > 1) {
        result.ambiguous += 1;
        continue;
      }

      const invoice = matches[0];
      await this.applyObservation(invoice, observation, result);
    }

    await this.repository.saveNetworkCursor({
      network: this.config.id,
      tokenIdentifier: this.config.tokenIdentifier,
      receivingAddress: this.config.receivingAddress,
      cursor: scan.nextCursor,
    });

    return result;
  }

  private async applyObservation(
    invoice: CryptoPaymentInvoiceRecord,
    observation: CryptoPaymentTransferObservation,
    result: CryptoPaymentWatcherRunResult
  ): Promise<void> {
    const confirmed =
      observation.confirmations >= this.config.requiredConfirmations;
    const transactionStatus: CryptoPaymentTransactionStatus = confirmed
      ? "confirmed"
      : "confirming";
    const invoiceStatus = confirmed ? "paid" : "confirming";

    const transactionId = await this.repository.upsertObservedTransfer(
      invoice.owner_principal,
      invoice.id,
      observation,
      transactionStatus
    );

    await this.repository.appendEvent({
      ownerPrincipal: invoice.owner_principal,
      invoiceId: invoice.id,
      transactionId,
      source: observation.network,
      sourceEventId:
        `${observation.txHash}:${observation.eventIndex}:${transactionStatus}`,
      eventType: confirmed ? "transfer_confirmed" : "transfer_detected",
      occurredAt: observation.observedAt,
    });

    const updated = await this.repository.updateInvoiceStatus(
      invoice.owner_principal,
      invoice.id,
      invoiceStatus
    );

    if (updated) {
      invoice.status = updated.status;
    } else {
      invoice.status = invoiceStatus;
    }

    result.matched += 1;
    if (confirmed) {
      result.confirmed += 1;
    } else {
      result.confirming += 1;
    }
  }
}
