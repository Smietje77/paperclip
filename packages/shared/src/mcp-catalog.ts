import type { McpCatalogEntry } from "./types/mcp-server.js";

/**
 * Curated catalog of MCP servers useful for a marketing-oriented company.
 *
 * Every entry below has been verified against the official MCP Registry
 * (registry.modelcontextprotocol.io) and/or npm/pypi. Entries whose upstream
 * distribution is Python require `uv` / `uvx` to be installed on the host.
 *
 * Secrets are never embedded in this file — only the expected env-key names
 * are declared. The user couples them to real values via the company secrets
 * vault.
 */
export const MARKETING_MCP_CATALOG: McpCatalogEntry[] = [
  // ============================================================ analytics
  {
    key: "google-analytics-4",
    name: "Google Analytics 4",
    description: "Query GA4 property reports, realtime data and audiences.",
    category: "analytics",
    status: "stable",
    transport: "stdio",
    command: "npx",
    args: ["-y", "mcp-ga4"],
    envKeys: [
      { key: "GA4_PROPERTY_ID", label: "GA4 Property ID", required: true },
      { key: "GOOGLE_APPLICATION_CREDENTIALS", label: "Service Account JSON path", required: true, docsUrl: "https://cloud.google.com/docs/authentication/application-default-credentials" },
    ],
    docsUrl: "https://github.com/mharnett/mcp-ga4",
    isStarterPack: true,
  },
  {
    key: "google-search-console",
    name: "Google Search Console",
    description: "SEO-posities, indexering, clicks en impressies per query.",
    category: "analytics",
    status: "stable",
    transport: "stdio",
    command: "npx",
    args: ["-y", "mcp-server-gsc"],
    envKeys: [
      { key: "GOOGLE_APPLICATION_CREDENTIALS", label: "Service Account JSON path", required: true },
      { key: "GSC_SITE_URL", label: "Site URL (https://example.com/)", required: true },
    ],
    docsUrl: "https://www.npmjs.com/package/mcp-server-gsc",
    isStarterPack: true,
  },

  // ============================================================ advertising
  {
    key: "google-ads",
    name: "Google Ads",
    description: "Campagnes, bied-strategieën en performance-rapportage.",
    category: "advertising",
    status: "stable",
    transport: "stdio",
    command: "npx",
    args: ["-y", "mcp-google-ads"],
    envKeys: [
      { key: "GOOGLE_ADS_DEVELOPER_TOKEN", label: "Developer Token", required: true },
      { key: "GOOGLE_ADS_CLIENT_ID", label: "OAuth Client ID", required: true },
      { key: "GOOGLE_ADS_CLIENT_SECRET", label: "OAuth Client Secret", required: true },
      { key: "GOOGLE_ADS_REFRESH_TOKEN", label: "Refresh Token", required: true },
      { key: "GOOGLE_ADS_CUSTOMER_ID", label: "Customer ID (123-456-7890)", required: true },
    ],
    docsUrl: "https://github.com/mharnett/mcp-google-ads",
    isStarterPack: false,
  },
  {
    key: "linkedin-ads",
    name: "LinkedIn Ads",
    description: "LinkedIn Marketing-API voor campagnes en lead-gen.",
    category: "advertising",
    status: "stable",
    transport: "stdio",
    command: "npx",
    args: ["-y", "mcp-linkedin-ads"],
    envKeys: [
      { key: "LINKEDIN_ACCESS_TOKEN", label: "OAuth access token", required: true },
      { key: "LINKEDIN_AD_ACCOUNT_ID", label: "Ad Account URN", required: true },
    ],
    docsUrl: "https://github.com/mharnett/mcp-linkedin-ads",
    isStarterPack: false,
  },
  {
    key: "meta-ads",
    name: "Meta Ads (Facebook/Instagram)",
    description: "Beheer van advertentiecampagnes, ad-sets en creatives via Pipeboard's Meta Ads MCP.",
    category: "advertising",
    status: "stable",
    transport: "stdio",
    command: "uvx",
    args: ["meta-ads-mcp"],
    envKeys: [
      { key: "META_ACCESS_TOKEN", label: "Long-lived access token", required: true },
      { key: "META_AD_ACCOUNT_ID", label: "Ad Account ID (act_xxx)", required: true },
    ],
    docsUrl: "https://github.com/pipeboard-co/meta-ads-mcp",
    isStarterPack: false,
  },

  // ============================================================ content
  {
    key: "notion",
    name: "Notion",
    description: "Contentkalender, briefings en redactionele workflow.",
    category: "content",
    status: "stable",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@notionhq/notion-mcp-server"],
    envKeys: [{ key: "NOTION_API_KEY", label: "Internal Integration Token", required: true }],
    docsUrl: "https://developers.notion.com/docs/mcp",
    isStarterPack: true,
  },
  {
    key: "google-drive",
    name: "Google Drive / Docs",
    description: "Documenten lezen en genereren voor content-productie.",
    category: "content",
    status: "stable",
    transport: "stdio",
    command: "npx",
    args: ["-y", "google-drive-mcp"],
    envKeys: [{ key: "GOOGLE_APPLICATION_CREDENTIALS", label: "Service Account JSON", required: true }],
    docsUrl: "https://github.com/domdomegg/google-drive-mcp",
    isStarterPack: false,
  },

  // ============================================================ design
  {
    key: "canva",
    name: "Canva",
    description: "Social posts, banners en presentaties on-brand genereren via Canva's officiële hosted MCP.",
    category: "design",
    status: "stable",
    transport: "http",
    url: "https://mcp.canva.com/",
    headerKeys: [{ key: "Authorization", label: "Bearer <OAuth token>", required: true }],
    envKeys: [],
    docsUrl: "https://www.canva.dev/docs/connect/",
    isStarterPack: false,
  },
  {
    key: "figma",
    name: "Figma",
    description: "Design-review, asset-export en brand-consistency checks.",
    category: "design",
    status: "stable",
    transport: "stdio",
    command: "npx",
    args: ["-y", "figma-developer-mcp", "--stdio"],
    envKeys: [{ key: "FIGMA_API_KEY", label: "Personal Access Token", required: true }],
    docsUrl: "https://github.com/GLips/Figma-Context-MCP",
    isStarterPack: false,
  },

  // ============================================================ email
  {
    key: "mailchimp",
    name: "Mailchimp",
    description: "Nieuwsbriefbeheer, audience-segmenten en campagnes (vereist `uv`/`uvx`).",
    category: "email",
    status: "experimental",
    transport: "stdio",
    command: "uvx",
    args: ["mailchimp-mcp-server"],
    envKeys: [
      { key: "MAILCHIMP_API_KEY", label: "API key (eindigt op -usX)", required: true },
      { key: "MAILCHIMP_SERVER_PREFIX", label: "Server prefix (bv. us21)", required: true },
    ],
    docsUrl: "https://github.com/asklokesh/mailchimp-mcp-server",
    isStarterPack: false,
  },

  // ============================================================ crm
  {
    key: "hubspot",
    name: "HubSpot",
    description: "CRM + marketing-automation in één: contacts, deals, campaigns.",
    category: "crm",
    status: "stable",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@hubspot/mcp-server"],
    envKeys: [{ key: "PRIVATE_APP_ACCESS_TOKEN", label: "HubSpot private app token", required: true }],
    docsUrl: "https://developers.hubspot.com/mcp",
    isStarterPack: true,
  },
  {
    key: "salesforce",
    name: "Salesforce",
    description: "Leads, accounts, opportunities uit Salesforce CRM via @aaronsb/salesforce-cloud-mcp.",
    category: "crm",
    status: "stable",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@aaronsb/salesforce-cloud-mcp"],
    envKeys: [
      { key: "SALESFORCE_INSTANCE_URL", label: "Instance URL", required: true },
      { key: "SALESFORCE_ACCESS_TOKEN", label: "OAuth access token", required: true },
    ],
    docsUrl: "https://github.com/aaronsb/salesforce-cloud-mcp",
    isStarterPack: false,
  },

  // ============================================================ ops
  {
    key: "calendly",
    name: "Calendly",
    description: "Afspraken automatisch inplannen en events uitlezen (vereist `uv`/`uvx`).",
    category: "ops",
    status: "experimental",
    transport: "stdio",
    command: "uvx",
    args: ["calendly-mcp"],
    envKeys: [{ key: "CALENDLY_API_TOKEN", label: "Personal access token", required: true }],
    docsUrl: "https://github.com/NyxToolsDev/calendly-mcp",
    isStarterPack: false,
  },
  {
    key: "apify",
    name: "Apify Actors",
    description: "Web scraping en data-extractie via duizenden kant-en-klare Actors (LinkedIn, Google Maps, Instagram, etc.).",
    category: "ops",
    status: "stable",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@apify/actors-mcp-server"],
    envKeys: [
      { key: "APIFY_TOKEN", label: "Apify API token", required: true, docsUrl: "https://console.apify.com/account/integrations" },
    ],
    docsUrl: "https://docs.apify.com/platform/integrations/mcp",
    isStarterPack: true,
  },
  {
    key: "airtable",
    name: "Airtable",
    description: "Flexibele databases voor campagne- en klant-trackers.",
    category: "ops",
    status: "stable",
    transport: "stdio",
    command: "npx",
    args: ["-y", "airtable-mcp-server"],
    envKeys: [{ key: "AIRTABLE_API_KEY", label: "Personal Access Token", required: true }],
    docsUrl: "https://github.com/domdomegg/airtable-mcp-server",
    isStarterPack: false,
  },
];

export function getCatalogEntry(key: string): McpCatalogEntry | undefined {
  return MARKETING_MCP_CATALOG.find((entry) => entry.key === key);
}

export function getStarterPackEntries(): McpCatalogEntry[] {
  return MARKETING_MCP_CATALOG.filter((entry) => entry.isStarterPack);
}
