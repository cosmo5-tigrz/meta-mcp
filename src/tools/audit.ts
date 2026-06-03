import { z } from "zod";
import type { AuthManager } from "../utils/auth.js";

/* ------------------------------------------------------------------ */
/* Helpers Graph (GET + pagination + retry rate-limit)                 */
/* ------------------------------------------------------------------ */

type GraphPage<T> = { data?: T[]; paging?: { next?: string } };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function graphGet<T = any>(
  auth: AuthManager,
  pathOrUrl: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T> {
  const GRAPH = `${auth.getBaseUrl()}/${auth.getApiVersion()}`;
  const TOKEN = auth.getAccessToken();

  let url: string;
  if (pathOrUrl.startsWith("http")) {
    url = pathOrUrl; // URL de pagination déjà signée (access_token inclus)
  } else {
    const u = new URL(`${GRAPH}/${pathOrUrl}`);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) u.searchParams.set(k, String(v));
    }
    u.searchParams.set("access_token", TOKEN);
    url = u.toString();
  }

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url);
    const json = await res.json();
    if (json.error) {
      const code = json.error.code;
      const rateLimited = code === 17 || code === 4 || code === 80004 || code === 32;
      if (rateLimited && attempt < 5) {
        await sleep(2000 * Math.pow(2, attempt));
        continue;
      }
      const err: any = new Error(`(#${code}) ${json.error.message}`);
      err.code = code;
      err.subcode = json.error.error_subcode;
      throw err;
    }
    return json as T;
  }
}

async function graphGetAll<T = any>(
  auth: AuthManager,
  path: string,
  params: Record<string, string | number | undefined>,
): Promise<T[]> {
  const out: T[] = [];
  let page = await graphGet<GraphPage<T>>(auth, path, params);
  out.push(...(page.data ?? []));
  let guard = 0;
  while (page.paging?.next && guard++ < 100) {
    page = await graphGet<GraphPage<T>>(auth, page.paging.next);
    out.push(...(page.data ?? []));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Comptes actifs (/me/adaccounts)                                     */
/* ------------------------------------------------------------------ */

type AdAccountLite = { id: string; name: string; account_status: number };

async function listActiveAdAccounts(auth: AuthManager): Promise<AdAccountLite[]> {
  const accounts = await graphGetAll<AdAccountLite>(auth, "me/adaccounts", {
    fields: "id,name,account_status",
    limit: 200,
  });
  return accounts.filter((a) => a.account_status === 1);
}

/* ------------------------------------------------------------------ */
/* Règles d'or : caractères autorisés = [A-Za-z0-9_-]                  */
/* ------------------------------------------------------------------ */

const ALLOWED = /^[A-Za-z0-9_-]+$/;

function namingErrors(name: string): string[] {
  if (ALLOWED.test(name)) return [];
  const errs = new Set<string>();
  for (const ch of name) {
    if (/[A-Za-z0-9_-]/.test(ch)) continue;
    if (ch === " ") errs.add("Espace");
    else if (/\p{L}/u.test(ch)) errs.add("Accent");
    else {
      switch (ch) {
        case "%": errs.add("%"); break;
        case "€": errs.add("€"); break;
        case "+": errs.add("+"); break;
        case ":": errs.add(":"); break;
        case "[":
        case "]": errs.add("[ ]"); break;
        case "'":
        case "’": errs.add("Apostrophe"); break;
        case "(":
        case ")": errs.add("Parenthèses"); break;
        case ".": errs.add("Point"); break;
        case ",": errs.add("Virgule"); break;
        case "/": errs.add("Slash"); break;
        case "&": errs.add("&"); break;
        default: errs.add(`Autre (${ch})`);
      }
    }
  }
  return [...errs];
}

/* ------------------------------------------------------------------ */
/* Cœur de l'audit                                                     */
/* ------------------------------------------------------------------ */

type CampaignInsight = { campaign_name: string; spend?: string };

async function auditNaming(
  auth: AuthManager,
  opts?: { date_preset?: string; include_clean?: boolean },
) {
  const date_preset = opts?.date_preset ?? "today";
  const include_clean = opts?.include_clean ?? false;

  const accounts = await listActiveAdAccounts(auth);
  const rows: any[] = [];
  const skipped: { id: string; name: string; reason: string }[] = [];

  for (const acct of accounts) {
    try {
      const camps = await graphGetAll<CampaignInsight>(auth, `${acct.id}/insights`, {
        level: "campaign",
        date_preset,
        fields: "campaign_name,spend",
        limit: 500,
      });
      for (const c of camps) {
        const spend = parseFloat(c.spend ?? "0");
        if (!(spend > 0)) continue;
        const errors = namingErrors(c.campaign_name);
        if (errors.length === 0 && !include_clean) continue;
        rows.push({
          account_id: acct.id,
          account_name: acct.name,
          campaign_name: c.campaign_name,
          spend,
          errors,
        });
      }
    } catch (e: any) {
      skipped.push({ id: acct.id, name: acct.name, reason: e.message ?? String(e) });
    }
  }

  return {
    generated_at: new Date().toISOString(),
    date_preset,
    audited_accounts: accounts.length,
    flagged_campaigns: rows.length,
    skipped_accounts: skipped,
    rows,
  };
}

/* ------------------------------------------------------------------ */
/* Enregistrement du tool                                              */
/* ------------------------------------------------------------------ */

export function registerAuditTools(server: any, auth: AuthManager) {
  server.tool(
    "audit_naming_today",
    "Audite à la demande la nomenclature des campagnes live (spend>0) sur TOUS les comptes ouverts. " +
      "Énumère /me/adaccounts au moment de l'appel, applique les règles d'or (caractères autorisés : " +
      "lettres, chiffres, tiret, underscore) et ne renvoie que les campagnes non conformes.",
    {
      date_preset: z
        .string()
        .optional()
        .describe("Période d'analyse (défaut: today). Ex: today, yesterday, last_7d."),
      include_clean: z
        .boolean()
        .optional()
        .describe("Inclure aussi les campagnes conformes (défaut: false)."),
    },
    async ({ date_preset, include_clean }: { date_preset?: string; include_clean?: boolean }) => {
      try {
        const result = await auditNaming(auth, { date_preset, include_clean });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `Audit failed: ${e.message ?? String(e)}` }],
          isError: true,
        };
      }
    },
  );
}
