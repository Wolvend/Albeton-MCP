autowatch = 1;
outlets = 1;

var previousSnapshotJson = "";

function respond(id, ok, payload) {
  var message = {
    id: String(id),
    ok: Boolean(ok)
  };
  if (ok) {
    message.data = payload;
  } else {
    message.error = payload && payload.error ? String(payload.error) : "Bridge action failed.";
    message.code = payload && payload.code ? String(payload.code) : "LIVEAPI_ERROR";
  }
  outlet(0, "response", String(id), JSON.stringify(message));
}

function liveObject(path) {
  return new LiveAPI(String(path));
}

function safeGet(api, propertyName, fallback) {
  try {
    var value = api.get(propertyName);
    if (value instanceof Array && value.length === 1) return value[0];
    return value;
  } catch (error) {
    return fallback;
  }
}

function safeCall(api, methodName, args) {
  try {
    if (args && args.length) {
      return api.call.apply(api, [methodName].concat(args));
    }
    return api.call(methodName);
  } catch (error) {
    return { error: String(error) };
  }
}

function childCount(api, childName) {
  try {
    return api.getcount(childName);
  } catch (error) {
    return 0;
  }
}

function objectId(api) {
  try {
    return api.id;
  } catch (error) {
    return 0;
  }
}

function summarizeDevice(deviceApi, index) {
  var parameterCount = childCount(deviceApi, "parameters");
  return {
    id: objectId(deviceApi),
    index: index,
    name: safeGet(deviceApi, "name", ""),
    class_name: safeGet(deviceApi, "class_name", ""),
    is_active: safeGet(deviceApi, "is_active", null),
    parameter_count: parameterCount
  };
}

function summarizeParameter(parameterApi, index) {
  return {
    id: objectId(parameterApi),
    index: index,
    name: safeGet(parameterApi, "name", ""),
    value: safeGet(parameterApi, "value", null),
    min: safeGet(parameterApi, "min", null),
    max: safeGet(parameterApi, "max", null),
    is_enabled: safeGet(parameterApi, "is_enabled", null)
  };
}

function summarizeClipSlot(trackIndex, slotIndex) {
  var slotApi = liveObject("live_set tracks " + trackIndex + " clip_slots " + slotIndex);
  var hasClip = Number(safeGet(slotApi, "has_clip", 0)) === 1;
  var clip = null;
  if (hasClip) {
    var clipApi = liveObject("live_set tracks " + trackIndex + " clip_slots " + slotIndex + " clip");
    clip = {
      id: objectId(clipApi),
      name: safeGet(clipApi, "name", ""),
      color: safeGet(clipApi, "color", null),
      is_playing: safeGet(clipApi, "is_playing", null),
      is_recording: safeGet(clipApi, "is_recording", null),
      length: safeGet(clipApi, "length", null),
      loop_start: safeGet(clipApi, "loop_start", null),
      loop_end: safeGet(clipApi, "loop_end", null)
    };
  }
  return {
    track_index: trackIndex,
    slot_index: slotIndex,
    has_clip: hasClip,
    playing_status: safeGet(slotApi, "playing_status", null),
    clip: clip
  };
}

function summarizeTrack(trackIndex, includeDevices, includeClips) {
  var trackApi = liveObject("live_set tracks " + trackIndex);
  var deviceCount = childCount(trackApi, "devices");
  var clipSlotCount = childCount(trackApi, "clip_slots");
  var devices = [];
  var clips = [];
  var i;

  if (includeDevices) {
    for (i = 0; i < deviceCount; i += 1) {
      devices.push(summarizeDevice(liveObject("live_set tracks " + trackIndex + " devices " + i), i));
    }
  }

  if (includeClips) {
    for (i = 0; i < clipSlotCount; i += 1) {
      clips.push(summarizeClipSlot(trackIndex, i));
    }
  }

  return {
    id: objectId(trackApi),
    index: trackIndex,
    name: safeGet(trackApi, "name", ""),
    color: safeGet(trackApi, "color", null),
    mute: safeGet(trackApi, "mute", null),
    solo: safeGet(trackApi, "solo", null),
    arm: safeGet(trackApi, "arm", null),
    can_be_armed: safeGet(trackApi, "can_be_armed", null),
    is_foldable: safeGet(trackApi, "is_foldable", null),
    playing_slot_index: safeGet(trackApi, "playing_slot_index", null),
    fired_slot_index: safeGet(trackApi, "fired_slot_index", null),
    device_count: deviceCount,
    clip_slot_count: clipSlotCount,
    devices: devices,
    clips: clips
  };
}

function summarizeScene(sceneIndex) {
  var sceneApi = liveObject("live_set scenes " + sceneIndex);
  return {
    id: objectId(sceneApi),
    index: sceneIndex,
    name: safeGet(sceneApi, "name", ""),
    color: safeGet(sceneApi, "color", null),
    tempo: safeGet(sceneApi, "tempo", null)
  };
}

function liveState() {
  var song = liveObject("live_set");
  var view = liveObject("live_set view");
  return {
    heartbeat: new Date().toISOString(),
    tempo: safeGet(song, "tempo", null),
    is_playing: safeGet(song, "is_playing", null),
    current_song_time: safeGet(song, "current_song_time", null),
    signature_numerator: safeGet(song, "signature_numerator", null),
    signature_denominator: safeGet(song, "signature_denominator", null),
    track_count: childCount(song, "tracks"),
    return_track_count: childCount(song, "return_tracks"),
    scene_count: childCount(song, "scenes"),
    selected_track_id: objectId(liveObject("live_set view selected_track")),
    selected_scene_id: objectId(liveObject("live_set view selected_scene")),
    detail_clip_id: objectId(liveObject("live_set view detail_clip")),
    selected_parameter_id: objectId(liveObject("live_set view selected_parameter")),
    view_id: objectId(view)
  };
}

function listTracks(includeDevices, includeClips) {
  var song = liveObject("live_set");
  var count = childCount(song, "tracks");
  var tracks = [];
  for (var i = 0; i < count; i += 1) {
    tracks.push(summarizeTrack(i, includeDevices, includeClips));
  }
  return tracks;
}

function listScenes() {
  var song = liveObject("live_set");
  var count = childCount(song, "scenes");
  var scenes = [];
  for (var i = 0; i < count; i += 1) {
    scenes.push(summarizeScene(i));
  }
  return scenes;
}

function listClips() {
  var tracks = listTracks(false, true);
  var clips = [];
  for (var t = 0; t < tracks.length; t += 1) {
    for (var c = 0; c < tracks[t].clips.length; c += 1) {
      if (tracks[t].clips[c].has_clip) clips.push(tracks[t].clips[c]);
    }
  }
  return clips;
}

function parseIndex(payload, keyName) {
  if (!payload || payload[keyName] === undefined || payload[keyName] === "selected") return null;
  var parsed = Number(payload[keyName]);
  if (!isFinite(parsed) || parsed < 0) return null;
  return Math.floor(parsed);
}

function selectedTrackIndex() {
  var selected = liveObject("live_set view selected_track");
  var selectedId = objectId(selected);
  var tracks = listTracks(false, false);
  for (var i = 0; i < tracks.length; i += 1) {
    if (Number(tracks[i].id) === Number(selectedId)) return i;
  }
  return 0;
}

function listDevices(payload) {
  var trackIndex = parseIndex(payload, "track_id");
  if (trackIndex === null) trackIndex = selectedTrackIndex();
  var trackApi = liveObject("live_set tracks " + trackIndex);
  var count = childCount(trackApi, "devices");
  var devices = [];
  for (var i = 0; i < count; i += 1) {
    devices.push(summarizeDevice(liveObject("live_set tracks " + trackIndex + " devices " + i), i));
  }
  return { track_index: trackIndex, devices: devices };
}

function listDeviceParameters(payload) {
  var trackIndex = parseIndex(payload, "track_id");
  if (trackIndex === null) trackIndex = selectedTrackIndex();
  var deviceIndex = parseIndex(payload, "device_id");
  if (deviceIndex === null) deviceIndex = 0;
  var deviceApi = liveObject("live_set tracks " + trackIndex + " devices " + deviceIndex);
  var count = childCount(deviceApi, "parameters");
  var parameters = [];
  for (var i = 0; i < count; i += 1) {
    parameters.push(summarizeParameter(liveObject("live_set tracks " + trackIndex + " devices " + deviceIndex + " parameters " + i), i));
  }
  return { track_index: trackIndex, device_index: deviceIndex, parameters: parameters };
}

function fullSnapshot() {
  return {
    state: liveState(),
    scenes: listScenes(),
    tracks: listTracks(true, true)
  };
}

function snapshotDiff() {
  var snapshot = fullSnapshot();
  var currentJson = JSON.stringify(snapshot);
  var changed = currentJson !== previousSnapshotJson;
  previousSnapshotJson = currentJson;
  return {
    changed: changed,
    snapshot: changed ? snapshot : null
  };
}

function setTempo(payload) {
  var tempo = Number(payload && payload.tempo);
  if (!isFinite(tempo) || tempo < 20 || tempo > 999) {
    throw new Error("Tempo must be between 20 and 999 BPM.");
  }
  liveObject("live_set").set("tempo", tempo);
  return { tempo: tempo };
}

function transportControl(payload) {
  var command = String(payload && payload.command ? payload.command : "");
  var song = liveObject("live_set");
  if (command === "play" || command === "start") return safeCall(song, "start_playing");
  if (command === "stop") return safeCall(song, "stop_playing");
  if (command === "continue") return safeCall(song, "continue_playing");
  throw new Error("Unsupported transport command.");
}

function setTrackBoolean(payload, propertyName) {
  var trackIndex = parseIndex(payload, "track_id");
  if (trackIndex === null) trackIndex = selectedTrackIndex();
  var value = payload && (payload.value !== undefined ? payload.value : payload.enabled);
  liveObject("live_set tracks " + trackIndex).set(propertyName, value ? 1 : 0);
  return { track_index: trackIndex, property: propertyName, value: value ? 1 : 0 };
}

function renameTrack(payload) {
  var trackIndex = parseIndex(payload, "track_id");
  if (trackIndex === null) trackIndex = selectedTrackIndex();
  var name = String(payload && payload.name ? payload.name : "").slice(0, 128);
  if (!name) throw new Error("Track name is required.");
  liveObject("live_set tracks " + trackIndex).set("name", name);
  return { track_index: trackIndex, name: name };
}

function createTrack(kind) {
  var song = liveObject("live_set");
  if (kind === "audio") return safeCall(song, "create_audio_track", [-1]);
  if (kind === "midi") return safeCall(song, "create_midi_track", [-1]);
  if (kind === "return") return safeCall(song, "create_return_track");
  throw new Error("Unsupported track kind.");
}

function dispatch(action, payload) {
  if (action === "ping") return { heartbeat: new Date().toISOString(), bridge: "ableton-mcp-liveapi", version: 1 };
  if (action === "live_state") return liveState();
  if (action === "transport") return { is_playing: safeGet(liveObject("live_set"), "is_playing", null), current_song_time: safeGet(liveObject("live_set"), "current_song_time", null) };
  if (action === "tempo") return { tempo: safeGet(liveObject("live_set"), "tempo", null) };
  if (action === "full_snapshot") return fullSnapshot();
  if (action === "snapshot_diff") return snapshotDiff();
  if (action === "list_tracks") return { tracks: listTracks(false, false) };
  if (action === "list_scenes") return { scenes: listScenes() };
  if (action === "list_clips") return { clips: listClips() };
  if (action === "list_devices") return listDevices(payload);
  if (action === "list_device_parameters") return listDeviceParameters(payload);
  if (action === "selected_track") return { track: summarizeTrack(selectedTrackIndex(), false, false) };
  if (action === "selected_device") return listDeviceParameters({ track_id: selectedTrackIndex(), device_id: 0 });
  if (action === "set_tempo" || action === "ableton_set_tempo") return setTempo(payload);
  if (action === "transport_control" || action === "ableton_transport_control") return transportControl(payload);
  if (action === "ableton_create_audio_track") return createTrack("audio");
  if (action === "ableton_create_midi_track") return createTrack("midi");
  if (action === "ableton_create_return_track") return createTrack("return");
  if (action === "ableton_arm_track") return setTrackBoolean(payload, "arm");
  if (action === "ableton_mute_track") return setTrackBoolean(payload, "mute");
  if (action === "ableton_solo_track") return setTrackBoolean(payload, "solo");
  if (action === "ableton_rename_track") return renameTrack(payload);
  return { unsupported: true, action: action, message: "Action is registered on the MCP side but not implemented in the v1 LiveAPI bridge yet." };
}

function request(id, action, payloadJson) {
  try {
    var payload = payloadJson ? JSON.parse(String(payloadJson)) : {};
    respond(id, true, dispatch(String(action), payload));
  } catch (error) {
    respond(id, false, { code: "LIVEAPI_ACTION_FAILED", error: String(error) });
  }
}

function bang() {
  post("Ableton MCP LiveAPI bridge loaded.\n");
}
