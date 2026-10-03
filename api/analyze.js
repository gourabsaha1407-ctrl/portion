/**
 * The only server-side piece of Portion.
 *
 * The browser sends a prompt and (usually) one downscaled photo; this holds the
 * API key and returns Claude's raw text. All nutrition arithmetic — totals,
 * targets, gaps, glycemic load, supplement dosing — happens in the page, so
 * this stays a thin, auditable boundary.
 */
import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5";
const MAX_IMAGE_CHARS = 5_000_000;          // base64 length, ~3.7 MB of bytes
const OK_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/* Best-effort throttle. Serverless instances are recycled, so this is a speed
   bump against accidental loops, not a security control. Put a spend cap on the
   key in the Anthropic console for the real guarantee. */
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  if (hits.size > 5000) hits.clear();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 12;
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body);
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const fail = (res, status, code, message) =>
  res.status(status).json({ error: { code, message } });

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  // The page calls GET once on load to decide whether to show camera features.
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      hasKey: Boolean(process.env.ANTHROPIC_API_KEY),
      model: MODEL,
    });
  }
  if (req.method !== "POST") return fail(res, 405, "method", "POST only.");

  if (!process.env.ANTHROPIC_API_KEY) {
    return fail(res, 503, "no_key",
      "This deployment has no ANTHROPIC_API_KEY set, so reading photos is switched off. " +
      "Everything else in the app works — add meals by hand from the katori list.");
  }

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "anon";
  if (rateLimited(ip)) {
    return fail(res, 429, "rate_limited", "Too many requests from here. Wait a minute and try again.");
  }

  let body;
  try {
    body = await readBody(req);
  } catch {
    return fail(res, 400, "bad_body", "That request could not be read.");
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return fail(res, 400, "bad_prompt", "No prompt was sent.");
  if (prompt.length > 20_000) return fail(res, 413, "bad_prompt", "That prompt is too long.");

  const content = [];
  if (body.image && typeof body.image.data === "string") {
    const { mediaType, data } = body.image;
    if (data.length > MAX_IMAGE_CHARS) {
      return fail(res, 413, "image_rejected", "That photo is too large. Take it again at a smaller size.");
    }
    if (!OK_TYPES.includes(mediaType)) {
      return fail(res, 400, "image_rejected", "That image format is not supported. Use JPEG or PNG.");
    }
    content.push({ type: "image", source: { type: "base64", media_type: mediaType, data } });
  }
  content.push({ type: "text", text: prompt });

  try {
    const client = new Anthropic();            // reads ANTHROPIC_API_KEY from the environment
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: "medium" },     // plenty for label-reading and portion estimates
      messages: [{ role: "user", content }],
    });

    if (message.stop_reason === "refusal") {
      return res.status(200).json({
        error: { code: "refused", message: "Claude declined to answer that one. Try a different photo." },
      });
    }

    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    if (!text.trim()) {
      return res.status(200).json({
        error: { code: "empty", message: "Nothing came back from that photo. Try a closer, better-lit shot." },
      });
    }
    return res.status(200).json({ text });
  } catch (err) {
    const status = err && err.status;
    if (status === 401 || status === 403) {
      return fail(res, 502, "auth", "The API key on this deployment was rejected. Check ANTHROPIC_API_KEY.");
    }
    if (status === 429) {
      return fail(res, 429, "rate_limited", "Claude is rate-limiting this key. Wait a minute and try again.");
    }
    if (status === 400) {
      return fail(res, 400, "bad_request", "Claude rejected that request. Try a different photo.");
    }
    return fail(res, 502, "upstream", "Claude could not be reached just now. Try again.");
  }
}
