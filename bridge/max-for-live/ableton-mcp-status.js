autowatch = 1;

function anything() {
  var args = arrayfromargs(messagename, arguments);
  post("ableton-mcp-node-status-detail " + args.join(" ") + "\n");
  var dictIndex = args.indexOf("dictionary");
  if (dictIndex >= 0 && args[dictIndex + 1]) {
    try {
      var dict = new Dict(args[dictIndex + 1]);
      post("ableton-mcp-node-status-dict " + dict.stringify() + "\n");
    } catch (error) {
      post("ableton-mcp-node-status-dict-error " + error + "\n");
    }
  }
}
