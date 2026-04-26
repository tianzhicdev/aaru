# Reddit Dating App Horror Story — Video Strategy

## Concept

Short-form vertical videos (TikTok/Reels/Shorts) narrating viral Reddit dating app horror stories. The format:

1. **Background**: The actual Reddit post rendered as a dark-mode screenshot, slowly scrolling as the narration progresses
2. **Narration**: Voice-cloned TTS reading a spoken-delivery rewrite of the post (not verbatim — adapted for natural speech cadence)
3. **Subtitles**: Word-level subtitles burned in, synced via Whisper timestamp alignment

## Why This Works

- **Proven viral format**: Reddit story narration is one of the most successful short-form content categories
- **Zero copyright risk**: Reddit posts are user-generated text, narration is original TTS
- **Thematically perfect**: Dating app horror stories naturally position Thumos as the alternative
- **Scalable**: Pipeline is fully automated — just swap in a new story
- **Authentic voice**: Real people's real experiences, not manufactured marketing copy

## Production Pipeline

```
Reddit post → HTML render → screenshot (post.png)
                                ↓
Story text → spoken rewrite → voice clone TTS (minimax) → narration.wav
                                                              ↓
                                              Whisper alignment → timestamps.json
                                                              ↓
                                              ASS subtitles → subtitles.ass
                                                              ↓
                              post.png + narration.wav + subtitles.ass
                                              ↓
                                    FFmpeg assembly (slow scroll + burn subs)
                                              ↓
                                          final.mp4 (1080x1920)
```

## Script

```bash
export FAL_KEY=<your-key>
python scripts/produce_reddit_story.py \
    --voice-ref marketing/stories/tts-auditions/full/csm_1b/audio/scene_01.wav \
    --out marketing/stories/output/reddit-horror/
```

### Voice Reference

The voice is cloned from `csm_1b` (Sesame CSM 1B model outputs). The reference needs to be >= 10 seconds for minimax voice-clone, so we concatenate multiple scene WAVs if needed.

### Editing the Narration

The narration text is embedded in `scripts/produce_reddit_story.py` as `NARRATION`. It's a spoken-delivery rewrite of the Reddit post — shorter sentences, dramatic pauses implied by paragraph breaks, emphasis on punchlines.

Key principles for the rewrite:
- Lead with the setup, not meta-commentary
- Use "So" and "Then" as natural spoken transitions
- Break long sentences into short punchy ones
- Capitalize words that need vocal emphasis (e.g., "INTRODUCE YOU TO MY MOTHER")
- End on the strongest line

## Finding New Stories

Good subreddits:
- r/tifu — "Today I F'd Up" (huge audience, self-contained stories)
- r/dating — general dating disasters
- r/Tinder — Tinder-specific horror stories
- r/hingeapp — Hinge disasters
- r/OnlineDating — cross-platform stories
- r/relationship_advice — dramatic reveals
- r/traumatizeThemBack — revenge/catharsis stories

Search terms: `dating app horror story`, `worst tinder date`, `catfished`, `ghosted`, `dating disaster`

### What Makes a Good Story

1. **Clear narrative arc**: setup → escalation → punchline
2. **Relatable opening**: "Like many unfortunate souls, my dating life..."
3. **Specific absurd detail**: the vial of ashes, the ziploc bacon
4. **Punchy ending**: one-liner that lands
5. **Right length**: 1500-3000 chars original → 60-150s narration
6. **High engagement**: 10K+ upvotes = proven entertaining

## First Video

**Story**: "TIFU By inviting a Tinder date over to my house and accidentally meeting his mother"
- Source: r/tifu, 47.8K upvotes
- Guy shows up looking nothing like his photos, won't stop talking, brings two pieces of bacon in a ziploc, then pulls out a vial of his dead mother's ashes and says "I'd like to INTRODUCE YOU TO MY MOTHER"
- Punchline: "I told him I didn't feel the connection — to him, or his mother."
- Output: `marketing/stories/output/reddit-horror/final.mp4` (2:20, 1080x1920)

## Future Improvements

- [ ] Add background music (lo-fi or tension-building)
- [ ] Animate text highlights as narrator reads each paragraph
- [ ] Add Thumos end card after the story
- [ ] Batch pipeline: feed a list of Reddit URLs, auto-produce all
- [ ] A/B test different voice clones
- [ ] Add sound effects at key moments (record scratch, dramatic pause)
