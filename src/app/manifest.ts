import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Takara",
    short_name: "Takara",
    description: "Fast catalogues for gold and jewellery sellers.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fbf9f5",
    theme_color: "#fbf9f5",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [{ name: "Add piece", url: "/add", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] }],
  };
}
