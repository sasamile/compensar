import QRCode from "qrcode";

export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t") || "";
  const png = await QRCode.toBuffer(t.slice(0, 300), { width: 260, margin: 1 });
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" } });
}
