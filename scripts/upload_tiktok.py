#!/usr/bin/env python3
"""
upload_tiktok.py — Upload a video to TikTok via Playwright with Chrome cookies.

Extracts TikTok session cookies from your local Chrome (via browser_cookie3),
launches a fresh Playwright Chromium with those cookies, then uploads the video
and (unless --dry-run) clicks Post.

Fully non-interactive: never blocks on stdin. All debug screenshots are saved
into the video's output directory so a /reddit-story run can show them on failure.

Usage:
    .venv/bin/python scripts/upload_tiktok.py \\
        --video marketing/stories/output/my-story/final.mp4 \\
        --caption "My story title #hashtag1 #hashtag2"

    # Dry run — uploads + sets caption but does not click Post:
    .venv/bin/python scripts/upload_tiktok.py \\
        --video marketing/stories/output/my-story/final.mp4 \\
        --caption "My story title" \\
        --dry-run

Requirements (handled by the project venv):
    .venv/bin/pip install browser-cookie3 playwright
    .venv/bin/playwright install chromium
"""

import argparse
import sys
import time
from pathlib import Path

import browser_cookie3
from playwright.sync_api import sync_playwright


TIKTOK_UPLOAD_URL = "https://www.tiktok.com/tiktokstudio/upload?from=upload&lang=en"
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)


def log(msg: str) -> None:
    print(f"[upload_tiktok] {msg}", flush=True)


def extract_tiktok_cookies():
    log("extracting TikTok cookies from Chrome…")
    cj = browser_cookie3.chrome(domain_name=".tiktok.com")
    cookies = []
    for c in cj:
        cookie = {
            "name": c.name,
            "value": c.value,
            "domain": c.domain,
            "path": c.path or "/",
        }
        if c.secure:
            cookie["secure"] = True
        if c.expires:
            cookie["expires"] = c.expires
        cookies.append(cookie)
    log(f"found {len(cookies)} cookies")
    return cookies


def wait_for_upload_complete(page, timeout: int = 180) -> bool:
    log("waiting for TikTok to finish ingesting the video…")
    start = time.time()
    while time.time() - start < timeout:
        try:
            done = page.evaluate(
                """() => {
                    const text = document.body.innerText || '';
                    return text.includes('Uploaded') ||
                           text.includes('uploaded') ||
                           text.includes('Change video') ||
                           text.includes('Edit video') ||
                           document.querySelector('[class*="reupload"]') !== null;
                }"""
            )
            if done:
                log("upload complete")
                return True
        except Exception:
            pass
        time.sleep(2)
    log("upload wait timed out")
    return False


def dismiss_overlays(page) -> None:
    """Dismiss TikTok Studio onboarding tour (react-joyride) only. Surgical:
    only touches the joyride portal — other tooltips/popovers belong to the
    real UI and removing them crashes the page."""
    # Try clicking the joyride "Got it" / "Skip" button first (proper flow).
    for label in ('Got it', 'Skip', 'Next', 'Close'):
        try:
            btn = page.query_selector(
                f'#react-joyride-portal button:has-text("{label}")'
            )
            if btn:
                btn.click(timeout=2000)
                time.sleep(0.4)
        except Exception:
            pass
    # Then remove the joyride portal entirely if it's still in the DOM.
    try:
        page.evaluate(
            """() => {
                const portal = document.getElementById('react-joyride-portal');
                if (portal) portal.remove();
            }"""
        )
    except Exception as e:
        log(f"dismiss_overlays JS failed (non-fatal): {e}")


def shot(page, out_dir: Path, name: str) -> None:
    try:
        path = out_dir / f"tiktok-{name}.png"
        page.screenshot(path=str(path))
        log(f"screenshot: {path}")
    except Exception as e:
        log(f"screenshot {name} failed: {e}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Upload video to TikTok")
    parser.add_argument("--video", required=True, help="Path to video file")
    parser.add_argument("--caption", required=True, help="Caption text with hashtags")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Upload + set caption but do not click Post; closes browser after.",
    )
    parser.add_argument(
        "--headful",
        action="store_true",
        default=True,
        help="(default) show the browser window so you can watch / intervene.",
    )
    parser.add_argument(
        "--headless",
        dest="headful",
        action="store_false",
        help="Run Chromium headless (TikTok may detect this and block).",
    )
    args = parser.parse_args()

    video_path = Path(args.video).resolve()
    if not video_path.exists():
        log(f"ERROR: video not found: {video_path}")
        return 1

    out_dir = video_path.parent
    log(f"video: {video_path}")
    log(f"caption: {args.caption}")
    log(f"size: {video_path.stat().st_size / (1024 * 1024):.1f}MB")
    log(f"debug screenshots will be written under: {out_dir}")

    cookies = extract_tiktok_cookies()
    if not cookies:
        log("ERROR: no TikTok cookies found. Log in to tiktok.com in Chrome first.")
        return 1

    with sync_playwright() as p:
        log(f"launching Chromium (headful={args.headful})…")
        browser = p.chromium.launch(
            headless=not args.headful,
            args=["--disable-blink-features=AutomationControlled"],
        )
        context = browser.new_context(
            viewport={"width": 1440, "height": 1500},
            user_agent=USER_AGENT,
        )
        context.add_cookies(cookies)

        page = context.new_page()
        log("navigating to TikTok Studio upload…")
        page.goto(TIKTOK_UPLOAD_URL, wait_until="domcontentloaded")
        time.sleep(4)

        if "login" in page.url.lower():
            log("ERROR: TikTok redirected to login. Cookies expired or wrong account.")
            shot(page, out_dir, "login-redirect")
            browser.close()
            return 2

        log("logged in. locating file input (page + iframes)…")
        shot(page, out_dir, "before-upload")

        file_input = None
        deadline = time.time() + 20
        while time.time() < deadline and file_input is None:
            for frame in page.frames:
                try:
                    el = frame.query_selector('input[type="file"]')
                except Exception:
                    el = None
                if el is not None:
                    file_input = el
                    log(f"found file input in frame: {frame.url or '(main)'}")
                    break
            if file_input is None:
                time.sleep(1)

        if file_input is None:
            log("ERROR: could not find file upload input in page or any iframe")
            shot(page, out_dir, "no-file-input")
            browser.close()
            return 3

        log(f"uploading {video_path.name}…")
        file_input.set_input_files(str(video_path))

        if not wait_for_upload_complete(page):
            log("WARNING: upload completion not detected; continuing anyway")

        time.sleep(3)
        dismiss_overlays(page)
        time.sleep(0.5)
        shot(page, out_dir, "after-upload")

        log("setting caption…")
        try:
            caption_editor = page.wait_for_selector(
                '[contenteditable="true"]', timeout=15000
            )
            dismiss_overlays(page)
            time.sleep(0.3)
            caption_editor.click()
            time.sleep(0.3)
            page.keyboard.press("Meta+a")
            page.keyboard.press("Backspace")
            time.sleep(0.3)
            page.keyboard.type(args.caption, delay=25)
            log(f"caption set ({len(args.caption)} chars)")
        except Exception as e:
            log(f"WARNING: could not set caption automatically: {e}")
            shot(page, out_dir, "caption-failed")

        time.sleep(2)
        shot(page, out_dir, "before-post")

        if args.dry_run:
            log("DRY RUN — not clicking Post. Closing in 8s.")
            time.sleep(8)
            browser.close()
            return 0

        # Scroll the upload form so the Post button is in view.
        page.evaluate("window.scrollTo(0, document.body.scrollHeight);")
        time.sleep(1)
        dismiss_overlays(page)

        log("looking for Post button…")
        # The Post button is the *last* visible button on the page whose text
        # is exactly 'Post' or 'Publish'. Other 'Post' substrings (sidebar
        # links like 'Posts', 'Schedule a post') would otherwise match.
        post_btn = None
        try:
            candidates = page.evaluate(
                """() => {
                    const out = [];
                    document.querySelectorAll('button').forEach((b, i) => {
                        const t = (b.innerText || '').trim();
                        if (t === 'Post' || t === 'Publish') {
                            const r = b.getBoundingClientRect();
                            out.push({
                                idx: i,
                                text: t,
                                disabled: b.disabled,
                                visible: r.width > 0 && r.height > 0,
                                x: Math.round(r.x), y: Math.round(r.y),
                            });
                        }
                    });
                    return out;
                }"""
            )
            log(f"post-button candidates: {candidates}")
            visible_enabled = [c for c in candidates if c["visible"] and not c["disabled"]]
            if not visible_enabled:
                raise RuntimeError("no enabled+visible Post button found")
            # Choose the bottom-most one.
            target = max(visible_enabled, key=lambda c: c["y"])
            post_btn = page.evaluate_handle(
                f"document.querySelectorAll('button')[{target['idx']}]"
            ).as_element()
        except Exception as e:
            log(f"ERROR: post button not found: {e}")
            shot(page, out_dir, "no-post-button")
            browser.close()
            return 4

        log("clicking Post…")
        post_btn.click()
        time.sleep(3)

        # TikTok may show a confirmation modal: "Continue to post? Copyright
        # check is incomplete." with a "Post now" button. Click through it.
        for label in ("Post now", "Post Now", "Continue", "Confirm"):
            try:
                btn = page.query_selector(f'button:has-text("{label}")')
                if btn and btn.is_visible() and btn.is_enabled():
                    log(f"confirming via '{label}' button…")
                    btn.click()
                    time.sleep(3)
                    break
            except Exception:
                pass

        # Wait for either redirect (success) or stable success indicator.
        success = False
        for _ in range(15):
            try:
                url_now = page.url
                body_text = page.evaluate("() => document.body.innerText || ''")
                if (
                    "/upload" not in url_now
                    or "Your video is being uploaded" in body_text
                    or "Your video is being posted" in body_text
                    or "Posted" in body_text
                ):
                    success = True
                    break
            except Exception:
                pass
            time.sleep(2)

        time.sleep(3)
        shot(page, out_dir, "posted")
        if success:
            log(f"posted. final URL: {page.url}")
        else:
            log("WARNING: no clear success signal. Check the screenshot.")
        browser.close()
        return 0 if success else 6


if __name__ == "__main__":
    sys.exit(main())
