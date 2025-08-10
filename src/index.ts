#!/usr/bin/env node

/**
 * @fileoverview Main entry point for cctime CLI tool
 * 
 * cctime - Claude Code conversation time tracker
 * Simple CLI to display daily conversation statistics including:
 * - Date
 * - First message time
 * - Last message time  
 * - Estimated conversation duration
 * - Message count
 * - Session count
 */

import process from 'node:process';
import pc from 'picocolors';
import { loadDailyConversationData } from './data-loader.ts';
import { createConversationTable, formatSummary } from './table-display.ts';
import type { LoadOptions } from './types.ts';

/**
 * Parse command line arguments
 */
function parseArgs(): LoadOptions & { help?: boolean; debug?: boolean; days?: number } {
    const args = process.argv.slice(2);
    const options: LoadOptions & { help?: boolean; debug?: boolean; days?: number } = {};

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        switch (arg) {
            case '-h':
            case '--help':
                options.help = true;
                break;
            case '--debug':
                options.debug = true;
                break;
            case '--since':
                if (i + 1 < args.length) {
                    options.since = args[++i];
                }
                break;
            case '--until':
                if (i + 1 < args.length) {
                    options.until = args[++i];
                }
                break;
            case '--claude-path':
                if (i + 1 < args.length) {
                    options.claudePath = args[++i];
                }
                break;
            case '--days':
                if (i + 1 < args.length) {
                    const daysValue = parseInt(args[++i], 10);
                    if (isNaN(daysValue) || daysValue < 1 || daysValue > 30) {
                        console.error(pc.red('Error: --days must be a number between 1 and 30'));
                        process.exit(1);
                    }
                    options.days = daysValue;
                }
                break;
            default:
                if (arg.startsWith('-')) {
                    console.error(pc.red(`Unknown option: ${arg}`));
                    process.exit(1);
                }
                break;
        }
    }

    return options;
}

/**
 * Show help information
 */
function showHelp(): void {
    console.log(`
${pc.bold(pc.cyan('cctime'))} - Claude Code conversation time tracker

${pc.bold('USAGE:')}
  cctime [OPTIONS]

${pc.bold('OPTIONS:')}
  -h, --help              Show this help message
  --debug                 Show debug information about file discovery
  --days N                Show only the last N days (1-30, default: all)
  --since YYYYMMDD        Filter conversations since date (e.g. 20241201)  
  --until YYYYMMDD        Filter conversations until date (e.g. 20241231)
  --claude-path PATH      Custom path to Claude data directory

${pc.bold('EXAMPLES:')}
  cctime                           # Show all conversations
  cctime --days 7                  # Show last 7 days
  cctime --days 30                 # Show last 30 days
  cctime --since 20241201          # Show conversations since Dec 1st, 2024
  cctime --since 20241201 --until 20241231  # Show December 2024 conversations
  cctime --claude-path ~/.claude   # Use custom Claude data path

${pc.bold('DESCRIPTION:')}
  cctime analyzes your Claude Code conversation data and displays a daily summary
  showing when you started and ended conversations each day, along with estimated
  conversation duration and message counts.
  
  The tool automatically finds your Claude data directory in standard locations:
  - ~/.config/claude/projects/
  - ~/.claude/projects/
  
  Or you can set the CLAUDE_CONFIG_DIR environment variable.
`);
}

/**
 * Main function
 */
async function main(): Promise<void> {
    const options = parseArgs();

    if (options.help) {
        showHelp();
        return;
    }

    console.log(pc.bold(pc.cyan('cctime - Claude Code Conversation Time Tracker')));
    console.log('');

    try {
        const allConversations = await loadDailyConversationData(options);

        // Limit to specified number of days if requested
        const conversations = options.days
            ? allConversations.slice(0, options.days)
            : allConversations;

        const table = createConversationTable(conversations);
        console.log(table);
        console.log('');

        const summary = formatSummary(conversations);
        console.log(summary);

    } catch (error) {
        console.error(pc.red('Error loading conversation data:'), error);
        process.exit(1);
    }
}

// Run main function
main().catch((error) => {
    console.error(pc.red('Unexpected error:'), error);
    process.exit(1);
});
