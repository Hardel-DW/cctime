import { describe, expect, test, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { getClaudePaths, loadDailyConversationData } from '../src/data-loader.ts';

const testDir = join(process.cwd(), 'test-claude-data');

describe('data-loader', () => {
    beforeEach(() => {
        if (existsSync(testDir)) {
            rmSync(testDir, { recursive: true });
        }
        mkdirSync(testDir, { recursive: true });
    });

    afterEach(() => {
        if (existsSync(testDir)) {
            rmSync(testDir, { recursive: true });
        }
    });

    test('getClaudePaths returns array', () => {
        const paths = getClaudePaths();
        expect(Array.isArray(paths)).toBe(true);
    });

    test('loadDailyConversationData with nonexistent path', async () => {
        const result = await loadDailyConversationData({ claudePath: '/nonexistent' });
        expect(result).toHaveProperty('conversations');
        expect(result).toHaveProperty('allEntries');
        expect(Array.isArray(result.conversations)).toBe(true);
        expect(result.conversations).toHaveLength(0);
    });

    test('loadDailyConversationData with valid data', async () => {
        const sessionDir = join(testDir, 'session-001');
        mkdirSync(sessionDir, { recursive: true });

        const testData = [
            { timestamp: '2025-08-09T10:00:00.000Z', message: { role: 'user', content: [{ type: 'text', text: 'test' }] } },
            { timestamp: '2025-08-09T10:05:00.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'response' }] } },
            { timestamp: '2025-08-09T10:10:00.000Z', message: { role: 'user', content: [{ type: 'text', text: 'test2' }] } }
        ];

        const jsonlContent = testData.map(data => JSON.stringify(data)).join('\n');
        writeFileSync(join(sessionDir, 'conversation.jsonl'), jsonlContent);

        const result = await loadDailyConversationData({ claudePath: testDir });
        expect(result).toHaveProperty('conversations');
        expect(result).toHaveProperty('allEntries');
        expect(Array.isArray(result.conversations)).toBe(true);
        expect(result.conversations.length).toBeGreaterThan(0);

        if (result.conversations.length > 0) {
            expect(result.conversations[0]).toHaveProperty('date');
            expect(result.conversations[0]).toHaveProperty('firstMessageTime');
            expect(result.conversations[0]).toHaveProperty('lastMessageTime');
            expect(result.conversations[0]).toHaveProperty('estimatedConversationTime');
            expect(result.conversations[0]).toHaveProperty('messageCount');
            expect(result.conversations[0]).toHaveProperty('sessionIds');
        }
    });

    test('loadDailyConversationData with date filtering', async () => {
        const sessionDir = join(testDir, 'session-002');
        mkdirSync(sessionDir, { recursive: true });

        const testData = [
            { timestamp: '2025-08-09T10:00:00.000Z', message: { role: 'user', content: [{ type: 'text', text: 'test' }] } }
        ];

        const jsonlContent = testData.map(data => JSON.stringify(data)).join('\n');
        writeFileSync(join(sessionDir, 'chat.jsonl'), jsonlContent);

        const result = await loadDailyConversationData({
            claudePath: testDir,
            since: '20250809',
            until: '20250809'
        });

        expect(result).toHaveProperty('conversations');
        expect(Array.isArray(result.conversations)).toBe(true);
    });

    test('loadDailyConversationData handles invalid JSON', async () => {
        const sessionDir = join(testDir, 'session-003');
        mkdirSync(sessionDir, { recursive: true });

        const invalidJsonl = 'invalid json line\n{"timestamp": "2025-08-09T10:00:00.000Z", "message": {"role": "user", "content": [{"type": "text", "text": "valid"}]}}';
        writeFileSync(join(sessionDir, 'usage.jsonl'), invalidJsonl);

        const result = await loadDailyConversationData({ claudePath: testDir });
        expect(result).toHaveProperty('conversations');
        expect(Array.isArray(result.conversations)).toBe(true);
    });

    test('loadDailyConversationData calculates session gaps', async () => {
        const sessionDir = join(testDir, 'session-004');
        mkdirSync(sessionDir, { recursive: true });

        const testData = [
            { timestamp: '2025-08-09T10:00:00.000Z', message: { role: 'user', content: [{ type: 'text', text: 'session1' }] } },
            { timestamp: '2025-08-09T10:01:00.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'response1' }] } },
            { timestamp: '2025-08-09T10:10:00.000Z', message: { role: 'user', content: [{ type: 'text', text: 'session2' }] } },
            { timestamp: '2025-08-09T10:11:00.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'response2' }] } }
        ];

        const jsonlContent = testData.map(data => JSON.stringify(data)).join('\n');
        writeFileSync(join(sessionDir, 'conversation.jsonl'), jsonlContent);

        const result = await loadDailyConversationData({ claudePath: testDir });
        expect(result).toHaveProperty('conversations');
        expect(Array.isArray(result.conversations)).toBe(true);

        if (result.conversations.length > 0) {
            expect(result.conversations[0].messageCount).toBe(4);
            expect(result.conversations[0].estimatedConversationTime).toBeTruthy();
        }
    });
});