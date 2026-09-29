#!/usr/bin/env bash
# Full build: cue sheet -> score -> frames -> master -> social encode.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p out dist
FF=${FFMPEG:-$(python3 -c "import imageio_ffmpeg as i; print(i.get_ffmpeg_exe())")}
node src/render.mjs cues out/cues.json
python3 src/audio.py out/cues.json out/score.wav
node src/render.mjs video out/silent.mp4
"$FF" -y -loglevel error -i out/silent.mp4 -i out/score.wav -af "loudnorm=I=-14:TP=-1.0:LRA=9" -ar 48000 \
  -c:v copy -c:a aac -b:a 256k -shortest -movflags +faststart out/rooune-master.mp4
"$FF" -y -loglevel error -i out/rooune-master.mp4 -c:v libx264 -preset slow -crf 21 -tune grain -pix_fmt yuv420p \
  -c:a copy -movflags +faststart dist/rooune-run-past-them-1080x1920.mp4
echo "done -> dist/rooune-run-past-them-1080x1920.mp4"
