# MCP GSC VDL

Multi-account Google Search Console MCP Server with Supabase VDL integration.

## Features

- 🔄 **Multi-Account Support** - Switch between multiple GSC accounts dynamically
- 📊 **Search Analytics** - Up to 25,000 rows with regex filtering
- 🎯 **Quick Wins Detection** - Automatic SEO opportunity identification
- 📈 **Period Comparison** - Compare performance between time periods
- 🔍 **URL Inspection** - Check indexing status of any URL
- 📤 **URL Indexing** - Submit URLs for indexing via Indexing API
- 🗺️ **Sitemap Management** - List and submit sitemaps

## Installation

```bash
npm install
npm run build
```

## Configuration

Set the following environment variables:

```bash
# Supabase VDL
SUPABASE_URL=https://ovptccunortgzaxxgexo.supabase.co
SUPABASE_SERVICE_KEY=your-service-key

# Google OAuth (from your Google Cloud project)
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
```

## MCP Configuration

Add to your MCP config (e.g., `mcporter.json` or `.mcp.json`):

```json
{
  "mcpServers": {
    "gsc-vdl": {
      "command": "node",
      "args": ["/path/to/mcp-gsc-vdl/dist/index.js"],
      "env": {
        "SUPABASE_URL": "https://ovptccunortgzaxxgexo.supabase.co",
        "SUPABASE_SERVICE_KEY": "your-service-key",
        "GOOGLE_CLIENT_ID": "your-client-id",
        "GOOGLE_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

## Available Tools

### list_accounts
List all available GSC accounts from VDL.

### list_sites
List all sites for a specific account.
- `account` (optional): Google account email

### search_analytics
Get search performance data.
- `siteUrl`: Site URL (e.g., `https://example.com` or `sc-domain:example.com`)
- `startDate`: Start date (YYYY-MM-DD)
- `endDate`: End date (YYYY-MM-DD)
- `dimensions`: Comma-separated (query, page, country, device, date)
- `rowLimit`: Max 25,000 rows
- `account` (optional): Account to use

### detect_quick_wins
Find SEO optimization opportunities.
- `siteUrl`: Site URL
- `startDate`, `endDate`: Date range
- `minImpressions`: Minimum impressions (default: 100)
- `maxCtr`: Maximum CTR % (default: 3.0)
- `positionRangeMin/Max`: Position range (default: 4-20)

### compare_periods
Compare metrics between two periods.
- `siteUrl`: Site URL
- `currentStartDate`, `currentEndDate`: Current period
- `previousStartDate`, `previousEndDate`: Previous period
- `dimensions`: Dimensions to compare

### inspect_url
Check URL indexing status.
- `siteUrl`: Property URL
- `inspectionUrl`: URL to inspect

### submit_url_for_indexing
Submit URL for Google indexing.
- `url`: Full URL to submit
- `type`: `URL_UPDATED` (index) or `URL_DELETED` (remove)

### list_sitemaps / submit_sitemap
Manage sitemaps for a site.

## Examples

```
"List my GSC accounts"

"Show quick wins for https://backlink-eldorado.fr using maurelvdl.1@gmail.com"

"Compare last 7 days vs previous 7 days for sc-domain:example.com"

"Submit https://example.com/new-article for indexing"
```

## License

MIT
