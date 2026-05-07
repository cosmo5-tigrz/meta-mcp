/**
 * POST /api/create-adset
 * Create an Ad Set inside an existing Meta campaign.
 *
 * Body (JSON):
 *   account_id          {string}   Meta Ad Account ID (without act_ prefix)
 *   campaign_id         {string}   Parent campaign ID
 *   name                {string}   Ad set name
 *   daily_budget        {number}   Daily budget in cents (e.g. 500 = 5€)
 *   optimization_goal   {string}   (optional) e.g. "OFFSITE_CONVERSIONS", "PURCHASE", "LINK_CLICKS"
 *                                  Defaults to "OFFSITE_CONVERSIONS"
 *   billing_event       {string}   (optional) Defaults to "IMPRESSIONS"
 *   bid_strategy        {string}   (optional) Defaults to "LOWEST_COST_WITHOUT_CAP"
 *   status              {string}   (optional) "ACTIVE" | "PAUSED" (default: "PAUSED")
 *   pixel_id            {string}   (optional) Meta Pixel ID for conversion tracking
 *   custom_event_type   {string}   (optional) e.g. "PURCHASE", "ADD_TO_CART" (default: "PURCHASE")
 *   start_time          {string}   (optional) ISO 8601 start date
 *   end_time            {string}   (optional) ISO 8601 end date
 *
 *   --- Targeting (all optional — defaults to Advantage+ broad) ---
 *   countries           {string[]} e.g. ["FR", "BE"] (default: ["FR"])
 *   age_min             {number}   Min age (default: 18)
 *   age_max             {number}   Max age (default: 65)
 *   genders             {number[]} 1 = male, 2 = female, omit for all
 *   custom_audiences    {string[]} Array of audience IDs to include
 *   excluded_audiences  {string[]} Array of audience IDs to exclude
 *
 * Returns:
 *   { success: true, adset_id: "...", name: "..." }
 */

const META_API_VERSION = "v21.0";
const META_GRAPH_BASE  = `https://graph.facebook.com/${META_API_VERSION}`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const accessToken = process.env.META_ACCESS_TOKEN;
  if (!accessToken) {
    return res.status(500).json({ error: "META_ACCESS_TOKEN is not configured" });
  }

  const {
    account_id,
    campaign_id,
    name,
    daily_budget,
    optimization_goal   = "OFFSITE_CONVERSIONS",
    billing_event       = "IMPRESSIONS",
    bid_strategy        = "LOWEST_COST_WITHOUT_CAP",
    status              = "PAUSED",
    pixel_id,
    custom_event_type   = "PURCHASE",
    start_time,
    end_time,
    // Targeting
    countries           = ["FR"],
    age_min             = 18,
    age_max             = 65,
    genders,
    custom_audiences,
    excluded_audiences,
  } = req.body || {};

  // — Validation —
  if (!account_id)   return res.status(400).json({ error: "account_id is required" });
  if (!campaign_id)  return res.status(400).json({ error: "campaign_id is required" });
  if (!name)         return res.status(400).json({ error: "name is required" });
  if (!daily_budget) return res.status(400).json({ error: "daily_budget is required (in cents)" });

  // — Build targeting spec —
  const targeting = {
    geo_locations: { countries },
    age_min,
    age_max,
    ...(genders && { genders }),
    ...(custom_audiences?.length && {
      custom_audiences: custom_audiences.map((id) => ({ id })),
    }),
    ...(excluded_audiences?.length && {
      excluded_custom_audiences: excluded_audiences.map((id) => ({ id })),
    }),
  };

  // — Build promoted_object (for conversion campaigns) —
  const promoted_object = pixel_id
    ? { pixel_id, custom_event_type }
    : undefined;

  // — Assemble payload —
  const payload = {
    access_token:     accessToken,
    campaign_id,
    name,
    daily_budget:     String(daily_budget),
    optimization_goal,
    billing_event,
    bid_strategy,
    status,
    targeting:        JSON.stringify(targeting),
    ...(promoted_object && { promoted_object: JSON.stringify(promoted_object) }),
    ...(start_time && { start_time }),
    ...(end_time   && { end_time }),
  };

  try {
    const response = await fetch(
      `${META_GRAPH_BASE}/act_${account_id}/adsets`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body:    new URLSearchParams(payload).toString(),
      }
    );

    const data = await response.json();

    if (data.error) {
      return res.status(400).json({
        success: false,
        error:   data.error.message,
        code:    data.error.code,
        raw:     data.error,
      });
    }

    return res.status(200).json({
      success:   true,
      adset_id:  data.id,
      name,
      daily_budget,
      status,
    });

  } catch (err) {
    console.error("create-adset error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
