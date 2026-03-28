# Deploying Thumos on Cloudflare

This site is authored as a plain static site in `web/` and is intended to be public at:

- `https://tianzhistudio.com/`
- `https://tianzhistudio.com/privacy`
- `https://tianzhistudio.com/support`

## Why this deploy target changed from the original `/thumos` spec

The older website spec in `web/SPEC.md` assumed a Pages project mounted under
`https://tianzhistudio.com/thumos/`.

Current Cloudflare docs say:

- Pages custom domains attach to a domain or subdomain
- URL rewrite rules cannot rewrite hostnames
- origin-rule host header and DNS overrides are Enterprise-only

That means a normal Cloudflare Pages project on a Free, Pro, or Business account should be attached
to the apex domain directly or to a dedicated subdomain. For your request, the cleanest answer is
to publish this site at `https://tianzhistudio.com/`.

## Before you deploy

1. Replace the App Store placeholder URL in:
   - `web/index.html`
2. Confirm the support email:
   - `thumos@tianzhistudio.com`
3. Push this repository to GitHub.

## Option A: Recommended

Use a GitHub-connected Cloudflare Pages project and attach `tianzhistudio.com` directly.

### 1. Create the Pages project

In Cloudflare:

1. Go to `Workers & Pages`.
2. Select `Create application`.
3. Select `Pages`.
4. Select `Import an existing Git repository`.
5. Connect the GitHub repository for this project.

Build settings:

- Production branch: `main`
- Framework preset: `None`
- Build command: `exit 0`
- Build output directory: `web`

After the first deploy, Cloudflare will give you a `*.pages.dev` hostname.

### 2. Attach the apex domain

Inside the Pages project:

1. Open `Custom domains`.
2. Select `Set up a domain`.
3. Add `tianzhistudio.com`.

Because the domain is already on the same Cloudflare account, Cloudflare will handle the required
DNS setup for the Pages project.

### 3. Test the public URLs

Open all of the following:

- `https://tianzhistudio.com/`
- `https://tianzhistudio.com/privacy`
- `https://tianzhistudio.com/support`

Also verify the canonical HTML files:

- `https://tianzhistudio.com/privacy.html`
- `https://tianzhistudio.com/support.html`

### 4. Enable analytics

Inside the Pages project:

1. Open `Metrics`
2. Under `Web Analytics`, select `Enable`

Cloudflare will inject the analytics beacon on the next deployment.

### 5. Optional cleanup

Redirect the production `*.pages.dev` hostname to `https://tianzhistudio.com/` with a Bulk
Redirect so search engines and users only see your public domain.

## Option B: Use a subdomain instead

If you want to keep something else on the apex later, attach the Pages project to a subdomain such
as `thumos.tianzhistudio.com` instead:

1. Add `thumos.tianzhistudio.com` as the Pages custom domain.
2. Update the canonical and OG URLs in the HTML files if you want the metadata to point at that
   subdomain.
3. Update `web/robots.txt` and `web/sitemap.xml` to the subdomain URLs.

## Option C: Keep `/thumos` anyway

Only use this if your Cloudflare plan and rules products support the required hostname and DNS
overrides, or if you are willing to put a Worker in front of the site and manage the routing
yourself. It is not the simple Pages-only path.

## Manual deploy without Git integration

If you prefer direct uploads, Cloudflare also supports Wrangler:

```bash
npx wrangler pages deploy web --project-name=thumos-site
```

You will need `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in your environment.

## Notes

- The site intentionally uses relative links so it works both locally and on the apex domain.
- `_redirects` provides nice `/privacy` and `/support` URLs.
- If you have not created `thumos@tianzhistudio.com` yet, either set up Cloudflare Email Routing
  for that address or replace the email in the HTML files before launch.
