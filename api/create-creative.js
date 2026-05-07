/**
 * POST /api/create-creative
 * Create an Ad Creative in a Meta Ad Account.
 * Supports: single image, single video, or carousel.
 *
 * Body (JSON):
 *   account_id        {string}   Meta Ad Account ID (without act_ prefix)
 *   name              {string}   Creative name (shown in Meta library)
 *   format            {string}   "image" | "video" | "carousel"
 *
 *   --- For format = "image" ---
 *   image_hash        {string}   Hash returned by /api/upload-image
 *   page_id           {string}   Facebook Page ID to run the ad from
 *   link              {string}   Destination URL
 *   message           {string}   (optional) Primary ad text
 *   headline          {string}   (optional) Headline below the creative
 *   description       {string}   (optional) Description
 *   call_to_action    {string}   (optional) e.g. "SHOP_NOW", "LEARN_MORE" (default: "SHOP_NOW")
 *
 *   --- For format = "video" ---
 *   video_id          {string}   ID returned by /api/upload-video
 *   image_hash        {string}   Thumbnail hash (from /api/upload-image)
 *   page_id           {string}   Facebook Page ID
 *   link              {string}   Destination URL
 *   message           {string}   (optional) Primary ad text
 *   headline          {string}   (optional) Headline
 *   call_to_action    {string}   (optional) default: "SHOP_NOW"
 *
 *   --- For format = "carousel" ---
 *   page_id           {string}   Facebook Page ID
 *   link              {string}   Fallback destination URL
 *   message           {string}   (optional) Primary ad text
 *   cards             {Array}    Array of card objects:
 *     - image_hash    {string}
 *     - title         {string}
 *     - link          {string}
 *     - description   {string}  (optional)
 *     - call_to_action {string} (optional)
 *
 * Returns:
 *   { success: true, creative_id: "...", name: "..." }
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
    name,
    format = "image",
    image_hash,
    video_id,
    page_id,
    link,
    message,
    headline,
    description,
    call_to_action = "SHOP_NOW",
    cards,
  } = req.body || {};

  // — Validation —
  if (!account_id) return res.status(400).json({ error: "account_id is required" });
  if (!name)       return res.status(400).json({ error: "name is required" });
  if (!page_id)    return res.status(400).json({ error: "page_id is required" });
  if (!link)       return res.status(400).json({ error: "link is required" });

  if (format === "image"    && !image_hash)              return res.status(400).json({ error: "image_hash is required for format=image" });
  if (format === "video"    && !video_id)                return res.status(400).json({ error: "video_id is required for format=video" });
  if (format === "carousel" && (!cards || !cards.length)) return res.status(400).json({ error: "cards[] is required for format=carousel" });

  // — Build object_story_spec —
  let object_story_spec;

  if (format === "image") {
    object_story_spec = {
      page_id,
      link_data: {
        image_hash,
        link,
        ...(message     && { message }),
        ...(headline    && { name: headline }),
        ...(description && { description }),
        call_to_action: { type: call_to_action, value: { link } },
      },
    };
  }

  else if (format === "video") {
    object_story_spec = {
      page_id,
      video_data: {
        video_id,
        ...(image_hash && { image_hash }),
        title:   headline || name,
        message: message  || "",
        call_to_action: { type: call_to_action, value: { link } },
      },
    };
  }

  else if (format === "carousel") {
    object_story_spec = {
      page_id,
      link_data: {
        link,
        ...(message && { message }),
        child_attachments: cards.map((card) => ({
          link:       card.link || link,
          image_hash: card.image_hash,
          name:       card.title,
          ...(card.description    && { description: card.description }),
          call_to_action: {
            type:  card.call_to_action || call_to_action,
            value: { link: card.link || link },
          },
        })),
        multi_share_end_card: false,
      },
    };
  }

  // — Create the creative —
  try {
    const body = {
      access_token: accessToken,
      name,
      object_story_spec: JSON.stringify(object_story_spec),
      degrees_of_freedom_spec: JSON.stringify({
        creative_features_spec: {
          standard_enhancements: { enroll_status: "OPT_OUT" },
        },
      }),
    };

    const params = new URLSearchParams(body);

    const response = await fetch(
      `${META_GRAPH_BASE}/act_${account_id}/adcreatives`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body:    params.toString(),
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
      success:     true,
      creative_id: data.id,
      name,
      format,
    });

  } catch (err) {
    console.error("create-creative error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
