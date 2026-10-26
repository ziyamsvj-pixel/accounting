// Server-only module: AI Gateway call for journal draft generation.
import { createOpenAI } from "@ai-sdk/openai";
import { Output, streamText } from "ai";
import { z } from "zod";

import { createLovableAiGatewayRunIdFetch } from "./run-id";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";
const MODEL = "openai/gpt-6-astra";

const lineSchema = z.object({
  account_code: z.string(),
  account_name: z.string(),
  debit: z.number(),
  credit: z.number(),
  description: z.string().nullable(),
  subsidiary_code: z.string().nullable(),
  subsidiary_name: z.string().nullable(),
  detail1_code: z.string().nullable(),
  detail1_name: z.string().nullable(),
  detail2_code: z.string().nullable(),
  detail2_name: z.string().nullable(),
});

const draftSchema = z.object({
  description: z.string(),
  lines: z.array(lineSchema),
});

export type JournalDraft = z.infer<typeof draftSchema>;

export type KnownAccount = {
  account_code: string;
  account_name: string;
  subsidiary_code: string | null;
  subsidiary_name: string | null;
  detail1_code: string | null;
  detail1_name: string | null;
  detail2_code: string | null;
  detail2_name: string | null;
};

export async function generateJournalDraft(
  eventDescription: string,
  knownAccounts: KnownAccount[],
): Promise<{ draft: JournalDraft | null; error: string | null }> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) {
    return { draft: null, error: "سرویس هوش مصنوعی پیکربندی نشده است." };
  }

  const runIdFetch = createLovableAiGatewayRunIdFetch();
  const provider = createOpenAI({
    baseURL: GATEWAY_URL,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });

  const accountsText =
    knownAccounts.length > 0
      ? knownAccounts
          .slice(0, 100)
          .map((a) =>
            [
              `کل: ${a.account_code} — ${a.account_name}`,
              a.subsidiary_code ? `معین: ${a.subsidiary_code} — ${a.subsidiary_name ?? ""}` : null,
              a.detail1_code ? `تفصیلی۱: ${a.detail1_code} — ${a.detail1_name ?? ""}` : null,
              a.detail2_code ? `تفصیلی۲: ${a.detail2_code} — ${a.detail2_name ?? ""}` : null,
            ]
              .filter(Boolean)
              .join(" | "),
          )
          .join("\n")
      : "(هنوز حسابی در اسناد کاربر ثبت نشده است)";

  try {
    const result = streamText({
      model: provider.responses(MODEL),
      system:
        "شما یک حسابدار رسمی ایرانی هستید. از شرح آزاد یک رویداد مالی، یک سند حسابداری دوطرفه و متوازن بسازید. " +
        "قواعد: جمع بدهکار باید دقیقاً برابر جمع بستانکار باشد؛ هر سطر فقط یکی از بدهکار یا بستانکار را دارد و دیگری صفر است؛ " +
        "مبالغ به ریال و بدون اعشار منفی؛ دست‌کم دو سطر؛ تا حد امکان از حساب‌های کل، معین و تفصیلی که کاربر قبلاً استفاده کرده بهره بگیرید؛ " +
        "اگر حساب مناسبی در فهرست نیست، کد و نام حساب استاندارد ایران را پیشنهاد دهید. " +
        "فیلدهای نامشخص را null بگذارید. شرح سند را فارسی و کوتاه بنویسید.",
      messages: [
        {
          role: "user",
          content:
            `حساب‌های شناخته‌شدهٔ کاربر:\n${accountsText}\n\n` +
            `شرح رویداد مالی:\n${eventDescription}`,
        },
      ],
      output: Output.object({ schema: draftSchema }),
      providerOptions: {
        openai: {
          store: false,
          forceReasoning: true,
          reasoningEffort: "low",
          reasoningSummary: "auto",
          include: ["reasoning.encrypted_content"],
        },
      },
    });

    const output = await result.output;
    if (!output) {
      return { draft: null, error: "پاسخ هوش مصنوعی قابل استفاده نبود؛ دوباره تلاش کنید." };
    }

    const lines = output.lines
      .map((l) => ({ ...l, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 }))
      .filter((l) => l.account_code && (l.debit > 0 || l.credit > 0));
    if (lines.length < 2) {
      return { draft: null, error: "سند پیشنهادی کمتر از دو سطر معتبر دارد؛ شرح را دقیق‌تر بنویسید." };
    }
    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
    if (Math.round((totalDebit - totalCredit) * 100) !== 0) {
      return {
        draft: null,
        error: "سند پیشنهادی متوازن نیست؛ لطفاً دوباره تلاش کنید یا سند را دستی ثبت کنید.",
      };
    }

    return { draft: { description: output.description, lines }, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { draft: null, error: `خطا در تولید پیشنهاد: ${message}` };
  }
}
