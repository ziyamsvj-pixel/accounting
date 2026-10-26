import type { Account, FiscalPeriod, JournalDocument, JournalLine } from "@/domain/journal";
import type { Actor } from "@/domain/workflow";
import type { ExchangeRate } from "@/domain/fx";

export const scope = { tenantId: "t1", companyId: "c1", branchId: "b1", counterId: "k1" };

export const accounts = new Map<string, Account>([
  [
    "1000",
    {
      code: "1000",
      name: "دارایی‌های جاری",
      type: "GROUP",
      level: "GENERAL",
      isActive: true,
      currencyCode: null,
      isMonetary: false,
    },
  ],
  [
    "1101",
    {
      code: "1101",
      name: "صندوق",
      type: "LEDGER",
      level: "GENERAL",
      isActive: true,
      currencyCode: null,
      isMonetary: true,
    },
  ],
  [
    "1102",
    {
      code: "1102",
      name: "بانک ارزی",
      type: "LEDGER",
      level: "GENERAL",
      isActive: true,
      currencyCode: "USD",
      isMonetary: true,
    },
  ],
  [
    "2101",
    {
      code: "2101",
      name: "حساب‌های پرداختنی ارزی",
      type: "LEDGER",
      level: "GENERAL",
      isActive: true,
      currencyCode: "USD",
      isMonetary: true,
    },
  ],
  [
    "6101",
    {
      code: "6101",
      name: "هزینهٔ اداری",
      type: "LEDGER",
      level: "GENERAL",
      isActive: true,
      currencyCode: null,
      isMonetary: false,
    },
  ],
  [
    "7101",
    {
      code: "7101",
      name: "سود تسعیر",
      type: "LEDGER",
      level: "GENERAL",
      isActive: true,
      currencyCode: null,
      isMonetary: false,
    },
  ],
  [
    "8101",
    {
      code: "8101",
      name: "زیان تسعیر",
      type: "LEDGER",
      level: "GENERAL",
      isActive: true,
      currencyCode: null,
      isMonetary: false,
    },
  ],
  [
    "9999",
    {
      code: "9999",
      name: "حساب غیرفعال",
      type: "LEDGER",
      level: "GENERAL",
      isActive: false,
      currencyCode: null,
      isMonetary: false,
    },
  ],
]);

export const openPeriod: FiscalPeriod = {
  id: "1405-08",
  companyId: "c1",
  startDate: "2026-10-23",
  endDate: "2026-11-21",
  status: "OPEN",
};

export const clerk: Actor = {
  userId: "u-clerk",
  roles: ["editor"],
  tenantId: "t1",
  companyIds: ["c1"],
  branchIds: ["b1"],
};
export const clerk2: Actor = {
  userId: "u-clerk2",
  roles: ["editor"],
  tenantId: "t1",
  companyIds: ["c1"],
  branchIds: ["b1"],
};
export const manager: Actor = {
  userId: "u-mgr",
  roles: ["admin"],
  tenantId: "t1",
  companyIds: ["c1"],
  branchIds: null,
};
export const viewer: Actor = {
  userId: "u-view",
  roles: ["viewer"],
  tenantId: "t1",
  companyIds: ["c1"],
  branchIds: null,
};
export const outsider: Actor = {
  userId: "u-x",
  roles: ["admin"],
  tenantId: "t2",
  companyIds: ["c9"],
  branchIds: null,
};

export const rialLines = (amount = 1_500_000n): JournalLine[] => [
  {
    accountCode: "6101",
    currencyCode: "IRR",
    debitBaseMinor: amount,
    creditBaseMinor: 0n,
    description: "هزینه",
  },
  {
    accountCode: "1101",
    currencyCode: "IRR",
    debitBaseMinor: 0n,
    creditBaseMinor: amount,
    description: "پرداخت از صندوق",
  },
];

export function doc(overrides: Partial<JournalDocument> = {}): JournalDocument {
  return {
    scope,
    documentId: "d1",
    documentType: "JOURNAL",
    draftNumber: "DRAFT-d1",
    documentNumber: null,
    version: 1,
    status: "APPROVED",
    fiscalPeriodId: openPeriod.id,
    entryDate: "2026-10-27",
    description: "خرید لوازم اداری",
    baseCurrency: "IRR",
    lines: rialLines(),
    attachmentIds: ["att-1"],
    sourceReference: null,
    idempotencyKey: "idem-0001",
    createdBy: clerk.userId,
    createdAt: "2026-10-27T08:00:00Z",
    ...overrides,
  };
}

export const usdIrr = (overrides: Partial<ExchangeRate> = {}): ExchangeRate => ({
  id: "rate-usd-1",
  baseCurrency: "USD",
  quoteCurrency: "IRR",
  rateType: "ACCOUNTING",
  sourceId: "src-bank",
  baseUnits: "1",
  quoteUnits: "500000",
  validFrom: "2026-10-01T00:00:00Z",
  validTo: null,
  status: "APPROVED",
  ...overrides,
});
