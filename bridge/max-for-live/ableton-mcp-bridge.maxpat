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
          "numinlets": 1,
          "numoutlets": 2,
          "outlettype": ["", ""],
          "saved_object_attributes": {
            "autostart": 1,
            "defer": 0,
            "node_bin_path": "",
            "npm_bin_path": "",
            "watch": 0
          },
          "text": "node.script ableton-mcp-http.js @autostart 1",
          "textfile": {
            "filename": "ableton-mcp-http.js",
            "flags": 0,
            "embed": 0,
            "autowatch": 1
          },
          "patching_rect": [35.0, 125.0, 300.0, 22.0]
        }
      },
      {
        "box": {
          "id": "message-start",
          "maxclass": "message",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [""],
          "text": "script start",
          "patching_rect": [360.0, 125.0, 90.0, 22.0]
        }
      },
      {
        "box": {
          "id": "js-liveapi",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 1,
          "outlettype": [""],
          "text": "js ableton-mcp-liveapi.js",
          "patching_rect": [35.0, 205.0, 220.0, 22.0]
        }
      },
      {
        "box": {
          "id": "print-node-status",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 0,
          "text": "print ableton-mcp-node-status",
          "patching_rect": [390.0, 160.0, 220.0, 22.0]
        }
      },
      {
        "box": {
          "id": "js-node-status",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 0,
          "text": "js ableton-mcp-status.js",
          "patching_rect": [390.0, 190.0, 170.0, 22.0]
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
          "source": ["node-http", 1],
          "destination": ["print-node-status", 0]
        }
      },
      {
        "patchline": {
          "source": ["node-http", 1],
          "destination": ["js-node-status", 0]
        }
      },
      {
        "patchline": {
          "source": ["message-start", 0],
          "destination": ["node-http", 0]
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
