#!/usr/bin/env node

/**
 * MCP GSC VDL - Multi-Account Google Search Console MCP Server
 * 
 * Features:
 * - Multi-account support via Supabase VDL
 * - Search Analytics with Quick Wins detection
 * - URL Indexing submission
 * - Period comparison
 * - Sitemap management
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema,
  ErrorCode,
  McpError 
} from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { z } from 'zod';

import { SupabaseAuthProvider, GSCAccount } from './supabase-auth.js';
import { SearchConsoleService } from './search-console.js';
import {
  SearchAnalyticsSchema,
  QuickWinsSchema,
  InspectUrlSchema,
  SubmitIndexingSchema,
  ListSitemapsSchema,
  SubmitSitemapSchema,
  ComparePeriodsSchema,
} from './schemas.js';

// Environment configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ovptccunortgzaxxgexo.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

// Validate required environment variables
if (!SUPABASE_KEY) {
  console.error('SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY is required');
  process.exit(1);
}

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required');
  process.exit(1);
}

// Initialize providers
const authProvider = new SupabaseAuthProvider(
  SUPABASE_URL,
  SUPABASE_KEY,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET
);

// Create MCP Server
const server = new Server(
  {
    name: 'mcp-gsc-vdl',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Helper to get service for an account
async function getServiceForAccount(email?: string): Promise<{ service: SearchConsoleService; account: GSCAccount }> {
  let account: GSCAccount | null;
  
  if (email) {
    account = await authProvider.getAccount(email);
    if (!account) {
      throw new McpError(ErrorCode.InvalidParams, `Account not found: ${email}`);
    }
  } else {
    const accounts = await authProvider.listAccounts();
    if (accounts.length === 0) {
      throw new McpError(ErrorCode.InternalError, 'No GSC accounts available');
    }
    account = accounts[0];
  }

  const authClient = await authProvider.getAuthClient(account.email);
  const service = new SearchConsoleService(authClient);
  
  return { service, account };
}

// List Tools Handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'list_accounts',
        description: 'List all available Google Search Console accounts from VDL',
        inputSchema: zodToJsonSchema(z.object({})),
      },
      {
        name: 'list_sites',
        description: 'List all sites for a specific GSC account',
        inputSchema: zodToJsonSchema(z.object({
          account: z.string().optional().describe('Google account email (optional, uses first account if not specified)'),
        })),
      },
      {
        name: 'search_analytics',
        description: 'Get search performance data with up to 25,000 rows, regex filters, and flexible date ranges',
        inputSchema: zodToJsonSchema(SearchAnalyticsSchema),
      },
      {
        name: 'detect_quick_wins',
        description: 'Automatically detect SEO quick wins - keywords with high impressions but low CTR in positions 4-20',
        inputSchema: zodToJsonSchema(QuickWinsSchema),
      },
      {
        name: 'compare_periods',
        description: 'Compare search performance between two time periods',
        inputSchema: zodToJsonSchema(ComparePeriodsSchema),
      },
      {
        name: 'inspect_url',
        description: 'Inspect URL indexing status in Google Search Console',
        inputSchema: zodToJsonSchema(InspectUrlSchema),
      },
      {
        name: 'submit_url_for_indexing',
        description: 'Submit a URL to Google for indexing or request removal (uses Indexing API)',
        inputSchema: zodToJsonSchema(SubmitIndexingSchema),
      },
      {
        name: 'list_sitemaps',
        description: 'List all sitemaps for a site',
        inputSchema: zodToJsonSchema(ListSitemapsSchema),
      },
      {
        name: 'submit_sitemap',
        description: 'Submit a sitemap to Google Search Console',
        inputSchema: zodToJsonSchema(SubmitSitemapSchema),
      },
    ],
  };
});

// Call Tool Handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'list_accounts': {
        const accounts = await authProvider.listAccounts();
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              accounts: accounts.map(a => ({
                email: a.email,
                sitesCount: a.sitesCount,
                isValid: a.isValid,
              })),
              totalAccounts: accounts.length,
              totalSites: accounts.reduce((sum, a) => sum + (a.sitesCount || 0), 0),
            }, null, 2),
          }],
        };
      }

      case 'list_sites': {
        const { account } = args as { account?: string };
        const { service, account: usedAccount } = await getServiceForAccount(account);
        const sites = await authProvider.getSitesForAccount(usedAccount.email);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              account: usedAccount.email,
              sites,
              totalSites: sites.length,
            }, null, 2),
          }],
        };
      }

      case 'search_analytics': {
        const params = SearchAnalyticsSchema.parse(args);
        const { service, account } = await getServiceForAccount(params.account);

        // Build request
        const requestBody: any = {
          startDate: params.startDate,
          endDate: params.endDate,
          dimensions: params.dimensions,
          searchType: params.type,
          aggregationType: params.aggregationType,
          rowLimit: params.rowLimit,
          startRow: params.startRow,
          dataState: params.dataState,
        };

        // Build filters
        const filters: any[] = [];
        if (params.pageFilter) {
          filters.push({
            dimension: 'page',
            operator: params.filterOperator || 'contains',
            expression: params.pageFilter,
          });
        }
        if (params.queryFilter) {
          filters.push({
            dimension: 'query',
            operator: params.filterOperator || 'contains',
            expression: params.queryFilter,
          });
        }
        if (params.countryFilter) {
          filters.push({
            dimension: 'country',
            operator: 'equals',
            expression: params.countryFilter,
          });
        }
        if (params.deviceFilter) {
          filters.push({
            dimension: 'device',
            operator: 'equals',
            expression: params.deviceFilter,
          });
        }

        if (filters.length > 0) {
          requestBody.dimensionFilterGroups = [{ groupType: 'and', filters }];
        }

        const result = await service.searchAnalytics(params.siteUrl, requestBody);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              account: account.email,
              siteUrl: params.siteUrl,
              dateRange: { start: params.startDate, end: params.endDate },
              rowCount: result.data.rows?.length || 0,
              data: result.data,
            }, null, 2),
          }],
        };
      }

      case 'detect_quick_wins': {
        const params = QuickWinsSchema.parse(args);
        const { service, account } = await getServiceForAccount(params.account);

        const quickWins = await service.detectQuickWins(
          params.siteUrl,
          params.startDate,
          params.endDate,
          {
            minImpressions: params.minImpressions,
            maxCtr: params.maxCtr,
            positionRangeMin: params.positionRangeMin,
            positionRangeMax: params.positionRangeMax,
            limit: params.limit,
          }
        );

        // Calculate totals
        const totalAdditionalClicks = quickWins.reduce((sum, qw) => sum + qw.additionalClicks, 0);
        const highOpportunities = quickWins.filter(qw => qw.opportunity === 'High').length;

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              account: account.email,
              siteUrl: params.siteUrl,
              dateRange: { start: params.startDate, end: params.endDate },
              thresholds: {
                minImpressions: params.minImpressions,
                maxCtr: params.maxCtr,
                positionRange: `${params.positionRangeMin}-${params.positionRangeMax}`,
              },
              summary: {
                totalQuickWins: quickWins.length,
                highOpportunities,
                potentialAdditionalClicks: totalAdditionalClicks,
              },
              quickWins,
            }, null, 2),
          }],
        };
      }

      case 'compare_periods': {
        const params = ComparePeriodsSchema.parse(args);
        const { service, account } = await getServiceForAccount(params.account);

        const result = await service.comparePeriods(
          params.siteUrl,
          params.currentStartDate,
          params.currentEndDate,
          params.previousStartDate,
          params.previousEndDate,
          params.dimensions,
          params.rowLimit
        );

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              account: account.email,
              siteUrl: params.siteUrl,
              ...result,
            }, null, 2),
          }],
        };
      }

      case 'inspect_url': {
        const params = InspectUrlSchema.parse(args);
        const { service, account } = await getServiceForAccount(params.account);

        const result = await service.inspectUrl(
          params.siteUrl,
          params.inspectionUrl,
          params.languageCode
        );

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              account: account.email,
              inspectedUrl: params.inspectionUrl,
              result: result.data,
            }, null, 2),
          }],
        };
      }

      case 'submit_url_for_indexing': {
        const params = SubmitIndexingSchema.parse(args);
        const { service, account } = await getServiceForAccount(params.account);

        try {
          const result = await service.submitUrlForIndexing(params.url, params.type);
          
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                account: account.email,
                url: params.url,
                type: params.type,
                notifyTime: new Date().toISOString(),
                message: params.type === 'URL_UPDATED'
                  ? 'Successfully submitted URL for indexing. Google will crawl this URL soon.'
                  : 'Successfully requested URL removal from index.',
                response: result.data,
              }, null, 2),
            }],
          };
        } catch (error: any) {
          if (error.code === 403) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: 'Indexing API not enabled or insufficient permissions',
                  suggestion: 'Enable the Indexing API in Google Cloud Console and ensure your OAuth has the indexing scope.',
                  url: params.url,
                }, null, 2),
              }],
            };
          }
          throw error;
        }
      }

      case 'list_sitemaps': {
        const params = ListSitemapsSchema.parse(args);
        const { service, account } = await getServiceForAccount(params.account);

        const result = await service.listSitemaps(params.siteUrl);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              account: account.email,
              siteUrl: params.siteUrl,
              sitemaps: result.data.sitemap || [],
            }, null, 2),
          }],
        };
      }

      case 'submit_sitemap': {
        const params = SubmitSitemapSchema.parse(args);
        const { service, account } = await getServiceForAccount(params.account);

        await service.submitSitemap(params.siteUrl, params.feedpath);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              account: account.email,
              siteUrl: params.siteUrl,
              sitemap: params.feedpath,
              message: 'Sitemap submitted successfully',
            }, null, 2),
          }],
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid arguments: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      );
    }
    throw error;
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MCP GSC VDL Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
