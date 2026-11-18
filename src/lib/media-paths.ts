/** Storage layout: media/{shop}/{piece}/{kind}-{mediaId}[-thumb].{ext}. Built on the server only. */
export type UploadKind = "photo" | "spin" | "video";
export const VIDEO_EXTS = ["mp4", "mov", "3gp", "webm"] as const;

export function mediaPaths(shopId: string, pieceId: string, mediaId: string, kind: UploadKind, ext: string) {
  const dir = `${shopId}/${pieceId}`;
  switch (kind) {
    case "photo":
      return { main: `${dir}/photo-${mediaId}.jpg`, thumb: `${dir}/photo-${mediaId}-thumb.jpg`, mainType: "image/jpeg" };
    case "spin":
      return { main: `${dir}/spin-${mediaId}.jpg`, thumb: `${dir}/spin-${mediaId}-small.jpg`, mainType: "image/jpeg" };
    case "video": {
      if (!(VIDEO_EXTS as readonly string[]).includes(ext)) throw new Error("unsupported video type");
      return { main: `${dir}/video-${mediaId}.${ext}`, thumb: null, mainType: null };
    }
  }
}

export const MEDIA_TYPE: Record<UploadKind, "photo" | "spin_sprite" | "spin_video"> = {
  photo: "photo",
  spin: "spin_sprite",
  video: "spin_video",
};
