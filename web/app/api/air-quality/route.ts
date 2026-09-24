import { NextResponse } from "next/server";
import { createSuccessResponse, createFailureResponse } from "@/lib/contracts/api";
import { AppError } from "@/lib/server/errors";
import { fetchMoenvAirQuality } from "@/lib/server/moenv-client";

export const dynamic = "force-dynamic";

/**
 * Cache-Control Policy for MOENV Real-time Air Quality (AQX_P_432)
 *
 * Upstream MOENV hourly air quality updates roughly every 60 minutes.
 * - Browser cache: 1 minute (max-age=60)
 * - CDN / Edge cache: 5 minutes (s-maxage=300)
 * - Stale-while-revalidate: 10 minutes (600s)
 */
export const AIR_QUALITY_CACHE_CONTROL =
  "public, max-age=60, s-maxage=300, stale-while-revalidate=600";
export const ERROR_CACHE_CONTROL = "no-store, max-age=0";
export const JSON_CONTENT_TYPE = "application/json; charset=utf-8";

export async function GET() {
  try {
    const data = await fetchMoenvAirQuality();

    return NextResponse.json(createSuccessResponse(data), {
      status: 200,
      headers: {
        "Content-Type": JSON_CONTENT_TYPE,
        "Cache-Control": AIR_QUALITY_CACHE_CONTROL,
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

    // Generic fallback for unhandled exceptions
    return NextResponse.json(
      createFailureResponse("INTERNAL_ERROR", "An unexpected server error occurred."),
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
