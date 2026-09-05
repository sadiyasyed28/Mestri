const fs = require('fs');
let code = fs.readFileSync('shared/statusFeeds.ts', 'utf8');

code = code.replace(
  'export type ProviderConfig = {',
  'export type ProviderAdapter = "statuspage" | "rss" | "instatus" | "google-cloud" | "manual";\n\nexport type ProviderConfig = {'
);

code = code.replace(
  '  sourceUrl: string;\n  feedUrl?: string;',
  '  sourceUrl: string;\n  feedUrl?: string;\n  adapter?: ProviderAdapter;'
);

const newProviders = `export const PROVIDERS: ProviderConfig[] = [
  {
    id: "openai",
    name: "OpenAI",
    service: "ChatGPT + API",
    sourceLabel: "status.openai.com",
    sourceUrl: "https://status.openai.com/",
    feedUrl: "https://status.openai.com/api/v2/summary.json",
    adapter: "statuspage",
    accent: "#111111",
    monogram: "O",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    service: "Claude + API",
    sourceLabel: "status.claude.com",
    sourceUrl: "https://status.claude.com/",
    feedUrl: "https://status.claude.com/api/v2/summary.json",
    adapter: "statuspage",
    accent: "#9D5F35",
    monogram: "A",
  },
  {
    id: "xai",
    name: "xAI",
    service: "Grok + API",
    sourceLabel: "status.x.ai",
    sourceUrl: "https://status.x.ai/",
    feedUrl: "https://status.x.ai/feed.xml",
    adapter: "rss",
    accent: "#111111",
    monogram: "X",
  },
  {
    id: "google",
    name: "Google",
    service: "Gemini + AI Studio",
    sourceLabel: "status.cloud.google.com",
    sourceUrl: "https://status.cloud.google.com/",
    feedUrl: "https://status.cloud.google.com/incidents.json",
    adapter: "google-cloud",
    accent: "#4285F4",
    monogram: "G",
  },
  {
    id: "mistral",
    name: "Mistral",
    service: "Le Chat + API",
    sourceLabel: "status.mistral.ai",
    sourceUrl: "https://status.mistral.ai/",
    feedUrl: "https://status.mistral.ai/api/v1/summary.json",
    adapter: "instatus",
    accent: "#F15A29",
    monogram: "M",
  },
  {
    id: "cohere",
    name: "Cohere",
    service: "Cohere + API",
    sourceLabel: "status.cohere.com",
    sourceUrl: "https://status.cohere.com/",
    feedUrl: "https://status.cohere.com/api/v2/summary.json",
    adapter: "statuspage",
    accent: "#39594D",
    monogram: "C",
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    service: "Inference + Hub",
    sourceLabel: "status.huggingface.co",
    sourceUrl: "https://status.huggingface.co/",
    feedUrl: "https://status.huggingface.co/feed.rss",
    adapter: "rss",
    accent: "#FFD21E",
    monogram: "H",
  },
  {
    id: "replicate",
    name: "Replicate",
    service: "Replicate API",
    sourceLabel: "status.replicate.com",
    sourceUrl: "https://status.replicate.com/",
    feedUrl: "https://status.replicate.com/api/v2/summary.json",
    adapter: "statuspage",
    accent: "#000000",
    monogram: "R",
  },
  {
    id: "groq",
    name: "Groq",
    service: "Groq Cloud + API",
    sourceLabel: "status.groq.com",
    sourceUrl: "https://status.groq.com/",
    adapter: "manual",
    manualOnly: true,
    accent: "#F55036",
    monogram: "GQ",
  },
  {
    id: "perplexity",
    name: "Perplexity",
    service: "Search + API",
    sourceLabel: "status.perplexity.ai",
    sourceUrl: "https://status.perplexity.ai/",
    adapter: "manual",
    manualOnly: true,
    accent: "#22B8CD",
    monogram: "P",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    service: "DeepSeek API",
    sourceLabel: "status.deepseek.com",
    sourceUrl: "https://status.deepseek.com/",
    feedUrl: "https://status.deepseek.com/history.rss",
    adapter: "rss",
    accent: "#4D6BFE",
    monogram: "D",
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    service: "Voice + API",
    sourceLabel: "status.elevenlabs.io",
    sourceUrl: "https://status.elevenlabs.io/",
    feedUrl: "https://status.elevenlabs.io/api/v2/summary.json",
    adapter: "statuspage",
    accent: "#000000",
    monogram: "E",
  }
];`;

code = code.replace(/export const PROVIDERS: ProviderConfig\[\] = \[\s*\{[\s\S]*?\}\s*\];/m, newProviders);

code = code.replace(
  'for (const p of PROVIDERS) {\n  if (p.feedUrl && !p.incidentsUrl) {\n    p.incidentsUrl = deriveIncidentsUrl(p.feedUrl);\n  }\n}',
  'for (const p of PROVIDERS) {\n  if (p.adapter === "statuspage" && p.feedUrl && !p.incidentsUrl) {\n    p.incidentsUrl = deriveIncidentsUrl(p.feedUrl);\n  }\n}'
);

fs.writeFileSync('shared/statusFeeds.ts', code);
console.log('done');
