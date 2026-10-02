#!/bin/bash
# Wandelt die Roh-Videos in kleine Web-Versionen um (ohne Ton, 24 fps, leicht entrauscht):
# MP4 (H.264) für Safari/iOS und Chrome, WebM (VP9) als Ersatz, dazu ein Standbild als Poster.
# Vorhandene Dateien werden übersprungen.
# Aufruf: bash tools/encode-videos.sh /pfad/zu/den/pexels-Videos [all|mp4|webm]
SRC=${1:-/mnt/user-data/uploads}; MODE=${2:-all}; OUT="$(dirname "$0")/../assets/video"; mkdir -p "$OUT"
VF="hqdn3d=4:3:6:5,fps=24"
LIST="night|pexels-media-18953366.mp4|720:1280
mosque|pexels-media-34753278.mp4|720:1280
sunset|pexels-media-30362373.mp4|720:1280
clouds|pexels-media-35626338.mp4|1280:720"
FF="ffmpeg -nostdin -y -loglevel error"                                    # -nostdin: sonst frisst ffmpeg die Schleifen-Eingabe
if [ "$MODE" != webm ]; then
  while IFS='|' read -r name file size; do
    [ -s "$OUT/$name.mp4" ] || $FF -i "$SRC/$file" -an -vf "scale=$size:flags=lanczos,$VF" -c:v libx264 -preset medium -crf 32 -pix_fmt yuv420p -movflags +faststart "$OUT/$name.mp4"
    [ -s "$OUT/$name.jpg" ] || $FF -ss 0.6 -i "$SRC/$file" -frames:v 1 -vf "scale=$size:flags=lanczos" -q:v 6 "$OUT/$name.jpg"
    echo "mp4 fertig: $name"
  done <<< "$LIST"
fi
if [ "$MODE" != mp4 ]; then
  while IFS='|' read -r name file size; do
    [ -s "$OUT/$name.webm" ] || $FF -i "$SRC/$file" -an -vf "scale=$size:flags=lanczos,$VF" -c:v libvpx-vp9 -b:v 0 -crf 40 -row-mt 1 -deadline good -cpu-used 5 -pix_fmt yuv420p "$OUT/$name.webm"
    echo "webm fertig: $name"
  done <<< "$LIST"
fi
