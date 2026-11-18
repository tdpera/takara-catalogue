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
