import { ImageResponse } from "next/og";
import { getDb } from "@/server/db";
import { readCreationImage } from "@/server/storage";
import { findAnyFrame } from "@/server/frame-catalog";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A yoga photo frame created with ZenFrame";

/**
 * Social preview for a public share link: the composite on the left, frame
 * details on the right. Only publicly shared creations resolve — anything else
 * returns the branded fallback.
 */
export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let dataUrl: string | null = null;
  let title = "ZenFrame";
  let caption: string | null = null;
  let occasion: string | null = null;

  if (slug && slug.length <= 64 && /^[A-Za-z0-9_-]+$/.test(slug)) {
    const row = getDb()
      .prepare(
        `SELECT frame_id, caption, share_show_caption, storage_path, mime_type
         FROM creations WHERE share_slug = ? AND visibility = 'public'`
      )
      .get(slug) as
      | {
          frame_id: string;
          caption: string | null;
          share_show_caption: number | null;
          storage_path: string;
          mime_type: string;
        }
      | undefined;

    if (row) {
      const frame = findAnyFrame(row.frame_id);
      title = frame?.title ?? "Yoga frame";
      occasion = frame?.occasion ?? null;
      caption = row.share_show_caption !== 0 ? row.caption : null;
      const buf = await readCreationImage(row.storage_path);
      if (buf) dataUrl = `data:${row.mime_type};base64,${buf.toString("base64")}`;
    }
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "linear-gradient(120deg, #FBF7F1 0%, #FFF0DC 55%, #FDE7F1 100%)",
          padding: 48,
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            width: 420,
            height: "100%",
            borderRadius: 32,
            overflow: "hidden",
            background: "#FFE9C7",
            boxShadow: "0 24px 60px rgba(15,118,110,0.18)",
          }}
        >
          {dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
            <img
              src={dataUrl}
              width={420}
              height={534}
              style={{ objectFit: "cover", objectPosition: "center" }}
            />
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            flex: 1,
            paddingLeft: 52,
          }}
        >
          <span
            style={{
              fontSize: 22,
              letterSpacing: 6,
              color: "#0F766E",
              textTransform: "uppercase",
            }}
          >
            ZenFrame
          </span>
          <span
            style={{
              marginTop: 18,
              fontSize: 62,
              fontWeight: 700,
              color: "#243033",
              lineHeight: 1.1,
            }}
          >
            {title}
          </span>
          {occasion && (
            <span style={{ marginTop: 14, fontSize: 28, color: "#F59E0B" }}>{occasion}</span>
          )}
          {caption && (
            <span
              style={{
                marginTop: 22,
                fontSize: 30,
                fontStyle: "italic",
                color: "#5C6B6E",
                maxWidth: 620,
              }}
            >
              “{caption}”
            </span>
          )}
          <span style={{ marginTop: 30, fontSize: 24, color: "#5C6B6E" }}>
            Hand-crafted yoga photo frames · zenframe.in
          </span>
        </div>
      </div>
    ),
    size
  );
}
