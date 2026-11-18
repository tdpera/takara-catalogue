/**
 * The prototype's two typefaces, Latin glyphs only (about 15 KB each, self-hosted by Next at build
 * time, so phones never contact Google). Arabic, Hindi and Malayalam text falls through to the
 * phone's own fonts, which cheap Android phones already have.
 *  - DM Serif Display: shop name, page titles, prices. The "jeweller's window" voice.
 *  - IBM Plex Mono: weights, rates and amounts, so figures line up in columns.
 */
import { DM_Serif_Display, IBM_Plex_Mono } from "next/font/google";

export const display = DM_Serif_Display({ weight: "400", subsets: ["latin"], display: "swap", variable: "--font-dm-serif" });
// One weight, not preloaded: figures render in the fallback first and swap in, so the font never
// competes with the first photos for bandwidth on a slow connection.
export const mono = IBM_Plex_Mono({ weight: "500", subsets: ["latin"], display: "swap", preload: false, variable: "--font-plex-mono" });
