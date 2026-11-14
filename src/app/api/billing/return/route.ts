import { connection } from "next/server";

/** Checkout and the Customer Portal land here, then the app closes the browser. */
export async function GET(request: Request) {
  await connection();
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id");
  const canceled = url.searchParams.get("canceled");
  const deep = new URL("shalom://billing");
  if (sessionId) deep.searchParams.set("session_id", sessionId);
  if (canceled) deep.searchParams.set("canceled", "1");
  const target = deep.toString();
  const title = canceled ? "Checkout canceled" : "Returning to Shalom";
  const html = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#2f68c2;color:#fff;font-family:sans-serif">
  <p>${title}. You can close this window.</p>
  <script>location.replace(${JSON.stringify(target)})</script>
</body>
</html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}
