import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/battle/requestAuth";
import { checkRateLimit } from "@/lib/battle/store";
import { fetchRandomPack } from "@/lib/objkt";
import { attachSalesContext } from "@/lib/packSales";
import { loadDenylist, scheduleExclusionWrite } from "@/lib/pullStore";

// The pack is drawn server-side, so a shared CDN cache would hand every visitor
// the same "random" pack for the life of the entry. Stays uncached on purpose.
export const dynamic = "force-dynamic";

// One GraphQL call, plus a fallback query when the windows come back empty.
export const maxDuration = 20;

// Every pack costs several OBJKT queries from our server, and the route is
// public, so an outside script calling it spends our share of OBJKT's own
// rate limit. A person ripping packs by hand never gets near this budget.
const PACK_RATE_LIMIT_WINDOW_SECONDS = 60;
const PACK_RATE_LIMIT_MAX_REQUESTS = 30;

/**
 * Fails open: packs work with no database (DATABASE_URL is scoped to
 * battling), so a missing or failing database serves the pack unmetered
 * rather than turning every pull into an error.
 */
async function withinPackBudget(request: NextRequest): Promise<boolean> {
  if (!process.env.DATABASE_URL) return true;
  try {
    return await checkRateLimit(
      `random-pack:${getClientIp(request)}`,
      PACK_RATE_LIMIT_WINDOW_SECONDS,
      PACK_RATE_LIMIT_MAX_REQUESTS,
    );
  } catch (error) {
    console.error("random-pack rate limit unavailable, serving the pack unmetered:", error);
    return true;
  }
}

function rateLimitedResponse() {
  return NextResponse.json(
    { error: "You're opening packs too fast. Wait a minute and try again." },
    {
      status: 429,
      // The budget is a fixed window, so a full window is the longest wait.
      headers: { "Retry-After": String(PACK_RATE_LIMIT_WINDOW_SECONDS) },
    },
  );
}

function getRequestCount(body: unknown): unknown {
  if (!body || typeof body !== "object" || !("count" in body)) return undefined;
  return body.count;
}

async function handleGeneratePack(countParam: unknown) {
  const count = Math.min(Math.max(Number(countParam) || 5, 3), 10);

  try {
    // Never throws: a database failure degrades the filter to the three OBJKT
    // rules rather than failing the pack.
    const denylist = await loadDenylist();
    const draw = await fetchRandomPack(count, denylist);
    const { excluded } = draw;
    // A second OBJKT request, after the draw; never fails the pack.
    const cards = await attachSalesContext(draw.cards);

    if (!cards || cards.length === 0) {
      return NextResponse.json(
        { error: "Failed to generate pack. Please try again." },
        { status: 500 }
      );
    }

    // Runs once the response has been sent, so recording an audit trail never
    // makes a draw slower. Bounded by this route's maxDuration.
    scheduleExclusionWrite(excluded);

    return NextResponse.json({
      cards,
      timestamp: Date.now(),
      packSize: cards.length,
    });
  } catch (error) {
    console.error("Error in /api/random-pack:", error);
    return NextResponse.json(
      { error: "Failed to generate booster pack" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  if (!(await withinPackBudget(request))) return rateLimitedResponse();
  const { searchParams } = new URL(request.url);
  return handleGeneratePack(searchParams.get("count"));
}

export async function POST(request: NextRequest) {
  if (!(await withinPackBudget(request))) return rateLimitedResponse();
  const body: unknown = await request.json().catch(() => ({}));
  return handleGeneratePack(getRequestCount(body));
}
