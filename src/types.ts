import { z } from 'zod';

/**
 * Branded Zod schemas for type safety
 */
export const isoTimestampSchema = z.string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/, 'Invalid ISO timestamp')
    .brand<'ISOTimestamp'>();

export const dailyDateSchema = z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .brand<'DailyDate'>();

export const sessionIdSchema = z.string()
    .min(1, 'Session ID cannot be empty')
    .brand<'SessionId'>();

/**
 * Inferred branded types from schemas
 */
export type ISOTimestamp = z.infer<typeof isoTimestampSchema>;
export type DailyDate = z.infer<typeof dailyDateSchema>;
export type SessionId = z.infer<typeof sessionIdSchema>;

/**
 * Helper functions to create branded values
 */
export const createISOTimestamp = (value: string): ISOTimestamp => isoTimestampSchema.parse(value);
export const createDailyDate = (value: string): DailyDate => dailyDateSchema.parse(value);
export const createSessionId = (value: string): SessionId => sessionIdSchema.parse(value);

/**
 * Schema for Claude usage data entries from JSONL files
 */
export const usageDataSchema = z.object({
    timestamp: isoTimestampSchema,
    message: z.object({
        content: z.array(z.object({
            type: z.string().optional(),
            text: z.string().optional(),
        })).optional(),
        role: z.string().optional(),
        usage: z.object({
            input_tokens: z.number().optional(),
            output_tokens: z.number().optional(),
        }).optional(),
        model: z.string().optional(),
    }).optional(),
    costUSD: z.number().optional(),
    sessionId: sessionIdSchema.optional(),
    isApiErrorMessage: z.boolean().optional(),
});

export type UsageData = z.infer<typeof usageDataSchema>;

/**
 * Daily conversation summary
 */
export interface DailyConversation {
    date: DailyDate;
    firstMessageTime: string; // HH:MM format
    lastMessageTime: string;  // HH:MM format
    estimatedConversationTime: string; // Human readable format like "2h 30m"
    messageCount: number;
    sessionIds: SessionId[];
}

/**
 * Load options for data filtering
 */
export interface LoadOptions {
    claudePath?: string;
    since?: string; // YYYYMMDD format
    until?: string; // YYYYMMDD format
}
