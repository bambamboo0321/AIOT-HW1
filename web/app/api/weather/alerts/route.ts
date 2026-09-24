import { NextResponse } from "next/server";
import { createSuccessResponse, createFailureResponse } from "@/lib/contracts/api";
import { AppError } from "@/lib/server/errors";
import { fetchCwaAlerts } from "@/lib/server/cwa-alert-client";

export const dynamic = "force-dynamic";

/**
 * Cache-Control Policy for Weather Alerts
 *
 * Weather warnings must remain timely:
 * - Browser cache: 60s
 * - Edge CDN cache: 300s
 * - Stale-while-revalidate: 600s
 */
export const ALERTS_CACHE_CONTROL = "public, max-age=60, s-maxage=300, stale-while-revalidate=600";
export const ERROR_CACHE_CONTROL = "no-store, max-age=0";
export const JSON_CONTENT_TYPE = "application/json; charset=utf-8";

export async function GET() {
  try {
    const data = await fetchCwaAlerts();

    return NextResponse.json(createSuccessResponse(data), {
      status: 200,
      headers: {
        "Content-Type": JSON_CONTENT_TYPE,
        "Cache-Control": ALERTS_CACHE_CONTROL,
      },
    });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json(err.toApiResponse(), {
        status: err.statusCode,
        headers: {
          "Content-Type": JSON_CONTENT_TYPE,
          "Cache-Control": ERROR_CACHE_CONTROL,
        },
      });
    }

    // Generic fallback: never leak internal stack traces or secrets
    return NextResponse.json(
      createFailureResponse("INTERNAL_ERROR", "An unexpected server error occurred while retrieving weather alerts."),
      {
        status: 500,
        headers: {
          "Content-Type": JSON_CONTENT_TYPE,
          "Cache-Control": ERROR_CACHE_CONTROL,
        },
      }
    );
  }
}
