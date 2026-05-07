/**
 * POST /api/upload-video
 * Upload a video to a Meta Ad Account from a URL (Google Drive, CDN, etc.)
 *
 * Body (JSON):
 *   account_id  {string}  Meta Ad Account ID (without act_ prefix)
 *   file_url    {string}  Publicly accessible URL of the video file
 *   title       {string}  (optional) Video title shown in Meta library
 *
 * Returns:
 *   { success: true, video_id: "...", title: "..." }
 */

const META_API_VERSION = "v21.0";
const META_VIDEO_BASE  = `https://graph-video.facebook.com/${META_API_VERSION}`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const accessToken = process.env.META_ACCESS_TOKEN;
  if (!accessToken) {
    return res.status(500).json({ error: "META_ACCESS_TOKEN is not configured" });
  }

  const { account_id, file_url, title } = req.body || {};

  if (!account_id) return res.status(400).json({ error: "account_id is required" });
  if (!file_url)   return res.status(400).json({ error: "file_url is required" });

  try {
    const params = new URLSearchParams({
      access_token: accessToken,
      file_url,
      ...(title && { title }),
    });

    const response = await fetch(
      `${META_VIDEO_BASE}/act_${account_id}/advideos`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      }
    );

    const data = await response.json();

    if (data.error) {
      return res.status(400).json({
        success: false,
        error: data.error.message,
        code:   data.error.code,
      });
    }

    return res.status(200).json({
      success:  true,
      video_id: data.id,
      title:    title || file_url.split("/").pop(),
    });

  } catch (err) {
    console.error("upload-video error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
