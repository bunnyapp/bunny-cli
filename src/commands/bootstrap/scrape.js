export function extractMetaFromHtml(html) {
  const meta = {};

  // og:image
  const ogImage = html.match(
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
  ) || html.match(
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i
  );
  if (ogImage) meta.ogImage = ogImage[1];

  // twitter:image
  const twitterImage = html.match(
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i
  ) || html.match(
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i
  );
  if (twitterImage) meta.twitterImage = twitterImage[1];

  // apple-touch-icon
  const appleIcon = html.match(
    /<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']([^"']+)["']/i
  ) || html.match(
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']apple-touch-icon["']/i
  );
  if (appleIcon) meta.appleIcon = appleIcon[1];

  // shortcut icon / favicon
  const favicon = html.match(
    /<link[^>]+rel=["'](?:shortcut icon|icon)["'][^>]+href=["']([^"']+)["']/i
  ) || html.match(
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut icon|icon)["']/i
  );
  if (favicon) meta.favicon = favicon[1];

  // theme-color
  const themeColor = html.match(
    /<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i
  ) || html.match(
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']theme-color["']/i
  );
  if (themeColor) meta.themeColor = themeColor[1];

  // img tags whose alt text contains "logo" (case-insensitive) — best signal for a logo image
  const logoImgMatches = html.matchAll(/<img[^>]+>/gi);
  const logoImgs = [];
  for (const m of logoImgMatches) {
    const tag = m[0];
    const altMatch = tag.match(/alt=["']([^"']*)["']/i);
    const srcMatch = tag.match(/src=["']([^"']+)["']/i);
    if (srcMatch && altMatch && /logo/i.test(altMatch[1])) {
      logoImgs.push(srcMatch[1]);
    }
  }
  if (logoImgs.length > 0) meta.logoImgs = logoImgs;

  // First few img src values (general fallback)
  const imgMatches = html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi);
  const imgs = [];
  for (const m of imgMatches) {
    imgs.push(m[1]);
    if (imgs.length >= 5) break;
  }
  if (imgs.length > 0) meta.images = imgs;

  // page title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) meta.title = titleMatch[1].trim();

  // og:title
  const ogTitle = html.match(
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i
  ) || html.match(
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i
  );
  if (ogTitle) meta.ogTitle = ogTitle[1];

  // og:description
  const ogDesc = html.match(
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i
  ) || html.match(
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i
  );
  if (ogDesc) meta.ogDescription = ogDesc[1];

  return meta;
}
