/**
 * POST /api/upload-image
 * Upload an image to a Meta Ad Account from a URL (Google Drive, CDN, etc.)
 *
 * Body (JSON):
 *   account_id  {string}  Meta Ad Account ID (without act_ prefix)
 *   file_url    {string}  Publicly accessible URL of the image file
 *   name        {string}  (optional) Image name in Meta library
 *
 * Returns:
 *   { success: true, image_hash: "...", url: "...", name: "..." }
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

  const { account_id, file_url, name } = req.body || {};

  if (!account_id) return res.status(400).json({ error: "account_id is required" });
  if (!file_url)   return res.status(400).json({ error: "file_url is required" });

  try {
    // Step 1 — Download the image from the provided URL
    const imageResponse = await fetch(file_url);
    if (!imageResponse.ok) {
      return res.status(400).json({
        success: false,
        error: `Failed to download image from URL (HTTP ${imageResponse.status})`,
      });
    }

    const imageBuffer  = await imageResponse.arrayBuffer();
    const contentType  = imageResponse.headers.get("content-type") || "image/jpeg";
    const fileName     = name || file_url.split("/").pop() || "image.jpg";

    // Step 2 — Upload to Meta as multipart/form-data (native FormData, Node 18+)
    const form = new FormData();
    form.append("access_token", accessToken);
    form.append("filename", new Blob([imageBuffer], { type: contentType }), fileName);

    const response = await fetch(
      `${META_GRAPH_BASE}/act_${account_id}/adimages`,
      {
        method: "POST",
        body:   form,
      }
    );

    const data = await response.json();

    if (data.error) {
      return res.status(400).json({
        success: false,
        error:   data.error.message,
        code:    data.error.code,
      });
    }

    // Meta returns { images: { <filename>: { hash, url, ... } } }
    const images     = data.images || {};
    const imageEntry = Object.values(images)[0];

    if (!imageEntry) {
      return res.status(500).json({ success: false, error: "Unexpected Meta API response", raw: data });
    }

    return res.status(200).json({
      success:    true,
      image_hash: imageEntry.hash,
      url:        imageEntry.url,
      name:       fileName,
    });

  } catch (err) {
    console.error("upload-image error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
