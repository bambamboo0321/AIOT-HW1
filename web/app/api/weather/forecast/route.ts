import { NextResponse } from "next/server";
import { createSuccessResponse, createFailureResponse } from "@/lib/contracts/api";
import { AppError } from "@/lib/server/errors";
import { fetchCwaForecast } from "@/lib/server/cwa-client";

export const dynamic = "force-dynamic";

/**
 * Cache-Control Policy for Weather Forecasts
 *
 * Upstream CWA 7-day county/city forecasts update roughly every 6 hours.
 * - Browser cache: 5 minutes (max-age=300) to prevent redundant client re-fetching
 * - CDN / Edge cache: 10 minutes (s-maxage=600) to shield CWA upstream from traffic spikes
 * - Stale-while-revalidate: 30 minutes (1800s) to serve fast stale data while updating in background
 */
export const FORECAST_CACHE_CONTROL = "public, max-age=300, s-maxage=600, stale-while-revalidate=1800";
export const ERROR_CACHE_CONTROL = "no-store, max-age=0";

export async function GET() {
  try {
    const data = await fetchCwaForecast();

    return NextResponse.json(createSuccessResponse(data), {
      status: 200,
      headers: {
        "Cache-Control": FORECAST_CACHE_CONTROL,
      },
    });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json(err.toApiResponse(), {
        status: err.statusCode,
        headers: {
          "Cache-Control": ERROR_CACHE_CONTROL,
        },
      });
    }

    // Generic fallback for unhandled exceptions to prevent leaking internal stack traces
    return NextResponse.json(
      createFailureResponse("INTERNAL_ERROR", "An unexpected server error occurred."),
      {
        status: 500,
        headers: {
          "Cache-Control": ERROR_CACHE_CONTROL,
        },
      }
    );
  }
}
