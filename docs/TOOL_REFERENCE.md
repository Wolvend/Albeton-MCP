# Tool Reference

Run:

```powershell
npm run build
node dist/scripts/self-test.js
```

Then use MCP Inspector:

```powershell
npm run inspect
```

Primary groups:

- Environment and setup
- Library and cache
- Live Set analysis
- Fast live session view
- Write-gated Live control
- Screenshot and UI tools
- Legal sample discovery/import
- Composition helpers
- Developer/evaluation tools
- Runtime/security tools

Additional MCP context:

- Resources: `ableton://environment`, `ableton://runtime`, `ableton://scan-status`
- Prompts: `ableton-safe-production-session`, `ableton-security-review`

All file tools enforce allowed roots and reject broad or sensitive paths.
