import type { VercelRequest, VercelResponse } from "@vercel/node";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { MetaApiClient } from "../src/meta-client.js";

function getMetaClient(): MetaApiClient {
  return new MetaApiClient();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

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
      account_id: z.string().describe("The ad account ID"),
      name: z.string().describe("Campaign name"),
      objective: z.string().describe("Campaign objective (OUTCOME_TRAFFIC, OUTCOME_LEADS, etc.)"),
      status: z.enum(["ACTIVE", "PAUSED"]).optional().describe("Campaign status (defaults to PAUSED)"),
      daily_budget: z.number().optional().describe("Daily budget in cents"),
      lifetime_budget: z.number().optional().describe("Lifetime budget in cents"),
    },
    async ({ account_id, name, objective, status, daily_budget, lifetime_budget }) => {
      try {
        const client = getMetaClient();
        const data: any = {
          name,
          objective,
          status: status || "PAUSED",
          special_ad_categories: [],
        };
        if (daily_budget) data.daily_budget = daily_budget;
        if (lifetime_budget) data.lifetime_budget = lifetime_budget;
        const campaign = await client.createCampaign(account_id, data);
        return {
          content: [{ type: "text", text: JSON.stringify({ success: true, campaign }) }],
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
        const client = getMetaClient();
        const updates: any = {};
        if (name) updates.name = name;
        if (status) updates.status = status;
        if (daily_budget) updates.daily_budget = daily_budget;
        const result = await client.updateCampaign(campaign_id, updates);
        return {
          content: [{ type: "text", text: JSON.stringify({ success: true, result }) }],
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

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}
