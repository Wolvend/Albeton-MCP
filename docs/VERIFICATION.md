# Verification

Required commands:

```powershell
npm install
npm run build
npm test
npm run lint
npm run inspect
```

Runtime checks:

- Bridge ping and snapshot require Ableton Live open and the Max for Live bridge loaded.
- Screenshot verification requires an Ableton window.
- Downloads require `ABLETON_MCP_ENABLE_DOWNLOADS=1`.
- Write control requires `ABLETON_MCP_ENABLE_WRITE=1`.
- UI control requires `ABLETON_MCP_ENABLE_UI_CONTROL=1`.
