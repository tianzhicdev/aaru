#!/usr/bin/env python3
"""
upload_tiktok.py — Upload a video to TikTok via Playwright with cookies from Chrome.

Extracts TikTok session cookies from your running Chrome (via browser_cookie3),
injects them into a fresh Playwright Chromium instance, and automates the upload.

Usage:
    python scripts/upload_tiktok.py \
        --video marketing/stories/output/my-story/final.mp4 \
        --caption "My story title #hashtag1 #hashtag2"

    # Dry run (stops before clicking Post):
    python scripts/upload_tiktok.py \
        --video marketing/stories/output/my-story/final.mp4 \
        --caption "My story title" \
        --dry-run

Requirements:
    pip install playwright browser-cookie3
    playwright install chromium
"""

import argparse
import sys
import time
from pathlib import Path

import browser_cookie3
from playwright.sync_api import sync_playwright


TIKTOK_UPLOAD_URL = "https://www.tiktok.com/tiktokstudio/upload?from=upload&lang=en"


def extract_tiktok_cookies():
    """Extract TikTok cookies from Chrome."""
    print("  Extracting TikTok cookies from Chrome...")
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
    print(f"  Found {len(cookies)} cookies")
    return cookies


def wait_for_upload_complete(page, timeout=120):
    """Wait for the video to finish uploading."""
    print("  Waiting for video upload to complete...", end="", flush=True)
    start = time.time()
    while time.time() - start < timeout:
        try:
            done = page.evaluate("""() => {
                const text = document.body.innerText;
                return text.includes('Uploaded') ||
                       text.includes('uploaded') ||
                       text.includes('Change video') ||
                       text.includes('Edit video') ||
                       document.querySelector('[class*="reupload"]') !== null;
            }""")
            if done:
                print(" done")
                return True
        except Exception:
            pass
        time.sleep(2)
    print(" timeout")
    return False


def main():
    parser = argparse.ArgumentParser(description="Upload video to TikTok")
    parser.add_argument("--video", required=True, help="Path to video file")
    parser.add_argument("--caption", required=True, help="Caption text with hashtags")
    parser.add_argument("--dry-run", action="store_true", help="Stop before clicking Post")
    args = parser.parse_args()

    video_path = Path(args.video).resolve()
    if not video_path.exists():
        print(f"Error: video not found: {video_path}")
        sys.exit(1)

    print(f"  Video: {video_path}")
    print(f"  Caption: {args.caption}")
    print(f"  Size: {video_path.stat().st_size / (1024*1024):.1f}MB")

    # Extract cookies first (while Chrome is running — that's fine)
    cookies = extract_tiktok_cookies()
    if not cookies:
        print("  ERROR: No TikTok cookies found. Log in to tiktok.com in Chrome first.")
        sys.exit(1)

    with sync_playwright() as p:
        # Launch a fresh Chromium (not Chrome — avoids profile lock)
        print("\n  Launching Chromium...")
        browser = p.chromium.launch(
            headless=False,
            args=["--disable-blink-features=AutomationControlled"],
        )
        context = browser.new_context(
            viewport={"width": 1280, "height": 900},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        )

        # Inject cookies
        print("  Injecting cookies...")
        context.add_cookies(cookies)

        page = context.new_page()

        # Navigate to TikTok upload
        print("  Navigating to TikTok Studio upload...")
        page.goto(TIKTOK_UPLOAD_URL, wait_until="domcontentloaded")
        time.sleep(4)

        # Check if logged in
        if "login" in page.url.lower():
            print("\n  ERROR: Cookies didn't work — TikTok redirected to login.")
            print("  Your session may have expired. Log in again in Chrome and retry.")
            page.screenshot(path="/tmp/tiktok-login-debug.png")
            print("  Screenshot: /tmp/tiktok-login-debug.png")
            input("  Press Enter to close...")
            browser.close()
            sys.exit(1)

        print("  Logged in! Looking for upload area...")
        time.sleep(2)

        # Screenshot current state for debugging
        page.screenshot(path="/tmp/tiktok-upload-state.png")

        # Find the file input and upload
        file_input = page.query_selector('input[type="file"]')
        if not file_input:
            try:
                file_input = page.wait_for_selector('input[type="file"]', timeout=10000)
            except Exception:
                print("  ERROR: Could not find file upload input.")
                page.screenshot(path="/tmp/tiktok-upload-debug.png")
                print("  Screenshot: /tmp/tiktok-upload-debug.png")
                input("  Press Enter to close...")
                browser.close()
                sys.exit(1)

        print(f"  Uploading {video_path.name}...")
        file_input.set_input_files(str(video_path))

        # Wait for upload to complete
        if not wait_for_upload_complete(page):
            print("  WARNING: Upload may not have completed. Continuing anyway...")

        time.sleep(3)
        page.screenshot(path="/tmp/tiktok-after-upload.png")

        # Find and fill caption
        print("  Setting caption...")
        try:
            caption_editor = page.wait_for_selector(
                '[contenteditable="true"]',
                timeout=10000,
            )
            if caption_editor:
                caption_editor.click()
                time.sleep(0.3)
                page.keyboard.press("Meta+a")
                page.keyboard.press("Backspace")
                time.sleep(0.5)
                page.keyboard.type(args.caption, delay=30)
                print(f"  Caption set: {args.caption[:60]}...")
        except Exception as e:
            print(f"  WARNING: Could not set caption: {e}")
            print("  Type the caption manually in the browser window.")

        time.sleep(2)
        page.screenshot(path="/tmp/tiktok-before-post.png")

        if args.dry_run:
            print("\n  DRY RUN — review in browser window.")
            print("  Screenshots saved to /tmp/tiktok-*.png")
            input("  Press Enter to close browser...")
            browser.close()
            return

        # Click Post button
        print("  Looking for Post button...")
        try:
            post_btn = page.wait_for_selector(
                'button:has-text("Post"), button:has-text("Publish")',
                timeout=10000,
            )
            if post_btn and post_btn.is_enabled():
                print("  Clicking Post...")
                post_btn.click()
                time.sleep(8)
                page.screenshot(path="/tmp/tiktok-posted.png")
                print("\n  Posted! Check your TikTok profile to confirm.")
            else:
                print("  Post button found but disabled. Check the browser window.")
                input("  Press Enter to close...")
        except Exception as e:
            print(f"  Could not find Post button: {e}")
            print("  Click Post manually in the browser window.")
            input("  Press Enter to close...")

        browser.close()

    print("\n  Done!")


if __name__ == "__main__":
    main()
