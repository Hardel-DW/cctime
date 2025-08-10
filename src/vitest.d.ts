/// <reference types="vitest" />

declare global {
    namespace Vitest {
        interface ImportMeta {
            vitest?: boolean;
        }
    }
}

// Extend ImportMeta interface
declare module 'vite/types/importMeta' {
    interface ImportMeta {
        vitest?: boolean;
    }
}

export { };
