import { callLLM } from "../../lib/llm.js";

export async function analyzeWithLLM(provider, apiKey, domain, meta) {
  const contextLines = [
    `Domain: ${domain}`,
    meta.title ? `Page title: ${meta.title}` : null,
    meta.ogTitle ? `OG title: ${meta.ogTitle}` : null,
    meta.ogDescription ? `OG description: ${meta.ogDescription}` : null,
    meta.logoImgs && meta.logoImgs.length > 0
      ? `Images with "logo" in alt text (best candidates): ${meta.logoImgs.join(", ")}`
      : null,
    meta.ogImage ? `OG image: ${meta.ogImage}` : null,
    meta.twitterImage ? `Twitter image: ${meta.twitterImage}` : null,
    meta.appleIcon ? `Apple touch icon: ${meta.appleIcon}` : null,
    meta.favicon ? `Favicon: ${meta.favicon}` : null,
    meta.themeColor ? `Theme color: ${meta.themeColor}` : null,
    meta.images && meta.images.length > 0
      ? `Other images: ${meta.images.join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const systemPrompt = `You are a branding analyst. Given metadata extracted from a company's website, you extract branding information. Always respond with valid JSON only, no markdown fences.`;

  const userPrompt = `Analyze this website metadata and extract branding information:

${contextLines}

Respond with a JSON object with these exact keys:
{
  "logoUrl": "the best logo image URL — prefer images with 'logo' in their alt text first, then apple-touch-icon, then og:image; avoid favicons and generic page images",
  "brandColor": "#RRGGBB hex color — use theme-color if available, otherwise infer the primary brand color from context",
  "accentColor": "#RRGGBB hex color — a secondary color visibly distinct from brandColor. If the site has a clear secondary color use that; otherwise produce a lighter tint of brandColor by blending it toward white (e.g. mix 40% white into the brand color). Do NOT default to orange or any color unrelated to the brand."
}

If you cannot determine a value, make a reasonable professional default derived from the brand. Return only valid JSON.`;

  const text = await callLLM(provider, apiKey, { systemPrompt, userPrompt, maxTokens: 1024, json: true });
  return JSON.parse(text);
}

export async function generateEmailTemplate(provider, apiKey, existingTemplate, logoUrl, brandColor, accentColor, domain) {
  const systemPrompt = `You are an HTML email template specialist. When given an HTML email template and brand assets, you update the template to reflect the new branding. Return only the complete updated HTML — no explanation, no markdown fences.`;

  const userPrompt = `Update the HTML email template below to use this branding:
- Domain: ${domain}
- Logo URL: ${logoUrl}
- Brand color (bare hex, no #): ${brandColor}
- Accent color (bare hex, no #): ${accentColor || brandColor}

Apply these changes:
1. Replace the logo <img> src attribute with the new logo URL
2. Replace the button background-color with #${brandColor}
3. Replace the accent color bar (the div with a solid background color) with #${accentColor || brandColor}
4. Replace any other hardcoded brand/link colors with #${brandColor} or #${accentColor || brandColor} as appropriate
5. Remove the support email link (the "Questions? We're all ears!" mailto link or any similar mailto: link in the template)
6. In the footer, remove all Bunny-specific content: the "Bunny, Inc." tagline text, and the LinkedIn/X/YouTube social media icon links
7. If the domain has known social media presence, add appropriate social links in the footer in the same style; otherwise leave the social links section empty
8. Replace any remaining references to "Bunny" in the footer text with the company name inferred from the domain
9. Preserve all Liquid/Handlebars template variables like {{body}}, {{company.name}}, {{quote.portal_url}} exactly as-is

Return only the complete updated HTML template.

Existing template:
${existingTemplate}`;

  return callLLM(provider, apiKey, { systemPrompt, userPrompt, maxTokens: 4096 });
}
