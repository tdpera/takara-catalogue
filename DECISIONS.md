# Product and technical decisions

Decisions made before building, with the reasoning. Change them here if the business disagrees.

## 1. Sign-in: Twilio Verify, WhatsApp first, SMS as fallback
- Supabase phone OTP needs an SMS provider. **Twilio Verify** handles UAE sender
  registration itself; sending your own SMS to UAE numbers needs a registered sender ID,
  which can take weeks.
- The code goes out on **WhatsApp by default**, with "Send by SMS instead" one tap away.
  Everyone in the souk uses WhatsApp, delivery is more reliable than SMS in the UAE, and
  it usually costs less.
- Local development uses Supabase's fixed test numbers (`+971500000001` to `…04`, code
  `123456`), so no messages are sent and no provider account is needed.

## 2. Spin video: keep the original untouched, upload the sprite first
- Record with the phone's own camera app (`<input capture>`). On cheap Androids it gives
  better focus and exposure than an in-browser recorder, and it needs no permission prompt.
- The 6×4 sprite (about 400 KB) uploads immediately, so the spin works in the catalogue right away.
- The **original video is kept byte-for-byte** for 3D reconstruction later. Re-encoding it in the
  browser is slow on cheap phones and throws away detail that 3D methods need.
- The video uploads in the background with resumable uploads (TUS). Uploads wait for Wi-Fi when
  the phone reports a metered connection. After 24 hours, or when the user taps "Upload now",
  they go anyway. Videos over 100 MB are rejected with a message.
- Storage estimate: 20 pieces a day with a spin on a third of them is about 4–5 GB a month per
  busy shop. That fits Supabase Pro's 100 GB for a pilot. Paths are `{shop}/{piece}/…`, so videos
  can move to cheaper storage (e.g. Cloudflare R2) later without schema changes.
- The grid also gets a small sprite (120 px cells, about 40 KB), because 20 full sprites would
  be too heavy over 3G. The full sprite loads only in the detail view.

## 3. What clients see on share links
- **Sold pieces** stay on the link with a "Sold" badge and no price. The client sees what happened,
  instead of a piece silently disappearing. **Reserved pieces** show "Reserved" and no price.
  Deleted pieces are left out.
- **Clients never see the internal "update today's rates" warning.** It's an instruction for staff,
  and showing it would look unprofessional. The link is still honest about the rate:
  - rates set today: prices, plus "at the gold rate of 18 Nov, 10:05";
  - rates 1–3 days old: prices labelled **"Indicative, based on the gold rate of {date}"**;
  - rates older than 3 days: **prices are hidden** ("Ask for today's price"). Karat and weight
    still show. Gold can move several percent in a few days, and a stale price sent to a client
    turns into an argument in the shop.
- The client page shows the **total, karat, weight and rate date, not the making-charge
  breakdown**. Making charges are the shop's negotiable margin. The full breakdown stays inside the app.
- Every price on the link says it is confirmed in store, and it includes VAT when the shop has VAT on.

## 4. Rounding
- Totals on cards, messages, share images and links: **whole AED, rounded half-up** from the
  full-precision total.
- The breakdown table in the app shows each line in **fils (2 decimals)** with the exact total,
  then a final **"Price AED 4,218"** row. If each line were rounded to whole AED, the lines would
  not add up to the total, and staff would notice.
- All maths uses decimal arithmetic (`decimal.js`), never floating point. Weights are stored to
  3 decimals, rates and making charges to 4. Prices are never stored; they are always computed
  from the newest rates.

## 5. Weight in messages and images
- Show **gross weight**, the number on the tag and the scale, which is what buyers compare.
  When a piece has stones, also show the gold weight: "12.40 g (gold 11.20 g)". The price
  depends on gold weight, and hiding that number would invite disputes.

## 6. 14K rate
- **No derive ratio for 14K.** The board ratios are not simple purity fractions: 18K is
  0.7612 of 24K while its purity is 0.75, so each karat carries about a 1–1.5% premium.
  14/24 = 0.5833 would underprice 14K by roughly that premium. The Dubai board doesn't publish
  14K, so it is **entered by hand**, labelled "not on the Dubai board".
- If a shop has no 14K rate, 14K pieces show "Price on request" and the rates screen warns.

## 7. Joining a shop
- Owners and managers **add a member by phone number** (managers can add salespeople only).
  The person joins automatically when they sign in with that number.
- The app sends nothing. A "Tell them on WhatsApp" link opens a prefilled message that the
  inviter sends themselves, the same principle as client sharing.
- **One person can belong to several shops** (common with family-run multi-shop businesses).
  The schema supports it, and a shop switcher appears only for people who have more than one shop.
- A shop always keeps at least one owner (enforced in the database).
- **Clients stay private to the salesperson, owners included.** If a salesperson leaves the
  shop, they lose access to that shop's client list in the app. The rows are kept, not deleted,
  so the decision can be revisited.

## 8. Who can do what
| | Owner | Manager | Salesperson |
|---|---|---|---|
| See all shop pieces | ✓ | ✓ | ✓ |
| Add pieces | ✓ | ✓ | ✓ |
| Edit piece details | any | any | own |
| Mark in stock / reserved / sold | ✓ | ✓ | ✓ (any piece) |
| Delete pieces | ✓ | ✓ | ✗ |
| Gold rates, making defaults, VAT, branding | ✓ | ✓ | ✗ |
| Add/remove salespeople | ✓ | ✓ | ✗ |
| Add owners/managers, change roles | ✓ | ✗ | ✗ |
| Clients, shares, view tracking | own only | own only | own only |
| Analytics | ✓ | ✓ | ✗ |

Gold rates are append-only (no edits or deletes), so the history is a reliable record of who set what and when.

## 9. Hosting and running costs
- Stay on **Vercel + Supabase**. Both production plans are needed once real shops use the app:
  Vercel's free Hobby plan forbids commercial use, and Supabase's free tier pauses after a
  week of inactivity.
  - Vercel Pro about $20/month, Supabase Pro about $25/month. **About $45/month fixed**, covering many shops.
  - Twilio Verify: a few US cents per sign-in. Sessions last weeks, so this stays small.
  - Claude API: about 1–2 US cents per AI fill (estimate; measured in step 4).
- Free tiers are fine for development and staging.
- Costs are kept down by: no paid image transformations (the phone makes its own thumbnails),
  no web fonts (Android already has Noto for all four scripts), and analytics in Postgres
  instead of a paid tool.
- Cloudflare would be cheaper still but adds deployment friction for a team with no tech staff.
  We can revisit at scale.

## 10. AI model
- `claude-opus-5-5` by default, the most capable current model, because reading a scale display
  and karat stamps accurately is the point of the feature. The model is set by an environment
  variable (`ANTHROPIC_MODEL`).
- In step 4 I'll build a small test set of real photos so a cheaper model can be compared on
  accuracy before anyone switches. Choosing a cheaper model is your call, made on measured results.
- Refusals fall back to another model on the server automatically.

## 11. The 15-second capture target
- Saving never waits for the AI. The AI runs while the user picks karat and category.
- **Weight and karat need an explicit tap to confirm** when the AI filled them, because they set
  the price. Name, category and descriptions are confirmed by pressing Save.
- Karat and gross weight are required to save. Offline, the AI is skipped and the user types the
  weight from the scale; they can run "AI fill" later from the piece.
- Pieces get their id on the phone, so capture works offline. The readable SKU (`ALF-0042`,
  sequential per shop and never reused) is assigned when the piece reaches the server.

## 12. Smaller choices
- **i18n:** a small typed dictionary instead of a library. The language is stored in a cookie
  and the user's profile, not in the URL, which suits an installed app. Arabic sets `dir="rtl"`
  and layouts use logical CSS properties. A unit test checks that every language has every key
  and placeholder. **The Arabic, Hindi and Malayalam strings need review by native speakers before launch.**
- **Share links:** 128-bit random tokens; the page is `noindex` and `no-referrer`. Views are logged
  at most once per visitor per 30 minutes, and the salesperson's own views are not counted.
  Expiry options: 1, 7 (default) or 30 days; links can be revoked.
- **Public pages** read through server code that checks the token and expiry, returns only
  those pieces, and signs image URLs. Anonymous users have no table access at all.
- **Analytics** live in an `events` table. Only owners and managers can read it.
  `share_viewed` can only be written by the server.

## 13. Gold rates and pricing (step 2)
- **One pricing engine** (`src/lib/pricing.ts`) is used everywhere: the app, the server and
  (from step 6) share links and images, so a price can never differ between screens.
- **"Today" is the calendar day in Dubai**, not the phone's or server's time zone. A rate set at
  23:59 is stale at 00:01.
- **Derive** multiplies the 24K rate by the brief's ratios and rounds half-up to fils
  (472.50 → 437.39, 419.44, 359.67). The user then checks each value against the board.
  Note: on the 13 Nov board, rounding to the nearest AED 0.25 would match the board exactly
  (437.50, 419.50, 359.75). That's easy to switch to if it holds on other days.
- **Saving rates saves every filled karat with the same timestamp**, even unchanged ones. Saving
  means "I checked these against today's board", which is what clears the warning.
- **Typo guards before saving:**
  - purer gold must cost more per gram (24K > 22K > 21K > 18K > 14K), which blocks dropped digits;
  - a move of more than 10% since the last rate needs an explicit "They're correct, save";
  - the server re-checks everything; the browser checks are only for speed.
- **Digits from Arabic, Hindi or Malayalam keyboards are accepted** (٤٧٢٫٥ reads as 472.5).
  Prices are always *shown* with Western digits, the norm for UAE trade.
- **Pricing settings** (default making charge per gram, VAT on/off) sit on the rates screen,
  with owner/manager access only. Shop branding (logo) comes with the share image in step 6.
- **Warnings are per role:** owners and managers get an "Update today's rates" button,
  salespeople get "Ask an owner or manager".
- **Price check:** the rates screen has a calculator anyone can use to quote a price from the
  current rates without saving a piece. The same breakdown component will be reused on the piece
  detail screen in step 5.

## 14. Capture and uploads (step 3)
- **Saving never touches the network.** "Save piece" writes the piece, photo and spin into the
  phone's upload queue (IndexedDB) and clears the form for the next piece. The queue uploads in
  the background and survives closing the app, bad Wi-Fi and phone restarts.
- **Upload order:** the piece's details first (a few hundred bytes, so they're safe on the server
  within seconds), then photo + thumbnail, then spin sprites, then the original video. Each step
  is recorded, so a dropped connection resumes where it stopped, and repeated uploads are harmless.
- **Retries** back off from 2 s to 5 min, and restart straight away when the phone comes back online.
  Rejected pieces and expired sessions stop and show in the header so the user can act on them.
- **Uploads use signed URLs**, created by the server for paths it builds itself
  (`{shop}/{piece}/{kind}-{id}`), checked against storage RLS. The browser never loads the
  Supabase client, keeping the capture screen at 7 kB.
- **Photos** are resized on the phone, in a background worker, to 1600 px (JPEG quality 0.88) plus a
  480 px thumbnail. Nothing else is changed: no filters or colour adjustment. Re-encoding also
  removes EXIF data such as GPS location.
- **Karat, category and making charge stay set** between pieces, because new stock tends to
  arrive in batches. A second similar piece needs only a photo and a weight. The name is
  optional (default "22K Bangle"); AI naming arrives in step 4.
- **Pieces can be saved before rates are set**; they're priced as soon as rates exist.
- **Offline:** a service worker keeps the app's files and last-opened pages, so the capture screen
  opens with no connection. Cached pages are cleared on sign-out, and the user is warned if
  uploads are still pending.
- **Videos** upload as one request (not resumable yet). With the Wi-Fi-first rule this is fine; if
  shops record long clips on poor Wi-Fi, switch to Supabase resumable (TUS) uploads.
  **Supabase's free plan limits files to 50 MB**; the bucket allows 100 MB, which needs the Pro plan.
- **Images are served through signed URLs** (private bucket). That's correct but defeats browser
  caching; step 5 will decide between this and unguessable public paths for catalogue speed.
- A SKU can be skipped (never duplicated) if a piece is saved twice at the same instant after a
  dropped response; the database guarantees uniqueness.

## 15. AI fill from photo (step 4)
- **Runs by itself after each photo** (a checkbox on the capture screen turns this off; the choice
  is remembered on the phone). The photo hint already asks for the scale display in shot, so
  the AI can read the weight, the purity stamp, the category and a name while the salesperson
  carries on. **Saving never waits for it.**
- **The AI never overwrites what the salesperson typed or tapped** for the current piece. It may
  replace a karat or category that was only carried over from the last piece, because a stamp
  it read is better evidence than "same as last time"; the field is then highlighted.
- **Highlighted, not blocking.** Every AI-filled field gets a "AI · check" badge and an amber
  outline; editing it removes the badge. A box lists what was filled and what must still be
  typed by hand. I didn't require a tap per field to confirm: that would cost several seconds per
  piece against the 15-second target. Saving with the fields visible counts as confirming them.
- **Strict JSON, then checked again on the server** (`src/lib/ai/validate.ts`, 15 unit tests).
  Anything failing a check is dropped and left for the salesperson, never "fixed up":
  - name: karat mentions removed, at most 6 words;
  - karat: kept only if the AI also copied the exact marking it read ("916", "22K");
  - weight: kept only if it equals the single number the AI says the display shows, in grams,
    with at most 3 decimals. Carats, tolas and ounces are rejected. The decimals stay as displayed
    ("24.350");
  - descriptions: 1–2 sentences, in the right script for each language, and **no digits in any
    script**, so no weight, karat or price can slip into client-facing text.
- **Photos are only read.** The route sends the 1600 px JPEG the phone already made (typically
  60–300 KB) and stores nothing; the photo is uploaded unchanged by the capture queue as before.
- **Descriptions arrive even if the piece was saved first.** The phone gives each piece its id
  when the photo is taken. When the AI reply is recorded it adds its descriptions to the saved
  piece, or the piece takes them when it's saved later; a database lock on the piece id makes
  either order safe. Descriptions the salesperson typed are never replaced, and one salesperson's
  AI reply can't write to a colleague's piece. Karat, weight and name from a late reply are
  dropped, because the salesperson has already decided those.
- **Every request is logged** in `ai_requests` (status, model actually used, tokens, time), readable
  by the shop's members and written only through two database functions. This is the basis for
  cost reporting and for comparing models.
- **Limits:** 12 requests a minute per person (fast capture is about one piece every 8 seconds) and
  1500 a day per shop (roughly USD 15–30). The day is the Dubai day. Over the limit, Claude isn't
  called and the form says how long to wait. Both numbers are in the migration and easy to change.
- **Errors each have their own message** in all four languages: unreadable photo, no jewellery,
  AI declined, unusable reply, AI busy (Claude 429/5xx/overloaded), too slow, offline, shop
  quota, per-person limit, not set up, signed out. Where trying again can help, a "Fill from
  photo" button appears.
- **Model and settings:** `claude-opus-5-5` (`ANTHROPIC_MODEL`) with adaptive thinking at **low
  effort** (`ANTHROPIC_EFFORT`): reading a display and a stamp is perception, not long reasoning,
  and low effort keeps the wait short. Server-side fallbacks are on (`fallbacks: "default"`), so
  a false-positive refusal on a jewellery photo is retried on another model automatically. One
  automatic retry for connection errors, 40 s timeout per attempt.
- **Security:** the API key is read only in `src/lib/ai/claude.ts` (marked server-only) and passed
  explicitly, so the SDK can't pick up some other credential. The route checks the session, shop
  membership (in the database), the request's origin, file size and that the file really is an
  image. Text in a photo is treated as information, never instructions, and the reply can only
  take the fixed JSON shape.
- **Not verified yet:** I couldn't call the real Claude API from this environment, so every test
  ran against a local stand-in that returns realistic and broken replies. The test set of real
  photos promised in section 10 is also still to do: it needs real shop photos and a key. Until
  then, model accuracy and real response time (expect roughly 3–8 s) are unmeasured.

## 16. Catalogue, piece page and spin viewer (step 5)
- **Filters and search live in the URL** (`/?q=&category=&karat=&status=`). Reloading, the back
  button and sending a colleague a link all keep them, and the page works without JavaScript.
  Filtering happens in the database, so it stays fast with thousands of pieces. Search covers
  name and SKU in any script; the text is cleaned to letters, digits, spaces and hyphens first
  so it can't change the database query.
- **24 pieces per page, "Show more" for the next 24.** I measured 48 first: Lighthouse mobile
  scored 89 with 400 ms of blocked main thread. With 24 it scores 98–99 (50 ms). 24 cards is
  12 rows on a phone.
- **Cards** show the photo, with the spin on top once it has loaded. Spins turn by themselves
  only while on screen, never with reduced motion (as the brief asks), and stop for good once
  turned by hand. All spins share one timer and move a background image rather than redrawing,
  which keeps a full grid light on low-end phones. Dragging a card turns it without opening the
  piece; vertical swipes still scroll.
- **The big viewer** on the piece page is a keyboard slider (arrow keys, Home/End, Page Up/Down)
  that announces "Angle 3 of 24", plus pointer drag. It uses the full 360 px sprite; cards use
  the small one (about 26 KB).
- **Bulk select** keeps the selection while you open pieces and come back (per shop, for the
  browser session). The Share button says sharing arrives in step 6, which starts from this
  selection.
- **Piece page:** spin and photo tabs, the full price breakdown at today's rate, description tabs
  (opening on the interface language when it has text), and the status (in stock, reserved,
  sold), which any member can change.
- **Edit page (added; the brief doesn't list it):** AI descriptions can arrive after saving, and
  weights get mistyped, so pieces need editing. The creator, a manager or the owner can edit;
  only managers and owners can delete, which also removes the files. "Write descriptions from
  the photo" fills only the empty languages, highlighted for checking. Replacing a photo or
  spin isn't possible yet.
- **Images:** the bucket stays private and pages use signed URLs (6 hours). Signatures change on
  every page load, which would defeat browser caching, so the service worker caches images by
  path without the signature. Paths never change (each file has its own id). Images then load
  once per phone and also work offline. The cache keeps the newest 800 files and is cleared on
  sign-out. I chose this over public paths (anyone with a link could see stock forever) and over
  proxying images through our server (bandwidth and a function call per image on Vercel).
- **Analytics:** `ai_fill_used` (in the brief, missed in step 4) is now logged on every
  successful AI fill, with the fields filled. `piece_added` was already logged; `share_created`
  and `share_viewed` come in step 6.
- **Lighthouse mobile** (local production build, so real network times will add to these):
  catalogue 98–99, piece page 97, capture 98; accessibility and best practices 100 on all three.

## 17. Sharing with clients (step 6)
- **Flow:** select pieces in the catalogue → Share → optionally pick or add a client → message →
  create the link → send it on WhatsApp, copy it, or save the catalogue image. **Nothing is
  ever sent by the app.** "Send on WhatsApp" is a wa.me link: WhatsApp opens with the message
  and link filled in, and the salesperson presses send. With no number saved, WhatsApp asks
  who to send it to.
- **The message:** the brief's English template: a greeting, one line per piece ("1. Rope bangle:
  22K, 24.35 g, AED 11,183"), the note that prices follow today's gold rate and are confirmed in
  store (with VAT if the shop charges it), and the shop name. It can be edited.
- **Write with AI never handles a figure.** Claude writes only the greeting and the closing, in
  the client's language, using their first name and saved notes. The piece lines and the price
  note are then inserted by our code from the server's own prices, and the note comes from fixed
  translations. Claude isn't even shown prices, weights or karats. Its text is also rejected if
  it contains any number (in any script), a link or the wrong language, with one automatic
  retry. This meets "the AI must keep the exact figures" by construction, rather than by
  checking afterwards. It counts against the same AI limits as photo fill.
- **Share links** are `/s/{22-character random token}` (128 bits, not guessable), expire after 7
  days and can be turned off. A link holds up to 24 pieces; sold pieces are left out when
  composing, and a piece sold later shows as "Sold" with no price. The page needs no login and
  shows each piece's spin (or photo), karat, weight, **today's price** (worked out when the page
  opens) and description in the client's language, which the client can switch. It shows nothing
  about the client, the salesperson or the message, and asks search engines not to index it.
- **How the public page reads data:** through one database function, `get_share(token)`, that
  returns only what a client should see, and only while the link is valid. The service-role key
  is used for exactly one thing: signing the images that function returned (24 hours).
- **View tracking that means something.** When a link is sent, WhatsApp fetches it at once to
  build a preview, so counting page loads would show every link as "opened". A view is recorded
  instead by a small script once the page is actually visible in a real browser, with a
  second filter on the user agent for known robots. The salesperson's own visits aren't
  counted, and repeat visits by the same visitor within 30 minutes count once. The visitor id
  is a hash of address, browser, link and date, so addresses aren't stored. The Shares page
  shows "Not opened yet" or "Opened 3 times, last 18 Nov, 14:05".
- **Catalogue image:** drawn on the phone (canvas) as a 1080 px wide PNG with the shop name,
  date, up to 6 pieces (photo, name, karat and weight, price) and the price note. Photos are
  cropped to squares but never retouched. It opens the phone's share sheet where available,
  otherwise downloads. In Arabic it's laid out right to left, with figures still written
  left to right ("AED 11,183").
- **Clients** belong to the salesperson who added them (other staff, managers included, can't
  see them), with name, optional WhatsApp number, message language and notes.
- **Analytics:** `share_created` (pieces, client yes/no, AI message yes/no) and `share_viewed`.
- **Not done:** a shop logo on the image and page (shops have a logo field but no upload screen
  yet), and extending a link's expiry (create a new one instead).

## 18. Seed data, tests in the repo, and what's left (step 7)
- **Demo pictures are drawn illustrations marked "DEMO"**, generated by the seed script itself
  (no image library needed). Photo-like pictures of pieces that don't exist would be easy to
  mistake for real stock in a catalogue that clients see. The marks sit at the top centre because
  the app uses the corners for its own badges.
- **The 10 demo pieces** cover every category and karat, with stones, a flat making charge,
  extras, a reserved and a sold piece, and two 360° spins. Weights and prices are in the range of
  Dubai souk stock (from AED 2,288 for a pendant to AED 47,341 for a bridal set at a 24K rate of
  AED 472.50). Descriptions follow the same rules as AI ones: no figures, no invented stones.
- **The seed refuses to touch a non-local Supabase without `--remote`**, and only ever replaces
  the demo shop it created (same name and owner).
- **The browser tests moved into the repo** (`e2e/`, run with `pnpm e2e --yes`), with their
  fixtures and the Claude stand-in, so anyone can rerun the 158 checks that were used to verify
  each step. Database queries in them go through Docker, so `psql` isn't needed.

**Before launch:**
- Run AI fill with a real `ANTHROPIC_API_KEY` on real shop photos; compare models on accuracy
  before choosing a cheaper one (section 10).
- Time capture on a real mid-range Android and check MP4 spin recordings (section 11 and step 3).
- Have native speakers review the Arabic, Hindi and Malayalam text.
- Set up Twilio (WhatsApp sender, SMS fallback) in Supabase.
- Possible next features: a logo upload for the share image and page, extending share links,
  replacing a piece's photo or spin, resumable video uploads, and a usage/cost view built on
  `ai_requests` and `events`.

## 19. Debugging pass and visual refresh
**How it was checked:** every page as owner, salesperson and anonymous visitor, in light, dark,
Arabic and desktop (76 page views), with an automated accessibility scan (axe), console and
network errors, and horizontal-overflow checks. Plus a code read for bugs a scan can't see.

**Bugs fixed**
- Gold rates: the "Fill from 24K" button squeezed the 24K input on phones until its value was
  cut off. The button now wraps below.
- Search: on a slow connection, results for an earlier keystroke could reset the search box
  and lose what had been typed since.
- Status buttons on the piece page dropped keyboard focus while saving.
- Edit page: Cancel used the browser's back, which leaves the app if the page was opened from a
  link. It now returns to the piece.
- Arabic: prices on cards, figures in the share composer, client phone numbers and rate history
  were aligned left inside right-to-left layouts.
- Accessibility: the rates line sat outside the page landmarks; unknown pages showed Next.js's
  unstyled English 404; not-found pages had no heading. Added a "Skip to content" link and an
  error screen with Retry (there was none: a failed load showed a blank default page).
- The public share page queried the database twice per visit (once for the link preview title).

**Visuals, following the prototype**
- **Fonts:** DM Serif Display for the shop name, page titles and prices, and IBM Plex Mono for
  weights, rates and amounts, as in the prototype. Both are Latin-only and self-hosted, so
  Arabic, Hindi and Malayalam keep the phone's own fonts. This revises section 12's "no font
  files": measured with Lighthouse, preloading both fonts delayed the first photos by about a
  second on a slow connection. With the serif preloaded and the mono font loaded lazily (one
  weight), the catalogue scores the same as before the refresh (90–91 against 89–90 on the
  seeded demo data, run alternately against the previous build).
- **Header:** the app's mark, the shop name in the serif, and today's rates as chips (24K 472.50,
  22K 437.39, …) like the prototype's rate strip, wrapping onto a second line on phones so
  they're all visible.
- Cards with soft shadows and a slight lift on hover, serif gold prices, a highlighted serif total
  in the price breakdown, and line icons instead of emoji (which look different on every phone).
- A designed sign-in and welcome screen, friendly empty states, and loading skeletons, so a tap
  on 3G shows the page's shape at once instead of nothing.

**Measured after:** accessibility 100 and best practices 100 on every page; performance 88–98
(catalogue 88–91 with the demo pictures, which are PNGs about three times the size of real
phone-made JPEG thumbnails); 0 accessibility violations, console errors or overflow in 76 page
views; all 123 unit, 54 database and 158 browser checks pass.

## 20. Second design round: "slick and professional"
- **Phone-app layout.** A compact top bar (mark, shop name, uploads, a globe language button),
  then a dark **rate ticker** styled like the souk's rate boards (gold figures on ink, a live
  dot and the time set), then the page. Navigation moved to a **bottom tab bar** on phones, in
  thumb reach, with a raised gold **Add** button in the middle, because adding pieces is the most
  frequent job. The tab bar hides on the add and edit screens, which have their own Save bar.
  Tablets and desktops keep pill links and a gold Add button in a sticky header. The phone
  header went from about 190 px to about 90 px.
- **Palette.** Warm ivory paper, white cards and near-black ink, with gold kept for prices and
  highlights, as jewellery brands do. Primary buttons are ink (gold in dark mode) rather than
  mustard. Every text and background pair was checked to be at least 4.5:1 in both themes, and
  the accessibility scan finds no contrast issues.
- **Piece page leads with the price** a salesperson quotes, in large serif, with the rate and
  time underneath and the full breakdown one tap away. The photo runs edge to edge on phones.
  It gets a **Share** button for sending just this piece, and status as a segmented control with
  coloured dots.
- **Consistent controls:** segmented pills for photo/360°, status and description languages;
  ink chips for karat and category; a real switch for AI fill; numbered steps in the share
  composer; initials avatars for clients and team members; small uppercase section labels
  (letter-spacing only for English, since it breaks joined Arabic letters).
- **Rates page:** current rates as a dark rate board matching the ticker.
- **Client's link page** as a lookbook: a centred hero with the shop's name in large serif, a
  pill language switch, and larger cards with serif names and prices.
- **Measured against the previous design** (same data, runs alternating): Lighthouse
  performance within noise (catalogue 89–90 vs 91, piece page 95 vs 96, client page 94–95 vs
  93–96); accessibility and best practices 100; 0 issues in the 76-view survey; 159 browser
  checks pass.

## 21. Launch animation
- On the first page of an app session, a dark screen where the gold ring **draws itself**, the
  stone **pops on** with a ripple, the name rises in (its letter-spacing settles; Arabic, Hindi and
  Malayalam rise without spacing, which would break their letters), a gold line and the tagline
  follow, and it fades into the app. About 1.8 s, in the app's language.
- **CSS only** (no JavaScript bundle), so it appears on the very first paint. A tiny script in
  the page head decides, before anything is drawn, whether this is the first page of the
  session; later pages and reloads never flash it.
- **It never blocks:** the app renders underneath and taps go straight through, so a salesperson
  can start typing at once.
- **Skipped** for reduced-motion users (the phone setting), on clients' share links (that page
  belongs to the shop), and if the browser blocks storage.
- The installed app's own launch screen is the same dark colour, so opening from the home screen
  flows into the animation.
- **Measured:** no Lighthouse change (sign-in 97, catalogue 89–90); first paint 0.8 s; no
  accessibility violations while it plays; 159 browser checks pass.

## 22. "Maison" design (chosen from 10 directions)
The owner picked design 01 of ten mockups (fonts and layouts researched first: luxury jewellery
brands pair one elegant serif for names with a plain sans for everything else, keep photos
dominant, and rarely use more than two typefaces).
- **Fonts:** Bodoni Moda for shop and piece names, page titles and the wordmark; Manrope for all
  interface text and figures (tabular digits keep weights and prices aligned). Latin only,
  self-hosted by Next. Manrope is preloaded (first text on every screen); Bodoni swaps in over a
  size-matched fallback so it never competes with the first photos. Arabic, Hindi and Malayalam
  use the phone's Noto faces (serif for titles, sans for text). IBM Plex Mono and DM Serif are gone.
- **Colours:** ivory paper, near-black ink, fine gold. Gold text is a shade deeper than the gold
  lines so it still passes 4.5:1; every text pair passes in light and dark.
- **Shape:** flat surfaces divided by hairlines, near-square corners (a Tailwind radius override,
  so every screen follows), small tracked capitals on buttons, tabs and labels. Tracking and
  capitals switch off in Arabic, Hindi and Malayalam, where they break letters.
- **Layout:** the shop name centred in spaced capitals; today's rates between two hairlines;
  categories as underlined text tabs; "The Collection" in Bodoni italic; a borderless 2-column
  grid of photos on ivory tiles with the name, karat and weight and price below; a bottom tab bar
  with a round ink Add button. The client page and the shared catalogue image use the same style.
- **App icon** redrawn to match (fine gold ring on ivory); the installed app's launch colour is
  ivory, so opening from the home screen flows into the launch animation.

### Motion
Quiet and quick, CSS only (no animation library, no extra JavaScript). All of it is off for
people who ask their phone for reduced motion, and nothing waits for an animation: content is in
place for taps and screen readers from the first frame.
- **Launch:** on ivory, the gold ring draws itself, the stone's outline follows with a glint, TAKARA
  appears letter by letter (Arabic, Hindi and Malayalam names appear as one word), a gold rule
  extends, the tagline rises, then the screen lifts like a curtain (about 2.6 s, once per session,
  never on clients' links, taps pass through).
- **Pages** fade in on every navigation (opacity only, so fixed bottom bars don't jump).
- **Catalogue:** the first six cards arrive one after another; the rest rise in as they scroll
  into view (where the browser supports scroll-driven animation; elsewhere they're simply there).
  Photos fade in and zoom slowly on hover or press.
- **Tabs:** the underline draws from the centre; the current bottom tab gets a short gold line;
  the Add button's plus turns on hover and the button gives on press.
- **Rates:** figures rise in one by one, then a soft gold sheen passes once along the strip.
- **Piece page:** the photo is unveiled from the bottom like a curtain; the price breakdown slides
  open.
- **Feedback:** confirmations pop in; a tick draws itself when a piece is saved or a link is
  created; the mark draws itself on empty, error and sign-in screens; the selection bar slides up;
  loading skeletons have a slow ivory sheen.
- **Measured:** 159 browser checks, 123 unit and 54 database tests pass; no accessibility
  violations or sideways scrolling in 76 page views (light, dark, Arabic, desktop); Lighthouse
  mobile: catalogue 91 (largest paint 3.2 s, slightly faster than before), piece 94, client page
  92, sign-in 97; accessibility and best practices 100 everywhere. Main-thread work on the
  catalogue is up a little (about 120 ms of blocking time under 4× CPU throttling, from about 35),
  still within Lighthouse's "good" range; tests with all animations switched off showed the same
  noise, so the animations aren't the cause.

## 23. Showcase round: introduction page, new launch, photo flights
Brief: "a real wow factor… the most impressive jewellery site anyone has seen; it will be
judged". Everything stays usable on a mid-range Android phone on shop Wi-Fi, accessible, and in
four languages.
- **Introduction page** (the signed-out home, /login), replacing the plain sign-in screen:
  - **A live 3D gold ring with a diamond**, drawn on the phone's graphics chip by one ray-marched
    shader (components/intro/ring-gl.ts, ~6 KB) instead of a 3D library (~150 KB). Gold is shaded
    with a physically based Fresnel term against a procedural photo studio (soft boxes, strip
    lights, warm floor); the diamond has reflections, a faked internal bounce with colour
    dispersion and per-facet sparkle; gold dust drifts behind. It turns like a jeweller's
    turntable (lingering where it faces you), spins with a sideways drag (vertical swipes still
    scroll), tips with the mouse or an Android phone's tilt.
  - Kind to phones: a still SVG ring shows instantly (and stays without WebGL); the live ring
    starts after the launch animation, pauses off screen and in background tabs, draws at reduced
    resolution and lowers it further if frames arrive late; nothing at all with Save-Data; one
    still frame for reduced motion.
  - Below the hero, scroll storytelling: a phone whose screen follows the step you're reading
    (photograph on the scale with a scanning LCD and shutter flash → AI typing the name and
    four-language descriptions → the price rolling to AED 11,643 with its breakdown → a WhatsApp
    message landing, ticks turning blue), a split-flap gold-rate board, the tagline morphing
    through English, Arabic, Hindi and Malayalam, four promises, then the sign-in form. The demo
    figures are the app's own arithmetic; the board is labelled as example rates.
  - Native scrolling only (no scroll-jacking). Scroll reveals, the story steps and the hero
    parallax come from one small observer; without it everything is simply visible.
- **Launch animation, "through the ring":** on black velvet, molten gold runs round the ring and
  settles (an SVG turbulence filter easing to zero), the diamond drops in with a flash and rays,
  TAKARA rises letter by letter with light sweeping across, then the camera flies through the
  ring: one animated custom property both scales the ring past the screen and opens a hole the
  size of its centre onto the app, so they always match. ~2.8 s, once per session, CSS/SVG only.
  The installed app's launch colour is the same velvet.
- **Photo flights:** tapping a piece makes its photo fly from the grid into the piece page, and
  "← Catalogue" flies it back (View Transitions API; skipped where unsupported, for reduced motion
  and for new-tab clicks; if the next page is slow we stop waiting after 0.45 s and cross-fade).
  The page is marked with data-vt while a flight is on, which the browser tests wait for.
- **Rolling figures:** prices and rates roll into place digit by digit; the intro's rate board
  flips like a split-flap board. Pure CSS: the real digits stay in the page as transparent text,
  so screen readers, copying and tests read the true value.
- **Display-case photos:** catalogue and client-page photos tilt towards the mouse with a
  reflection following it; on a phone a tap sends a glint across.
- **Client page header** in black velvet with the shop's name in flowing gold.
- **Measured:** 159 browser checks, 123 unit and 54 database tests pass; accessibility survey of
  76 page views (light, dark, Arabic, desktop) clean; Lighthouse mobile: introduction page 95
  (accessibility and best practices 100; its back/forward-cache check hangs in headless Chrome
  and was skipped), catalogue 93, piece 94, client page 93. The launch animation now removes
  itself completely when done (display: none), so nothing lingers over the app for tools or
  assistive technology.

## 24. A realistic launch film ("forged ring")
Feedback: the line-drawn launch looked machine-made; it should look real: a ring forged from
molten gold, then the stone flashing.
- **A rendered film instead of drawn lines.** scripts/splash-film/forge.frag is a ray-marched
  scene rendered offline (render.mjs, headless Chromium, twice the output size then scaled down,
  bloom and grain added with ffmpeg): molten gold pours in, runs round the band from the bottom
  up both sides with liquid, bulging fronts and sparks, lights a polished dark stone floor, cools
  from yellow-orange heat (molten gold's colour, not blue-white) through red to polished gold;
  the head and prongs rise; the diamond is set and traced through internal reflections with
  dispersion; a photographic star flares off it. 3.6 s, 800 × 800, about 0.5 MB.
- **Why a video, not live 3D:** offline rendering can afford effects phones can't draw in real
  time (multi-bounce diamond, bloom, reflections, sparks), and every phone sees the same quality
  with no graphics load while the app starts.
- **Kind to slow connections:** the film is requested only when the splash really plays, is
  cached for a year under a versioned name (ring-v1.*), and if it hasn't started within 2 s
  (or Save-Data is on) a still of the finished ring with a CSS glint plays instead. MP4 (H.264)
  is offered first with exact codecs: iPhones can claim WebM and then fail on it, and the film
  only counts as failed when the last file does. `?intro` on any address replays it for demos. A failsafe
  hides the splash after 7 s whatever happens; taps always pass through to the app.
- The name, tagline and city stay real text over the film (crisp, and in the user's language);
  the exit still flies through the ring, with the film scaled by the same --fly value that opens
  the hole onto the app.

## 25. Shop websites, trays, sold attribution, reports and the Takara dashboard
The business model is B2B: shops pay a setup fee for their own website and a monthly plan for
the app. A consolidated marketplace can come later, built from shops' websites. The souq sells
from trays: staff bring out a few, customers sift through them, then compare shops. So:
- **The website is a shop window, not a shop.** No buying, paying, reserving or customer forms.
  It's a customer-facing, read-only copy of the catalogue (collection with category, karat and
  weight filters; piece pages with the spin; a visit page), in the 4 languages, at
  `<slug>.<NEXT_PUBLIC_SITE_DOMAIN>` (middleware rewrites the host to `/site/<slug>`) and always
  at `<app>/site/<slug>`, which works before any domain is bought. No Takara launch film, service
  worker or app chrome on a shop's site; the shop's name and logo lead, Takara is a small credit.
- **The tray** is the bridge to the shop and the answer to "how do we show they came through
  us?". Customers add pieces (a cookie per site: piece ids only, no account, nothing personal),
  then either **send it on WhatsApp** (wa.me with the pieces and codes written out; they press
  send, so the app still never messages anyone) or **show it in the shop** (a 6-character code
  with no look-alike letters, and a QR that opens the tray in the staff app). Both save the
  tray, so the shop sees it under **Trays**; the same customer sending the same tray again keeps
  its code. Opening a tray (code, QR or the link in the WhatsApp message) records the visit.
- **Prices** come only from the pricing engine, through one rule set (`src/lib/public-price.ts`)
  shared with share links: each shop picks **live** (today's price), **from** (the gold value
  with VAT only: the real price is never lower and making charges stay private) or **ask** (no
  prices). Rates set today show plainly, 1-3 days old are "indicative", older are hidden ("Ask
  for today's price"). Sold and reserved pieces show their status, never a price. This also
  brings share links in line with §3, which until now showed reserved pieces' prices and didn't
  label old rates.
- **Making charges never reach the browser.** The website's database functions return them
  (the server needs them to price), so only the service role may call those functions;
  `src/lib/site-data.ts` turns rows into what a page may show and drops them. Images go through
  `/site-img/<slug>/<path>`, which serves a file only if it belongs to a piece the site shows
  (or the logo), with CDN caching (paths never change), instead of signed URLs that change on
  every load. Pages render per request, so prices are always current.
- **Sold attribution:** marking a piece sold records today's price and asks "How did they find
  it?" (walk-in, website, tray, WhatsApp link, returning client); selling from a tray fills it
  in, and a recent tray or opened share link is marked "likely". Un-selling clears it.
- **Monthly report** (owners): website visitors, trays (WhatsApp / in the shop / opened by
  staff), share links, sales by how they were found, most-viewed pieces, catalogue upkeep, each
  against last month. **Takara dashboard** (`/admin`, `platform_admins` only, added by SQL):
  totals and 12-month trends across shops, a sortable shops table with "needs attention" flags
  (rates not updated for 3+ days, quiet for 7+, no website) and estimated AI cost (list prices,
  `src/lib/ai-cost.ts`), and each shop's report and activity feed in plain words. Counts and
  piece names only: never client names or numbers, and the owner's own contact as Takara's
  customer.
- **Visits** are counted like share-link views (a script once the page is visible, robots
  filtered, a hashed visitor id, repeats within 30 minutes once), and staff browsing their own
  site aren't counted.
- **Navigation:** phones get Catalogue, Shares, Add, Trays, Shop; gold rates, website, report
  and team live under Shop (today's rates are still on every screen, and the stale-rates banner
  still links to them).
- **The 360° spin stays optional.** The dashboard shows how many pieces have one per shop; if
  shops rarely record spins, hide the button behind a setting.
- **Not done yet** (next phases in the plan): studio photo clean-up, detailed gold attributes
  (chain style, hollow/solid, finish), bulk import, plans and billing, own domains per shop
  through the Vercel API, gold-rate suggestions, the KYC module and the cross-shop directory.

## 26. Digital trays and a showcase-only website
Feedback: customers shouldn't be able to see a shop's whole catalogue, because others could copy
its designs. Shops should send customers a tray of chosen pieces instead.
- **The Digital tray is what the shop sends.** Shares became trays: select pieces in the
  catalogue, tap **Send tray**, pick a client, and send it on WhatsApp (the salesperson presses
  send). The link lasts 1, 7 (default) or 30 days, can be turned off, isn't indexed, and holds at
  most 24 pieces. Each photo carries the shop's name faintly across it; long-press and right-click
  on photos are off. Screenshots can't be stopped, so the watermark is what makes a copied photo
  traceable.
- **Customers answer with what they'd like to see.** On the tray they tick pieces, then either
  **send their choice** (WhatsApp opens with the pieces, codes and a 6-character code written, to
  the shop's website number or else the salesperson who sent it) or **show it in the shop** (the
  code and a QR that opens it in the staff app). The choice is a `site_trays` row linked to the
  sent tray (`share_id`), so the Trays tab shows "Fatima's choice from your tray" next to choices
  made from the website. The same choice sent twice keeps its code.
- **The Trays tab is both ways:** code entry, customers' choices, and the trays you sent (with
  when each was opened). Phones: Catalogue, Trays, Add, Clients, Shop. `/shares` redirects here.
- **The website is a shop window.** It shows the shop's introduction, "Ask for a tray"
  (WhatsApp with the request written), how a tray works, how to visit, and at most **12 showcase
  pieces** the owner picks (none by default, enforced in the database). The full collection and
  its filters are gone; `/collection` goes to the showcase. Pieces outside the showcase have no
  page and their images aren't served.
- **get_share and create_tray_from_share are server-only now,** like the website functions:
  they return making charges for pricing, which must never reach anyone outside the shop.
- **The demo account.** The sign-in page shows the demo number and code (050 000 0001, 123456,
  a Supabase test number), with buttons that fill them in; set `NEXT_PUBLIC_DEMO_LOGIN=off` to
  hide it. Signed in as the demo account, **Load the demo shop** (welcome page, empty catalogue,
  Shop page) builds it on the server in about 10-20 s: 10 pieces with drawn "DEMO" pictures,
  rates, a client and a tray sent to her with her answer, a website with 5 showcase pieces,
  visits, trays and a sale. The same module (scripts/demo-shop.mjs) is what `pnpm seed` uses.
  The demo account never gets Takara admin rights; anyone can open it.
- **"The database needs an update" instead of an error.** The app asks `schema_version()` once
  per server start. If a migration hasn't been run, every page shows which file in
  `supabase/updates/` to paste into the Supabase SQL Editor (all updates, or only the latest,
  worked out from what the database has), and recovers by itself once it's run.
