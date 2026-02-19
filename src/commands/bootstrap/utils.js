export function errMsg(err) {
  if (err == null) return "Unknown error";
  if (typeof err === "string") return err;
  if (err.status === 500) return `Internal Server Error: ${err.exception || "unknown server error"}`;
  if (err.message) return err.message;
  const s = JSON.stringify(err);
  return s && s !== "{}" ? s : String(err);
}

export function verboseErr(err) {
  if (err == null) return String(err);
  if (err instanceof Error) {
    return JSON.stringify({ name: err.name, message: err.message, stack: err.stack, ...err }, null, 2);
  }
  const s = JSON.stringify(err, null, 2);
  return s && s !== "{}" ? s : String(err);
}

export function sanitizeColor(color) {
  if (!color) return undefined;
  // Strip leading # and any non-hex characters, then cap at 8 chars
  return color.replace(/^#/, "").replace(/[^0-9a-fA-F]/g, "").slice(0, 8) || undefined;
}

export function resolveUrl(base, url) {
  if (!url) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("//")) return "https:" + url;
  if (url.startsWith("/")) {
    const u = new URL(base);
    return `${u.protocol}//${u.host}${url}`;
  }
  return base.replace(/\/$/, "") + "/" + url;
}

export function guessMimeType(url) {
  if (url.includes(".png")) return "image/png";
  if (url.includes(".jpg") || url.includes(".jpeg")) return "image/jpeg";
  if (url.includes(".gif")) return "image/gif";
  if (url.includes(".webp")) return "image/webp";
  if (url.includes(".svg")) return "image/svg+xml";
  if (url.includes(".ico")) return "image/x-icon";
  return "image/png";
}
