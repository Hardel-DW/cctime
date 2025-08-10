

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { isDirectorySync } from 'path-type';
import { glob } from 'tinyglobby';
import type { UsageData, DailyConversation, LoadOptions, ISOTimestamp, DailyDate, SessionId } from './types.ts';
import { usageDataSchema, createDailyDate, createSessionId } from './types.ts';
import { CLAUDE_CONFIG_DIR_ENV, DEFAULT_CLAUDE_CONFIG_PATH, DEFAULT_CLAUDE_CODE_PATH } from './constants.ts';


export function getClaudePaths(): string[] {
    const paths = [];
    const normalizedPaths = new Set<string>();

    const envPaths = (process.env[CLAUDE_CONFIG_DIR_ENV] ?? '').trim();
    if (envPaths !== '') {
        const envPathList = envPaths.split(',').map(p => p.trim()).filter(p => p !== '');
        for (const envPath of envPathList) {
            const normalizedPath = path.resolve(envPath);
            if (isDirectorySync(normalizedPath)) {
                if (!normalizedPaths.has(normalizedPath)) {
                    normalizedPaths.add(normalizedPath);
                    paths.push(normalizedPath);
                }
            }
        }
        if (paths.length > 0) {
            return paths;
        }
    }

    // Use default paths - just check if they exist, don't require projects/ subdir
    const defaultPaths = [DEFAULT_CLAUDE_CONFIG_PATH, DEFAULT_CLAUDE_CODE_PATH];
    for (const defaultPath of defaultPaths) {
        if (isDirectorySync(defaultPath)) {
            const normalizedPath = path.resolve(defaultPath);
            if (!normalizedPaths.has(normalizedPath)) {
                normalizedPaths.add(normalizedPath);
                paths.push(normalizedPath);
            }
        }
    }

    return paths;
}

/**
 * Parse a single JSONL line to UsageData
 */
function parseUsageEntry(line: string, filePath: string, debug = false): UsageData | null {
    try {
        const data = JSON.parse(line);
        return usageDataSchema.parse(data);
    } catch (error) {
        if (debug) {
            console.warn(`Skipping invalid line in ${filePath}:`, error);
        }
        return null;
    }
}

/**
 * Load usage data from a single JSONL file
 */
async function loadUsageFile(filePath: string, debug = false): Promise<UsageData[]> {
    try {
        const content = await readFile(filePath, 'utf8');
        const lines = content.trim().split('\n').filter(line => line.trim());

        const entries: UsageData[] = [];
        for (const line of lines) {
            const entry = parseUsageEntry(line, filePath, debug);
            if (entry) {
                entries.push(entry);
            }
        }

        return entries;
    } catch (error) {
        console.warn(`Failed to read file ${filePath}:`, error);
        return [];
    }
}

/**
 * Find all JSONL files in Claude data directories
 * Using the same approach as claude-code-templates: recursive search from root
 */
async function findUsageFiles(claudePaths: string[], debug = false): Promise<string[]> {
    const allFiles: string[] = [];

    for (const claudePath of claudePaths) {
        if (debug) {
            console.log(`\nSearching recursively in: ${claudePath}`);
        }

        // Use glob-compatible pattern (forward slashes work on all platforms)
        const pattern = claudePath.replace(/\\/g, '/') + '/**/*.jsonl';

        try {
            const files = await glob(pattern);
            if (debug) {
                console.log(`Found ${files.length} .jsonl files:`, files);
            }
            allFiles.push(...files);
        } catch (error) {
            if (debug) {
                console.warn(`Failed to glob files with pattern ${pattern}:`, error);
            }
        }
    }

    // Remove duplicates and sort
    return Array.from(new Set(allFiles)).sort();
}

/**
 * Extract session ID from file path
 */
function extractSessionIdFromPath(filePath: string): SessionId | null {
    try {
        // Extract filename without extension as potential session ID
        const fileName = path.basename(filePath, path.extname(filePath));

        // Get parent directory name as potential session ID
        const parentDir = path.basename(path.dirname(filePath));

        // Try parent directory first (common pattern: ../sessionId/file.jsonl)
        if (parentDir && parentDir !== '.' && parentDir !== '.claude') {
            return createSessionId(parentDir);
        }

        // Fall back to filename (pattern: sessionId.jsonl)
        if (fileName && fileName !== 'usage' && fileName !== 'chat') {
            return createSessionId(fileName);
        }

        // Default fallback
        return createSessionId('unknown');
    } catch {
        return createSessionId('unknown');
    }
}

/**
 * Format time from ISO timestamp to HH:MM
 */
function formatTime(timestamp: ISOTimestamp): string {
    const date = new Date(timestamp);
    // Use manual formatting to avoid 24:xx display bug
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

/**
 * Format date from ISO timestamp to YYYY-MM-DD using local timezone
 */
function formatDate(timestamp: ISOTimestamp): DailyDate {
    const date = new Date(timestamp);
    // Use local date instead of UTC to properly group messages by local day
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return createDailyDate(`${year}-${month}-${day}`);
}

/**
 * Calculate estimated conversation time based on first and last messages
 */
/**
 * Calculate actual conversation time by grouping messages into sessions
 * with a 3-minute gap tolerance between messages
 */
function calculateConversationTime(entries: Array<{ timestamp: ISOTimestamp }>, debug = false): string {
    if (entries.length === 0) return '0m';
    if (entries.length === 1) return '1m'; // Single message = 1 minute minimum

    // Sort entries by timestamp
    const sortedEntries = [...entries].sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    if (debug) {
        console.log(`\n=== DEBUG: Processing ${entries.length} messages ===`);
        console.log(`First message: ${sortedEntries[0].timestamp}`);
        console.log(`Last message: ${sortedEntries[sortedEntries.length - 1].timestamp}`);
    }

    const sessions: Array<{ start: Date; end: Date }> = [];
    const SESSION_GAP_MS = 3 * 60 * 1000; // 3 minutes in milliseconds

    let currentSessionStart = new Date(sortedEntries[0].timestamp);
    let currentSessionEnd = new Date(sortedEntries[0].timestamp);

    for (let i = 1; i < sortedEntries.length; i++) {
        const currentTime = new Date(sortedEntries[i].timestamp);
        const timeSinceLastMessage = currentTime.getTime() - currentSessionEnd.getTime();

        if (timeSinceLastMessage <= SESSION_GAP_MS) {
            // Continue current session
            currentSessionEnd = currentTime;
        } else {
            // End current session and start new one
            if (debug) {
                const sessionDuration = (currentSessionEnd.getTime() - currentSessionStart.getTime()) / (1000 * 60);
                console.log(`Session ended: ${currentSessionStart.toLocaleTimeString()} -> ${currentSessionEnd.toLocaleTimeString()} (${sessionDuration.toFixed(1)}min)`);
            }
            sessions.push({ start: currentSessionStart, end: currentSessionEnd });
            currentSessionStart = currentTime;
            currentSessionEnd = currentTime;
        }
    }

    // Add the last session
    if (debug) {
        const sessionDuration = (currentSessionEnd.getTime() - currentSessionStart.getTime()) / (1000 * 60);
        console.log(`Final session: ${currentSessionStart.toLocaleTimeString()} -> ${currentSessionEnd.toLocaleTimeString()} (${sessionDuration.toFixed(1)}min)`);
    }
    sessions.push({ start: currentSessionStart, end: currentSessionEnd });

    // Calculate total time across all sessions
    let totalMinutes = 0;
    for (const session of sessions) {
        const sessionDurationMs = session.end.getTime() - session.start.getTime();
        const sessionMinutes = Math.max(1, Math.floor(sessionDurationMs / (1000 * 60))); // Minimum 1 minute per session
        totalMinutes += sessionMinutes;
    }

    if (debug) {
        console.log(`Total sessions: ${sessions.length}, Total time: ${totalMinutes}min`);
        console.log(`=== END DEBUG ===\n`);
    }

    if (totalMinutes < 60) {
        return `${totalMinutes}m`;
    }

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (minutes === 0) {
        return `${hours}h`;
    }

    return `${hours}h ${minutes}m`;
}

export async function loadDailyConversationData(options?: LoadOptions & { debug?: boolean }): Promise<{
    conversations: DailyConversation[];
    allEntries: Array<UsageData & { sessionId: SessionId; filePath: string }>;
}> {

    const claudePaths = options?.claudePath ? [options.claudePath] : getClaudePaths();
    if (claudePaths.length === 0) {
        console.warn('No Claude data directories found');
        if (options?.debug) {
            console.log('Checked paths:', [DEFAULT_CLAUDE_CONFIG_PATH, DEFAULT_CLAUDE_CODE_PATH]);
        }
        return { conversations: [], allEntries: [] };
    }

    if (options?.debug) {
        console.log('Found Claude paths:', claudePaths);
    }

    // Find all usage files
    const usageFiles = await findUsageFiles(claudePaths, options?.debug);
    if (usageFiles.length === 0) {
        console.warn('No usage files found');
        if (options?.debug) {
            console.log('Searched pattern: **/*.jsonl');
            console.log('In directories:', claudePaths);
        }
        return { conversations: [], allEntries: [] };
    }

    if (options?.debug) {
        console.log(`Found ${usageFiles.length} usage files:`, usageFiles);
    }

    // Load all entries
    const allEntries: Array<UsageData & { sessionId: SessionId; filePath: string }> = [];

    for (const filePath of usageFiles) {
        const entries = await loadUsageFile(filePath, options?.debug);
        const sessionId = extractSessionIdFromPath(filePath);

        if (sessionId) {
            for (const entry of entries) {
                allEntries.push({
                    ...entry,
                    sessionId,
                    filePath
                });
            }
        }
    }


    const filteredEntries = (!options?.since && !options?.until) ? allEntries :
        allEntries.filter(entry => {
            const dateStr = formatDate(entry.timestamp).replace(/-/g, '');
            if (options?.since && dateStr < options.since) return false;
            if (options?.until && dateStr > options.until) return false;
            return true;
        });

    // Group by date
    const dailyGroups = new Map<DailyDate, Array<typeof filteredEntries[0]>>();

    for (const entry of filteredEntries) {
        const date = formatDate(entry.timestamp);
        if (!dailyGroups.has(date)) {
            dailyGroups.set(date, []);
        }
        dailyGroups.get(date)!.push(entry);
    }

    // Create daily conversation summaries
    const dailyConversations: DailyConversation[] = [];

    for (const [date, entries] of dailyGroups) {
        if (entries.length === 0) continue;

        // Sort entries by timestamp
        entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        const firstEntry = entries[0];
        const lastEntry = entries[entries.length - 1];



        // Get unique session IDs (filter out undefined values)
        const sessionIds = Array.from(new Set(entries.map(e => e.sessionId).filter((id): id is SessionId => id !== undefined)));

        dailyConversations.push({
            date,
            firstMessageTime: formatTime(firstEntry.timestamp),
            lastMessageTime: formatTime(lastEntry.timestamp),
            estimatedConversationTime: calculateConversationTime(entries, options?.debug),
            messageCount: entries.length,
            sessionIds,
        });
    }

    // Sort by date descending (most recent first)
    dailyConversations.sort((a, b) => b.date.localeCompare(a.date));

    return {
        conversations: dailyConversations,
        allEntries: filteredEntries
    };
}