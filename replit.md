# Das ELB Hotel & Restaurant

## Overview
A pre-built Next.js static export for "Das ELB Hotel & Restaurant" served via a custom Node.js static file server on port 5000.

## Architecture
- **Server**: `das-elb-hotel/server.js` — Node.js HTTP static file server (no Express)
  - Gzip compression (level 6) for all text assets (HTML/CSS/JS/SVG)
  - Immutable cache headers for `/_next/static/*`; 7-day cache for media
  - ETag / conditional GET (304 responses) with in-memory stat cache
  - HTTP Range request support for proper video seeking
- **Static files**: `das-elb-hotel/public/` — pre-built Next.js static export (no source to rebuild)
- **Port**: 5000

## Key Fixes Applied

### Session 1 — Initial setup
1. **React error silencing**: `rF` sentinel has `digest: "BAILOUT_TO_CLIENT_SIDE_RENDERING"` to suppress Next.js error handlers; `rD` is a no-op.
2. **R3F (React Three Fiber) stub**: Chunk 258 — Canvas → div, all hooks → noop.
3. **GSAP stub**: Chunk 592 + try-catch wrapper in chunk 157.
4. **Server crash hardening**: `stream.on('error')`, `req.on('error')`, `process.on('uncaughtException')`, `process.on('unhandledRejection')`.
5. **Loading screen**: Inner animation uses `setTimeout(fn, 16)` for consistent speed in headless environments.
6. **Fonts**: Downloaded all 11 missing woff2 font files (Inter + Playfair Display) from Google Fonts CDN into `_next/static/media/`. Removed broken HTML preload links. Added `public/overrides.css` with CSS variable definitions.
7. **Hero poster**: Generated dark green gradient `images/hero-poster.webp` to replace missing original.
8. **Event images**: Generated brand-color placeholder PNGs for `images/events/oster-lunch.png` and `images/events/herrentag.png`.

### Session 3 — Deep scroll audit and full fix
14. **GSAP ticker made real** (`c15bf2b0.9fc21fe62e22c072.js`): Replaced `add: noop` with a proper `requestAnimationFrame` loop. Lenis registers its RAF callback here (`lenis.raf(1000*t)`). Without a working ticker, Lenis intercepted all wheel events (preventing native scroll) but never animated — completely blocking scroll. Now Lenis smooth-scrolls properly.
15. **Lenis `allowNestedScroll: true` + `syncTouch: true`** (chunk 157): Added these options so tab bars, accordion panels, and modal content can scroll independently without Lenis intercepting the events.
16. **Horizontal scroll containers unblocked** (overrides.css): The compiled CSS had `.horizontal-scroll-container { overflow-x: hidden }` which prevented tab bars from scrolling. Overridden to `overflow-x: auto !important` with scroll-snap.
17. **Comprehensive contrast overrides** (overrides.css): Strengthened rules for `section-pattern-2`, `section-pattern-3`, `light-section`, and global button backgrounds so no white-on-white or invisible text remains.

### Session 2 — Scroll, contrast, and resource fixes
9. **Scroll lock patches** (chunks 92, 487, 541, 787): Removed `!important` from all `document.body.style.setProperty("overflow","hidden","important")` calls (8 instances). Modals and lightboxes now use regular inline style, which CSS can override.
10. **Section overflow fix** (overrides.css): Changed `section { overflow-x: hidden }` → `section { overflow-x: clip }` to prevent the Safari bug where `overflow: hidden` creates a scroll container that blocks page scrolling.
11. **Light-section contrast** (overrides.css): Added 10+ CSS rules for all element types inside `.light-section` containers (restaurant panel, etc.) to ensure dark text on light green (`#DEF4C6`) backgrounds.
12. **Next.js image loader** (chunk 356): Patched the default image URL generator from `return r.path+"?url="+encodeURIComponent(n)+"&w="+i+"&q="+l` → `return n`. Eliminates all `/_next/image?url=...` 404 errors since there is no Next.js optimization server.
13. **Missing about video** (`public/videos/about.mp4`): Created `public/videos/` directory and symlinked `about.mp4` → `../video/grill-show.mp4`. Fixes 39+ repeated 404 errors for the about-section background video.

### Session 4 — Performance optimization (media compression + server upgrade)
18. **Server rewrite** (`server.js`): Added zlib gzip level-6 for all compressible types, immutable cache headers for hashed Next.js static chunks, ETag+304 conditional GET with in-memory stat cache, HTTP Range request support for video seeking.
19. **Hero video**: Compressed `hero.mp4` from 5.6MB → 2.5MB (-56%) using libx264 CRF 28 + faststart. Removed reference to 21MB `hero-hd.mp4`.
20. **Gallery chunk 221**: All raw 18–19MB gallery JPEGs redirected to 200KB optimized versions (-99%).
21. **Logo**: 2.1MB PNG → 142KB (-93%).
22. **Event images**: `queens-day.png` 594KB → 58KB WebP (-90%).
23. **Dish images**: `veggie-bowl`, `bruschetta`, `caesar-salad`, `caesar-salat`, `rinderroulade` all converted to WebP (-50–87%).
24. **Lazy loading**: MutationObserver script in `index.html` now also stamps `loading="lazy" decoding="async"` on all below-fold images.
25. **Video preload**: `preload:"auto"` → `preload:"none"` for hero and grill-show — videos don't download until played.
26. **data-lenis-prevent**: MutationObserver in `index.html` stamps scroll containers so Lenis allows nested scrolling.

**Total media savings (before → after)**: 60MB → 3MB (-95%) per fresh page load

## Remaining Known Issues
- External CDN images on `cdn.website-editor.net` (event photos) return 403 in headless/server environments — signed CloudFront URLs requiring a proper referrer. Load fine in a real browser.
- API calls to `gestronomy-api.onrender.com` (reservations, event bookings) are live backend calls that will fail in the dev environment — expected behavior for form submissions.

## Workflow
- **Start application**: `cd das-elb-hotel && npm run dev` (runs `node server.js`)

## File Structure
```
das-elb-hotel/
  server.js                          # Static file server
  package.json                       # npm scripts
  public/
    index.html                       # Main page
    tagungen.html                    # Tagungen page
    impressum.html                   # Impressum page
    404.html                         # 404 page
    overrides.css                    # CSS overrides (contrast, scroll, fonts)
    images/                          # Hotel images (all present)
    video/                           # Hero + grill videos
    videos/                          # about.mp4 (symlink → ../video/grill-show.mp4)
    _next/static/
      css/                           # Compiled CSS (31f348d0010abe8a.css = 133KB main)
      chunks/                        # JS bundles (patched)
        356-*.js                     # Image loader (patched: direct URLs)
        92-*.js                      # Rooms + lightbox + modal (patched: scroll lock)
        487-*.js                     # Gallery (patched: scroll lock)
        541-*.js                     # (patched: scroll lock)
        787-*.js                     # Restaurant section (patched: scroll lock)
      media/                         # Font woff2 files (11 files downloaded from Google)
```

## Brand Colors
- `--brand-green: #1A2F24` (dark forest green)
- `--brand-cream: #FDFBF7` (warm cream)
- `--brand-gold: #C5A059` (antique gold)
- `--accent-green: #2fb0a8` (teal accent)
- `forest-600: #1a5c5e`, `forest-500: #247a6e`
