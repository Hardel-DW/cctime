import { defineConfig } from 'tsdown';

export default defineConfig({
    entry: 'src/index.ts',
    format: 'esm',
    platform: 'node',
    target: 'node20',
    outDir: 'dist',
    dts: true,
    clean: true,
    external: [],
    banner: '#!/usr/bin/env node',
});
