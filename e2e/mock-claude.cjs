// Local stand-in for the Claude Messages API. Scenario comes from SCENARIO_FILE contents.
const http = require("http");
const fs = require("fs");
const SC = require("path").join(process.env.E2E_TMP || require("path").join(__dirname, ".tmp"), "scenario.txt");
const LOG = SC.replace("scenario.txt", "mock-requests.jsonl");
const reply = {
  photo: "ok", name: "22K Twisted rope bangle", category: "Bangle", karat_text: "916", karat: 22,
  scale_text: "24.350 g", weight_g: 24.35,
  descriptions: {
    en: "A polished twisted rope bangle with a bright, even finish. Lovely for weddings and festive wear.",
    ar: "سوار مجدول بلمسة نهائية لامعة وتصميم أنيق. مثالي للأعراس والمناسبات.",
    hi: "चमकदार फ़िनिश वाला सुंदर बटा हुआ कंगन। शादियों और त्योहारों के लिए उत्तम।",
    ml: "തിളങ്ങുന്ന ഫിനിഷുള്ള മനോഹരമായ പിരിച്ച വള. വിവാഹങ്ങൾക്കും ആഘോഷങ്ങൾക്കും അനുയോജ്യം.",
  },
};
function msg(text, stop = "end_turn") {
  return { id: "msg_mock", type: "message", role: "assistant", model: "claude-opus-5-5", stop_reason: stop, stop_details: null,
    content: text === null ? [] : [{ type: "text", text }], usage: { input_tokens: 1750, output_tokens: 420 } };
}
http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const sc = (fs.existsSync(SC) ? fs.readFileSync(SC, "utf8") : "ok").trim();
    let parsed = {};
    try { parsed = JSON.parse(body); } catch {}
    const img = parsed.messages?.[0]?.content?.find?.((b) => b.type === "image");
    fs.appendFileSync(LOG, JSON.stringify({ sc, path: req.url, beta: req.headers["anthropic-beta"], hasKey: !!req.headers["x-api-key"], auth: Object.keys(req.headers).filter(h => /key|auth/i.test(h)),
      model: parsed.model, fallbacks: parsed.fallbacks, effort: parsed.output_config?.effort, format: parsed.output_config?.format?.type,
      imageType: img?.source?.media_type, imageB64Len: img?.source?.data?.length }) + "\n");
    const send = (status, obj, headers = {}) => { res.writeHead(status, { "content-type": "application/json", ...headers }); res.end(JSON.stringify(obj)); };
    const delay = sc === "slow" ? 3000 : 600;
    const isMessage = typeof parsed.system === "string" && parsed.system.includes("WhatsApp message");
    if (isMessage) {
      const facts = parsed.messages?.[0]?.content || "";
      fs.appendFileSync(LOG, JSON.stringify({ kind: "message", facts }) + "\n");
      const ar = /Language: Arabic/.test(facts);
      const parts = sc === "msg_digits"
        ? { intro: "Special price only AED 9,999 today!", closing: "Offer ends in 2 days." }
        : ar
          ? { intro: "مرحبًا فاطمة، اخترت لكِ هذه القطع الخفيفة التي تناسب استخدامك اليومي.", closing: "يسعدني ردك أو زيارتك للمحل في أي وقت." }
          : { intro: "Hello, I picked these pieces with you in mind.", closing: "Reply here or drop by the shop any time." };
      return setTimeout(() => send(200, msg(JSON.stringify(parts))), 400);
    }
    setTimeout(() => {
      switch (sc) {
        case "ok": return send(200, msg(JSON.stringify(reply)));
        case "no_scale": return send(200, msg(JSON.stringify({ ...reply, karat: null, karat_text: "", weight_g: null, scale_text: "" })));
        case "bad_weight": return send(200, msg(JSON.stringify({ ...reply, weight_g: 30, scale_text: "24.350 g", descriptions: { ...reply.descriptions, en: "A 24 gram bangle." } })));
        case "blurry": return send(200, msg(JSON.stringify({ ...reply, photo: "too_blurry" })));
        case "refusal": return send(200, msg(null, "refusal"));
        case "bad_json": return send(200, msg("{\"photo\": \"ok\", \"name\""));
        case "rate": return send(429, { type: "error", error: { type: "rate_limit_error", message: "rate limited" } }, { "retry-after": "20", "x-should-retry": "false" });
        case "overloaded": return send(529, { type: "error", error: { type: "overloaded_error", message: "overloaded" } }, { "x-should-retry": "false" });
        case "badkey": return send(401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } });
        default: return send(200, msg(JSON.stringify(reply)));
      }
    }, delay);
  });
}).listen(4010, () => console.log("mock claude on 4010"));
