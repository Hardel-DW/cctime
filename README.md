# cctime

Claude Code conversation time tracker - Simple CLI to display daily conversation
statistics

## Features

- Display daily conversation statistics in a clean table format
- Shows first message time, last message time, and estimated conversation
  duration
- Intelligent session detection with 3-minute gap tolerance
- Excludes idle time and pauses from conversation duration
- Supports date filtering and day limits
- Debug mode for troubleshooting

## Installation

```bash
# Clone and install dependencies
git clone <repository-url>
cd cctime
pnpm install

# Run directly
pnpm start

# Build for distribution
pnpm build
```

## Usage

```bash
# Show all conversations
pnpm start

# Show last 7 days
pnpm start -- --days 7

# Show specific date range  
pnpm start -- --since 20241201 --until 20241231

# Debug mode
pnpm start -- --debug

# Custom Claude data path
pnpm start -- --claude-path ~/.claude
```

## Options

- `--days N` - Show only the last N days (1-30)
- `--since YYYYMMDD` - Filter conversations since date
- `--until YYYYMMDD` - Filter conversations until date
- `--claude-path PATH` - Custom path to Claude data directory
- `--debug` - Show debug information
- `--help` - Show help message

## How it works

cctime automatically finds your Claude Code conversation data and analyzes it to
provide accurate time tracking:

- **Session Detection**: Groups messages with gaps >3 minutes into separate
  sessions
- **Time Calculation**: Sums all active session times, excluding pauses and idle
  periods
- **Local Timezone**: Properly handles timezone conversion for accurate daily
  grouping
- **Multiple Sessions**: Combines all sessions within the same day

## Requirements

- Node.js >= 20.19.3
- Claude Code with conversation data

## Development

```bash
# Run in development mode
pnpm dev

# Run tests
pnpm test

# Type checking
pnpm typecheck
```

## License

MIT
