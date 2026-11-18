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
