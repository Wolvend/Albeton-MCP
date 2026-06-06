{
  "patcher": {
    "fileversion": 1,
    "appversion": {
      "major": 8,
      "minor": 6,
      "revision": 0,
      "architecture": "x64"
    },
    "rect": [0.0, 0.0, 640.0, 420.0],
    "boxes": [
      {
        "box": {
          "id": "comment-contract",
          "maxclass": "comment",
          "text": "Ableton MCP bridge contract: loopback JSON on 127.0.0.1:17364 with request id/action/payload. Implement LiveAPI snapshot and control handlers here.",
          "patching_rect": [40.0, 40.0, 560.0, 40.0]
        }
      },
      {
        "box": {
          "id": "js-bridge",
          "maxclass": "newobj",
          "text": "js ableton-mcp-bridge.js",
          "patching_rect": [40.0, 110.0, 180.0, 22.0]
        }
      }
    ],
    "lines": []
  }
}
