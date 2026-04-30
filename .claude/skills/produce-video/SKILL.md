---
name: produce-video
description: |
  Produce a marketing video from a script JSON file. Generates TTS narration
  (ElevenLabs v3), AI video clips (Kling 2.5 Pro), and assembles with
  subtitles into a final vertical TikTok video.
user-invocable: true
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
---

# Produce Video

Generate a finished marketing video from a script JSON.

## Steps

1. **Identify the script**: The user provides a path like `marketing/stories/script-01-am-i-just-boring.json`. If no path given, list available scripts with `ls marketing/stories/script-*.json`.

2. **Check prerequisites**:
   - `FAL_KEY` must be in `.env` or exported
   - Python deps: `pip install fal-client requests`
   - FFmpeg: `brew install ffmpeg`

3. **Run the pipeline**:
   ```bash
   ./scripts/produce-video.sh <script.json>
   ```
   Or with a specific voice:
   ```bash
   ./scripts/produce-video.sh <script.json> --voice Daniel
   ```

4. **Monitor progress**: The script prints step-by-step progress (TTS, video gen, subtitles, assembly). Video generation is the slowest step (~2-5 min per clip).

5. **Handle errors**: If a step fails, the script exits with an error. Fix the issue and re-run — it resumes from where it left off (existing files are skipped).

6. **Report results**: When done, report:
   - Output path: `marketing/stories/output/{slug}/final.mp4`
   - Duration and cost breakdown
   - Suggest the user preview the video

## Available Voices

Warm male (recommended for current scripts): `Brian`, `Daniel`, `George`, `Liam`
Female options: `Rachel`, `Aria`, `Sarah`, `Laura`, `Charlotte`

## Cost Estimate

| Component | Per Video |
|-----------|----------|
| TTS (ElevenLabs v3) | ~$0.12 |
| Video (Kling 2.5 Pro) | ~$5-7 |
| **Total** | **~$5-8** |

## Output Structure

```
marketing/stories/output/{slug}/
  audio/       # TTS .mp3 + timestamp .json per scene
  video/       # Kling .mp4 clips per scene
  combined/    # Per-scene video+audio composites
  subtitles.ass
  concat.txt
  final.mp4    # The finished video
```
