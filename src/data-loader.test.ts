/**
 * @fileoverview Tests for data-loader functionality
 * Inspired by ccusage data-loader tests
 */

import { describe, it, expect } from 'vitest';
import { createFixture } from 'fs-fixture';
import { loadDailyConversationData } from './data-loader.ts';
import { createISOTimestamp, createDailyDate } from './types.ts';

describe('loadDailyConversationData', () => {
    it('returns empty array when no files found', async () => {
        await using fixture = await createFixture({
            emptydir: {},
        });

        const result = await loadDailyConversationData({ claudePath: fixture.path });
        expect(result).toEqual([]);
    });

    it('loads and processes conversation data correctly', async () => {
        const mockData = [
            {
                timestamp: '2024-12-08T09:15:00Z',
                message: {
                    usage: { input_tokens: 100, output_tokens: 50 },
                    role: 'user',
                    content: [{ type: 'text', text: 'Hello' }]
                },
                costUSD: 0.001
            },
            {
                timestamp: '2024-12-08T10:30:00Z',
                message: {
                    usage: { input_tokens: 200, output_tokens: 150 },
                    role: 'assistant',
                    content: [{ type: 'text', text: 'Hi there!' }]
                },
                costUSD: 0.002
            }
        ];

        await using fixture = await createFixture({
            'session-001': {
                'conversation.jsonl': mockData.map(d => JSON.stringify(d)).join('\n'),
            },
        });

        const result = await loadDailyConversationData({ claudePath: fixture.path });

        expect(result).toHaveLength(1);
        expect(result[0]?.date).toBe('2024-12-08');
        expect(result[0]?.firstMessageTime).toBe('10:15'); // UTC+1 timezone conversion
        expect(result[0]?.lastMessageTime).toBe('11:30');
        expect(result[0]?.estimatedConversationTime).toBe('1h 15m');
        expect(result[0]?.messageCount).toBe(2);
        expect(result[0]?.sessionIds).toHaveLength(1);
        expect(result[0]?.sessionIds[0]).toBe('session-001');
    });

    it('handles multiple sessions on same day', async () => {
        const session1Data = {
            timestamp: '2024-12-08T09:00:00Z',
            message: { usage: { input_tokens: 100, output_tokens: 50 } },
            costUSD: 0.001
        };

        const session2Data = {
            timestamp: '2024-12-08T14:00:00Z',
            message: { usage: { input_tokens: 200, output_tokens: 100 } },
            costUSD: 0.002
        };

        await using fixture = await createFixture({
            'session-001': {
                'chat.jsonl': JSON.stringify(session1Data),
            },
            'session-002': {
                'usage.jsonl': JSON.stringify(session2Data),
            },
        });

        const result = await loadDailyConversationData({ claudePath: fixture.path });

        expect(result).toHaveLength(1);
        expect(result[0]?.date).toBe('2024-12-08');
        expect(result[0]?.firstMessageTime).toBe('10:00'); // UTC+1 timezone conversion  
        expect(result[0]?.lastMessageTime).toBe('15:00');
        expect(result[0]?.estimatedConversationTime).toBe('5h');
        expect(result[0]?.messageCount).toBe(2);
        expect(result[0]?.sessionIds).toHaveLength(2);
        expect(result[0]?.sessionIds).toContain('session-001');
        expect(result[0]?.sessionIds).toContain('session-002');
    });

    it('handles multiple days correctly', async () => {
        const day1Data = {
            timestamp: '2024-12-07T10:00:00Z',
            message: { usage: { input_tokens: 100, output_tokens: 50 } },
            costUSD: 0.001
        };

        const day2Data = {
            timestamp: '2024-12-08T15:00:00Z',
            message: { usage: { input_tokens: 200, output_tokens: 100 } },
            costUSD: 0.002
        };

        await using fixture = await createFixture({
            'session-001': {
                'conversation.jsonl': JSON.stringify(day1Data),
            },
            'session-002': {
                'conversation.jsonl': JSON.stringify(day2Data),
            },
        });

        const result = await loadDailyConversationData({ claudePath: fixture.path });

        expect(result).toHaveLength(2);
        // Results should be sorted by date descending (most recent first)
        expect(result[0]?.date).toBe('2024-12-08');
        expect(result[1]?.date).toBe('2024-12-07');
    });

    it('filters by date range correctly', async () => {
        const dataEntries = [
            {
                timestamp: '2024-12-01T10:00:00Z',
                message: { usage: { input_tokens: 100, output_tokens: 50 } },
                costUSD: 0.001
            },
            {
                timestamp: '2024-12-15T15:00:00Z',
                message: { usage: { input_tokens: 200, output_tokens: 100 } },
                costUSD: 0.002
            },
            {
                timestamp: '2024-12-25T20:00:00Z',
                message: { usage: { input_tokens: 300, output_tokens: 150 } },
                costUSD: 0.003
            }
        ];

        await using fixture = await createFixture({
            'session-001': {
                'conversation.jsonl': dataEntries.map(d => JSON.stringify(d)).join('\n'),
            },
        });

        const result = await loadDailyConversationData({
            claudePath: fixture.path,
            since: '20241210',
            until: '20241220'
        });

        expect(result).toHaveLength(1);
        expect(result[0]?.date).toBe('2024-12-15');
    });

    it('calculates conversation time correctly for short durations', async () => {
        const mockData = [
            {
                timestamp: '2024-12-08T10:00:00Z',
                message: { usage: { input_tokens: 100, output_tokens: 50 } },
                costUSD: 0.001
            },
            {
                timestamp: '2024-12-08T10:15:00Z',
                message: { usage: { input_tokens: 200, output_tokens: 100 } },
                costUSD: 0.002
            }
        ];

        await using fixture = await createFixture({
            'session-001': {
                'conversation.jsonl': mockData.map(d => JSON.stringify(d)).join('\n'),
            },
        });

        const result = await loadDailyConversationData({ claudePath: fixture.path });

        expect(result).toHaveLength(1);
        expect(result[0]?.estimatedConversationTime).toBe('15m');
    });

    it('handles invalid JSON lines gracefully', async () => {
        const validData = {
            timestamp: '2024-12-08T10:00:00Z',
            message: { usage: { input_tokens: 100, output_tokens: 50 } },
            costUSD: 0.001
        };

        await using fixture = await createFixture({
            'session-001': {
                'conversation.jsonl': [
                    'invalid json line',
                    JSON.stringify(validData),
                    'another invalid line'
                ].join('\n'),
            },
        });

        const result = await loadDailyConversationData({ claudePath: fixture.path });

        expect(result).toHaveLength(1);
        expect(result[0]?.messageCount).toBe(1); // Only valid entry counted
    });

    it('finds files in nested directory structures', async () => {
        const mockData = {
            timestamp: '2024-12-08T10:00:00Z',
            message: { usage: { input_tokens: 100, output_tokens: 50 } },
            costUSD: 0.001
        };

        await using fixture = await createFixture({
            'projects': {
                'my-project': {
                    'session-001': {
                        'usage.jsonl': JSON.stringify(mockData),
                    },
                },
            },
            'deep': {
                'nested': {
                    'path': {
                        'session-002': {
                            'chat.jsonl': JSON.stringify(mockData),
                        },
                    },
                },
            },
        });

        const result = await loadDailyConversationData({ claudePath: fixture.path });

        expect(result).toHaveLength(1);
        expect(result[0]?.sessionIds).toHaveLength(2);
        expect(result[0]?.sessionIds).toContain('session-001');
        expect(result[0]?.sessionIds).toContain('session-002');
    });
});

if (import.meta.vitest) {
    // Test helper functions
    describe('helper functions', () => {
        it('createDailyDate validates format', () => {
            expect(() => createDailyDate('2024-12-08')).not.toThrow();
            expect(() => createDailyDate('invalid')).toThrow();
        });

        it('createISOTimestamp validates format', () => {
            expect(() => createISOTimestamp('2024-12-08T10:00:00Z')).not.toThrow();
            expect(() => createISOTimestamp('invalid')).toThrow();
        });
    });
}
