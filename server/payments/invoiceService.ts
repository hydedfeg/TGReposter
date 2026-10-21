import crypto from "crypto";
import {
  CryptoPaymentRepository,
  type CryptoPaymentInvoiceRecord,
} from "../repositories/cryptoPaymentRepository";
import { createCryptoPaymentNetworkAdapter } from "./paymentAdapterFactory";
import type {
  CryptoPaymentNetworkAdapter,
  CryptoPaymentNetworkConfig,
  CryptoPaymentNetwork,
} from "./types";
import { loadCryptoPaymentNetworkConfigs } from "./paymentConfig";
import {
  DEFAULT_PAYMENT_DISCRIMINATOR_DIGITS,
  applyPaymentDiscriminator,
  maxPaymentDiscriminatorSlot,
} from "./paymentAmount";

const DEFAULT_AMOUNT_REUSE_DELAY_MS = 24 * 60 * 60 * 1000;
const MIN_AMOUNT_REUSE_DELAY_MS = 60 * 60 * 1000;
const MAX_AMOUNT_REUSE_DELAY_MS = 30 * 24 * 60 * 60 * 1000;

type Environment = Record<string, string | undefined>;

type InvoiceRepository = Pick<
  CryptoPaymentRepository,
  "tryCreateReservedInvoice" | "getInvoiceByRequestKey" | "getInvoice" | "updateInvoiceStatus"
>;

interface CryptoPaymentInvoiceServiceDependencies {
  repository?: InvoiceRepository;
  env?: Environment;
  now?: () => number;
  randomStartSlot?: (maxSlot: number) => number;
  createAdapter?: (
    config: CryptoPaymentNetworkConfig
  ) => Pick<CryptoPaymentNetworkAdapter, "getAssetDecimals">;
}

export interface CreateCryptoPaymentRequestInput {
  network: CryptoPaymentNetwork;
  baseAmount: string;
  expiresAt: string;
  requestKey: string;
}

function parseDiscriminatorDigits(value?: string): number {
  if (!value?.trim()) {
    return DEFAULT_PAYMENT_DISCRIMINATOR_DIGITS;
  }

  const digits = Number.parseInt(value, 10);
  maxPaymentDiscriminatorSlot(digits);
  return digits;
}

function parseAmountReuseDelayMs(value?: string): number {
  if (!value?.trim()) {
    return DEFAULT_AMOUNT_REUSE_DELAY_MS;
  }

  const delay = Number.parseInt(value, 10);
  if (
    !Number.isSafeInteger(delay) ||
    delay < MIN_AMOUNT_REUSE_DELAY_MS ||
    delay > MAX_AMOUNT_REUSE_DELAY_MS
  ) {
    throw new Error(
      `CRYPTO_PAYMENT_AMOUNT_REUSE_DELAY_MS must be between ${MIN_AMOUNT_REUSE_DELAY_MS} and ${MAX_AMOUNT_REUSE_DELAY_MS}.`
    );
  }

  return delay;
}

export class CryptoPaymentInvoiceService {
  private readonly repository: InvoiceRepository;
  private readonly env: Environment;
  private readonly now: () => number;
  private readonly randomStartSlot: (maxSlot: number) => number;
  private readonly createAdapter: (
    config: CryptoPaymentNetworkConfig
  ) => Pick<CryptoPaymentNetworkAdapter, "getAssetDecimals">;

  constructor(
    dependencies: CryptoPaymentInvoiceServiceDependencies = {}
  ) {
    this.repository =
      dependencies.repository ?? new CryptoPaymentRepository();
    this.env = dependencies.env ?? process.env;
    this.now = dependencies.now ?? (() => Date.now());
    this.randomStartSlot =
      dependencies.randomStartSlot ??
      ((maxSlot) => crypto.randomInt(1, maxSlot + 1));
    this.createAdapter =
      dependencies.createAdapter ?? createCryptoPaymentNetworkAdapter;
  }

  async createInvoice(
    ownerPrincipal: string,
    input: CreateCryptoPaymentRequestInput
  ): Promise<CryptoPaymentInvoiceRecord> {
    const requestKey = input.requestKey.trim();
    if (requestKey.length < 8 || requestKey.length > 128) {
      throw new Error(
        "Crypto payment idempotency key must be between 8 and 128 characters."
      );
    }

    const existingInvoice =
      await this.repository.getInvoiceByRequestKey(
        ownerPrincipal,
        requestKey
      );
    if (existingInvoice) {
      return existingInvoice;
    }

    const configs = loadCryptoPaymentNetworkConfigs(this.env);
    const config = configs.find((candidate) => candidate.id === input.network);

    if (!config) {
      throw new Error(
        `Crypto payment network "${input.network}" is not enabled.`
      );
    }

    const expiresAtMs = Date.parse(input.expiresAt);
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= this.now()) {
      throw new Error("Crypto payment invoice expiry must be in the future.");
    }

    const discriminatorDigits = parseDiscriminatorDigits(
      this.env.CRYPTO_PAYMENT_AMOUNT_DISCRIMINATOR_DIGITS
    );
    const maxSlot = maxPaymentDiscriminatorSlot(discriminatorDigits);
    const reuseDelayMs = parseAmountReuseDelayMs(
      this.env.CRYPTO_PAYMENT_AMOUNT_REUSE_DELAY_MS
    );
    const reservedUntil = new Date(
      expiresAtMs + reuseDelayMs
    ).toISOString();

    const adapter = this.createAdapter(config);
    const tokenDecimals = await adapter.getAssetDecimals();
    const startSlot = this.randomStartSlot(maxSlot);

    if (
      !Number.isSafeInteger(startSlot) ||
      startSlot < 1 ||
      startSlot > maxSlot
    ) {
      throw new Error("Crypto payment discriminator generator returned an invalid slot.");
    }

    for (let offset = 0; offset < maxSlot; offset += 1) {
      const slot = ((startSlot - 1 + offset) % maxSlot) + 1;
      const expectedAmount = applyPaymentDiscriminator({
        baseAmount: input.baseAmount,
        tokenDecimals,
        slot,
        discriminatorDigits,
      });

      const invoice = await this.repository.tryCreateReservedInvoice(
        ownerPrincipal,
        {
          network: config.id,
          requestedAmount: input.baseAmount,
          expectedAmount,
          requestKey,
          receivingAddress: config.receivingAddress,
          tokenIdentifier: config.tokenIdentifier,
          expiresAt: new Date(expiresAtMs).toISOString(),
          reservedUntil,
        }
      );

      if (invoice) {
        return invoice;
      }
    }

    throw new Error(
      "No unique crypto payment amount is currently available for this payment."
    );
  }

  async getInvoice(
    ownerPrincipal: string,
    invoiceId: string
  ): Promise<CryptoPaymentInvoiceRecord | null> {
    return this.repository.getInvoice(ownerPrincipal, invoiceId);
  }

  async cancelInvoice(
    ownerPrincipal: string,
    invoiceId: string
  ): Promise<CryptoPaymentInvoiceRecord | null> {
    return this.repository.updateInvoiceStatus(
      ownerPrincipal,
      invoiceId,
      "cancelled"
    );
  }
}
