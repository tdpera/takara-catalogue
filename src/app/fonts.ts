/**
 * The Maison typefaces, Latin glyphs only, self-hosted by Next at build time (phones never contact
 * Google). Arabic, Hindi and Malayalam fall through to the phone's own Noto fonts.
 *  - Manrope: all interface text and figures (tabular digits line up weights and prices).
 *    Preloaded: it's the first text on every screen.
 *  - Bodoni Moda: shop and piece names, page titles, the wordmark. Not preloaded, so it never
 *    competes with the first photos for bandwidth; it swaps in over a metric-matched fallback.
 */
import { Bodoni_Moda, Manrope } from "next/font/google";

export const sans = Manrope({ subsets: ["latin"], display: "swap", variable: "--font-manrope" });
export const display = Bodoni_Moda({
  // One weight (two files with the italic): 500 holds up at both title and caption sizes.
  weight: "500",
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-bodoni",
});
