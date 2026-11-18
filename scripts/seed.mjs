#!/usr/bin/env node
// Demo data: one shop with 10 realistic pieces, today's gold rates, a client and a share link.
//
//   pnpm seed                          local Supabase; owner 050 000 0001, salesperson 050 000 0002
//   pnpm seed --owner +971501234567    make that phone number the demo shop's owner
//   pnpm seed --remote                 required when the Supabase URL isn't local
//
// Running it again replaces the previous demo shop (same name and owner) and its files.
// Pictures are drawn illustrations marked "DEMO" (see demo-art.mjs), never fake stock photos.
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (read from .env.local).
import { readFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { photoPng, spritePng } from "./demo-art.mjs";

// ------------------------------------------------------------------ settings

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv(".env.local");
loadEnv(".env");

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
if (!URL_ || !KEY) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (in .env.local). `pnpm db:start` prints both.");
  process.exit(1);
}
const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(URL_);
if (!local && !args.includes("--remote")) {
  console.error(`${URL_} is not a local Supabase. Add --remote if you really want demo data there.`);
  process.exit(1);
}
const E164 = /^\+[1-9]\d{7,14}$/;
const OWNER_PHONE = arg("--owner") || "+971500000001";
const SALES_PHONE = arg("--salesperson") || (arg("--owner") ? null : "+971500000002");
for (const p of [OWNER_PHONE, SALES_PHONE].filter(Boolean)) {
  if (!E164.test(p)) {
    console.error(`${p} isn't a phone number in international format, e.g. +971501234567.`);
    process.exit(1);
  }
}

const SHOP_NAME = "Al Noor Jewellers (demo)";
const db = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const must = (res, what) => {
  if (res.error) {
    console.error(`Failed to ${what}:`, res.error.message);
    process.exit(1);
  }
  return res.data;
};

// ------------------------------------------------------------------ demo content

// Board rate for 24K, and 22/21/18K derived with the app's ratios (src/lib/rates.ts).
const RATE24 = 472.5;
const ratio = { 22: 0.9257, 21: 0.8877, 18: 0.7612 };
const RATES = {
  24: RATE24.toFixed(2),
  22: (RATE24 * ratio[22]).toFixed(2),
  21: (RATE24 * ratio[21]).toFixed(2),
  18: (RATE24 * ratio[18]).toFixed(2),
  14: "276.40",
};

// Weights, making charges and extras in the range seen in Dubai souk shops.
const PIECES = [
  {
    art: "bangle", spin: true, name: "Twisted rope kada", category: "Bangle", karat: 22, gross_g: "32.450", making_per_g: "18",
    d: {
      en: "A bold kada with a twisted rope pattern and a high-polish finish. A classic choice for weddings and festive days.",
      ar: "سوار عريض بنقشة الحبل المجدول ولمسة نهائية لامعة. اختيار كلاسيكي للأعراس والمناسبات.",
      hi: "मरोड़ी रस्सी के डिज़ाइन वाला दमदार कड़ा, चमकदार पॉलिश के साथ। शादी और त्योहारों के लिए क्लासिक पसंद।",
      ml: "പിരിച്ച കയർ ഡിസൈനും തിളങ്ങുന്ന പോളിഷുമുള്ള ഗംഭീരമായ കട. വിവാഹങ്ങൾക്കും ആഘോഷങ്ങൾക്കും ക്ലാസിക് തിരഞ്ഞെടുപ്പ്.",
    },
  },
  {
    art: "ring", spin: true, name: "Solitaire cocktail ring", category: "Ring", karat: 21, gross_g: "6.820", stone_g: "0.400", making_per_g: "25", extras_aed: "150",
    d: {
      en: "A slim polished band holding a single clear stone in a raised four-prong setting. Elegant for evenings and gifts.",
      ar: "خاتم بحلقة نحيفة لامعة يحمل حجرًا شفافًا واحدًا مرفوعًا على أربعة مخالب. أنيق للسهرات وللإهداء.",
      hi: "पतली चमकदार अंगूठी, जिसमें चार पंजों पर उठा हुआ एक साफ़ नग जड़ा है। शाम के मौक़ों और तोहफ़े के लिए सुंदर।",
      ml: "നാല് നഖങ്ങളിൽ ഉയർത്തി പതിപ്പിച്ച ഒറ്റ തെളിഞ്ഞ കല്ലുള്ള നേർത്ത തിളങ്ങുന്ന മോതിരം. വൈകുന്നേര ചടങ്ങുകൾക്കും സമ്മാനത്തിനും മനോഹരം.",
    },
  },
  {
    art: "chain", name: "Box link chain", category: "Chain", karat: 22, gross_g: "18.300", making_per_g: "12",
    d: {
      en: "A sturdy box link chain with a smooth, bright finish. Easy to wear every day, on its own or with a pendant.",
      ar: "سلسلة متينة بحلقات مربعة ولمسة ناعمة لامعة. سهلة اللبس يوميًا، وحدها أو مع تعليقة.",
      hi: "चिकनी चमक वाली मज़बूत बॉक्स लिंक चेन। रोज़ पहनने में आसान, अकेले या पेंडेंट के साथ।",
      ml: "മിനുസമുള്ള തിളക്കമുള്ള ബലമുള്ള ബോക്സ് ലിങ്ക് ചെയിൻ. ദിവസവും അണിയാൻ എളുപ്പം, ഒറ്റയ്ക്കോ പെൻഡന്റിനൊപ്പമോ.",
    },
  },
  {
    art: "necklace", name: "Temple bead necklace", category: "Necklace", karat: 22, gross_g: "58.900", making_per_g: "22", status: "reserved",
    d: {
      en: "Graduated gold beads leading to a domed centrepiece, in a warm antique-style finish. Made for weddings and family celebrations.",
      ar: "خرزات ذهبية متدرجة تنتهي بقطعة وسطى مقببة، بلمسة عتيقة دافئة. مصممة للأعراس والاحتفالات العائلية.",
      hi: "धीरे-धीरे बड़े होते सोने के मनके और बीच में गुंबदनुमा लॉकेट, गर्म एंटीक फ़िनिश में। शादी और पारिवारिक जश्न के लिए।",
      ml: "ക്രമമായി വലുതാകുന്ന സ്വർണ്ണ മുത്തുകളും നടുവിൽ താഴികക്കുട ലോക്കറ്റും, ചൂടുള്ള ആന്റിക് ഫിനിഷിൽ. വിവാഹങ്ങൾക്കും കുടുംബ ആഘോഷങ്ങൾക്കും.",
    },
  },
  {
    art: "earrings", name: "Floral jhumka earrings", category: "Earrings", karat: 18, gross_g: "9.150", stone_g: "0.300", making_per_g: "30", extras_aed: "220",
    d: {
      en: "Bell-shaped jhumkas with a red stone at the centre and a fringe of tiny gold beads. Lovely with festive outfits.",
      ar: "أقراط جُمكا على شكل جرس بحجر أحمر في الوسط وأطراف من خرز ذهبي صغير. جميلة مع أزياء المناسبات.",
      hi: "घंटी के आकार के झुमके, बीच में लाल नग और किनारे पर सोने के छोटे मनकों की झालर। त्योहारी कपड़ों के साथ ख़ूबसूरत।",
      ml: "നടുവിൽ ചുവന്ന കല്ലും ചെറിയ സ്വർണ്ണ മുത്തുകളുടെ തൊങ്ങലുമുള്ള മണിയുടെ ആകൃതിയിലുള്ള ജിമിക്കി. ആഘോഷ വസ്ത്രങ്ങൾക്കൊപ്പം മനോഹരം.",
    },
  },
  {
    art: "pendant", name: "Oval calligraphy pendant", category: "Pendant", karat: 21, gross_g: "4.600", making_per_g: "0", making_flat: "250",
    d: {
      en: "An open oval pendant with a polished frame and a delicate inner ring. A thoughtful gift that suits daily wear.",
      ar: "تعليقة بيضاوية مفرغة بإطار لامع وحلقة داخلية رقيقة. هدية مميزة تناسب الاستخدام اليومي.",
      hi: "चमकदार फ़्रेम और नाज़ुक भीतरी छल्ले वाला खुला अंडाकार पेंडेंट। रोज़ पहनने लायक एक प्यारा तोहफ़ा।",
      ml: "തിളങ്ങുന്ന ഫ്രെയിമും നേർത്ത അകവളയവുമുള്ള തുറന്ന ഓവൽ പെൻഡന്റ്. ദിവസവും അണിയാൻ പറ്റിയ നല്ലൊരു സമ്മാനം.",
    },
  },
  {
    art: "bracelet", name: "Italian link bracelet", category: "Bracelet", karat: 18, gross_g: "12.750", making_per_g: "20",
    d: {
      en: "Light, flexible oval links with a bright polish. A modern piece for the office or the weekend.",
      ar: "حلقات بيضاوية خفيفة ومرنة بلمعة ساطعة. قطعة عصرية للعمل أو لعطلة نهاية الأسبوع.",
      hi: "हल्की, लचीली अंडाकार कड़ियाँ, तेज़ चमक के साथ। ऑफ़िस या वीकेंड के लिए आधुनिक पीस।",
      ml: "തിളക്കമുള്ള ഭാരം കുറഞ്ഞ, വഴങ്ങുന്ന ഓവൽ കണ്ണികൾ. ഓഫീസിനും വാരാന്ത്യത്തിനും ആധുനിക പീസ്.",
    },
  },
  {
    art: "set", name: "Bridal necklace set", category: "Set", karat: 22, gross_g: "96.400", stone_g: "2.100", making_per_g: "28", extras_aed: "1200",
    d: {
      en: "A rich necklace of graduated beads with a red-stone centrepiece and matching drop earrings. Made for the bride's big day.",
      ar: "عقد فاخر من خرز متدرج بقطعة وسطى بحجر أحمر مع أقراط متدلية متناسقة. مصمم ليوم العروس الكبير.",
      hi: "धीरे-धीरे बड़े होते मनकों का भव्य हार, बीच में लाल नग, साथ में मेल खाते लटकन वाले झुमके। दुल्हन के ख़ास दिन के लिए।",
      ml: "ക്രമമായി വലുതാകുന്ന മുത്തുകളുടെ സമൃദ്ധമായ മാലയും നടുവിൽ ചുവന്ന കല്ലും, ഒപ്പം ചേരുന്ന തൂങ്ങുന്ന കമ്മലുകളും. വധുവിന്റെ വലിയ ദിവസത്തിനായി.",
    },
  },
  {
    art: "baby-bangle", name: "Pure gold baby bangle", category: "Bangle", karat: 24, gross_g: "7.200", making_per_g: "10",
    d: {
      en: "A small, smooth bangle in pure gold with softly rounded edges. A traditional gift for a newborn.",
      ar: "سوار صغير ناعم من الذهب الخالص بحواف مستديرة. هدية تقليدية للمولود الجديد.",
      hi: "शुद्ध सोने का छोटा, चिकना कंगन, मुलायम गोल किनारों के साथ। नवजात के लिए पारंपरिक तोहफ़ा।",
      ml: "മൃദുവായ ഉരുണ്ട അരികുകളുള്ള, ശുദ്ധ സ്വർണ്ണത്തിലുള്ള ചെറിയ മിനുസമുള്ള വള. നവജാത ശിശുവിന് പരമ്പരാഗത സമ്മാനം.",
    },
  },
  {
    art: "signet", name: "Men's signet ring", category: "Ring", karat: 22, gross_g: "11.300", making_per_g: "15", status: "sold",
    d: {
      en: "A solid signet ring with a domed top and a satin-smooth band. A confident everyday piece for men.",
      ar: "خاتم رجالي متين بوجه مقبب وحلقة ناعمة. قطعة واثقة للاستخدام اليومي.",
      hi: "गुंबदनुमा ऊपरी हिस्से और चिकने छल्ले वाली ठोस सिग्नेट अंगूठी। पुरुषों के लिए रोज़ का दमदार पीस।",
      ml: "താഴികക്കുട മുകൾഭാഗവും മിനുസമുള്ള വളയവുമുള്ള ഉറച്ച സിഗ്നറ്റ് മോതിരം. പുരുഷന്മാർക്ക് ദിവസേനയുള്ള ആത്മവിശ്വാസമുള്ള പീസ്.",
    },
  },
];

// ------------------------------------------------------------------ helpers

async function userFor(phone) {
  const bare = phone.replace(/^\+/, "");
  // listUsers has no phone filter; demo projects are small, so page through.
  for (let page = 1; page < 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.phone === bare || u.phone === phone);
    if (hit) return hit.id;
    if (data.users.length < 200) break;
  }
  const res = must(await db.auth.admin.createUser({ phone, phone_confirm: true }), `create user ${phone}`);
  return res.user.id;
}

async function removeShopFiles(shopId) {
  const dirs = must(await db.storage.from("media").list(shopId, { limit: 1000 }), "list demo files");
  for (const dir of dirs) {
    const files = must(await db.storage.from("media").list(`${shopId}/${dir.name}`, { limit: 1000 }), "list demo files");
    if (files.length) must(await db.storage.from("media").remove(files.map((f) => `${shopId}/${dir.name}/${f.name}`)), "remove demo files");
  }
}

async function upload(path, bytes) {
  must(await db.storage.from("media").upload(path, bytes, { contentType: "image/png", upsert: true }), `upload ${path}`);
}

// ------------------------------------------------------------------ seed

const ownerId = await userFor(OWNER_PHONE);
const salesId = SALES_PHONE ? await userFor(SALES_PHONE) : null;

// Replace an earlier demo shop owned by the same person.
const old = must(await db.from("shops").select("id").eq("name", SHOP_NAME).eq("created_by", ownerId), "find old demo shop");
for (const s of old) {
  await removeShopFiles(s.id);
  must(await db.from("shops").delete().eq("id", s.id), "remove old demo shop");
}

const shop = must(
  await db.from("shops").insert({ name: SHOP_NAME, sku_prefix: "ANJ", default_making_per_g: 18, vat_enabled: true, created_by: ownerId }).select("id").single(),
  "create shop",
);
must(await db.from("shop_members").insert({ shop_id: shop.id, user_id: ownerId, role: "owner" }), "add owner");
if (salesId) must(await db.from("shop_members").insert({ shop_id: shop.id, user_id: salesId, role: "salesperson" }), "add salesperson");
must(await db.from("gold_rates").insert(Object.entries(RATES).map(([karat, aed]) => ({ shop_id: shop.id, karat: Number(karat), aed_per_g: aed, set_by: ownerId }))), "set rates");

const ids = [];
for (const [i, p] of PIECES.entries()) {
  const id = randomUUID();
  ids.push(id);
  // Spread "added" times over the last two weeks, newest first in the catalogue.
  const createdAt = new Date(Date.now() - (PIECES.length - i) * 31 * 3600 * 1000).toISOString();
  must(
    await db.from("pieces").insert({
      id, shop_id: shop.id, name: p.name, category: p.category, karat: p.karat, gross_g: p.gross_g, stone_g: p.stone_g ?? "0",
      making_per_g: p.making_per_g, making_flat: p.making_flat ?? null, extras_aed: p.extras_aed ?? "0",
      descriptions: p.d, status: p.status ?? "in_stock", created_by: i % 3 === 2 && salesId ? salesId : ownerId, created_at: createdAt,
    }),
    `add ${p.name}`,
  );
  const dir = `${shop.id}/${id}`;
  const photoId = randomUUID();
  const photo = photoPng(p.art, 1000);
  await upload(`${dir}/photo-${photoId}.png`, photo);
  await upload(`${dir}/photo-${photoId}-thumb.png`, photoPng(p.art, 480));
  const media = [{ id: photoId, piece_id: id, shop_id: shop.id, type: "photo", storage_path: `${dir}/photo-${photoId}.png`, thumb_path: `${dir}/photo-${photoId}-thumb.png`, bytes: photo.length, sort_order: 0, created_by: ownerId }];
  if (p.spin) {
    const spinId = randomUUID();
    const sprite = spritePng(p.art, 360);
    await upload(`${dir}/spin-${spinId}.png`, sprite);
    await upload(`${dir}/spin-${spinId}-small.png`, spritePng(p.art, 120));
    media.push({ id: spinId, piece_id: id, shop_id: shop.id, type: "spin_sprite", storage_path: `${dir}/spin-${spinId}.png`, thumb_path: `${dir}/spin-${spinId}-small.png`, bytes: sprite.length, frames: 24, cols: 6, cell_px: 360, sort_order: 1, created_by: ownerId });
  }
  must(await db.from("piece_media").insert(media), `add pictures for ${p.name}`);
  process.stdout.write(`  ${String(i + 1).padStart(2)}. ${p.karat}K ${p.name}${p.spin ? " (with 360° spin)" : ""}\n`);
}

// A client and a live share link for the owner, so the sharing screens have something to show.
const client = must(
  await db.from("clients").insert({ shop_id: shop.id, salesperson_id: ownerId, name: "Fatima Al Mansoori", phone: "+971501234567", language: "ar", preferences: "Likes light pieces for daily wear; prefers 22K." }).select("id").single(),
  "add client",
);
const share = must(
  await db.from("shares").insert({ shop_id: shop.id, salesperson_id: ownerId, client_id: client.id, piece_ids: [ids[0], ids[1], ids[4], ids[6]] }).select("public_token").single(),
  "create share",
);

console.log(`\nDemo shop "${SHOP_NAME}" is ready: ${PIECES.length} pieces, today's rates (24K AED ${RATES[24]}), 1 client, 1 share link.`);
console.log(`Owner:       ${OWNER_PHONE}${local && OWNER_PHONE === "+971500000001" ? "  (sign in with 050 000 0001, code 123456)" : ""}`);
if (SALES_PHONE) console.log(`Salesperson: ${SALES_PHONE}${local && SALES_PHONE === "+971500000002" ? "  (050 000 0002, code 123456)" : ""}`);
console.log(`Share link:  ${SITE}/s/${share.public_token}`);
