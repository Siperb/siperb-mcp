# Siperb MCP Server

MCP server that gives AI agents access to the [Siperb](https://www.siperb.com) SIP/VoIP platform API.

## Quick Start

Add to your Claude Code config (`.claude/settings.json` or project settings):

```json
{
  "mcpServers": {
    "siperb-api": {
      "command": "npx",
      "args": ["github:siperb/siperb-mcp"]
    }
  }
}
```

Or run directly:

```bash
npx github:siperb/siperb-mcp
```

## Tools

| Tool | Description |
|------|-------------|
| `list_endpoints` | Browse and search API endpoints by tag, path, or keyword |
| `get_endpoint_details` | Full documentation for a specific endpoint — parameters, request body, auth |
| `call_api` | Make a live API call (requires a session token or PAT) |

## Authentication

Most API calls require a **session token**:

1. Create a Personal Access Token (PAT) in the Siperb Admin Panel
2. Use `call_api` with `POST /Login` and your PAT to get a session token
3. Use the session token for all subsequent calls

## API Coverage

129 endpoints across 19 categories: Authentication, Users, Domain Users, Devices, Connections, Address Book, Voicemail, Personal Access Tokens, oAuth/Cognito, Provisioning, Support Tickets, Messaging (Telegram, WhatsApp, Audio Call), Message Stream, Call Recordings, Call QoS, Avatars, vCards, and device/connection logs.

Full API documentation: [postman.com/siperb](https://www.postman.com/siperb/siperb-api/)

## License

MIT
