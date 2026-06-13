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

function callSucceeded(result) {
  return !(result && typeof result === "object" && result.error);
}

function unsupported(action, reason, details) {
  return {
    unsupported: true,
    action: action,
    reason: reason,
    details: details || {},
    nextSteps: [
      "Use read tools to inspect the target first.",
      "If this action is required, update the Max for Live bridge after confirming the exact LiveAPI method for this Ableton version."
    ]
  };
}

function fileNameOnly(filePath) {
  var parts = String(filePath || "").split(/[\\/]/);
  return parts.length ? parts[parts.length - 1] : "";
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
      is_audio_clip: safeGet(clipApi, "is_audio_clip", null),
      is_midi_clip: safeGet(clipApi, "is_midi_clip", null),
      length: safeGet(clipApi, "length", null),
      gain: safeGet(clipApi, "gain", null),
      gain_display_string: safeGet(clipApi, "gain_display_string", null),
      pitch_coarse: safeGet(clipApi, "pitch_coarse", null),
      pitch_fine: safeGet(clipApi, "pitch_fine", null),
      warping: safeGet(clipApi, "warping", null),
      warp_mode: safeGet(clipApi, "warp_mode", null),
      start_marker: safeGet(clipApi, "start_marker", null),
      end_marker: safeGet(clipApi, "end_marker", null),
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
    mixer: mixerSummary("live_set tracks " + trackIndex),
    devices: devices,
    clips: clips
  };
}

function summarizeReturnTrack(returnIndex, includeDevices) {
  var trackApi = liveObject("live_set return_tracks " + returnIndex);
  var deviceCount = childCount(trackApi, "devices");
  var devices = [];
  if (includeDevices) {
    for (var i = 0; i < deviceCount; i += 1) {
      devices.push(summarizeDevice(liveObject("live_set return_tracks " + returnIndex + " devices " + i), i));
    }
  }
  return {
    id: objectId(trackApi),
    index: returnIndex,
    name: safeGet(trackApi, "name", ""),
    color: safeGet(trackApi, "color", null),
    mute: safeGet(trackApi, "mute", null),
    solo: safeGet(trackApi, "solo", null),
    device_count: deviceCount,
    devices: devices,
    mixer: mixerSummary("live_set return_tracks " + returnIndex)
  };
}

function summarizeMasterTrack(includeDevices) {
  var trackApi = liveObject("live_set master_track");
  var deviceCount = childCount(trackApi, "devices");
  var devices = [];
  if (includeDevices) {
    for (var i = 0; i < deviceCount; i += 1) {
      devices.push(summarizeDevice(liveObject("live_set master_track devices " + i), i));
    }
  }
  return {
    id: objectId(trackApi),
    name: safeGet(trackApi, "name", "Master"),
    color: safeGet(trackApi, "color", null),
    device_count: deviceCount,
    devices: devices,
    mixer: mixerSummary("live_set master_track")
  };
}

function mixerSummary(trackPath) {
  var mixerPath = trackPath + " mixer_device";
  var volume = liveObject(mixerPath + " volume");
  var panning = liveObject(mixerPath + " panning");
  return {
    volume: summarizeParameter(volume, 0),
    panning: summarizeParameter(panning, 1),
    sends: summarizeSends(trackPath)
  };
}

function summarizeSends(trackPath) {
  var mixerPath = trackPath + " mixer_device";
  var mixer = liveObject(mixerPath);
  var sendCount = childCount(mixer, "sends");
  var returnTrackCount = childCount(liveObject("live_set"), "return_tracks");
  var sends = [];
  for (var i = 0; i < sendCount; i += 1) {
    var send = summarizeParameter(liveObject(mixerPath + " sends " + i), i);
    send.send_index = i;
    send.return_track_index = i < returnTrackCount ? i : null;
    send.return_track_name = i < returnTrackCount ? safeGet(liveObject("live_set return_tracks " + i), "name", "") : "";
    sends.push(send);
  }
  return sends;
}

function routingOverview(payload) {
  var includeDevices = Boolean(payload && payload.include_devices);
  var tracks = listTracks(includeDevices, false);
  var returnTracks = listReturnTracks(includeDevices);
  var masterTrack = summarizeMasterTrack(includeDevices);
  var sendMatrix = [];

  for (var i = 0; i < tracks.length; i += 1) {
    var track = tracks[i];
    var sends = track && track.mixer && track.mixer.sends instanceof Array ? track.mixer.sends : [];
    for (var j = 0; j < sends.length; j += 1) {
      var send = sends[j];
      sendMatrix.push({
        track_index: track.index,
        track_name: track.name,
        send_index: send.send_index,
        return_track_index: send.return_track_index,
        return_track_name: send.return_track_name,
        value: send.value,
        min: send.min,
        max: send.max,
        is_enabled: send.is_enabled
      });
    }
  }

  return {
    track_count: tracks.length,
    return_track_count: returnTracks.length,
    tracks: tracks,
    return_tracks: returnTracks,
    master_track: masterTrack,
    send_matrix: sendMatrix,
    next_steps: [
      "Use send_matrix rows to choose send_index values for ableton_set_track_send.",
      "Inspect return_tracks devices before routing reverb, delay, texture, or pressure layers."
    ]
  };
}

function summarizeScene(sceneIndex) {
  var sceneApi = liveObject("live_set scenes " + sceneIndex);
  return {
    id: objectId(sceneApi),
    index: sceneIndex,
    name: safeGet(sceneApi, "name", ""),
    color: safeGet(sceneApi, "color", null),
    tempo: safeGet(sceneApi, "tempo", null),
    tempo_enabled: safeGet(sceneApi, "tempo_enabled", null),
    time_signature_numerator: safeGet(sceneApi, "time_signature_numerator", null),
    time_signature_denominator: safeGet(sceneApi, "time_signature_denominator", null),
    time_signature_enabled: safeGet(sceneApi, "time_signature_enabled", null),
    is_empty: safeGet(sceneApi, "is_empty", null),
    is_triggered: safeGet(sceneApi, "is_triggered", null)
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

function listReturnTracks(includeDevices) {
  var song = liveObject("live_set");
  var count = childCount(song, "return_tracks");
  var tracks = [];
  for (var i = 0; i < count; i += 1) {
    tracks.push(summarizeReturnTrack(i, includeDevices));
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

function parseRequiredIndex(payload, keyName) {
  var parsed = parseIndex(payload, keyName);
  if (parsed === null) throw new Error(keyName + " must be a non-negative integer.");
  return parsed;
}

function parseTrackIndex(payload) {
  var parsed = parseIndex(payload, "track_index");
  if (parsed === null) parsed = parseIndex(payload, "track_id");
  if (parsed === null) parsed = selectedTrackIndex();
  return parsed;
}

function parseClipSlotIndex(payload) {
  var parsed = parseIndex(payload, "clip_slot_index");
  if (parsed === null) parsed = parseIndex(payload, "slot_index");
  if (parsed === null) parsed = 0;
  return parsed;
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
  var trackIndex = parseTrackIndex(payload);
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
  if (trackIndex === null) trackIndex = parseIndex(payload, "track_index");
  if (trackIndex === null) trackIndex = selectedTrackIndex();
  var deviceIndex = parseIndex(payload, "device_id");
  if (deviceIndex === null) deviceIndex = parseIndex(payload, "device_index");
  if (deviceIndex === null) deviceIndex = 0;
  var deviceApi = liveObject("live_set tracks " + trackIndex + " devices " + deviceIndex);
  var count = childCount(deviceApi, "parameters");
  var parameters = [];
  for (var i = 0; i < count; i += 1) {
    parameters.push(summarizeParameter(liveObject("live_set tracks " + trackIndex + " devices " + deviceIndex + " parameters " + i), i));
  }
  return { track_index: trackIndex, device_index: deviceIndex, parameters: parameters };
}

function automationParameterTarget(trackIndex, targetType, parameterApi, options) {
  var parameter = summarizeParameter(parameterApi, options.parameter_index);
  return {
    target_id: options.target_id,
    target_type: targetType,
    track_index: trackIndex,
    device_index: options.device_index === undefined ? null : options.device_index,
    device_name: options.device_name || null,
    device_class_name: options.device_class_name || null,
    parameter_index: options.parameter_index,
    parameter_name: parameter.name,
    value: parameter.value,
    min: parameter.min,
    max: parameter.max,
    is_enabled: parameter.is_enabled,
    current_value_write_tool: options.current_value_write_tool || null,
    automation_write_supported: false
  };
}

function automationSummary(payload) {
  var trackIndex = parseIndex(payload, "track_id");
  if (trackIndex === null) trackIndex = parseIndex(payload, "track_index");
  if (trackIndex === null) trackIndex = selectedTrackIndex();
  var includeDevices = !(payload && payload.include_devices === false);
  var maxParameters = Math.floor(Number(payload && payload.max_parameters ? payload.max_parameters : 256));
  if (!isFinite(maxParameters) || maxParameters < 1) maxParameters = 256;
  if (maxParameters > 512) maxParameters = 512;

  var trackPath = "live_set tracks " + trackIndex;
  var track = liveObject(trackPath);
  var targets = [];
  var truncated = false;
  var mixerPath = trackPath + " mixer_device";
  if (targets.length < maxParameters) {
    targets.push(automationParameterTarget(trackIndex, "track_volume", liveObject(mixerPath + " volume"), {
      target_id: "track:" + trackIndex + ":mixer:volume",
      parameter_index: 0,
      current_value_write_tool: { name: "ableton_set_track_volume", arguments: { track_index: trackIndex, value: safeGet(liveObject(mixerPath + " volume"), "value", null), dry_run: true } }
    }));
  } else {
    truncated = true;
  }
  if (targets.length < maxParameters) {
    targets.push(automationParameterTarget(trackIndex, "track_pan", liveObject(mixerPath + " panning"), {
      target_id: "track:" + trackIndex + ":mixer:panning",
      parameter_index: 1,
      current_value_write_tool: { name: "ableton_set_track_pan", arguments: { track_index: trackIndex, value: safeGet(liveObject(mixerPath + " panning"), "value", null), dry_run: true } }
    }));
  } else {
    truncated = true;
  }

  var mixer = liveObject(mixerPath);
  var sendCount = childCount(mixer, "sends");
  for (var sendIndex = 0; sendIndex < sendCount; sendIndex += 1) {
    if (targets.length >= maxParameters) {
      truncated = true;
      break;
    }
    var sendParameter = liveObject(mixerPath + " sends " + sendIndex);
    targets.push(automationParameterTarget(trackIndex, "track_send", sendParameter, {
      target_id: "track:" + trackIndex + ":send:" + sendIndex,
      parameter_index: sendIndex,
      current_value_write_tool: { name: "ableton_set_track_send", arguments: { track_index: trackIndex, send_index: sendIndex, value: safeGet(sendParameter, "value", null), dry_run: true } }
    }));
  }

  var deviceTargets = 0;
  if (includeDevices) {
    var deviceCount = childCount(track, "devices");
    for (var deviceIndex = 0; deviceIndex < deviceCount; deviceIndex += 1) {
      if (targets.length >= maxParameters) {
        truncated = true;
        break;
      }
      var device = liveObject(trackPath + " devices " + deviceIndex);
      var deviceName = safeGet(device, "name", "");
      var className = safeGet(device, "class_name", "");
      var parameterCount = childCount(device, "parameters");
      for (var parameterIndex = 0; parameterIndex < parameterCount; parameterIndex += 1) {
        if (targets.length >= maxParameters) {
          truncated = true;
          break;
        }
        targets.push(automationParameterTarget(trackIndex, "device_parameter", liveObject(trackPath + " devices " + deviceIndex + " parameters " + parameterIndex), {
          target_id: "track:" + trackIndex + ":device:" + deviceIndex + ":parameter:" + parameterIndex,
          device_index: deviceIndex,
          device_name: deviceName,
          device_class_name: className,
          parameter_index: parameterIndex,
          current_value_write_tool: { name: "ableton_set_device_parameter", arguments: { track_index: trackIndex, device_index: deviceIndex, parameter_index: parameterIndex, value: safeGet(liveObject(trackPath + " devices " + deviceIndex + " parameters " + parameterIndex), "value", null), dry_run: true } }
        }));
        deviceTargets += 1;
      }
    }
  }

  return {
    track_index: trackIndex,
    track_name: safeGet(track, "name", ""),
    targets: targets,
    summary: {
      total_targets: targets.length,
      mixer_targets: targets.length - deviceTargets,
      device_targets: deviceTargets,
      truncated: truncated,
      max_parameters: maxParameters
    },
    support: {
      parameter_value_writes: "write_gated",
      automation_breakpoint_writes: "unsupported"
    },
    next_steps: [
      "Use target_id and parameter_index values to review candidate automation targets.",
      "Use the current_value_write_tool templates only as dry-runs unless ABLETON_MCP_ENABLE_WRITE=1 is intentionally enabled.",
      "Automation breakpoint writing still returns unsupported until the bridge has a verified envelope write path."
    ]
  };
}

function listClipSlots(payload) {
  var trackIndex = parseTrackIndex(payload);
  var trackApi = liveObject("live_set tracks " + trackIndex);
  var count = childCount(trackApi, "clip_slots");
  var slots = [];
  for (var i = 0; i < count; i += 1) {
    slots.push(summarizeClipSlot(trackIndex, i));
  }
  return { track_index: trackIndex, clip_slots: slots };
}

function getTrackMixer(payload) {
  var trackIndex = parseTrackIndex(payload);
  return { track_index: trackIndex, mixer: mixerSummary("live_set tracks " + trackIndex) };
}

function getReturnTrackMixer(payload) {
  var returnTrackIndex = parseIndex(payload, "return_track_index");
  if (returnTrackIndex === null) returnTrackIndex = parseIndex(payload, "return_track_id");
  if (returnTrackIndex === null) returnTrackIndex = 0;
  return { return_track_index: returnTrackIndex, mixer: mixerSummary("live_set return_tracks " + returnTrackIndex) };
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
  var trackIndex = parseTrackIndex(payload);
  var value = payload && (payload.value !== undefined ? payload.value : payload.enabled);
  liveObject("live_set tracks " + trackIndex).set(propertyName, value ? 1 : 0);
  return { track_index: trackIndex, property: propertyName, value: value ? 1 : 0 };
}

function parseColor(payload) {
  var color = Math.floor(Number(payload && payload.color));
  if (!isFinite(color) || color < 0 || color > 16777215) throw new Error("color must be an RGB integer from 0 to 16777215.");
  return color;
}

function setTrackColor(payload) {
  var trackIndex = parseTrackIndex(payload);
  var color = parseColor(payload);
  var track = liveObject("live_set tracks " + trackIndex);
  track.set("color", color);
  return { track_index: trackIndex, color: safeGet(track, "color", null) };
}

function setReturnTrackColor(payload) {
  var returnTrackIndex = parseRequiredIndex(payload, "return_track_index");
  var color = parseColor(payload);
  var track = liveObject("live_set return_tracks " + returnTrackIndex);
  track.set("color", color);
  return { return_track_index: returnTrackIndex, color: safeGet(track, "color", null) };
}

function setSceneColor(payload) {
  var sceneIndex = parseRequiredIndex(payload, "scene_index");
  var color = parseColor(payload);
  var scene = liveObject("live_set scenes " + sceneIndex);
  scene.set("color", color);
  return { scene_index: sceneIndex, color: safeGet(scene, "color", null) };
}

function setClipColor(payload) {
  var target = clipSlotFromPayload(payload);
  if (!clipExists(target.track_index, target.slot_index)) throw new Error("Clip slot does not contain a clip.");
  var color = parseColor(payload);
  var clip = liveObject(target.clip_path);
  clip.set("color", color);
  return { track_index: target.track_index, clip_slot_index: target.slot_index, color: safeGet(clip, "color", null) };
}

function renameTrack(payload) {
  var trackIndex = parseTrackIndex(payload);
  var name = String(payload && payload.name ? payload.name : "").slice(0, 128);
  if (!name) throw new Error("Track name is required.");
  liveObject("live_set tracks " + trackIndex).set("name", name);
  return { track_index: trackIndex, name: name };
}

function renameReturnTrack(payload) {
  var returnTrackIndex = parseRequiredIndex(payload, "return_track_index");
  var name = String(payload && payload.name ? payload.name : "").slice(0, 128);
  if (!name) throw new Error("Return track name is required.");
  liveObject("live_set return_tracks " + returnTrackIndex).set("name", name);
  return { return_track_index: returnTrackIndex, name: name };
}

function renameScene(payload) {
  var sceneIndex = parseRequiredIndex(payload, "scene_index");
  var name = String(payload && payload.name ? payload.name : "").slice(0, 128);
  if (!name) throw new Error("Scene name is required.");
  liveObject("live_set scenes " + sceneIndex).set("name", name);
  return { scene_index: sceneIndex, name: name };
}

function createTrack(kind, payload) {
  var song = liveObject("live_set");
  var name = String(payload && payload.name ? payload.name : "").slice(0, 128);
  var index = parseIndex(payload, "track_index");
  if (index === null) index = -1;
  var beforeCount = kind === "return" ? childCount(song, "return_tracks") : childCount(song, "tracks");
  var result;
  if (kind === "audio") result = safeCall(song, "create_audio_track", [index]);
  else if (kind === "midi") result = safeCall(song, "create_midi_track", [index]);
  else if (kind === "return") result = safeCall(song, "create_return_track");
  else throw new Error("Unsupported track kind.");
  if (!callSucceeded(result)) return unsupported("ableton_create_" + kind + "_track", "Track creation is unavailable from this LiveAPI context.", { kind: kind, result: result });
  var createdIndex = index >= 0 ? index : beforeCount;
  if (name) {
    var pathPrefix = kind === "return" ? "live_set return_tracks " : "live_set tracks ";
    liveObject(pathPrefix + createdIndex).set("name", name);
  }
  return { kind: kind, index: createdIndex, name: name || null, result: result };
}

function createScene(payload) {
  var song = liveObject("live_set");
  var name = String(payload && payload.name ? payload.name : "").slice(0, 128);
  var index = parseIndex(payload, "scene_index");
  if (index === null) index = -1;
  var beforeCount = childCount(song, "scenes");
  var result = safeCall(song, "create_scene", [index]);
  if (!callSucceeded(result)) return unsupported("ableton_create_scene", "Scene creation is unavailable from this LiveAPI context.", { result: result });
  var createdIndex = index >= 0 ? index : beforeCount;
  if (name) liveObject("live_set scenes " + createdIndex).set("name", name);
  return { index: createdIndex, name: name || null, result: result };
}

function clipSlotFromPayload(payload) {
  var trackIndex = parseTrackIndex(payload);
  var slotIndex = parseClipSlotIndex(payload);
  return {
    track_index: trackIndex,
    slot_index: slotIndex,
    slot: liveObject("live_set tracks " + trackIndex + " clip_slots " + slotIndex),
    clip_path: "live_set tracks " + trackIndex + " clip_slots " + slotIndex + " clip"
  };
}

function clipSlotByIndexes(trackIndex, slotIndex) {
  return liveObject("live_set tracks " + trackIndex + " clip_slots " + slotIndex);
}

function clipByIndexes(trackIndex, slotIndex) {
  return liveObject("live_set tracks " + trackIndex + " clip_slots " + slotIndex + " clip");
}

function clipExists(trackIndex, slotIndex) {
  return Number(safeGet(clipSlotByIndexes(trackIndex, slotIndex), "has_clip", 0)) === 1;
}

function createClip(payload) {
  var target = clipSlotFromPayload(payload);
  if (Number(safeGet(target.slot, "has_clip", 0)) === 1) throw new Error("Clip slot already contains a clip.");
  var length = Number(payload && payload.length ? payload.length : 4);
  if (!isFinite(length) || length <= 0 || length > 1024) throw new Error("Clip length must be between 0 and 1024 beats.");
  var result = safeCall(target.slot, "create_clip", [length]);
  if (!callSucceeded(result)) return unsupported("ableton_create_clip", "ClipSlot.create_clip is unavailable for this target. It only works on empty MIDI clip slots.", { track_index: target.track_index, slot_index: target.slot_index, result: result });
  var name = String(payload && payload.name ? payload.name : "").slice(0, 128);
  if (name) liveObject(target.clip_path).set("name", name);
  return { track_index: target.track_index, slot_index: target.slot_index, length: length, name: name || null, result: result };
}

function loadPresetOrSample(payload) {
  var target = clipSlotFromPayload(payload);
  var mode = String(payload && payload.mode ? payload.mode : "audio_clip");
  var filePath = String(payload && payload.path ? payload.path : "");
  if (mode !== "audio_clip") {
    return unsupported("ableton_load_preset_or_sample", "Only approved local audio sample clip creation is implemented. Preset/device loading needs a reviewed browser or LiveAPI insertion path.", { mode: mode });
  }
  if (!filePath) throw new Error("path is required.");
  if (Number(safeGet(target.slot, "has_clip", 0)) === 1) throw new Error("Clip slot already contains a clip.");
  var result = safeCall(target.slot, "create_audio_clip", [filePath]);
  if (!callSucceeded(result)) return unsupported("ableton_load_preset_or_sample", "ClipSlot.create_audio_clip is unavailable for this target. It requires an empty audio track clip slot and a supported local audio file.", { track_index: target.track_index, slot_index: target.slot_index, file_name: fileNameOnly(filePath), result: result });
  var name = String(payload && payload.name ? payload.name : "").slice(0, 128);
  if (name) liveObject(target.clip_path).set("name", name);
  return { track_index: target.track_index, slot_index: target.slot_index, file_name: fileNameOnly(filePath), name: name || null, result: result };
}

function normalizeMidiNote(note) {
  var pitch = Math.floor(Number(note && note.pitch));
  var startTime = Number(note && note.start_time);
  var duration = Number(note && note.duration);
  var velocity = Number(note && note.velocity !== undefined ? note.velocity : 100);
  if (!isFinite(pitch) || pitch < 0 || pitch > 127) throw new Error("MIDI note pitch must be 0..127.");
  if (!isFinite(startTime) || startTime < 0) throw new Error("MIDI note start_time must be non-negative.");
  if (!isFinite(duration) || duration <= 0) throw new Error("MIDI note duration must be positive.");
  if (!isFinite(velocity) || velocity < 0 || velocity > 127) throw new Error("MIDI note velocity must be 0..127.");
  var normalized = {
    pitch: pitch,
    start_time: startTime,
    duration: duration,
    velocity: velocity,
    mute: note && note.mute ? 1 : 0
  };
  if (note && note.probability !== undefined) {
    normalized.probability = Number(note.probability);
    if (!isFinite(normalized.probability) || normalized.probability < 0 || normalized.probability > 1) throw new Error("MIDI note probability must be 0..1.");
  }
  if (note && note.velocity_deviation !== undefined) {
    normalized.velocity_deviation = Number(note.velocity_deviation);
    if (!isFinite(normalized.velocity_deviation) || normalized.velocity_deviation < -127 || normalized.velocity_deviation > 127) throw new Error("MIDI note velocity_deviation must be -127..127.");
  }
  if (note && note.release_velocity !== undefined) {
    normalized.release_velocity = Number(note.release_velocity);
    if (!isFinite(normalized.release_velocity) || normalized.release_velocity < 0 || normalized.release_velocity > 127) throw new Error("MIDI note release_velocity must be 0..127.");
  }
  return normalized;
}

function noteEndTime(note) {
  return Number(note.start_time || 0) + Number(note.duration || 0);
}

function maxNoteEndTime(notes) {
  var maxEndTime = 0;
  for (var i = 0; i < notes.length; i += 1) {
    maxEndTime = Math.max(maxEndTime, noteEndTime(notes[i]));
  }
  return maxEndTime;
}

function midiReplacementTimeSpan(payload, clip, normalizedNotes) {
  var clipLength = Number(safeGet(clip, "length", 0));
  var requestedLength = Number(payload && payload.clip_length ? payload.clip_length : 0);
  return Math.max(
    isFinite(clipLength) ? clipLength : 0,
    isFinite(requestedLength) ? requestedLength : 0,
    maxNoteEndTime(normalizedNotes),
    1
  );
}

function existingMidiNoteCount(result) {
  return result && result.notes instanceof Array ? result.notes.length : null;
}

function midiNotesForWrite(notes) {
  var normalized = [];
  if (!(notes instanceof Array)) return normalized;
  for (var i = 0; i < notes.length; i += 1) {
    normalized.push(normalizeMidiNote(notes[i]));
  }
  return normalized;
}

function readExistingMidiNotes(clip, target, timeSpan) {
  var result = safeCall(clip, "get_notes_extended", [0, 128, 0, timeSpan]);
  if (!callSucceeded(result)) {
    return unsupported("ableton_insert_midi_notes", "Clip.get_notes_extended is unavailable, so existing notes cannot be inspected before replacement.", {
      track_index: target.track_index,
      clip_slot_index: target.slot_index,
      time_span: timeSpan,
      result: result
    });
  }
  return result;
}

function removeExistingMidiNotes(clip, target, timeSpan) {
  var result = safeCall(clip, "remove_notes_extended", [0, 128, 0, timeSpan]);
  if (!callSucceeded(result)) {
    return unsupported("ableton_insert_midi_notes", "Clip.remove_notes_extended is unavailable, so replacement cannot run safely.", {
      track_index: target.track_index,
      clip_slot_index: target.slot_index,
      time_span: timeSpan,
      result: result
    });
  }
  return { time_span: timeSpan, result: result };
}

function restoreExistingMidiNotes(clip, existingNotes) {
  if (existingNotes && existingNotes.notes instanceof Array && existingNotes.notes.length) {
    return safeCall(clip, "add_new_notes", [{ notes: midiNotesForWrite(existingNotes.notes) }]);
  }
  return null;
}

function clampNumber(value, minValue, maxValue) {
  return Math.max(minValue, Math.min(maxValue, value));
}

function normalizedSeed(payload, target, noteCount, timingAmount, velocityAmount) {
  var explicitSeed = payload && payload.seed !== undefined ? Number(payload.seed) : NaN;
  var seed = isFinite(explicitSeed)
    ? Math.floor(explicitSeed)
    : ((target.track_index + 1) * 1000003) + ((target.slot_index + 1) * 9176) + (noteCount * 101) + Math.floor(timingAmount * 100000) + Math.floor(velocityAmount * 1000);
  seed = seed % 2147483647;
  if (seed <= 0) seed += 2147483646;
  return seed;
}

function nextSeededRandom(state) {
  state.value = (state.value * 16807) % 2147483647;
  return (state.value - 1) / 2147483646;
}

function humanizeMidiNotes(notes, payload, target, timeSpan) {
  var timingAmount = Number(payload && payload.timing_amount !== undefined ? payload.timing_amount : 0.02);
  var velocityAmount = Number(payload && payload.velocity_amount !== undefined ? payload.velocity_amount : 5);
  if (!isFinite(timingAmount) || timingAmount < 0 || timingAmount > 0.25) throw new Error("timing_amount must be between 0 and 0.25 beats.");
  if (!isFinite(velocityAmount) || velocityAmount < 0 || velocityAmount > 32) throw new Error("velocity_amount must be between 0 and 32.");
  var normalized = midiNotesForWrite(notes);
  var seed = normalizedSeed(payload, target, normalized.length, timingAmount, velocityAmount);
  var state = { value: seed };
  var rewritten = [];
  var changed = false;
  for (var i = 0; i < normalized.length; i += 1) {
    var note = normalized[i];
    var timingJitter = (nextSeededRandom(state) * 2 - 1) * timingAmount;
    var velocityJitter = Math.round((nextSeededRandom(state) * 2 - 1) * velocityAmount);
    var maxStart = Math.max(0, timeSpan - note.duration);
    var nextStart = clampNumber(note.start_time + timingJitter, 0, maxStart);
    var nextVelocity = Math.floor(clampNumber(note.velocity + velocityJitter, 0, 127));
    var nextNote = {
      pitch: note.pitch,
      start_time: nextStart,
      duration: note.duration,
      velocity: nextVelocity,
      mute: note.mute ? 1 : 0
    };
    if (note.probability !== undefined) nextNote.probability = note.probability;
    if (note.velocity_deviation !== undefined) nextNote.velocity_deviation = note.velocity_deviation;
    if (note.release_velocity !== undefined) nextNote.release_velocity = note.release_velocity;
    if (nextNote.start_time !== note.start_time || nextNote.velocity !== note.velocity) changed = true;
    rewritten.push(nextNote);
  }
  return {
    notes: rewritten,
    original_count: normalized.length,
    changed: changed,
    seed: seed,
    timing_amount: timingAmount,
    velocity_amount: velocityAmount
  };
}

function insertMidiNotes(payload) {
  var target = clipSlotFromPayload(payload);
  var notes = payload && payload.notes instanceof Array ? payload.notes : [];
  if (!notes.length) throw new Error("notes must contain at least one MIDI note.");
  if (!clipExists(target.track_index, target.slot_index)) {
    if (!(payload && payload.create_clip_if_missing)) throw new Error("Clip slot does not contain a MIDI clip.");
    var created = createClip({ track_index: target.track_index, clip_slot_index: target.slot_index, length: payload.clip_length || 4, name: payload.name || "MIDI" });
    if (created.unsupported) return created;
  }
  var clip = liveObject(target.clip_path);
  var isMidiClip = safeGet(clip, "is_midi_clip", null);
  if (Number(isMidiClip) === 0) {
    return unsupported("ableton_insert_midi_notes", "The target clip is not a MIDI clip.", { track_index: target.track_index, clip_slot_index: target.slot_index });
  }
  var normalizedNotes = [];
  for (var i = 0; i < notes.length; i += 1) {
    normalizedNotes.push(normalizeMidiNote(notes[i]));
  }
  var replaceExisting = Boolean(payload && payload.replace_existing);
  var existingNotes = null;
  var removal = null;
  if (replaceExisting) {
    var timeSpan = midiReplacementTimeSpan(payload, clip, normalizedNotes);
    existingNotes = readExistingMidiNotes(clip, target, timeSpan);
    if (existingNotes && existingNotes.unsupported) return existingNotes;
    removal = removeExistingMidiNotes(clip, target, timeSpan);
    if (removal && removal.unsupported) return removal;
  }
  var notePayload = { notes: normalizedNotes };
  var result = safeCall(clip, "add_new_notes", [notePayload]);
  if (!callSucceeded(result)) {
    var restoreResult = replaceExisting ? restoreExistingMidiNotes(clip, existingNotes) : null;
    return unsupported("ableton_insert_midi_notes", "Clip.add_new_notes is unavailable from this bridge context.", {
      track_index: target.track_index,
      clip_slot_index: target.slot_index,
      note_count: notePayload.notes.length,
      replace_existing: replaceExisting,
      removal: removal,
      restore_result: restoreResult,
      result: result
    });
  }
  return {
    track_index: target.track_index,
    clip_slot_index: target.slot_index,
    note_count: notePayload.notes.length,
    replace_existing: replaceExisting,
    removed_note_range: removal ? { from_pitch: 0, pitch_span: 128, from_time: 0, time_span: removal.time_span } : null,
    existing_note_count: existingMidiNoteCount(existingNotes),
    result: result
  };
}

function unsupportedDeviceInsertion(action, payload) {
  return unsupported(action, "Ableton-native device insertion is not exposed reliably through this LiveAPI bridge. Use browse/read tools first, then the user-chosen UI driver fallback if device insertion is required.", {
    track_index: parseTrackIndex(payload || {}),
    requested_device: String(payload && (payload.device || payload.name || payload.preset || "")).slice(0, 128)
  });
}

function fireClip(payload) {
  var target = clipSlotFromPayload(payload);
  return { track_index: target.track_index, slot_index: target.slot_index, result: safeCall(target.slot, "fire") };
}

function stopClip(payload) {
  var trackIndex = parseTrackIndex(payload);
  var slotIndex = parseIndex(payload, "slot_index");
  if (slotIndex === null) slotIndex = parseIndex(payload, "clip_slot_index");
  if (slotIndex === null) {
    return { track_index: trackIndex, result: safeCall(liveObject("live_set tracks " + trackIndex), "stop_all_clips") };
  }
  var slot = liveObject("live_set tracks " + trackIndex + " clip_slots " + slotIndex);
  return { track_index: trackIndex, slot_index: slotIndex, result: safeCall(slot, "stop") };
}

function setClipLoop(payload) {
  var target = clipSlotFromPayload(payload);
  var clip = liveObject(target.clip_path);
  if (payload.looping !== undefined) clip.set("looping", payload.looping ? 1 : 0);
  if (payload.loop_start !== undefined) clip.set("loop_start", Number(payload.loop_start));
  if (payload.loop_end !== undefined) clip.set("loop_end", Number(payload.loop_end));
  return {
    track_index: target.track_index,
    slot_index: target.slot_index,
    loop_start: safeGet(clip, "loop_start", null),
    loop_end: safeGet(clip, "loop_end", null),
    looping: safeGet(clip, "looping", null)
  };
}

function renameClip(payload) {
  var target = clipSlotFromPayload(payload);
  var clip = liveObject(target.clip_path);
  var name = String(payload && payload.name ? payload.name : "").slice(0, 128);
  if (!name) throw new Error("Clip name is required.");
  clip.set("name", name);
  return { track_index: target.track_index, slot_index: target.slot_index, name: name };
}

function audioClipTarget(payload, action) {
  var target = clipSlotFromPayload(payload);
  if (!clipExists(target.track_index, target.slot_index)) throw new Error("Clip slot does not contain a clip.");
  var clip = liveObject(target.clip_path);
  if (Number(safeGet(clip, "is_audio_clip", 0)) !== 1) {
    return {
      unsupported: unsupported(action, "This operation is available only for audio clips in the Live Object Model.", {
        track_index: target.track_index,
        clip_slot_index: target.slot_index,
        clip: summarizeClipSlot(target.track_index, target.slot_index).clip
      })
    };
  }
  target.clip = clip;
  return target;
}

function audioClipState(target) {
  return {
    track_index: target.track_index,
    slot_index: target.slot_index,
    gain: safeGet(target.clip, "gain", null),
    gain_display_string: safeGet(target.clip, "gain_display_string", null),
    pitch_coarse: safeGet(target.clip, "pitch_coarse", null),
    pitch_fine: safeGet(target.clip, "pitch_fine", null),
    warping: safeGet(target.clip, "warping", null),
    warp_mode: safeGet(target.clip, "warp_mode", null),
    start_marker: safeGet(target.clip, "start_marker", null),
    end_marker: safeGet(target.clip, "end_marker", null),
    loop_start: safeGet(target.clip, "loop_start", null),
    loop_end: safeGet(target.clip, "loop_end", null)
  };
}

function setClipGain(payload) {
  var target = audioClipTarget(payload, "ableton_set_clip_gain");
  if (target.unsupported) return target.unsupported;
  var gain = Number(payload && payload.gain);
  if (!isFinite(gain) || gain < 0 || gain > 1) throw new Error("gain must be between 0 and 1.");
  target.clip.set("gain", gain);
  return audioClipState(target);
}

function transposeClip(payload) {
  var target = audioClipTarget(payload, "ableton_transpose_clip");
  if (target.unsupported) return target.unsupported;
  var semitones = Math.floor(Number(payload && payload.semitones));
  if (!isFinite(semitones) || semitones < -48 || semitones > 48) throw new Error("semitones must be an integer from -48 to 48.");
  target.clip.set("pitch_coarse", semitones);
  if (payload && payload.cents !== undefined) {
    var cents = Number(payload.cents);
    if (!isFinite(cents) || cents < -50 || cents > 49) throw new Error("cents must be between -50 and 49.");
    target.clip.set("pitch_fine", cents);
  }
  return audioClipState(target);
}

function warpModeIndex(value) {
  if (typeof value === "number") {
    if (value >= 0 && value <= 6 && Math.floor(value) === value) return value;
    throw new Error("warp_mode index must be 0..6.");
  }
  var key = String(value || "").toLowerCase().replace(/[\s-]+/g, "_");
  var modes = {
    beats: 0,
    tones: 1,
    texture: 2,
    re_pitch: 3,
    complex: 4,
    rex: 5,
    complex_pro: 6
  };
  if (modes[key] === undefined) throw new Error("warp_mode must be beats, tones, texture, re-pitch, complex, rex, or complex_pro.");
  return modes[key];
}

function setClipWarp(payload) {
  var target = audioClipTarget(payload, "ableton_set_clip_warp");
  if (target.unsupported) return target.unsupported;
  if (!payload || (payload.warping === undefined && payload.warp_mode === undefined)) throw new Error("warping or warp_mode is required.");
  if (payload.warping !== undefined) target.clip.set("warping", payload.warping ? 1 : 0);
  if (payload.warp_mode !== undefined) target.clip.set("warp_mode", warpModeIndex(payload.warp_mode));
  return audioClipState(target);
}

function setClipMarkers(payload) {
  var target = clipSlotFromPayload(payload);
  if (!clipExists(target.track_index, target.slot_index)) throw new Error("Clip slot does not contain a clip.");
  var clip = liveObject(target.clip_path);
  var hasStart = payload && payload.start_marker !== undefined;
  var hasEnd = payload && payload.end_marker !== undefined;
  if (!hasStart && !hasEnd) throw new Error("start_marker or end_marker is required.");
  var startMarker = hasStart ? Number(payload.start_marker) : null;
  var endMarker = hasEnd ? Number(payload.end_marker) : null;
  if (hasStart && (!isFinite(startMarker) || startMarker < 0)) throw new Error("start_marker must be a non-negative number.");
  if (hasEnd && (!isFinite(endMarker) || endMarker < 0)) throw new Error("end_marker must be a non-negative number.");
  if (hasStart && hasEnd && endMarker < startMarker) throw new Error("end_marker cannot be before start_marker.");
  var currentEnd = Number(safeGet(clip, "end_marker", 0));
  if (hasEnd && hasStart && startMarker > currentEnd) {
    clip.set("end_marker", endMarker);
    clip.set("start_marker", startMarker);
  } else {
    if (hasStart) clip.set("start_marker", startMarker);
    if (hasEnd) clip.set("end_marker", endMarker);
  }
  return {
    track_index: target.track_index,
    slot_index: target.slot_index,
    start_marker: safeGet(clip, "start_marker", null),
    end_marker: safeGet(clip, "end_marker", null),
    loop_start: safeGet(clip, "loop_start", null),
    loop_end: safeGet(clip, "loop_end", null)
  };
}

function setMixerParameter(payload, parameterName, minValue, maxValue) {
  var trackIndex = parseTrackIndex(payload);
  var value = Number(payload && payload.value);
  if (!isFinite(value) || value < minValue || value > maxValue) {
    throw new Error(parameterName + " value must be between " + minValue + " and " + maxValue + ".");
  }
  var parameter = liveObject("live_set tracks " + trackIndex + " mixer_device " + parameterName);
  parameter.set("value", value);
  return { track_index: trackIndex, parameter: parameterName, value: safeGet(parameter, "value", null) };
}

function setTrackSend(payload) {
  var trackIndex = parseTrackIndex(payload);
  var sendIndex = parseRequiredIndex(payload, "send_index");
  var value = Number(payload && payload.value);
  if (!isFinite(value) || value < 0 || value > 1) throw new Error("Send value must be between 0 and 1.");
  var mixerPath = "live_set tracks " + trackIndex + " mixer_device";
  var sendCount = childCount(liveObject(mixerPath), "sends");
  if (sendIndex >= sendCount) {
    throw new Error("send_index " + sendIndex + " is out of range; track " + trackIndex + " has " + sendCount + " sends. Call ableton_get_track_mixer and ableton_list_return_tracks first.");
  }
  var parameter = liveObject(mixerPath + " sends " + sendIndex);
  parameter.set("value", value);
  return { track_index: trackIndex, send_index: sendIndex, value: safeGet(parameter, "value", null), mixer: mixerSummary("live_set tracks " + trackIndex) };
}

function setReturnMixerParameter(payload, parameterName, minValue, maxValue) {
  var returnTrackIndex = parseRequiredIndex(payload, "return_track_index");
  var value = Number(payload && payload.value);
  if (!isFinite(value) || value < minValue || value > maxValue) {
    throw new Error(parameterName + " value must be between " + minValue + " and " + maxValue + ".");
  }
  var parameter = liveObject("live_set return_tracks " + returnTrackIndex + " mixer_device " + parameterName);
  parameter.set("value", value);
  return { return_track_index: returnTrackIndex, parameter: parameterName, value: safeGet(parameter, "value", null) };
}

function setMasterMixerParameter(payload, parameterName, minValue, maxValue) {
  var value = Number(payload && payload.value);
  if (!isFinite(value) || value < minValue || value > maxValue) {
    throw new Error(parameterName + " value must be between " + minValue + " and " + maxValue + ".");
  }
  var parameter = liveObject("live_set master_track mixer_device " + parameterName);
  parameter.set("value", value);
  return { track: "master", parameter: parameterName, value: safeGet(parameter, "value", null) };
}

function setDeviceParameter(payload) {
  var trackIndex = parseTrackIndex(payload);
  var deviceIndex = parseIndex(payload, "device_id");
  if (deviceIndex === null) deviceIndex = parseIndex(payload, "device_index");
  if (deviceIndex === null) deviceIndex = 0;
  var parameterIndex = parseIndex(payload, "parameter_id");
  if (parameterIndex === null) parameterIndex = parseIndex(payload, "parameter_index");
  if (parameterIndex === null) throw new Error("parameter_id is required.");
  var value = Number(payload && payload.value);
  if (!isFinite(value)) throw new Error("Parameter value must be numeric.");
  var parameter = liveObject("live_set tracks " + trackIndex + " devices " + deviceIndex + " parameters " + parameterIndex);
  parameter.set("value", value);
  return {
    track_index: trackIndex,
    device_index: deviceIndex,
    parameter_index: parameterIndex,
    parameter: summarizeParameter(parameter, parameterIndex)
  };
}

function listArrangementMarkers() {
  var song = liveObject("live_set");
  var count = childCount(song, "cue_points");
  var markers = [];
  for (var i = 0; i < count; i += 1) {
    var marker = liveObject("live_set cue_points " + i);
    markers.push({
      id: objectId(marker),
      index: i,
      name: safeGet(marker, "name", ""),
      time: safeGet(marker, "time", null)
    });
  }
  return { markers: markers };
}

function createArrangementMarker(payload) {
  var time = Number(payload && payload.time);
  var name = String(payload && payload.name ? payload.name : "").slice(0, 128);
  if (!isFinite(time) || time < 0) throw new Error("time must be a non-negative number.");
  if (!name) throw new Error("name is required.");
  var song = liveObject("live_set");
  var result = safeCall(song, "create_locator", [time]);
  if (!callSucceeded(result)) return unsupported("ableton_create_arrangement_marker", "create_locator is unavailable from this LiveAPI context.", { time: time, name: name, result: result });
  var markers = listArrangementMarkers().markers;
  for (var i = 0; i < markers.length; i += 1) {
    if (Number(markers[i].time) === time) {
      liveObject("live_set cue_points " + markers[i].index).set("name", name);
      markers[i].name = name;
      return { created: true, marker: markers[i], result: result };
    }
  }
  return { created: true, time: time, name: name, result: result };
}

function duplicateScene(payload) {
  var sceneIndex = parseRequiredIndex(payload, "scene_index");
  var result = safeCall(liveObject("live_set"), "duplicate_scene", [sceneIndex]);
  if (!callSucceeded(result)) return unsupported("ableton_duplicate_scene", "duplicate_scene is unavailable from this LiveAPI context.", { scene_index: sceneIndex, result: result });
  return { scene_index: sceneIndex, duplicated: true, result: result };
}

function fireScene(payload) {
  var sceneIndex = parseRequiredIndex(payload, "scene_index");
  var forceLegato = payload && payload.force_legato ? 1 : 0;
  var canSelectScene = payload && payload.select_scene === false ? 0 : 1;
  var scene = liveObject("live_set scenes " + sceneIndex);
  var result = safeCall(scene, "fire", [forceLegato, canSelectScene]);
  if (!callSucceeded(result)) return unsupported("ableton_fire_scene", "Scene.fire is unavailable from this LiveAPI context.", { scene_index: sceneIndex, result: result });
  return { scene_index: sceneIndex, fired: true, force_legato: Boolean(forceLegato), select_scene: Boolean(canSelectScene), scene: summarizeScene(sceneIndex), result: result };
}

function setSceneTempo(payload) {
  var sceneIndex = parseRequiredIndex(payload, "scene_index");
  var tempo = Number(payload && payload.tempo);
  var enabled = !(payload && payload.enabled === false);
  if (!isFinite(tempo) || tempo < 20 || tempo > 999) throw new Error("tempo must be between 20 and 999 BPM.");
  var scene = liveObject("live_set scenes " + sceneIndex);
  scene.set("tempo_enabled", enabled ? 1 : 0);
  if (enabled) scene.set("tempo", tempo);
  return { scene_index: sceneIndex, tempo: safeGet(scene, "tempo", null), tempo_enabled: safeGet(scene, "tempo_enabled", null) };
}

function setSceneTimeSignature(payload) {
  var sceneIndex = parseRequiredIndex(payload, "scene_index");
  var numerator = Math.floor(Number(payload && payload.numerator));
  var denominator = Math.floor(Number(payload && payload.denominator));
  var enabled = !(payload && payload.enabled === false);
  if (!isFinite(numerator) || numerator < 1 || numerator > 32) throw new Error("numerator must be 1..32.");
  if ([2, 4, 8, 16].indexOf(denominator) === -1) throw new Error("denominator must be 2, 4, 8, or 16.");
  var scene = liveObject("live_set scenes " + sceneIndex);
  scene.set("time_signature_enabled", enabled ? 1 : 0);
  if (enabled) {
    scene.set("time_signature_numerator", numerator);
    scene.set("time_signature_denominator", denominator);
  }
  return {
    scene_index: sceneIndex,
    time_signature_numerator: safeGet(scene, "time_signature_numerator", null),
    time_signature_denominator: safeGet(scene, "time_signature_denominator", null),
    time_signature_enabled: safeGet(scene, "time_signature_enabled", null)
  };
}

function duplicateClip(payload) {
  var sourceTrack = parseTrackIndex(payload);
  var sourceSlot = parseClipSlotIndex(payload);
  var destinationTrack = parseIndex(payload, "destination_track_index");
  if (destinationTrack === null) destinationTrack = sourceTrack;
  var destinationSlot = parseIndex(payload, "destination_clip_slot_index");
  if (destinationSlot === null) destinationSlot = sourceSlot + 1;
  if (!clipExists(sourceTrack, sourceSlot)) throw new Error("Source clip slot does not contain a clip.");
  if (clipExists(destinationTrack, destinationSlot)) throw new Error("Destination clip slot already contains a clip.");
  var result = safeCall(clipSlotByIndexes(sourceTrack, sourceSlot), "duplicate_clip_to", [clipSlotByIndexes(destinationTrack, destinationSlot)]);
  if (!callSucceeded(result)) return unsupported("ableton_duplicate_clip", "duplicate_clip_to is unavailable from this LiveAPI context.", { source_track_index: sourceTrack, source_clip_slot_index: sourceSlot, destination_track_index: destinationTrack, destination_clip_slot_index: destinationSlot, result: result });
  return { duplicated: true, source_track_index: sourceTrack, source_clip_slot_index: sourceSlot, destination_track_index: destinationTrack, destination_clip_slot_index: destinationSlot, result: result };
}

function moveClip(payload) {
  var sourceTrack = parseTrackIndex(payload);
  var sourceSlot = parseClipSlotIndex(payload);
  var destinationTrack = parseRequiredIndex(payload, "destination_track_index");
  var destinationSlot = parseRequiredIndex(payload, "destination_clip_slot_index");
  var duplicateResult = duplicateClip({
    track_index: sourceTrack,
    clip_slot_index: sourceSlot,
    destination_track_index: destinationTrack,
    destination_clip_slot_index: destinationSlot
  });
  if (duplicateResult.unsupported) return duplicateResult;
  var deleteResult = safeCall(clipSlotByIndexes(sourceTrack, sourceSlot), "delete_clip");
  if (!callSucceeded(deleteResult)) return unsupported("ableton_move_clip", "Clip duplicated but source delete_clip is unavailable from this LiveAPI context.", { duplicate: duplicateResult, delete_result: deleteResult });
  return { moved: true, duplicate: duplicateResult, delete_result: deleteResult };
}

function getClipNotes(payload) {
  var trackIndex = parseTrackIndex(payload);
  var slotIndex = parseClipSlotIndex(payload);
  if (!clipExists(trackIndex, slotIndex)) throw new Error("Clip slot does not contain a clip.");
  var clip = clipByIndexes(trackIndex, slotIndex);
  var timeSpan = Math.min(Math.max(Number(safeGet(clip, "length", 128)), 1), 1024);
  var notes = safeCall(clip, "get_notes_extended", [0, 128, 0, timeSpan]);
  if (!callSucceeded(notes)) {
    notes = safeCall(clip, "get_notes", [0, 0, timeSpan, 128]);
  }
  if (!callSucceeded(notes)) return unsupported("clip_notes", "MIDI note read methods are unavailable from this LiveAPI context.", { track_index: trackIndex, clip_slot_index: slotIndex, result: notes });
  return { track_index: trackIndex, clip_slot_index: slotIndex, time_span: timeSpan, notes: notes };
}

function getClipEnvelopes(payload) {
  var trackIndex = parseTrackIndex(payload);
  var slotIndex = parseClipSlotIndex(payload);
  if (!clipExists(trackIndex, slotIndex)) throw new Error("Clip slot does not contain a clip.");
  return unsupported("clip_envelopes", "Detailed clip envelope enumeration needs a reviewed LiveAPI envelope mapping for this Ableton version.", { track_index: trackIndex, clip_slot_index: slotIndex, clip: summarizeClipSlot(trackIndex, slotIndex).clip });
}

function automationTarget(payload) {
  var trackIndex = parseTrackIndex(payload);
  var parameterIndex = parseRequiredIndex(payload, "parameter_index");
  var deviceIndex = parseIndex(payload, "device_index");
  var parameterPath;
  if (deviceIndex === null) {
    parameterPath = "live_set tracks " + trackIndex + " mixer_device volume";
  } else {
    parameterPath = "live_set tracks " + trackIndex + " devices " + deviceIndex + " parameters " + parameterIndex;
  }
  var parameter = liveObject(parameterPath);
  return {
    track_index: trackIndex,
    device_index: deviceIndex,
    parameter_index: parameterIndex,
    parameter_path: parameterPath,
    parameter: summarizeParameter(parameter, parameterIndex)
  };
}

function createAutomationEnvelope(payload) {
  return unsupported("ableton_create_automation_envelope", "LiveAPI automation envelope creation is not exposed reliably from this bridge context.", automationTarget(payload));
}

function setAutomationPoint(payload) {
  var target = automationTarget(payload);
  target.time = Number(payload && payload.time);
  target.value = Number(payload && payload.value);
  return unsupported("ableton_set_automation_point", "LiveAPI automation breakpoint writing is not exposed reliably from this bridge context.", target);
}

function simplifyAutomation(payload) {
  var target = automationTarget(payload);
  target.tolerance = Number(payload && payload.tolerance !== undefined ? payload.tolerance : 0.05);
  return unsupported("ableton_simplify_automation", "LiveAPI automation simplification is not exposed reliably from this bridge context.", target);
}

function quantizeClip(payload) {
  var target = clipSlotFromPayload(payload);
  if (!clipExists(target.track_index, target.slot_index)) throw new Error("Clip slot does not contain a clip.");
  var amount = Number(payload && payload.amount !== undefined ? payload.amount : 1);
  if (!isFinite(amount) || amount < 0 || amount > 1) throw new Error("amount must be between 0 and 1.");
  var grid = String(payload && payload.grid ? payload.grid : "1/16");
  return unsupported("ableton_quantize_clip", "Quantization enum values vary by LiveAPI context; refusing to guess.", { track_index: target.track_index, clip_slot_index: target.slot_index, grid: grid, amount: amount });
}

function humanizeMidiClip(payload) {
  var target = clipSlotFromPayload(payload);
  if (!clipExists(target.track_index, target.slot_index)) throw new Error("Clip slot does not contain a clip.");
  var clip = liveObject(target.clip_path);
  var isMidiClip = safeGet(clip, "is_midi_clip", null);
  if (Number(isMidiClip) === 0) {
    return unsupported("ableton_humanize_midi_clip", "The target clip is not a MIDI clip.", { track_index: target.track_index, clip_slot_index: target.slot_index });
  }
  var timeSpan = midiReplacementTimeSpan(payload, clip, []);
  var existingNotes = readExistingMidiNotes(clip, target, timeSpan);
  if (existingNotes && existingNotes.unsupported) return unsupported("ableton_humanize_midi_clip", existingNotes.reason, existingNotes.details);
  if (!existingNotes || !(existingNotes.notes instanceof Array) || existingNotes.notes.length === 0) {
    return { track_index: target.track_index, clip_slot_index: target.slot_index, humanized: false, note_count: 0, reason: "No MIDI notes found in the target clip." };
  }
  var rewritten = humanizeMidiNotes(existingNotes.notes, payload, target, timeSpan);
  if (!rewritten.changed) {
    return {
      track_index: target.track_index,
      clip_slot_index: target.slot_index,
      humanized: false,
      note_count: rewritten.original_count,
      seed: rewritten.seed,
      timing_amount: rewritten.timing_amount,
      velocity_amount: rewritten.velocity_amount,
      reason: "timing_amount and velocity_amount produced no note changes."
    };
  }
  var removal = removeExistingMidiNotes(clip, target, timeSpan);
  if (removal && removal.unsupported) return unsupported("ableton_humanize_midi_clip", removal.reason, removal.details);
  var result = safeCall(clip, "add_new_notes", [{ notes: rewritten.notes }]);
  if (!callSucceeded(result)) {
    var restoreResult = restoreExistingMidiNotes(clip, existingNotes);
    return unsupported("ableton_humanize_midi_clip", "Clip.add_new_notes is unavailable after MIDI humanization rewrite.", {
      track_index: target.track_index,
      clip_slot_index: target.slot_index,
      note_count: rewritten.original_count,
      removal: removal,
      restore_result: restoreResult,
      result: result
    });
  }
  return {
    track_index: target.track_index,
    clip_slot_index: target.slot_index,
    humanized: true,
    note_count: rewritten.original_count,
    seed: rewritten.seed,
    timing_amount: rewritten.timing_amount,
    velocity_amount: rewritten.velocity_amount,
    removed_note_range: { from_pitch: 0, pitch_span: 128, from_time: 0, time_span: removal.time_span },
    result: result
  };
}

function bridgeCapabilities() {
  var actions = [
    ["ping", "diagnostic", "bridge"],
    ["bridge_capabilities", "diagnostic", "bridge"],
    ["live_state", "read_only", "set"],
    ["full_snapshot", "read_only", "set"],
    ["snapshot_diff", "read_only", "set"],
    ["list_tracks", "read_only", "tracks"],
    ["list_return_tracks", "read_only", "returns"],
    ["master_track", "read_only", "master"],
    ["track_mixer", "read_only", "mixer"],
    ["routing_overview", "read_only", "mixer"],
    ["return_track_mixer", "read_only", "mixer"],
    ["list_scenes", "read_only", "scenes"],
    ["list_clips", "read_only", "clips"],
    ["list_clip_slots", "read_only", "clips"],
    ["list_devices", "read_only", "devices"],
    ["list_device_parameters", "read_only", "devices"],
    ["arrangement_markers", "read_only", "arrangement"],
    ["clip_notes", "read_only", "clips"],
    ["clip_envelopes", "unsupported", "automation"],
    ["device_parameter_map", "read_only", "devices"],
    ["automation_summary", "read_only", "automation"],
    ["ui_overview", "unsupported", "ui"],
    ["selected_track", "read_only", "selection"],
    ["selected_device", "read_only", "selection"],
    ["tempo", "read_only", "transport"],
    ["transport", "read_only", "transport"],
    ["ableton_set_tempo", "write_gated", "transport"],
    ["ableton_transport_control", "write_gated", "transport"],
    ["ableton_create_audio_track", "write_gated", "tracks"],
    ["ableton_create_midi_track", "write_gated", "tracks"],
    ["ableton_create_return_track", "write_gated", "returns"],
    ["ableton_create_scene", "write_gated", "scenes"],
    ["ableton_fire_scene", "write_gated", "scenes"],
    ["ableton_set_scene_tempo", "write_gated", "scenes"],
    ["ableton_set_scene_time_signature", "write_gated", "scenes"],
    ["ableton_set_scene_color", "write_gated", "scenes"],
    ["ableton_create_clip", "write_gated", "clips"],
    ["ableton_create_midi_clip", "write_gated", "clips"],
    ["ableton_insert_midi_notes", "write_gated", "midi"],
    ["ableton_load_preset_or_sample", "write_gated", "samples"],
    ["ableton_set_clip_loop", "write_gated", "clips"],
    ["ableton_set_clip_gain", "write_gated", "clips"],
    ["ableton_transpose_clip", "write_gated", "clips"],
    ["ableton_set_clip_warp", "write_gated", "clips"],
    ["ableton_set_clip_markers", "write_gated", "clips"],
    ["ableton_set_clip_color", "write_gated", "clips"],
    ["ableton_fire_clip", "write_gated", "clips"],
    ["ableton_stop_clip", "write_gated", "clips"],
    ["ableton_duplicate_scene", "write_gated", "scenes"],
    ["ableton_duplicate_clip", "write_gated", "clips"],
    ["ableton_move_clip", "write_gated", "clips"],
    ["ableton_arm_track", "write_gated", "tracks"],
    ["ableton_mute_track", "write_gated", "tracks"],
    ["ableton_solo_track", "write_gated", "tracks"],
    ["ableton_set_track_color", "write_gated", "tracks"],
    ["ableton_set_track_volume", "write_gated", "mixer"],
    ["ableton_set_track_pan", "write_gated", "mixer"],
    ["ableton_set_track_send", "write_gated", "mixer"],
    ["ableton_set_return_track_color", "write_gated", "returns"],
    ["ableton_set_return_track_volume", "write_gated", "mixer"],
    ["ableton_set_return_track_pan", "write_gated", "mixer"],
    ["ableton_set_master_volume", "write_gated", "mixer"],
    ["ableton_set_master_pan", "write_gated", "mixer"],
    ["ableton_set_device_parameter", "write_gated", "devices"],
    ["ableton_rename_track", "write_gated", "tracks"],
    ["ableton_rename_return_track", "write_gated", "returns"],
    ["ableton_rename_scene", "write_gated", "scenes"],
    ["ableton_rename_clip", "write_gated", "clips"],
    ["ableton_create_arrangement_marker", "write_gated", "arrangement"],
    ["ableton_insert_instrument", "unsupported", "devices"],
    ["ableton_insert_effect", "unsupported", "devices"],
    ["ableton_map_macro", "unsupported", "devices"],
    ["ableton_apply_groove", "unsupported", "groove"],
    ["ableton_create_automation_envelope", "unsupported", "automation"],
    ["ableton_set_automation_point", "unsupported", "automation"],
    ["ableton_simplify_automation", "unsupported", "automation"],
    ["ableton_quantize_clip", "unsupported", "midi"],
    ["ableton_humanize_midi_clip", "write_gated", "midi"]
  ];
  var summary = {};
  for (var i = 0; i < actions.length; i += 1) {
    summary[actions[i][1]] = (summary[actions[i][1]] || 0) + 1;
  }
  return {
    protocol: "ableton-mcp-liveapi-v1",
    bridge: "ableton-mcp-liveapi",
    version: 1,
    generatedAt: new Date().toISOString(),
    summary: summary,
    gates: {
      writes: "MCP must set dry_run=false and ABLETON_MCP_ENABLE_WRITE=1 before sending write actions.",
      uiFallback: "UI driver remains separate and requires ABLETON_MCP_ENABLE_UI_CONTROL=1."
    },
    actions: actions.map(function (entry) {
      return {
        action: entry[0],
        status: entry[1],
        domain: entry[2],
        write_gated: entry[1] === "write_gated"
      };
    })
  };
}

function dispatch(action, payload) {
  if (action === "ping") return { heartbeat: new Date().toISOString(), bridge: "ableton-mcp-liveapi", version: 1 };
  if (action === "bridge_capabilities") return bridgeCapabilities();
  if (action === "live_state") return liveState();
  if (action === "transport") return { is_playing: safeGet(liveObject("live_set"), "is_playing", null), current_song_time: safeGet(liveObject("live_set"), "current_song_time", null) };
  if (action === "tempo") return { tempo: safeGet(liveObject("live_set"), "tempo", null) };
  if (action === "full_snapshot") return fullSnapshot();
  if (action === "snapshot_diff") return snapshotDiff();
  if (action === "list_tracks") return { tracks: listTracks(false, false) };
  if (action === "list_return_tracks") return { return_tracks: listReturnTracks(false) };
  if (action === "master_track") return { master_track: summarizeMasterTrack(false) };
  if (action === "track_mixer") return getTrackMixer(payload);
  if (action === "routing_overview") return routingOverview(payload);
  if (action === "return_track_mixer") return getReturnTrackMixer(payload);
  if (action === "list_scenes") return { scenes: listScenes() };
  if (action === "arrangement_markers") return listArrangementMarkers();
  if (action === "list_clips") return { clips: listClips() };
  if (action === "list_clip_slots") return listClipSlots(payload);
  if (action === "clip_notes") return getClipNotes(payload);
  if (action === "clip_envelopes") return getClipEnvelopes(payload);
  if (action === "list_devices") return listDevices(payload);
  if (action === "list_device_parameters") return listDeviceParameters(payload);
  if (action === "device_parameter_map") return listDeviceParameters(payload);
  if (action === "automation_summary") return automationSummary(payload);
  if (action === "selected_track") return { track: summarizeTrack(selectedTrackIndex(), false, false) };
  if (action === "selected_device") return listDeviceParameters({ track_id: selectedTrackIndex(), device_id: 0 });
  if (action === "set_tempo" || action === "ableton_set_tempo") return setTempo(payload);
  if (action === "transport_control" || action === "ableton_transport_control") return transportControl(payload);
  if (action === "ableton_create_audio_track") return createTrack("audio", payload);
  if (action === "ableton_create_midi_track") return createTrack("midi", payload);
  if (action === "ableton_create_return_track") return createTrack("return", payload);
  if (action === "ableton_create_scene") return createScene(payload);
  if (action === "ableton_create_clip" || action === "ableton_create_midi_clip") return createClip(payload);
  if (action === "ableton_insert_midi_notes") return insertMidiNotes(payload);
  if (action === "ableton_load_preset_or_sample") return loadPresetOrSample(payload);
  if (action === "ableton_set_clip_loop") return setClipLoop(payload);
  if (action === "ableton_set_clip_gain") return setClipGain(payload);
  if (action === "ableton_transpose_clip") return transposeClip(payload);
  if (action === "ableton_set_clip_warp") return setClipWarp(payload);
  if (action === "ableton_set_clip_markers") return setClipMarkers(payload);
  if (action === "ableton_fire_clip") return fireClip(payload);
  if (action === "ableton_stop_clip") return stopClip(payload);
  if (action === "ableton_arm_track") return setTrackBoolean(payload, "arm");
  if (action === "ableton_mute_track") return setTrackBoolean(payload, "mute");
  if (action === "ableton_solo_track") return setTrackBoolean(payload, "solo");
  if (action === "ableton_set_track_color") return setTrackColor(payload);
  if (action === "ableton_set_track_volume") return setMixerParameter(payload, "volume", 0, 1);
  if (action === "ableton_set_track_pan") return setMixerParameter(payload, "panning", -1, 1);
  if (action === "ableton_set_track_send") return setTrackSend(payload);
  if (action === "ableton_set_return_track_color") return setReturnTrackColor(payload);
  if (action === "ableton_set_return_track_volume") return setReturnMixerParameter(payload, "volume", 0, 1);
  if (action === "ableton_set_return_track_pan") return setReturnMixerParameter(payload, "panning", -1, 1);
  if (action === "ableton_set_master_volume") return setMasterMixerParameter(payload, "volume", 0, 1);
  if (action === "ableton_set_master_pan") return setMasterMixerParameter(payload, "panning", -1, 1);
  if (action === "ableton_insert_instrument" || action === "ableton_insert_effect") return unsupportedDeviceInsertion(action, payload);
  if (action === "ableton_set_device_parameter") return setDeviceParameter(payload);
  if (action === "ableton_rename_track") return renameTrack(payload);
  if (action === "ableton_rename_return_track") return renameReturnTrack(payload);
  if (action === "ableton_rename_scene") return renameScene(payload);
  if (action === "ableton_rename_clip") return renameClip(payload);
  if (action === "ableton_set_clip_color") return setClipColor(payload);
  if (action === "ableton_create_automation_envelope") return createAutomationEnvelope(payload);
  if (action === "ableton_set_automation_point") return setAutomationPoint(payload);
  if (action === "ableton_simplify_automation") return simplifyAutomation(payload);
  if (action === "ableton_create_arrangement_marker") return createArrangementMarker(payload);
  if (action === "ableton_fire_scene") return fireScene(payload);
  if (action === "ableton_set_scene_tempo") return setSceneTempo(payload);
  if (action === "ableton_set_scene_time_signature") return setSceneTimeSignature(payload);
  if (action === "ableton_set_scene_color") return setSceneColor(payload);
  if (action === "ableton_duplicate_scene") return duplicateScene(payload);
  if (action === "ableton_duplicate_clip") return duplicateClip(payload);
  if (action === "ableton_move_clip") return moveClip(payload);
  if (action === "ableton_quantize_clip") return quantizeClip(payload);
  if (action === "ableton_humanize_midi_clip") return humanizeMidiClip(payload);
  return unsupported(action, "Action is registered on the MCP side but not implemented in the v1 LiveAPI bridge yet.", {});
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
