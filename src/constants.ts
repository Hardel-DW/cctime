import path from 'node:path';
import { homedir } from 'node:os';

/**
 * Environment variable for custom Claude config directory
 */
export const CLAUDE_CONFIG_DIR_ENV = 'CLAUDE_CONFIG_DIR';

/**
 * Directory name containing Claude projects
 */
export const CLAUDE_PROJECTS_DIR_NAME = 'projects';

/**
 * Default paths where Claude data might be located
 */
export const DEFAULT_CLAUDE_CONFIG_PATH = path.join(homedir(), '.config', 'claude');
export const DEFAULT_CLAUDE_CODE_PATH = path.join(homedir(), '.claude');

/**
 * Glob patterns to find usage/conversation JSONL files
 */
export const USAGE_DATA_GLOB_PATTERNS = [
    '**/*/usage.jsonl',
    '**/*/chat.jsonl',
    '**/*/*.jsonl'
];

/**
 * User home directory
 */
export const USER_HOME_DIR = homedir();
