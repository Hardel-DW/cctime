/**
 * Debug script to test file discovery
 */

import { createFixture } from 'fs-fixture';
import { loadDailyConversationData } from './src/data-loader.ts';
import { glob } from 'tinyglobby';
import path from 'node:path';
import { readdir } from 'node:fs/promises';

async function debugTest() {
    console.log('Creating test fixture...');

    const mockData = {
        timestamp: '2024-12-08T09:15:00Z',
        message: {
            usage: { input_tokens: 100, output_tokens: 50 },
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }]
        },
        costUSD: 0.001
    };

    const fixture = await createFixture({
        'session-001': {
            'conversation.jsonl': JSON.stringify(mockData),
        },
    });

    console.log('Test fixture created at:', fixture.path);

    // Debug: Check directory contents
    console.log('\nDirectory contents:');
    try {
        const items = await readdir(fixture.path, { recursive: true });
        console.log('Files found:', items);
    } catch (error) {
        console.error('Error reading directory:', error);
    }

    // Debug: Test glob directly
    console.log('\nTesting glob pattern directly:');
    const pattern = path.join(fixture.path, '**/*.jsonl');
    console.log('Pattern:', pattern);

    try {
        const files = await glob(pattern);
        console.log('Glob result:', files);
    } catch (error) {
        console.error('Glob error:', error);
    }

    console.log('\nRunning loadDailyConversationData with debug...');

    try {
        const result = await loadDailyConversationData({
            claudePath: fixture.path,
            debug: true
        });

        console.log('Result:', result);
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await fixture[Symbol.asyncDispose]();
    }
}

debugTest().catch(console.error);
