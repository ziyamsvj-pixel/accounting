import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { queryOptions } from "@tanstack/react-query";

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const url = process.env["SUPABASE_URL"]!;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export type Rule = {
  id: string;
  rule_code: string;
  version: string;
  domain: string;
  title: string;
  severity: string;
  status: string;
  priority: number;
  explanation: string;
  education_note: string | null;
  effective_from: string | null;
  effective_to: string | null;
  source_id: string | null;
};

export type Source = {
  id: string;
  authority: string;
  document_type: string;
  document_number: string | null;
  title: string;
  official_reference: string | null;
  verification_status: string;
  issue_date: string | null;
  effective_date: string | null;
};

export type AllocationBasis = {
  id: string;
  basis_key: string;
  title_fa: string;
  description: string;
  sort_order: number;
};

export const listRules = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await publicClient()
    .from("compliance_rules")
    .select(
      "id, rule_code, version, domain, title, severity, status, priority, explanation, education_note, effective_from, effective_to, source_id",
    )
    .order("domain")
    .order("priority");
  if (error) return { rules: [] as Rule[], error: error.message };
  return { rules: (data ?? []) as Rule[], error: null as string | null };
});

export const listSources = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await publicClient()
    .from("regulatory_sources")
    .select(
      "id, authority, document_type, document_number, title, official_reference, verification_status, issue_date, effective_date",
    )
    .order("authority");
  if (error) return { sources: [] as Source[], error: error.message };
  return { sources: (data ?? []) as Source[], error: null as string | null };
});

export const listAllocationBases = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await publicClient()
    .from("allocation_bases")
    .select("id, basis_key, title_fa, description, sort_order")
    .order("sort_order");
  if (error) return { bases: [] as AllocationBasis[], error: error.message };
  return { bases: (data ?? []) as AllocationBasis[], error: null as string | null };
});

export const rulesQuery = queryOptions({
  queryKey: ["compliance-rules"],
  queryFn: () => listRules(),
});

export const sourcesQuery = queryOptions({
  queryKey: ["regulatory-sources"],
  queryFn: () => listSources(),
});

export const allocationBasesQuery = queryOptions({
  queryKey: ["allocation-bases"],
  queryFn: () => listAllocationBases(),
});
