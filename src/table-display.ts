/**
 * @fileoverview Table display utilities for conversation data
 * Inspired by ccusage table formatting
 */

import Table from 'cli-table3';
import pc from 'picocolors';
import type { DailyConversation } from './types.ts';

/**
 * Create and display a table of daily conversations
 */
export function createConversationTable(conversations: DailyConversation[]): string {
    const table = new Table({
        head: [
            pc.cyan('Date'),
            pc.cyan('First Message'),
            pc.cyan('Last Message'),
            pc.cyan('Conv. Time'),
            pc.cyan('Messages'),
            pc.cyan('Sessions')
        ],
        style: {
            head: [],
            border: []
        },
        colAligns: ['left', 'center', 'center', 'center', 'right', 'right']
    });

    if (conversations.length === 0) {
        table.push([
            { colSpan: 6, content: pc.yellow('No conversation data found') }
        ]);
        return table.toString();
    }

    // Add conversation data rows
    for (const conv of conversations) {
        table.push([
            conv.date,
            conv.firstMessageTime,
            conv.lastMessageTime,
            conv.estimatedConversationTime,
            conv.messageCount.toString(),
            conv.sessionIds.length.toString()
        ]);
    }

    return table.toString();
}

/**
 * Format summary information
 */
export function formatSummary(conversations: DailyConversation[]): string {
    if (conversations.length === 0) {
        return pc.yellow('No data to summarize');
    }

    const totalDays = conversations.length;
    const totalMessages = conversations.reduce((sum, conv) => sum + conv.messageCount, 0);
    const totalSessions = conversations.reduce((sum, conv) => sum + conv.sessionIds.length, 0);

    const lines = [
        `${pc.bold('Summary:')}`,
        `  Days with activity: ${pc.green(totalDays.toString())}`,
        `  Total messages: ${pc.green(totalMessages.toString())}`,
        `  Total sessions: ${pc.green(totalSessions.toString())}`,
        `  Avg messages/day: ${pc.green(Math.round(totalMessages / totalDays).toString())}`
    ];

    return lines.join('\n');
}
