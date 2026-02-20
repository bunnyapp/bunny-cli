export async function callLLM(provider, apiKey, { systemPrompt, userPrompt, maxTokens = 1024, json = false }) {
  if (provider === "Anthropic") {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: "claude-opus-4-6",
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    return message.content[0].text.trim();
  } else {
    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey });
    const params = {
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    };
    if (json) params.response_format = { type: "json_object" };
    const completion = await openai.chat.completions.create(params);
    return completion.choices[0].message.content.trim();
  }
}
