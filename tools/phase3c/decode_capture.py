#!/usr/bin/env python3
"""Decode YWD DMR RX Monitor capture exports into 8 kHz mono WAV files.

This is a development harness for RX Monitor Phase 3C. It consumes the
already-recovered 49-bit AMBE+2 2450 vocoder frames produced by the plugin and
passes them to a pinned mbelib build through ctypes. The hotspot/Pi is not
involved in decoding.

The capture timestamp is intentionally NOT used as the audio clock. Each
recovered AMBE frame represents 20 ms / 160 samples at 8 kHz and frames are
consumed in capture-array order.
"""
from __future__ import annotations

import argparse
import ctypes
import json
import math
import os
from pathlib import Path
import statistics
import sys
import wave

SAMPLE_RATE = 8000
SAMPLES_PER_FRAME = 160
FRAME_MS = 20
CAPTURE_FORMAT = "ywd-dmr-rx-capture"


class MbeParms(ctypes.Structure):
    _fields_ = [
        ("w0", ctypes.c_float),
        ("L", ctypes.c_int),
        ("K", ctypes.c_int),
        ("Vl", ctypes.c_int * 57),
        ("Ml", ctypes.c_float * 57),
        ("log2Ml", ctypes.c_float * 57),
        ("PHIl", ctypes.c_float * 57),
        ("PSIl", ctypes.c_float * 57),
        ("gamma", ctypes.c_float),
        ("un", ctypes.c_int),
        ("repeat", ctypes.c_int),
    ]


def fail(message: str) -> "NoReturn":
    raise SystemExit(f"ERROR: {message}")


def load_capture(path: Path) -> dict:
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        fail(f"capture not found: {path}")
    except json.JSONDecodeError as exc:
        fail(f"invalid JSON capture: {exc}")
    if doc.get("format") != CAPTURE_FORMAT:
        fail(f"unsupported capture format: {doc.get('format')!r}")
    frames = doc.get("frames")
    if not isinstance(frames, list) or not frames:
        fail("capture contains no frames")
    return doc


def ambe_bits(value: str) -> list[int]:
    """Convert the plugin's 13-nibble MSB-first/right-padded storage to 49 bits."""
    text = str(value or "").strip().lower()
    if len(text) != 13 or any(ch not in "0123456789abcdef" for ch in text):
        raise ValueError(f"invalid AMBE49 storage value: {value!r}")
    # 49 useful bits are left-aligned in 52 storage bits. The final three bits
    # are padding and must be zero.
    raw = int(text, 16)
    if raw & 0x7:
        raise ValueError(f"AMBE49 value has non-zero right padding: {value!r}")
    bit_text = f"{raw:052b}"[:49]
    return [1 if ch == "1" else 0 for ch in bit_text]


def validate_frames(frames: list[dict]) -> dict:
    paths: dict[str, int] = {}
    slots: dict[int, int] = {}
    corrected_frames = 0
    corrected_bits = 0
    malformed = 0
    partial_bursts = 0
    burst_indexes: dict[tuple[str, int], set[int]] = {}

    for frame in frames:
        path = str(frame.get("path") or "unknown")
        paths[path] = paths.get(path, 0) + 1
        try:
            slot = int(frame.get("slot"))
            slots[slot] = slots.get(slot, 0) + 1
        except (TypeError, ValueError):
            pass
        try:
            ambe_bits(frame.get("ambe49"))
        except ValueError:
            malformed += 1
        fec = int(frame.get("fec") or 0)
        if fec:
            corrected_frames += 1
            corrected_bits += fec
        try:
            key = (path, int(frame.get("burst_seq")))
            burst_indexes.setdefault(key, set()).add(int(frame.get("index")))
        except (TypeError, ValueError):
            pass

    for indexes in burst_indexes.values():
        if indexes != {0, 1, 2}:
            partial_bursts += 1

    return {
        "frames": len(frames),
        "duration_s": len(frames) * FRAME_MS / 1000.0,
        "paths": paths,
        "slots": slots,
        "corrected_frames": corrected_frames,
        "corrected_bits": corrected_bits,
        "malformed": malformed,
        "partial_bursts": partial_bursts,
    }


def print_capture_summary(doc: dict) -> None:
    frames = doc["frames"]
    summary = validate_frames(frames)
    plugin = doc.get("plugin") or {}
    counters = (doc.get("capture") or {}).get("session_counters") or {}
    print("=== YWD PHASE 3C CAPTURE ===")
    print(f"Plugin          : {plugin.get('id', '?')} v{plugin.get('version', '?')}")
    print(f"Frames in export: {summary['frames']} ({summary['duration_s']:.2f} s nominal audio)")
    print(f"Paths           : {summary['paths']}")
    print(f"Slots           : {summary['slots']}")
    print(f"FEC in ring     : {summary['corrected_frames']} frames / {summary['corrected_bits']} bits")
    print(f"Malformed AMBE  : {summary['malformed']}")
    print(f"Partial bursts  : {summary['partial_bursts']} (a bounded ring may begin/end mid-burst)")
    if counters:
        print(
            "Session counters: "
            f"recovered={counters.get('recovered_49bit', '?')} "
            f"unrecoverable={counters.get('unrecoverable', '?')} "
            f"sequence_gaps={counters.get('sequence_gaps', '?')}"
        )
    if summary["malformed"]:
        fail("capture contains malformed AMBE49 values")


def load_mbelib(path: Path):
    if not path.exists():
        fail(f"mbelib shared library not found: {path}")
    try:
        lib = ctypes.CDLL(str(path.resolve()))
    except OSError as exc:
        fail(f"unable to load mbelib {path}: {exc}")

    p = ctypes.POINTER(MbeParms)
    lib.mbe_initMbeParms.argtypes = [p, p, p]
    lib.mbe_initMbeParms.restype = None
    lib.mbe_processAmbe2450Data.argtypes = [
        ctypes.POINTER(ctypes.c_short),
        ctypes.POINTER(ctypes.c_int),
        ctypes.POINTER(ctypes.c_int),
        ctypes.POINTER(ctypes.c_char),
        ctypes.POINTER(ctypes.c_char),
        p,
        p,
        p,
        ctypes.c_int,
    ]
    lib.mbe_processAmbe2450Data.restype = None
    return lib


def new_decoder_state(lib):
    state = (MbeParms(), MbeParms(), MbeParms())
    lib.mbe_initMbeParms(*(ctypes.byref(x) for x in state))
    return state


def frame_key(frame: dict) -> tuple:
    return (
        str(frame.get("path") or ""),
        int(frame.get("slot") or 0),
        int(frame.get("src") or 0),
        int(frame.get("dst") or 0),
        bool(frame.get("group", False)),
    )


def decode_frames(lib, frames: list[dict], uvquality: int) -> tuple[list[int], dict]:
    if not frames:
        return [], {"decoded": 0, "resets": 0, "statuses": {}}

    cur, prev, enhanced = new_decoder_state(lib)
    pcm: list[int] = []
    statuses: dict[str, int] = {}
    resets = 0
    previous_key = None
    previous_burst = None
    previous_dmr_seq = None

    for frame in frames:
        key = frame_key(frame)
        burst = int(frame.get("burst_seq") or 0)
        dmr_seq = int(frame.get("dmr_seq") or 0)
        index = int(frame.get("index") or 0)

        reset = previous_key is not None and key != previous_key
        # Only inspect sequence progression when entering a new DMR burst. Three
        # AMBE frames from one burst share the same DMR sequence number.
        if previous_burst is not None and burst != previous_burst and previous_dmr_seq is not None:
            expected = (previous_dmr_seq + 1) & 0xFF
            if dmr_seq != expected:
                reset = True
        if reset:
            cur, prev, enhanced = new_decoder_state(lib)
            resets += 1

        bits = ambe_bits(frame.get("ambe49"))
        ambe = (ctypes.c_char * 49)(*(bytes((bit,)) for bit in bits))
        out = (ctypes.c_short * SAMPLES_PER_FRAME)()
        errs = ctypes.c_int(0)
        errs2 = ctypes.c_int(0)
        errbuf = ctypes.create_string_buffer(128)

        lib.mbe_processAmbe2450Data(
            out,
            ctypes.byref(errs),
            ctypes.byref(errs2),
            errbuf,
            ambe,
            ctypes.byref(cur),
            ctypes.byref(prev),
            ctypes.byref(enhanced),
            uvquality,
        )
        pcm.extend(int(sample) for sample in out)
        status = errbuf.value.decode("ascii", errors="replace")
        if status:
            statuses[status] = statuses.get(status, 0) + 1

        previous_key = key
        previous_burst = burst
        previous_dmr_seq = dmr_seq

    return pcm, {"decoded": len(frames), "resets": resets, "statuses": statuses}


def write_wav(path: Path, samples: list[int]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        # wave.writeframes accepts bytes; explicitly little-endian-pack samples
        # so output is deterministic across hosts.
        buf = bytearray()
        for sample in samples:
            value = max(-32768, min(32767, int(sample)))
            buf.extend(value.to_bytes(2, byteorder="little", signed=True))
        wav.writeframes(bytes(buf))


def pcm_stats(samples: list[int]) -> tuple[int, float]:
    if not samples:
        return 0, 0.0
    peak = max(abs(x) for x in samples)
    rms = math.sqrt(sum(float(x) * float(x) for x in samples) / len(samples))
    return peak, rms


def selected_frames(doc: dict, path: str) -> list[dict]:
    frames = doc["frames"]
    if path == "all":
        return list(frames)
    return [f for f in frames if str(f.get("path") or "").lower() == path]


def output_for(base: Path, path: str, multiple: bool) -> Path:
    if not multiple:
        return base
    stem = base.stem
    suffix = base.suffix or ".wav"
    return base.with_name(f"{stem}-{path}{suffix}")


def main() -> int:
    ap = argparse.ArgumentParser(description="Decode a YWD RX Monitor AMBE49 capture to WAV")
    ap.add_argument("capture", type=Path, help="ywd-dmr-rx-capture-*.json")
    ap.add_argument("--library", type=Path, help="path to pinned libmbe.so")
    ap.add_argument("--path", choices=("network", "rf", "all", "both"), default="both")
    ap.add_argument("--output", type=Path, help="output WAV path/base")
    ap.add_argument("--uvquality", type=int, default=3, choices=range(1, 8), metavar="1..7")
    ap.add_argument("--inspect-only", action="store_true", help="validate/describe capture without decoding")
    args = ap.parse_args()

    doc = load_capture(args.capture)
    print_capture_summary(doc)
    if args.inspect_only:
        return 0
    if args.library is None:
        fail("--library is required for decoding (run setup-mbelib.sh or PHASE3C-DECODE.sh)")

    lib = load_mbelib(args.library)
    if args.output:
        base = args.output
    else:
        base = args.capture.with_suffix(".wav")

    wanted = ("rf", "network") if args.path == "both" else (args.path,)
    multiple = len(wanted) > 1
    print("\n=== DECODER ===")
    print(f"mbelib          : {args.library}")
    print(f"Sample format   : mono 16-bit PCM @ {SAMPLE_RATE} Hz")
    print(f"Audio clock     : {FRAME_MS} ms per recovered AMBE frame (capture timestamps ignored)")

    for path_name in wanted:
        frames = selected_frames(doc, path_name)
        if not frames:
            print(f"{path_name:16}: no frames; skipped")
            continue
        pcm, meta = decode_frames(lib, frames, args.uvquality)
        output = output_for(base, path_name, multiple)
        write_wav(output, pcm)
        peak, rms = pcm_stats(pcm)
        duration = len(pcm) / SAMPLE_RATE
        print(
            f"{path_name:16}: {len(frames)} AMBE frames -> {len(pcm)} samples "
            f"({duration:.2f} s), peak={peak}, rms={rms:.1f}, resets={meta['resets']}"
        )
        if meta["statuses"]:
            print(f"  decoder status: {meta['statuses']}")
        print(f"  WAV: {output}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
