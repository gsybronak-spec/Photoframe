import { ImageResponse } from "next/og";
import { FRAMES, getFrame } from "@/lib/frames";

export const runtime = "nodejs";
export const size = { width: 1000, height: 1250 };
export const contentType = "image/png";

export function generateStaticParams() {
  return FRAMES.map((f) => ({ slug: f.slug }));
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const frame = getFrame(slug);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: frame
            ? `linear-gradient(135deg, ${frame.style.from}, ${frame.style.to})`
            : "#fff8f0",
          color: frame ? frame.style.ink : "#2d3a35",
        }}
      >
        <div style={{ fontSize: 48, letterSpacing: 12, opacity: 0.6 }}>
          ZENFRAME
        </div>
        <div style={{ fontSize: 84, fontWeight: 700, marginTop: 24 }}>
          {frame ? frame.title : "Yoga Photo Frames"}
        </div>
        <div style={{ fontSize: 40, marginTop: 16, opacity: 0.8 }}>
          {frame ? frame.tagline : "Share your practice"}
        </div>
      </div>
    ),
    size
  );
}
