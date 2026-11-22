import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { LOCALES, dirFor, makeT } from "@/i18n";
import { LanguagePicker } from "@/components/LanguagePicker";
import { Logo } from "@/components/icons";
import { Odometer } from "@/components/Odometer";
import { RingHero } from "@/components/intro/RingHero";
import { IntroMotion } from "@/components/intro/IntroMotion";
import { LoginForm } from "./LoginForm";
import "./intro.css";

export const metadata: Metadata = {
  title: { absolute: "Takara · Gold, beautifully catalogued" },
  description: "The catalogue for Dubai's jewellers: photograph a piece, and it's described in four languages, priced at today's gold rate and ready to share.",
};

// The demo piece in "how it works": 24.35 g of 22K at an example rate of 437.39 AED/g,
// making 18 AED/g, 5% VAT. The figures are the app's own arithmetic, rounded as it rounds.
const DEMO = { weight: "24.35", rate: "437.39", gold: "10,650.45", making: "438.30", vat: "554.44", total: "11,643" };
const BOARD = [
  { k: "24K", v: "472.50" },
  { k: "22K", v: "437.39" },
  { k: "21K", v: "419.44" },
  { k: "18K", v: "359.67" },
];
// Real descriptions in each language, as the AI writes them.
const DESCS = [
  { l: "en", t: "Hand-twisted 22K rope kada with a mirror finish." },
  { l: "ar", t: "كادا من ذهب عيار 22 بتصميم حبل ملتوي ولمسة لامعة." },
  { l: "hi", t: "शीशे जैसी चमक वाला 22K रस्सी डिज़ाइन कड़ा।" },
  { l: "ml", t: "കണ്ണാടി പോലെ തിളങ്ങുന്ന 22K കയർ ഡിസൈൻ വള." },
] as const;

const Icon = ({ d }: { d: string }) => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const PROMISE_ICONS = [
  "M6.5 10.5V8a5.5 5.5 0 0 1 11 0v2.5M5 10.5h14v10H5zM12 14.5v2.5",
  "M3 12s3.5-6.5 9-6.5S21 12 21 12s-3.5 6.5-9 6.5S3 12 3 12zM12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z",
  "M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.6 16a5 5 0 0 1 6.8 0M12 19.5h.01",
  "M12 3v18M5 7h14M5 7l-2.5 6a3 3 0 0 0 5 0zM19 7l-2.5 6a3 3 0 0 0 5 0zM8 21h8",
];

export default async function LoginPage() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/");
  const { t, locale } = await getT();
  const titleLines = t("intro.heroTitle").split("|");
  const promises = [1, 2, 3, 4] as const;

  return (
    <div className="intro">
      <IntroMotion />
      <main id="main">

      {/* ---------------------------------------------------------------- hero */}
      <section className="intro-hero" aria-labelledby="intro-title">
        <header className="intro-top">
          <p className="wordmark font-display text-[15px] font-medium">Takara</p>
          <div className="flex items-center gap-1">
            <LanguagePicker compact className="text-[#f3eee4]! hover:bg-white/10! [&_svg]:text-[#b9ad99]!" />
            <a href="#sign-in" className="caps inline-flex min-h-10 items-center px-2 text-[11.5px] font-semibold text-[#e9c77a] hover:text-[#fff3d6]">
              {t("intro.signIn")}
            </a>
          </div>
        </header>

        <div className="intro-hero-grid">
          <div className="intro-ring">
            <RingHero />
            <p className="intro-drag caps">{t("intro.dragHint")}</p>
          </div>
          <div className="intro-copy">
            <p className="eyebrow intro-eyebrow hero-in" style={{ "--i": 0 } as React.CSSProperties}>{t("intro.forJewellers")}</p>
            <h1 id="intro-title" className="intro-title">
              {titleLines.map((line, i) => (
                <span key={i} className="line">
                  <span className="gold-text hero-line" style={{ "--i": i } as React.CSSProperties}>{line}</span>
                </span>
              ))}
            </h1>
            <p className="intro-lede hero-in" style={{ "--i": 4 } as React.CSSProperties}>{t("intro.heroText")}</p>
            <div className="intro-ctas hero-in" style={{ "--i": 5 } as React.CSSProperties}>
              <a href="#sign-in" className="intro-btn-gold caps">{t("intro.signIn")}</a>
              <a href="#how" className="intro-btn-ghost caps">{t("intro.howItWorks")}</a>
            </div>
          </div>
        </div>
        <a href="#how" className="intro-scroll caps" aria-label={t("intro.howItWorks")}>
          <span aria-hidden="true">{t("intro.scroll")}</span>
          <i aria-hidden="true" />
        </a>
      </section>

      {/* ---------------------------------------------------------------- how it works */}
      <section id="how" className="intro-story" aria-labelledby="story-title">
        <div className="story-head" data-reveal>
          <p className="eyebrow">{t("intro.storyEyebrow")}</p>
          <h2 id="story-title" className="intro-h2">{t("intro.storyTitle")}</h2>
        </div>
        <div className="story-grid">
          <div className="story-phone-wrap">
            <div className="story-phone" data-phone data-active="1" aria-hidden="true">
              <div className="phone-notch" />
              {/* 1 · photograph */}
              <div className="scr s1">
                <div className="cam">
                  <div className="scale">
                    <div className="plate">
                      <svg viewBox="0 0 48 30" className="plate-ring">
                        <ellipse cx="24" cy="15" rx="15" ry="9" fill="none" stroke="url(#ph-gold)" strokeWidth="3.4" />
                        <defs>
                          <linearGradient id="ph-gold" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0" stopColor="#fbe7b0" />
                            <stop offset="0.5" stopColor="#c99a3e" />
                            <stop offset="1" stopColor="#f1d38c" />
                          </linearGradient>
                        </defs>
                      </svg>
                    </div>
                    <div className="scale-body">
                      <div className="lcd">
                        <span>{DEMO.weight}</span>
                        <small>g</small>
                      </div>
                    </div>
                  </div>
                  <i className="corner tl" />
                  <i className="corner tr" />
                  <i className="corner bl" />
                  <i className="corner br" />
                  <div className="scan" />
                  <div className="flash" />
                </div>
                <div className="shutter">
                  <i />
                </div>
              </div>
              {/* 2 · read and written */}
              <div className="scr s2">
                <p className="f-label">{t("edit.name")}</p>
                <p className="f-val">
                  <span className="typed">{t("intro.demoName")}</span>
                </p>
                <div className="f-chips">
                  <span className="ai">22K</span>
                  <span>{t("intro.demoCategory")}</span>
                  <span className="ai" dir="ltr">{DEMO.weight} g</span>
                </div>
                <p className="ai-note">✦ {t("intro.demoAi")}</p>
                <ul className="descs">
                  {DESCS.map((d, i) => (
                    <li key={d.l} lang={d.l} dir={d.l === "ar" ? "rtl" : "ltr"} style={{ "--i": i } as React.CSSProperties}>
                      <b>{d.l.toUpperCase()}</b>
                      {d.t}
                    </li>
                  ))}
                </ul>
              </div>
              {/* 3 · priced */}
              <div className="scr s3">
                <p className="p-label">{t("intro.demoTotal")}</p>
                <p className="p-big">
                  <span className="p-cur">AED</span>
                  <Odometer value={DEMO.total} trigger="parent" />
                </p>
                <div className="p-rule" />
                <dl className="p-rows">
                  <div style={{ "--i": 0 } as React.CSSProperties}>
                    <dt>{t("intro.demoGold")} <span dir="ltr">{DEMO.weight} g × {DEMO.rate}</span></dt>
                    <dd dir="ltr">{DEMO.gold}</dd>
                  </div>
                  <div style={{ "--i": 1 } as React.CSSProperties}>
                    <dt>{t("intro.demoMaking")} <span dir="ltr">18.00/g</span></dt>
                    <dd dir="ltr">{DEMO.making}</dd>
                  </div>
                  <div style={{ "--i": 2 } as React.CSSProperties}>
                    <dt>{t("intro.demoVat")}</dt>
                    <dd dir="ltr">{DEMO.vat}</dd>
                  </div>
                </dl>
              </div>
              {/* 4 · shared */}
              <div className="scr s4">
                <div className="wa-top">
                  <i />
                  <span>Fatima</span>
                </div>
                <div className="wa-chat">
                  <div className="wa-bubble">
                    <div className="wa-card">
                      <div className="wa-thumb">
                        <svg viewBox="0 0 48 48">
                          <circle cx="24" cy="27" r="11" fill="none" stroke="url(#ph-gold)" strokeWidth="3" />
                          <path d="M24 7 28.5 11.5 24 16 19.5 11.5z" fill="#f4f1ea" stroke="#d9ab4e" strokeWidth="0.6" />
                        </svg>
                      </div>
                      <div>
                        <p className="wa-card-t">{t("intro.demoLinkTitle")}</p>
                        <p className="wa-card-s">{t("intro.demoShop")}</p>
                      </div>
                    </div>
                    <p className="wa-text">{t("intro.demoMessage")}</p>
                    <p className="wa-meta">
                      17:05 <span className="ticks">✓✓</span>
                    </p>
                  </div>
                </div>
                <div className="wa-input">
                  <i />
                  <b />
                </div>
              </div>
            </div>
          </div>

          <ol className="story-steps">
            {[1, 2, 3, 4].map((n) => (
              <li key={n} className="story-step" data-step={n}>
                <span className="step-num" dir="ltr">0{n}</span>
                <h3 className="step-title">{t(`intro.step${n}Title` as "intro.step1Title")}</h3>
                <p className="step-text">{t(`intro.step${n}Text` as "intro.step1Text")}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------------------------------------------------------------- rate board */}
      <section className="intro-board" aria-labelledby="board-title">
        <div className="board-copy" data-reveal>
          <p className="eyebrow intro-eyebrow">{t("intro.boardEyebrow")}</p>
          <h2 id="board-title" className="intro-h2 gold-text">{t("intro.boardTitle")}</h2>
          <p className="board-text">{t("intro.boardText")}</p>
        </div>
        <div className="board" data-reveal>
          {BOARD.map((r, i) => (
            <div key={r.k} className="board-row" style={{ "--row": i } as React.CSSProperties}>
              <span className="board-k" dir="ltr">{r.k}</span>
              <Odometer value={r.v} flap trigger="parent" className="board-v" />
            </div>
          ))}
          <p className="board-note">{t("intro.boardNote")}</p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- languages */}
      <section className="intro-langs" aria-labelledby="langs-title">
        <div data-reveal>
          <p className="eyebrow">{t("intro.langsEyebrow")}</p>
          <h2 id="langs-title" className="intro-h2">{t("intro.langsTitle")}</h2>
        </div>
        <div className="langs-stage" data-reveal>
          {LOCALES.map((l, i) => (
            <p key={l} lang={l} dir={dirFor(l)} className="langs-line" style={{ "--i": i } as React.CSSProperties}>
              <span className="langs-name">{makeT(l)("app.name")}</span>
              <span className="langs-tag">{makeT(l)("app.tagline")}</span>
            </p>
          ))}
        </div>
        <p className="langs-text" data-reveal>{t("intro.langsText")}</p>
      </section>

      {/* ---------------------------------------------------------------- promises */}
      <section className="intro-promises" aria-labelledby="promises-title">
        <h2 id="promises-title" className="intro-h2 text-center" data-reveal>{t("intro.promisesTitle")}</h2>
        <ul className="promise-grid">
          {promises.map((n, i) => (
            <li key={n} className="promise" data-reveal style={{ "--i": i } as React.CSSProperties}>
              <span className="promise-icon"><Icon d={PROMISE_ICONS[i]} /></span>
              <h3 className="promise-title">{t(`intro.p${n}Title` as "intro.p1Title")}</h3>
              <p className="promise-text">{t(`intro.p${n}Text` as "intro.p1Text")}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------------------------------------------------------------- sign in */}
      <section id="sign-in" className="intro-signin" aria-labelledby="signin-title">
        <div className="signin-card" data-reveal>
          <Logo size={44} draw />
          <p className="eyebrow mt-5">{t("intro.signInEyebrow")}</p>
          <h2 id="signin-title" className="mt-2 font-display text-[1.9rem] leading-tight">{t("login.title")}</h2>
          <p className="mt-1 text-muted">{t("login.subtitle")}</p>
          <div className="text-start">
            <LoginForm />
          </div>
        </div>
      </section>
      </main>
      <footer className="intro-foot">
        <Logo size={18} />
        <span className="wordmark font-display text-[12px]">Takara</span>
        <span aria-hidden="true">·</span>
        <span lang={locale}>{t("intro.footer")}</span>
      </footer>
    </div>
  );
}
