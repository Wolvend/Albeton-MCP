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
    devices: devices
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
    panning: summarizeParameter(panning, 1)
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

function listClipSlots(payload) {
  var trackIndex = parseIndex(payload, "track_id");
  if (trackIndex === null) trackIndex = selectedTrackIndex();
  var trackApi = liveObject("live_set tracks " + trackIndex);
  var count = childCount(trackApi, "clip_slots");
  var slots = [];
  for (var i = 0; i < count; i += 1) {
    slots.push(summarizeClipSlot(trackIndex, i));
  }
  return { track_index: trackIndex, clip_slots: slots };
}

function getTrackMixer(payload) {
  var trackIndex = parseIndex(payload, "track_id");
  if (trackIndex === null) trackIndex = selectedTrackIndex();
  return { track_index: trackIndex, mixer: mixerSummary("live_set tracks " + trackIndex) };
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
  return { track_index: target.track_index, slot_index: target.slot_index, length: length, result: result };
}

function fireClip(payload) {
  var target = clipSlotFromPayload(payload);
  return { track_index: target.track_index, slot_index: target.slot_index, result: safeCall(target.slot, "fire") };
}

function stopClip(payload) {
  var trackIndex = parseIndex(payload, "track_id");
  if (trackIndex === null) trackIndex = selectedTrackIndex();
  var slotIndex = parseIndex(payload, "slot_index");
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

function setMixerParameter(payload, parameterName, minValue, maxValue) {
  var trackIndex = parseIndex(payload, "track_id");
  if (trackIndex === null) trackIndex = selectedTrackIndex();
  var value = Number(payload && payload.value);
  if (!isFinite(value) || value < minValue || value > maxValue) {
    throw new Error(parameterName + " value must be between " + minValue + " and " + maxValue + ".");
  }
  var parameter = liveObject("live_set tracks " + trackIndex + " mixer_device " + parameterName);
  parameter.set("value", value);
  return { track_index: trackIndex, parameter: parameterName, value: safeGet(parameter, "value", null) };
}

function setTrackSend(payload) {
  var trackIndex = parseIndex(payload, "track_id");
  if (trackIndex === null) trackIndex = selectedTrackIndex();
  var sendIndex = parseRequiredIndex(payload, "send_index");
  var value = Number(payload && payload.value);
  if (!isFinite(value) || value < 0 || value > 1) throw new Error("Send value must be between 0 and 1.");
  var parameter = liveObject("live_set tracks " + trackIndex + " mixer_device sends " + sendIndex);
  parameter.set("value", value);
  return { track_index: trackIndex, send_index: sendIndex, value: safeGet(parameter, "value", null) };
}

function setDeviceParameter(payload) {
  var trackIndex = parseIndex(payload, "track_id");
  if (trackIndex === null) trackIndex = selectedTrackIndex();
  var deviceIndex = parseIndex(payload, "device_id");
  if (deviceIndex === null) deviceIndex = 0;
  var parameterIndex = parseIndex(payload, "parameter_id");
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
  var notes = safeCall(clip, "get_notes_extended", [0, 0, 128, 128]);
  if (!callSucceeded(notes)) {
    notes = safeCall(clip, "get_notes", [0, 0, 128, 128]);
  }
  if (!callSucceeded(notes)) return unsupported("clip_notes", "MIDI note read methods are unavailable from this LiveAPI context.", { track_index: trackIndex, clip_slot_index: slotIndex, result: notes });
  return { track_index: trackIndex, clip_slot_index: slotIndex, notes: notes };
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
  return unsupported("ableton_humanize_midi_clip", "MIDI note rewriting needs reviewed get/apply note support for this Ableton version.", { track_index: target.track_index, clip_slot_index: target.slot_index, timing_amount: payload && payload.timing_amount, velocity_amount: payload && payload.velocity_amount });
}

function dispatch(action, payload) {
  if (action === "ping") return { heartbeat: new Date().toISOString(), bridge: "ableton-mcp-liveapi", version: 1 };
  if (action === "live_state") return liveState();
  if (action === "transport") return { is_playing: safeGet(liveObject("live_set"), "is_playing", null), current_song_time: safeGet(liveObject("live_set"), "current_song_time", null) };
  if (action === "tempo") return { tempo: safeGet(liveObject("live_set"), "tempo", null) };
  if (action === "full_snapshot") return fullSnapshot();
  if (action === "snapshot_diff") return snapshotDiff();
  if (action === "list_tracks") return { tracks: listTracks(false, false) };
  if (action === "list_return_tracks") return { return_tracks: listReturnTracks(false) };
  if (action === "master_track") return { master_track: summarizeMasterTrack(false) };
  if (action === "track_mixer") return getTrackMixer(payload);
  if (action === "list_scenes") return { scenes: listScenes() };
  if (action === "arrangement_markers") return listArrangementMarkers();
  if (action === "list_clips") return { clips: listClips() };
  if (action === "list_clip_slots") return listClipSlots(payload);
  if (action === "clip_notes") return getClipNotes(payload);
  if (action === "clip_envelopes") return getClipEnvelopes(payload);
  if (action === "list_devices") return listDevices(payload);
  if (action === "list_device_parameters") return listDeviceParameters(payload);
  if (action === "device_parameter_map") return listDeviceParameters(payload);
  if (action === "selected_track") return { track: summarizeTrack(selectedTrackIndex(), false, false) };
  if (action === "selected_device") return listDeviceParameters({ track_id: selectedTrackIndex(), device_id: 0 });
  if (action === "set_tempo" || action === "ableton_set_tempo") return setTempo(payload);
  if (action === "transport_control" || action === "ableton_transport_control") return transportControl(payload);
  if (action === "ableton_create_audio_track") return createTrack("audio", payload);
  if (action === "ableton_create_midi_track") return createTrack("midi", payload);
  if (action === "ableton_create_return_track") return createTrack("return", payload);
  if (action === "ableton_create_scene") return createScene(payload);
  if (action === "ableton_create_clip" || action === "ableton_create_midi_clip") return createClip(payload);
  if (action === "ableton_set_clip_loop") return setClipLoop(payload);
  if (action === "ableton_fire_clip") return fireClip(payload);
  if (action === "ableton_stop_clip") return stopClip(payload);
  if (action === "ableton_arm_track") return setTrackBoolean(payload, "arm");
  if (action === "ableton_mute_track") return setTrackBoolean(payload, "mute");
  if (action === "ableton_solo_track") return setTrackBoolean(payload, "solo");
  if (action === "ableton_set_track_volume") return setMixerParameter(payload, "volume", 0, 1);
  if (action === "ableton_set_track_pan") return setMixerParameter(payload, "panning", -1, 1);
  if (action === "ableton_set_track_send") return setTrackSend(payload);
  if (action === "ableton_set_device_parameter") return setDeviceParameter(payload);
  if (action === "ableton_rename_track") return renameTrack(payload);
  if (action === "ableton_rename_clip") return renameClip(payload);
  if (action === "ableton_create_automation_envelope") return createAutomationEnvelope(payload);
  if (action === "ableton_set_automation_point") return setAutomationPoint(payload);
  if (action === "ableton_simplify_automation") return simplifyAutomation(payload);
  if (action === "ableton_create_arrangement_marker") return createArrangementMarker(payload);
  if (action === "ableton_duplicate_scene") return duplicateScene(payload);
  if (action === "ableton_duplicate_clip") return duplicateClip(payload);
  if (action === "ableton_move_clip") return moveClip(payload);
  if (action === "ableton_quantize_clip") return quantizeClip(payload);
  if (action === "ableton_humanize_midi_clip") return humanizeMidiClip(payload);
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
