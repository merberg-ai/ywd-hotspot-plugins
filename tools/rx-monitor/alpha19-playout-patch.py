#!/usr/bin/env python3
from __future__ import annotations

import pathlib
import sys

path = pathlib.Path(sys.argv[1])
text = path.read_text()

old_reset = """    } else if (event.type === 'reset') {
      streamResets += 1;
      resetLastMs = Number(event.reset_ms) || 0;
      resetMaxMs = Math.max(resetMaxMs, resetLastMs);
      resetLocalPlayback({stopSources:true});
      setDecoderState('RESETTING', 'active');
      setAudioState('BUFFERING', 'active');
"""
new_reset = """    } else if (event.type === 'reset') {
      streamResets += 1;
      resetLastMs = Number(event.reset_ms) || 0;
      resetMaxMs = Math.max(resetMaxMs, resetLastMs);
      // Decoder state resets are normal at DMR talker/route boundaries. Keep
      // already scheduled PCM playing; explicit drop/error events still flush
      // and rebuffer when continuity was actually lost.
      setDecoderState('RESETTING', 'active');
"""
if text.count(old_reset) != 1:
    raise SystemExit('Alpha19 reset-handler marker changed')
text = text.replace(old_reset, new_reset)

old_pcm = """        enqueueChunk(pcm, CHUNK_MS);
        setDecoderState(backendName, 'good');
"""
new_pcm = """        enqueueChunk(pcm, CHUNK_MS);
        setDecoderState(backendName, 'good');
        setNote('Phase 3J streamed PCM path active. DMR recovery and vocoder batching run in trusted core; the sandbox receives PCM only.');
"""
if text.count(old_pcm) != 1:
    raise SystemExit('Alpha19 PCM-success marker changed')
text = text.replace(old_pcm, new_pcm)

old_label = '<article><div class="label">KEEPALIVE</div><div class="rx-audio-value" id="rxAudioKeepalive">0 / 0 err</div></article>'
new_label = '<article><div class="label">HEARTBEATS</div><div class="rx-audio-value" id="rxAudioKeepalive">0 / 0 err</div></article>'
if text.count(old_label) != 1:
    raise SystemExit('Alpha19 heartbeat-label marker changed')
text = text.replace(old_label, new_label)

path.write_text(text)
