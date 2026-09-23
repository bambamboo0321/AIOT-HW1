import { NextResponse } from "next/server";
import { createSuccessResponse } from "@/lib/contracts/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const responsePayload = createSuccessResponse({
    service: "aiot-hw1-web",
    status: "healthy",
  });

  return NextResponse.json(responsePayload, {
    status: 200,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
