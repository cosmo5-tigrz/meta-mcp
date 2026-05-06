import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MetaApiClient } from "../meta-client.js";

const CreateAdSchema = z.object({
  account_id: z.string().describe("Meta Ad Account ID (without act_ prefix)"),
  name: z.string().describe("Name of the ad"),
  adset_id: z.string().describe("ID of the parent ad set"),
  creative_id: z.string().describe("ID of the ad creative to use"),
  status: z.enum(["ACTIVE", "PAUSED"]).optional().describe("Initial status of the ad (default: PAUSED)"),
});

const UpdateAdSetSchema = z.object({
  adset_id: z.string().describe("ID of the ad set to update"),
  name: z.string().optional().describe("New name for the ad set"),
  status: z.enum(["ACTIVE", "PAUSED"]).optional().describe("New status"),
  daily_budget: z.number().optional().describe("New daily budget in cents (e.g. 5000 = 50€)"),
  lifetime_budget: z.number().optional().describe("New lifetime budget in cents"),
  end_time: z.string().optional().describe("New end date in ISO 8601 format"),
  bid_amount: z.number().optional().describe("New bid amount in cents"),
});

const UpdateAdSchema = z.object({
  ad_id: z.string().describe("ID of the ad to update"),
  name: z.string().optional().describe("New name for the ad"),
  status: z.enum(["ACTIVE", "PAUSED", "ARCHIVED"]).optional().describe("New status"),
  creative_id: z.string().optional().describe("ID of a new creative to swap in"),
});

const BulkUpdateAdSetsBudgetSchema = z.object({
  updates: z.array(
    z.object({
      adset_id: z.string().describe("Ad set ID"),
      daily_budget: z.number().describe("New daily budget in cents"),
    })
  ).describe("List of ad set budget updates"),
});

const GetPixelStatsSchema = z.object({
  account_id: z.string().describe("Meta Ad Account ID (without act_ prefix)"),
  date_preset: z.enum(["last_7d", "last_14d", "last_30d"]).optional().describe("Analysis period (default: last_7d)"),
});

export function registerAdsTools(
  server: McpServer,
  metaClient: MetaApiClient
) {
  // ─── CREATE AD ────────────────────────────────────────────────────────────────
  server.tool(
    "create_ad",
    "Create an individual ad by linking an ad set and a creative. The ad will be created in PAUSED status by default. Requires a valid ad set ID and creative ID. Returns the new ad ID.",
    CreateAdSchema.shape,
    async ({ account_id, name, adset_id, creative_id, status = "PAUSED" }) => {
      try {
        const result = await metaClient.createAd(account_id, {
          name,
          adset_id,
          creative: { creative_id },
          status,
        });

        const response = {
          success: true,
          ad_id: result.id,
          message: `Ad "${name}" created successfully in status ${status}`,
          details: { id: result.id, name, adset_id, creative_id, status, account_id },
        };

        return {
          content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error creating ad: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  // ─── UPDATE AD SET ────────────────────────────────────────────────────────────
  server.tool(
    "update_adset",
    "Update an existing ad set. Modify its name, status, daily budget, targeting, or end date. Only the provided fields will be updated. Use this to adjust targeting or budget without recreating the ad set.",
    UpdateAdSetSchema.shape,
    async ({ adset_id, name, status, daily_budget, lifetime_budget, end_time, bid_amount }) => {
      try {
        const updates: Record<string, string | number> = {};

        if (name !== undefined)            updates.name = name;
        if (status !== undefined)          updates.status = status;
        if (daily_budget !== undefined)    updates.daily_budget = Math.round(daily_budget);
        if (lifetime_budget !== undefined) updates.lifetime_budget = Math.round(lifetime_budget);
        if (end_time !== undefined)        updates.end_time = end_time;
        if (bid_amount !== undefined)      updates.bid_amount = bid_amount;

        if (Object.keys(updates).length === 0) {
          return {
            content: [{ type: "text", text: "Error: No updates provided. Specify at least one field." }],
            isError: true,
          };
        }

        await metaClient.updateAdSet(adset_id, updates);

        return {
          content: [{ type: "text", text: JSON.stringify({
            success: true,
            adset_id,
            message: `Ad set ${adset_id} updated successfully`,
            updates_applied: updates,
          }, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error updating ad set: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  // ─── UPDATE AD ────────────────────────────────────────────────────────────────
  server.tool(
    "update_ad",
    "Update an existing ad. Change its name, status, or swap the creative. Only provided fields are updated.",
    UpdateAdSchema.shape,
    async ({ ad_id, name, status, creative_id }) => {
      try {
        const updates: Record<string, unknown> = {};

        if (name !== undefined)        updates.name = name;
        if (status !== undefined)      updates.status = status;
        if (creative_id !== undefined) updates.creative = { creative_id };

        if (Object.keys(updates).length === 0) {
          return {
            content: [{ type: "text", text: "Error: No updates provided." }],
            isError: true,
          };
        }

        await metaClient.updateAd(ad_id, updates);

        return {
          content: [{ type: "text", text: JSON.stringify({
            success: true,
            ad_id,
            message: `Ad ${ad_id} updated successfully`,
            updates_applied: updates,
          }, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error updating ad: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );

  // ─── BULK UPDATE AD SETS BUDGET ───────────────────────────────────────────────
  server.tool(
    "bulk_update_adsets_budget",
    "Update the daily budget of multiple ad sets in a single command. Useful for batch optimization — e.g. cutting budget on underperformers or scaling winners. Returns a summary of successes and failures.",
    BulkUpdateAdSetsBudgetSchema.shape,
    async ({ updates }) => {
      const results: Array<{ adset_id: string; status: string; error?: string }> = [];

      await Promise.all(
        updates.map(async ({ adset_id, daily_budget }) => {
          try {
            await metaClient.updateAdSet(adset_id, { daily_budget: Math.round(daily_budget) });
            results.push({ adset_id, status: "updated" });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            results.push({ adset_id, status: "failed", error: errorMessage });
          }
        })
      );

      const successCount = results.filter((r) => r.status === "updated").length;
      const failCount = results.filter((r) => r.status === "failed").length;

      return {
        content: [{ type: "text", text: JSON.stringify({
          success: failCount === 0,
          summary: `${successCount} ad set(s) updated, ${failCount} failed`,
          results,
        }, null, 2) }],
        isError: failCount > 0 && successCount === 0,
      };
    }
  );

  // ─── GET PIXEL STATS ──────────────────────────────────────────────────────────
  server.tool(
    "get_pixel_stats",
    "Diagnose Meta Pixel and CAPI signal quality for an ad account. Lists all pixels, their last fire time, and the events received over the selected period. Use to check tracking health before launching conversion campaigns.",
    GetPixelStatsSchema.shape,
    async ({ account_id, date_preset = "last_7d" }) => {
      try {
        const pixels = await metaClient.getPixels(account_id);

        if (!pixels || pixels.length === 0) {
          return {
            content: [{ type: "text", text: JSON.stringify({
              success: true,
              account_id,
              message: "No pixels found on this account.",
              pixels: [],
            }, null, 2) }],
          };
        }

        const daysMap: Record<string, number> = { last_7d: 7, last_14d: 14, last_30d: 30 };
        const startTime = Math.floor(Date.now() / 1000) - (daysMap[date_preset] || 7) * 86400;

        const pixelStats = await Promise.all(
          pixels.map(async (pixel) => {
            let events: string[] = [];
            try {
              const stats = await metaClient.getPixelStats(pixel.id, startTime);
              events = (stats || []).map((e) => `${e.event_name}: ${e.count}`);
            } catch {
              events = ["Could not retrieve event stats"];
            }

            const daysSinceLastFire = pixel.last_fired_time
              ? Math.floor((Date.now() - new Date(pixel.last_fired_time).getTime()) / 86400000)
              : null;

            let health = "unknown";
            if (daysSinceLastFire === null)   health = "never_fired";
            else if (daysSinceLastFire === 0) health = "active";
            else if (daysSinceLastFire <= 3)  health = "good";
            else if (daysSinceLastFire <= 7)  health = "warning";
            else                              health = "stale";

            return {
              pixel_id: pixel.id,
              pixel_name: pixel.name,
              last_fired: pixel.last_fired_time
                ? new Date(pixel.last_fired_time).toLocaleString("fr-FR")
                : "Never",
              health_status: health,
              events_last_period: events.length > 0 ? events : ["No events"],
            };
          })
        );

        return {
          content: [{ type: "text", text: JSON.stringify({
            success: true,
            account_id,
            period: date_preset,
            pixels: pixelStats,
            summary: {
              total_pixels: pixelStats.length,
              active: pixelStats.filter((p) => ["active", "good"].includes(p.health_status)).length,
              stale_or_inactive: pixelStats.filter((p) => ["stale", "never_fired", "warning"].includes(p.health_status)).length,
            },
          }, null, 2) }],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [{ type: "text", text: `Error getting pixel stats: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );
}
