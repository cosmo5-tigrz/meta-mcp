// @ts-nocheck
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { MetaApiClient } from "../src/meta-client.js";

// Non-static strings prevent esbuild from bundling these packages at build time
const _mcpPkg   = "@modelcontextprotocol/sdk/server/mcp.js";
const _httpPkg  = "@modelcontextprotocol/sdk/server/streamableHttp.js";
const _zodPkg   = "zod";

function getMetaClient(): MetaApiClient {
  return new MetaApiClient();
}

function formatMetaError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const result: Record<string, unknown> = { error: error.message };
    if ("errorCode" in error && (error as any).errorCode != null) result.code = (error as any).errorCode;
    if ("errorSubcode" in error && (error as any).errorSubcode != null) result.subcode = (error as any).errorSubcode;
    if ("errorType" in error && (error as any).errorType != null) result.type = (error as any).errorType;
    return result;
  }
  return { error: String(error) };
}

function metaErrResponse(error: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ success: false, ...formatMetaError(error) }) }],
    isError: true as const,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const { McpServer } = await import(_mcpPkg);
  const { StreamableHTTPServerTransport } = await import(_httpPkg);
  const { z } = await import(_zodPkg);

  const server = new McpServer({
    name: "meta-ads-mcp",
    version: "1.7.0",
  });

  server.tool("health_check", "Check server health", {}, async () => ({
    content: [
      {
        type: "text",
        text: JSON.stringify({
          status: "ok",
          timestamp: new Date().toISOString(),
          has_token: !!process.env.META_ACCESS_TOKEN,
        }),
      },
    ],
  }));

  server.tool(
    "get_ad_accounts",
    "Get list of accessible Meta ad accounts",
    {},
    async () => {
      try {
        const client = getMetaClient();
        const accounts = await client.getAdAccounts();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, accounts, total: accounts.length }),
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "get_campaigns",
    "Get campaigns for an ad account",
    {
      account_id: z.string().describe("The ad account ID"),
      limit: z.number().optional().describe("Maximum number of campaigns to return (default: 25)"),
      status: z.array(z.string()).optional().describe("Filter by campaign status (ACTIVE, PAUSED, etc.)"),
    },
    async ({ account_id, limit, status }) => {
      try {
        const client = getMetaClient();
        const result = await client.getCampaigns(account_id, { limit: limit || 25, status });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                campaigns: result.data.map((c) => ({
                  id: c.id,
                  name: c.name,
                  objective: c.objective,
                  status: c.status,
                  effective_status: c.effective_status,
                  created_time: c.created_time,
                  daily_budget: c.daily_budget,
                  lifetime_budget: c.lifetime_budget,
                })),
                total: result.data.length,
              }),
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "get_insights",
    "Get performance insights for campaigns, ad sets, or ads",
    {
      object_id: z.string().describe("The ID of the campaign, ad set, or ad"),
      level: z.enum(["account", "campaign", "adset", "ad"]).describe("The level of insights"),
      date_preset: z.string().optional().describe("Date preset like 'last_7d', 'last_30d'"),
      fields: z.array(z.string()).optional().describe("Specific metrics to retrieve"),
      limit: z.number().optional().describe("Number of results to return"),
    },
    async ({ object_id, level, date_preset, fields, limit }) => {
      try {
        const client = getMetaClient();
        const params: Record<string, any> = {
          level,
          limit: limit || 25,
          date_preset: date_preset || "last_7d",
        };
        if (fields && fields.length > 0) params.fields = fields;
        const insights = await client.getInsights(object_id, params);
        return {
          content: [{ type: "text", text: JSON.stringify({ success: true, insights, object_id, level }) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "create_campaign",
    "Create a new advertising campaign",
    {
      account_id:            z.string().describe("The ad account ID"),
      name:                  z.string().describe("Campaign name"),
      objective:             z.string().describe("Campaign objective (OUTCOME_TRAFFIC, OUTCOME_SALES, OUTCOME_LEADS, etc.)"),
      status:                z.enum(["ACTIVE", "PAUSED"]).optional().describe("Campaign status (defaults to PAUSED)"),
      daily_budget:          z.number().optional().describe("Daily budget in cents (CBO). Omit for ABO."),
      lifetime_budget:       z.number().optional().describe("Lifetime budget in cents (CBO). Requires end_time."),
      end_time:              z.string().optional().describe("Campaign end date ISO 8601. Required with lifetime_budget."),
      bid_strategy:          z.enum(["LOWEST_COST_WITHOUT_CAP", "LOWEST_COST_WITH_BID_CAP", "COST_CAP"]).optional().describe("Bid strategy for CBO campaigns (default: LOWEST_COST_WITHOUT_CAP). Ignored for ABO."),
      special_ad_categories: z.array(z.string()).optional().describe('Special ad categories. Use [] or omit for standard campaigns; ["HOUSING"], ["EMPLOYMENT"], or ["CREDIT"] for regulated industries.'),
    },
    async ({ account_id, name, objective, status, daily_budget, lifetime_budget, end_time, bid_strategy, special_ad_categories }) => {
      try {
        const accessToken = process.env.META_ACCESS_TOKEN;
        const isCBO = !!(daily_budget || lifetime_budget);

        const params: Record<string, string> = {
          access_token: accessToken!,
          name,
          objective,
          status:       status || "PAUSED",
          buying_type:  "AUCTION",
          special_ad_categories: JSON.stringify(special_ad_categories ?? []),
        };

        if (daily_budget)    params.daily_budget = String(daily_budget);
        if (lifetime_budget) { params.lifetime_budget = String(lifetime_budget); if (end_time) params.stop_time = end_time; }
        // bid_strategy only makes sense at campaign level for CBO; ABO sets it at ad-set level
        if (isCBO) params.bid_strategy = bid_strategy || "LOWEST_COST_WITHOUT_CAP";

        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 15000);
        let data: any;
        try {
          const resp = await fetch(`${META_GRAPH_BASE}/act_${account_id}/campaigns`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams(params).toString(),
            signal: ctrl.signal,
          });
          data = await resp.json();
        } finally {
          clearTimeout(timeout);
        }

        if (data.error) {
          const e = data.error;
          return {
            content: [{ type: "text", text: JSON.stringify({ success: false, error: e.error_user_msg || e.message, code: e.code, subcode: e.error_subcode, user_title: e.error_user_title, trace_id: e.fbtrace_id }) }],
            isError: true,
          };
        }
        return {
          content: [{ type: "text", text: JSON.stringify({ success: true, campaign_id: data.id, name, objective, cbo: isCBO, bid_strategy: isCBO ? (bid_strategy || "LOWEST_COST_WITHOUT_CAP") : null }) }],
        };
      } catch (error) {
        return metaErrResponse(error);
      }
    }
  );

  server.tool(
    "update_campaign",
    "Update an existing campaign",
    {
      campaign_id: z.string().describe("Campaign ID to update"),
      name: z.string().optional().describe("New campaign name"),
      status: z.enum(["ACTIVE", "PAUSED"]).optional().describe("Campaign status"),
      daily_budget: z.number().optional().describe("Daily budget in cents"),
    },
    async ({ campaign_id, name, status, daily_budget }) => {
      try {
        if (daily_budget === 0) {
          return {
            content: [{ type: "text", text: JSON.stringify({ success: false, error: "Cannot set daily_budget to 0. Removing a campaign budget (CBO → ABO) is not supported by Meta API — create a new campaign instead." }) }],
            isError: true,
          };
        }
        const client = getMetaClient();
        const updates: any = {};
        if (name) updates.name = name;
        if (status) updates.status = status;
        if (daily_budget && daily_budget > 0) updates.daily_budget = daily_budget;
        if (Object.keys(updates).length === 0) {
          return { content: [{ type: "text", text: JSON.stringify({ success: false, error: "No updates provided." }) }], isError: true };
        }
        const result = await client.updateCampaign(campaign_id, updates);
        return {
          content: [{ type: "text", text: JSON.stringify({ success: true, result }) }],
        };
      } catch (error) {
        return metaErrResponse(error);
      }
    }
  );

  server.tool(
    "pause_campaign",
    "Pause a campaign",
    { campaign_id: z.string().describe("Campaign ID to pause") },
    async ({ campaign_id }) => {
      try {
        const client = getMetaClient();
        await client.updateCampaign(campaign_id, { status: "PAUSED" });
        return { content: [{ type: "text", text: JSON.stringify({ success: true, message: "Campaign paused" }) }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "resume_campaign",
    "Resume/activate a paused campaign",
    { campaign_id: z.string().describe("Campaign ID to resume") },
    async ({ campaign_id }) => {
      try {
        const client = getMetaClient();
        await client.updateCampaign(campaign_id, { status: "ACTIVE" });
        return { content: [{ type: "text", text: JSON.stringify({ success: true, message: "Campaign resumed" }) }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "list_ad_sets",
    "List ad sets for a campaign",
    {
      campaign_id: z.string().describe("The campaign ID"),
      limit: z.number().optional().describe("Number of ad sets to return"),
      status: z.array(z.string()).optional().describe("Filter by status"),
    },
    async ({ campaign_id, limit, status }) => {
      try {
        const client = getMetaClient();
        const params: any = { limit: limit || 25 };
        if (status) params.status = status;
        const adSets = await client.getAdSets({ campaignId: campaign_id, ...params });
        return { content: [{ type: "text", text: JSON.stringify({ success: true, ad_sets: adSets }) }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "list_audiences",
    "List custom audiences for an ad account",
    {
      account_id: z.string().describe("The ad account ID"),
      limit: z.number().optional().describe("Number of audiences to return"),
    },
    async ({ account_id, limit }) => {
      try {
        const client = getMetaClient();
        const audiences = await client.getCustomAudiences(account_id, { limit: limit || 25 });
        return { content: [{ type: "text", text: JSON.stringify({ success: true, audiences }) }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "list_ads",
    "List ads for an ad set, campaign, or account",
    {
      ad_set_id: z.string().optional().describe("The ad set ID"),
      campaign_id: z.string().optional().describe("The campaign ID"),
      account_id: z.string().optional().describe("The account ID"),
      limit: z.number().optional().describe("Number of ads to return"),
    },
    async ({ ad_set_id, campaign_id, account_id, limit }) => {
      try {
        const client = getMetaClient();
        const params: any = { limit: limit || 25 };
        let ads;
        if (ad_set_id) {
          ads = await client.getAds({ adsetId: ad_set_id, ...params });
        } else if (campaign_id) {
          ads = await client.getAdsByCampaign(campaign_id, params);
        } else if (account_id) {
          ads = await client.getAdsByAccount(account_id, params);
        } else {
          throw new Error("Must provide ad_set_id, campaign_id, or account_id");
        }
        return { content: [{ type: "text", text: JSON.stringify({ success: true, ads }) }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "list_ad_creatives",
    "List ad creatives for an account",
    {
      account_id: z.string().describe("The ad account ID"),
      limit: z.number().optional().describe("Number of creatives to return"),
    },
    async ({ account_id, limit }) => {
      try {
        const client = getMetaClient();
        const creatives = await client.getAdCreatives(account_id, { limit: limit || 25 });
        return { content: [{ type: "text", text: JSON.stringify({ success: true, creatives }) }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "compare_performance",
    "Compare performance between multiple campaigns, ad sets, or ads",
    {
      object_ids: z.array(z.string()).describe("Array of IDs to compare"),
      level: z.enum(["campaign", "adset", "ad"]).describe("The level of comparison"),
      date_preset: z.string().optional().describe("Date preset like 'last_7d', 'last_30d'"),
      fields: z.array(z.string()).optional().describe("Specific metrics to compare"),
    },
    async ({ object_ids, level, date_preset, fields }) => {
      try {
        const client = getMetaClient();
        const results = await Promise.all(
          object_ids.map(async (object_id) => {
            const params: Record<string, any> = { level, date_preset: date_preset || "last_7d" };
            if (fields && fields.length > 0) params.fields = fields;
            const insights = await client.getInsights(object_id, params);
            return { object_id, insights };
          })
        );
        return { content: [{ type: "text", text: JSON.stringify({ success: true, comparison: results }) }] };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "create_ad",
    "Create an individual ad by linking an ad set and a creative",
    {
      account_id: z.string().describe("Meta Ad Account ID (without act_ prefix)"),
      name: z.string().describe("Name of the ad"),
      adset_id: z.string().describe("ID of the parent ad set"),
      creative_id: z.string().describe("ID of the ad creative to use"),
      status: z.enum(["ACTIVE", "PAUSED"]).optional().describe("Initial status (default: PAUSED)"),
    },
    async ({ account_id, name, adset_id, creative_id, status = "PAUSED" }) => {
      try {
        const client = getMetaClient();
        const result = await client.createAd(account_id, { name, adset_id, creative: { creative_id }, status });
        return { content: [{ type: "text", text: JSON.stringify({ success: true, ad_id: result.id, name, adset_id, creative_id, status }) }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.tool(
    "update_adset",
    "Update an existing ad set (name, status, budget, end date)",
    {
      adset_id: z.string().describe("ID of the ad set to update"),
      name: z.string().optional().describe("New name"),
      status: z.enum(["ACTIVE", "PAUSED"]).optional().describe("New status"),
      daily_budget: z.number().optional().describe("New daily budget in cents"),
      lifetime_budget: z.number().optional().describe("New lifetime budget in cents"),
      end_time: z.string().optional().describe("New end date in ISO 8601 format"),
      bid_amount: z.number().optional().describe("New bid amount in cents"),
    },
    async ({ adset_id, name, status, daily_budget, lifetime_budget, end_time, bid_amount }) => {
      try {
        const client = getMetaClient();
        const updates: Record<string, string | number> = {};
        if (name !== undefined) updates.name = name;
        if (status !== undefined) updates.status = status;
        if (daily_budget !== undefined) updates.daily_budget = Math.round(daily_budget);
        if (lifetime_budget !== undefined) updates.lifetime_budget = Math.round(lifetime_budget);
        if (end_time !== undefined) updates.end_time = end_time;
        if (bid_amount !== undefined) updates.bid_amount = bid_amount;
        if (Object.keys(updates).length === 0) return { content: [{ type: "text", text: "Error: No updates provided." }], isError: true };
        await client.updateAdSet(adset_id, updates);
        return { content: [{ type: "text", text: JSON.stringify({ success: true, adset_id, updates_applied: updates }) }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.tool(
    "update_ad",
    "Update an existing ad (name, status, or swap creative)",
    {
      ad_id: z.string().describe("ID of the ad to update"),
      name: z.string().optional().describe("New name"),
      status: z.enum(["ACTIVE", "PAUSED", "ARCHIVED"]).optional().describe("New status"),
      creative_id: z.string().optional().describe("ID of a new creative to swap in"),
    },
    async ({ ad_id, name, status, creative_id }) => {
      try {
        const client = getMetaClient();
        const updates: Record<string, unknown> = {};
        if (name !== undefined) updates.name = name;
        if (status !== undefined) updates.status = status;
        if (creative_id !== undefined) updates.creative = { creative_id };
        if (Object.keys(updates).length === 0) return { content: [{ type: "text", text: "Error: No updates provided." }], isError: true };
        await client.updateAd(ad_id, updates);
        return { content: [{ type: "text", text: JSON.stringify({ success: true, ad_id, updates_applied: updates }) }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.tool(
    "bulk_update_adsets_budget",
    "Update daily budget of multiple ad sets in one call",
    {
      updates: z.array(z.object({
        adset_id: z.string().describe("Ad set ID"),
        daily_budget: z.number().describe("New daily budget in cents"),
      })).describe("List of ad set budget updates"),
    },
    async ({ updates }) => {
      const client = getMetaClient();
      const results: Array<{ adset_id: string; status: string; error?: string }> = [];
      await Promise.all(updates.map(async ({ adset_id, daily_budget }) => {
        try {
          await client.updateAdSet(adset_id, { daily_budget: Math.round(daily_budget) });
          results.push({ adset_id, status: "updated" });
        } catch (error) {
          results.push({ adset_id, status: "failed", error: error instanceof Error ? error.message : String(error) });
        }
      }));
      const successCount = results.filter((r) => r.status === "updated").length;
      const failCount = results.filter((r) => r.status === "failed").length;
      return { content: [{ type: "text", text: JSON.stringify({ success: failCount === 0, summary: `${successCount} updated, ${failCount} failed`, results }) }], isError: failCount > 0 && successCount === 0 };
    }
  );

  server.tool(
    "get_pixel_stats",
    "Diagnose Meta Pixel health: lists pixels, last fire time, and events received",
    {
      account_id: z.string().describe("Meta Ad Account ID (without act_ prefix)"),
      date_preset: z.enum(["last_7d", "last_14d", "last_30d"]).optional().describe("Analysis period (default: last_7d)"),
    },
    async ({ account_id, date_preset = "last_7d" }) => {
      try {
        const client = getMetaClient();
        const pixels = await client.getPixels(account_id);
        if (!pixels || pixels.length === 0) return { content: [{ type: "text", text: JSON.stringify({ success: true, account_id, pixels: [] }) }] };
        const daysMap: Record<string, number> = { last_7d: 7, last_14d: 14, last_30d: 30 };
        const startTime = Math.floor(Date.now() / 1000) - (daysMap[date_preset] || 7) * 86400;
        const pixelStats = await Promise.all(pixels.map(async (pixel) => {
          let events: string[] = [];
          try { const stats = await client.getPixelStats(pixel.id, startTime); events = stats.map((e) => `${e.event_name}: ${e.count}`); } catch { events = ["Could not retrieve event stats"]; }
          const daysSince = pixel.last_fired_time ? Math.floor((Date.now() - new Date(pixel.last_fired_time).getTime()) / 86400000) : null;
          const health = daysSince === null ? "never_fired" : daysSince === 0 ? "active" : daysSince <= 3 ? "good" : daysSince <= 7 ? "warning" : "stale";
          return { pixel_id: pixel.id, pixel_name: pixel.name, last_fired: pixel.last_fired_time ? new Date(pixel.last_fired_time).toLocaleString("fr-FR") : "Never", health_status: health, events_last_period: events.length > 0 ? events : ["No events"] };
        }));
        return { content: [{ type: "text", text: JSON.stringify({ success: true, account_id, period: date_preset, pixels: pixelStats, summary: { total: pixelStats.length, active: pixelStats.filter((p) => ["active","good"].includes(p.health_status)).length } }) }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  const META_API_VERSION = "v21.0";
  const META_GRAPH_BASE  = `https://graph.facebook.com/${META_API_VERSION}`;
  const META_VIDEO_BASE  = `https://graph-video.facebook.com/${META_API_VERSION}`;

  server.tool(
    "upload_video",
    "Upload a video to a Meta Ad Account from a URL (Google Drive direct link, CDN, etc.)",
    {
      account_id: z.string().describe("Meta Ad Account ID (without act_ prefix)"),
      file_url:   z.string().describe("Publicly accessible URL of the video file"),
      title:      z.string().optional().describe("Optional video title shown in Meta media library"),
    },
    async ({ account_id, file_url, title }) => {
      try {
        const accessToken = process.env.META_ACCESS_TOKEN;
        const params = new URLSearchParams({ access_token: accessToken!, file_url, ...(title && { title }) });
        const response = await fetch(`${META_VIDEO_BASE}/act_${account_id}/advideos`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params.toString(),
        });
        const data = await response.json() as any;
        if (data.error) throw new Error(`Meta API error: ${data.error.message}`);
        return { content: [{ type: "text", text: JSON.stringify({ success: true, video_id: data.id, title: title || file_url.split("/").pop() }) }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  server.tool(
    "upload_image",
    "Upload an image to a Meta Ad Account from a URL. Returns an image_hash to use in creatives.",
    {
      account_id: z.string().describe("Meta Ad Account ID (without act_ prefix)"),
      file_url:   z.string().describe("Accessible URL of the image file (JPEG, PNG)"),
      name:       z.string().optional().describe("Optional image name in Meta media library"),
    },
    async ({ account_id, file_url, name }) => {
      try {
        const accessToken = process.env.META_ACCESS_TOKEN;
        const imageResponse = await fetch(file_url, {
          redirect: "follow",
          headers: { "User-Agent": "Mozilla/5.0 (compatible; MetaMCP/1.0)" },
        });
        if (!imageResponse.ok) {
          return { content: [{ type: "text", text: JSON.stringify({ success: false, error: `Failed to download image from URL (HTTP ${imageResponse.status}). For Google Drive, use a direct download URL: https://drive.google.com/uc?id=FILE_ID&export=download` }) }], isError: true };
        }
        const rawContentType = imageResponse.headers.get("content-type") || "";
        const baseContentType = rawContentType.split(";")[0].trim();
        if (!baseContentType.startsWith("image/")) {
          return { content: [{ type: "text", text: JSON.stringify({ success: false, error: `URL did not return an image (content-type: ${rawContentType || "unknown"}). Ensure the URL points directly to an image file.` }) }], isError: true };
        }
        const mimeToExt: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp" };
        const ext = mimeToExt[baseContentType] || ".jpg";
        const rawName = name || file_url.split("/").pop()?.split("?")[0] || "image";
        const fileName = rawName.includes(".") ? rawName : rawName + ext;
        const imageBuffer = await imageResponse.arrayBuffer();
        const form = new FormData();
        form.append("access_token", accessToken!);
        form.append("filename", new Blob([imageBuffer], { type: baseContentType }), fileName);
        const response = await fetch(`${META_GRAPH_BASE}/act_${account_id}/adimages`, { method: "POST", body: form });
        const data = await response.json() as any;
        if (data.error) {
          const e = data.error;
          return { content: [{ type: "text", text: JSON.stringify({ success: false, error: e.error_user_msg || e.message, code: e.code, subcode: e.error_subcode, trace_id: e.fbtrace_id }) }], isError: true };
        }
        const imageEntry = Object.values(data.images || {})[0] as any;
        if (!imageEntry) throw new Error("Unexpected Meta API response — no image entry returned");
        return { content: [{ type: "text", text: JSON.stringify({ success: true, image_hash: imageEntry.hash, url: imageEntry.url, name: fileName }) }] };
      } catch (error) {
        return metaErrResponse(error);
      }
    }
  );

  server.tool(
    "create_creative",
    "Create an ad creative in a Meta Ad Account. Supports image, video, and carousel formats.",
    {
      account_id:     z.string().describe("Meta Ad Account ID (without act_ prefix)"),
      name:           z.string().describe("Creative name shown in Meta library"),
      format:         z.enum(["image", "video", "carousel"]).describe("Creative format"),
      page_id:        z.string().describe("Facebook Page ID to run the ad from"),
      link:           z.string().describe("Destination URL"),
      image_hash:     z.string().optional().describe("Image hash (from upload_image). Required for format=image, optional thumbnail for format=video"),
      video_id:       z.string().optional().describe("Video ID (from upload_video). Required for format=video"),
      message:        z.string().optional().describe("Primary ad text"),
      headline:       z.string().optional().describe("Headline below the creative"),
      description:    z.string().optional().describe("Ad description"),
      call_to_action: z.string().optional().describe("CTA type e.g. SHOP_NOW, LEARN_MORE, BUY_NOW (default: SHOP_NOW)"),
      cards: z.array(z.object({
        image_hash:     z.string(),
        title:          z.string(),
        link:           z.string(),
        description:    z.string().optional(),
        call_to_action: z.string().optional(),
      })).optional().describe("Carousel cards — required for format=carousel"),
    },
    async ({ account_id, name, format, page_id, link, image_hash, video_id, message, headline, description, call_to_action = "SHOP_NOW", cards }) => {
      try {
        const accessToken = process.env.META_ACCESS_TOKEN;
        let object_story_spec: any;
        if (format === "image") {
          if (!image_hash) throw new Error("image_hash is required for format=image");
          object_story_spec = { page_id, link_data: { image_hash, link, ...(message && { message }), ...(headline && { name: headline }), ...(description && { description }), call_to_action: { type: call_to_action, value: { link } } } };
        } else if (format === "video") {
          if (!video_id) throw new Error("video_id is required for format=video");
          object_story_spec = { page_id, video_data: { video_id, ...(image_hash && { image_hash }), title: headline || name, message: message || "", call_to_action: { type: call_to_action, value: { link } } } };
        } else if (format === "carousel") {
          if (!cards || !cards.length) throw new Error("cards[] is required for format=carousel");
          object_story_spec = { page_id, link_data: { link, ...(message && { message }), child_attachments: cards.map((c) => ({ link: c.link || link, image_hash: c.image_hash, name: c.title, ...(c.description && { description: c.description }), call_to_action: { type: c.call_to_action || call_to_action, value: { link: c.link || link } } })), multi_share_end_card: false } };
        }
        const body = new URLSearchParams({
          access_token: accessToken!,
          name,
          object_story_spec: JSON.stringify(object_story_spec),
          degrees_of_freedom_spec: JSON.stringify({ creative_features_spec: { standard_enhancements: { enroll_status: "OPT_OUT" } } }),
        });

        const creativeCtrl = new AbortController();
        const creativeTimeout = setTimeout(() => creativeCtrl.abort(), 15000);
        let data: any;
        try {
          const response = await fetch(`${META_GRAPH_BASE}/act_${account_id}/adcreatives`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: body.toString(),
            signal: creativeCtrl.signal,
          });
          data = await response.json();
        } finally {
          clearTimeout(creativeTimeout);
        }

        if (data.error) {
          const e = data.error;
          return {
            content: [{ type: "text", text: JSON.stringify({ success: false, error: e.error_user_msg || e.message, code: e.code, subcode: e.error_subcode, user_title: e.error_user_title, trace_id: e.fbtrace_id, object_story_spec_sent: object_story_spec }) }],
            isError: true,
          };
        }
        return { content: [{ type: "text", text: JSON.stringify({ success: true, creative_id: data.id, name, format }) }] };
      } catch (error) {
        return metaErrResponse(error);
      }
    }
  );

  server.tool(
    "create_adset",
    "Create an ad set inside an existing Meta campaign. Supports conversion optimization, custom audiences, and geo targeting. For CBO campaigns (campaign has a budget), do NOT pass daily_budget. For ABO campaigns (no campaign budget), daily_budget is required.",
    {
      account_id:        z.string().describe("Meta Ad Account ID (without act_ prefix)"),
      campaign_id:       z.string().describe("Parent campaign ID"),
      name:              z.string().describe("Ad set name"),
      daily_budget:      z.number().optional().describe("Daily budget in cents (e.g. 500 = 5€). Required for ABO campaigns; must be omitted for CBO campaigns."),
      optimization_goal: z.string().optional().describe("e.g. OFFSITE_CONVERSIONS, LINK_CLICKS, REACH (default: OFFSITE_CONVERSIONS)"),
      billing_event:     z.string().optional().describe("Default: IMPRESSIONS"),
      bid_strategy:      z.string().optional().describe("Bid strategy override. Inherited from campaign if omitted. Default: LOWEST_COST_WITHOUT_CAP"),
      bid_amount:        z.number().optional().describe("Bid amount in cents. Required when bid_strategy is LOWEST_COST_WITH_BID_CAP or COST_CAP."),
      status:            z.enum(["ACTIVE", "PAUSED"]).optional().describe("Initial status (default: PAUSED)"),
      pixel_id:          z.string().optional().describe("Meta Pixel ID for conversion tracking"),
      custom_event_type: z.string().optional().describe("e.g. PURCHASE, ADD_TO_CART (default: PURCHASE)"),
      countries:         z.array(z.string()).optional().describe('Target country codes e.g. ["FR", "BE"] (default: ["FR"])'),
      age_min:           z.number().optional().describe("Minimum target age (default: 18)"),
      age_max:           z.number().optional().describe("Maximum target age (default: 65)"),
      genders:           z.array(z.number()).optional().describe("1 = male, 2 = female, omit for all"),
      custom_audiences:  z.array(z.string()).optional().describe("Array of audience IDs to include"),
      excluded_audiences: z.array(z.string()).optional().describe("Array of audience IDs to exclude"),
      start_time:        z.string().optional().describe("Start date ISO 8601"),
      end_time:          z.string().optional().describe("End date ISO 8601"),
    },
    async ({ account_id, campaign_id, name, daily_budget, optimization_goal, billing_event, bid_strategy, bid_amount, status, pixel_id, custom_event_type, countries, age_min, age_max, genders, custom_audiences, excluded_audiences, start_time, end_time }) => {
      try {
        const accessToken = process.env.META_ACCESS_TOKEN;

        // Fetch parent campaign to detect CBO and get its bid_strategy
        const campCtrl = new AbortController();
        const campTimeout = setTimeout(() => campCtrl.abort(), 15000);
        let campData: any;
        try {
          const campRes = await fetch(
            `${META_GRAPH_BASE}/${campaign_id}?fields=daily_budget,lifetime_budget,bid_strategy&access_token=${encodeURIComponent(accessToken!)}`,
            { redirect: "follow", signal: campCtrl.signal }
          );
          campData = await campRes.json();
        } finally {
          clearTimeout(campTimeout);
        }
        if (campData.error) {
          const e = campData.error;
          return { content: [{ type: "text", text: JSON.stringify({ success: false, error: `Could not fetch parent campaign: ${e.error_user_msg || e.message}`, code: e.code, subcode: e.error_subcode }) }], isError: true };
        }

        const campaignHasBudget = !!(campData.daily_budget || campData.lifetime_budget);

        if (!campaignHasBudget && !daily_budget) {
          return { content: [{ type: "text", text: JSON.stringify({ success: false, error: "daily_budget is required: the parent campaign has no budget (ABO mode). Provide a daily_budget for the ad set." }) }], isError: true };
        }
        if (campaignHasBudget && daily_budget) {
          return { content: [{ type: "text", text: JSON.stringify({ success: false, error: "Cannot set daily_budget on ad set when campaign has a budget (CBO mode). Remove daily_budget from the request." }) }], isError: true };
        }

        const targeting: any = {
          geo_locations: { countries: countries || ["FR"] },
          age_min: age_min ?? 18,
          age_max: age_max ?? 65,
          ...(genders && { genders }),
          ...(custom_audiences?.length && { custom_audiences: custom_audiences.map((id) => ({ id })) }),
          ...(excluded_audiences?.length && { excluded_custom_audiences: excluded_audiences.map((id) => ({ id })) }),
        };

        const resolvedOptGoal = optimization_goal || "OFFSITE_CONVERSIONS";
        const promoted_object = pixel_id
          ? { pixel_id, custom_event_type: custom_event_type || "PURCHASE" }
          : undefined;

        // Strategies that require bid_amount
        const needsBidAmount = ["LOWEST_COST_WITH_BID_CAP", "COST_CAP", "TARGET_COST"];

        // CBO: Meta IGNORES bid_strategy sent at ad-set level — the campaign-level strategy applies.
        // Never send bid_strategy for CBO. Validate that campaign strategy doesn't require bid_amount.
        // ABO: bid_strategy is set at ad-set level. LOWEST_COST_WITHOUT_CAP is Meta's default (don't send).
        if (campaignHasBudget) {
          const campStrategy: string | undefined = campData.bid_strategy;
          if (campStrategy && needsBidAmount.includes(campStrategy) && !bid_amount) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  success: false,
                  error: `This CBO campaign uses ${campStrategy} — bid_amount (in cents) is required for all ad sets. Provide bid_amount, or recreate the campaign with bid_strategy: LOWEST_COST_WITHOUT_CAP.`,
                }),
              }],
              isError: true,
            };
          }
        } else {
          const aboStrategy = bid_strategy || "LOWEST_COST_WITHOUT_CAP";
          if (needsBidAmount.includes(aboStrategy) && !bid_amount) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  success: false,
                  error: `bid_amount is required when bid_strategy is ${aboStrategy}. Provide bid_amount in cents, or use bid_strategy: "LOWEST_COST_WITHOUT_CAP".`,
                }),
              }],
              isError: true,
            };
          }
        }

        const params: Record<string, string> = {
          access_token: accessToken!,
          campaign_id,
          name,
          optimization_goal: resolvedOptGoal,
          billing_event: billing_event || "IMPRESSIONS",
          status: status || "PAUSED",
          targeting: JSON.stringify(targeting),
        };

        if (!campaignHasBudget && daily_budget) params.daily_budget = String(daily_budget);
        // CBO: never send bid_strategy (Meta uses campaign-level strategy, overrides any value we send)
        // ABO: only send bid_strategy when it's non-default (LOWEST_COST_WITHOUT_CAP is Meta's implicit default)
        if (!campaignHasBudget) {
          const aboStrategy = bid_strategy || "LOWEST_COST_WITHOUT_CAP";
          if (aboStrategy !== "LOWEST_COST_WITHOUT_CAP") params.bid_strategy = aboStrategy;
        }
        if (bid_amount) params.bid_amount = String(bid_amount);
        if (promoted_object) params.promoted_object = JSON.stringify(promoted_object);
        if (start_time) params.start_time = start_time;
        if (end_time) params.end_time = end_time;

        const adsetCtrl = new AbortController();
        const adsetTimeout = setTimeout(() => adsetCtrl.abort(), 15000);
        let data: any;
        try {
          const response = await fetch(`${META_GRAPH_BASE}/act_${account_id}/adsets`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams(params).toString(),
            signal: adsetCtrl.signal,
          });
          data = await response.json();
        } finally {
          clearTimeout(adsetTimeout);
        }
        if (data.error) {
          const e = data.error;
          return { content: [{ type: "text", text: JSON.stringify({ success: false, error: e.error_user_msg || e.message, code: e.code, subcode: e.error_subcode, user_title: e.error_user_title, trace_id: e.fbtrace_id }) }], isError: true };
        }
        return { content: [{ type: "text", text: JSON.stringify({ success: true, adset_id: data.id, name, daily_budget: daily_budget || null, status: status || "PAUSED", cbo: campaignHasBudget }) }] };
      } catch (error) {
        return metaErrResponse(error);
      }
    }
  );

  server.tool(
    "delete_campaign",
    "Permanently delete a campaign. This action is irreversible.",
    { campaign_id: z.string().describe("Campaign ID to delete") },
    async ({ campaign_id }) => {
      try {
        const client = getMetaClient();
        await client.deleteCampaign(campaign_id);
        return { content: [{ type: "text", text: JSON.stringify({ success: true, deleted_campaign_id: campaign_id }) }] };
      } catch (error) {
        return metaErrResponse(error);
      }
    }
  );

  server.tool(
    "delete_adset",
    "Permanently delete an ad set. This action is irreversible.",
    { adset_id: z.string().describe("Ad set ID to delete") },
    async ({ adset_id }) => {
      try {
        const client = getMetaClient();
        await client.deleteAdSet(adset_id);
        return { content: [{ type: "text", text: JSON.stringify({ success: true, deleted_adset_id: adset_id }) }] };
      } catch (error) {
        return metaErrResponse(error);
      }
    }
  );

  server.tool(
    "delete_ad",
    "Permanently delete an ad. This action is irreversible.",
    { ad_id: z.string().describe("Ad ID to delete") },
    async ({ ad_id }) => {
      try {
        const client = getMetaClient();
        await client.deleteAd(ad_id);
        return { content: [{ type: "text", text: JSON.stringify({ success: true, deleted_ad_id: ad_id }) }] };
      } catch (error) {
        return metaErrResponse(error);
      }
    }
  );

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}
