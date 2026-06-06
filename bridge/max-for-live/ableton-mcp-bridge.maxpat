{
  "patcher": {
    "fileversion": 1,
    "appversion": {
      "major": 8,
      "minor": 6,
      "revision": 0,
      "architecture": "x64"
    },
    "rect": [0.0, 0.0, 760.0, 460.0],
    "boxes": [
      {
        "box": {
          "id": "comment-title",
          "maxclass": "comment",
          "text": "Ableton MCP Bridge: Node-for-Max HTTP loopback -> Max JS LiveAPI handler -> HTTP response",
          "patching_rect": [35.0, 30.0, 640.0, 22.0]
        }
      },
      {
        "box": {
          "id": "comment-safety",
          "maxclass": "comment",
          "text": "Listens on 127.0.0.1:17364 only. Keep MCP write actions gated with ABLETON_MCP_ENABLE_WRITE=1.",
          "patching_rect": [35.0, 58.0, 640.0, 22.0]
        }
      },
      {
        "box": {
          "id": "node-http",
          "maxclass": "newobj",
          "text": "node.script ableton-mcp-http.js @autostart 1",
          "patching_rect": [35.0, 125.0, 300.0, 22.0]
        }
      },
      {
        "box": {
          "id": "js-liveapi",
          "maxclass": "newobj",
          "text": "js ableton-mcp-liveapi.js",
          "patching_rect": [35.0, 205.0, 220.0, 22.0]
        }
      },
      {
        "box": {
          "id": "comment-flow",
          "maxclass": "comment",
          "text": "node.script outlet sends: request <id> <action> <payloadJson>. LiveAPI JS returns: response <id> <json>.",
          "patching_rect": [35.0, 285.0, 640.0, 22.0]
        }
      }
    ],
    "lines": [
      {
        "patchline": {
          "source": ["node-http", 0],
          "destination": ["js-liveapi", 0]
        }
      },
      {
        "patchline": {
          "source": ["js-liveapi", 0],
          "destination": ["node-http", 0]
        }
      }
    ]
  }
}
