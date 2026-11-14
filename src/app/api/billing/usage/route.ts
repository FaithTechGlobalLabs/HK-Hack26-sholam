import { connection } from "next/server";
import { usageSnapshot } from "@/lib/billing/access";
import { isCustomerId, isDeviceId } from "@/lib/billing/plans";

export async function GET(request: Request) {
  await connection();
  const deviceId = request.headers.get("x-shalom-device");
  if (!isDeviceId(deviceId)) {
    return Response.json(
      { error: "Expected an x-shalom-device header." },
      { status: 400 },
    );
  }
  const customer = request.headers.get("x-shalom-customer");
  const usage = await usageSnapshot(
    deviceId,
    isCustomerId(customer) ? customer : null,
  );
  return Response.json(usage, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
