import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "~/lib/supabase";

// GET /api/leaderboard?type=builders|submitters
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "builders";
  const limit = Math.min(parseInt(searchParams.get("limit") || "10", 10), 50);

  try {
    const supabase = createServerClient();

    if (type === "builders") {
      // Top builders by approved builds and earnings
      const { data: payouts } = await supabase
        .from("payouts")
        .select("recipient_fid, amount")
        .eq("payout_type", "builder");

      // Aggregate payouts by builder
      const builderStats = new Map<
        number,
        { fid: number; earned: number; builds: number }
      >();

      for (const p of payouts || []) {
        const existing = builderStats.get(p.recipient_fid) || {
          fid: p.recipient_fid,
          earned: 0,
          builds: 0,
        };
        existing.earned += Number(p.amount);
        existing.builds += 1;
        builderStats.set(p.recipient_fid, existing);
      }

      // Get user info for top builders
      const sortedBuilders = Array.from(builderStats.values())
        .sort((a, b) => b.earned - a.earned)
        .slice(0, limit);

      if (sortedBuilders.length === 0) {
        return NextResponse.json({ data: [], type: "builders" });
      }

      const { data: users } = await supabase
        .from("users")
        .select("fid, username, display_name, pfp_url, streak")
        .in(
          "fid",
          sortedBuilders.map((b) => b.fid)
        );

      const userMap = new Map(users?.map((u) => [u.fid, u]) || []);

      const leaderboard = sortedBuilders.map((builder, index) => {
        const user = userMap.get(builder.fid);
        return {
          rank: index + 1,
          fid: builder.fid,
          name: user?.display_name || user?.username || `fid:${builder.fid}`,
          pfp_url: user?.pfp_url || null,
          claimed: builder.builds,
          earned: builder.earned,
          streak: user?.streak || 0,
        };
      });

      return NextResponse.json({ data: leaderboard, type: "builders" });
    } else if (type === "submitters") {
      // Top idea submitters by number of ideas and earnings
      const { data: ideas } = await supabase
        .from("ideas")
        .select("submitter_fid")
        .not("submitter_fid", "is", null);

      const { data: payouts } = await supabase
        .from("payouts")
        .select("recipient_fid, amount")
        .eq("payout_type", "submitter");

      // Count ideas per submitter
      const submitterIdeas = new Map<number, number>();
      for (const idea of ideas || []) {
        if (idea.submitter_fid) {
          submitterIdeas.set(
            idea.submitter_fid,
            (submitterIdeas.get(idea.submitter_fid) || 0) + 1
          );
        }
      }

      // Sum earnings per submitter
      const submitterEarnings = new Map<number, number>();
      for (const p of payouts || []) {
        submitterEarnings.set(
          p.recipient_fid,
          (submitterEarnings.get(p.recipient_fid) || 0) + Number(p.amount)
        );
      }

      // Combine and sort
      const allSubmitters = new Set([
        ...submitterIdeas.keys(),
        ...submitterEarnings.keys(),
      ]);

      const submitterStats = Array.from(allSubmitters).map((fid) => ({
        fid,
        ideas: submitterIdeas.get(fid) || 0,
        earnings: submitterEarnings.get(fid) || 0,
      }));

      const sortedSubmitters = submitterStats
        .sort((a, b) => b.ideas - a.ideas || b.earnings - a.earnings)
        .slice(0, limit);

      if (sortedSubmitters.length === 0) {
        return NextResponse.json({ data: [], type: "submitters" });
      }

      const { data: users } = await supabase
        .from("users")
        .select("fid, username, display_name, pfp_url")
        .in(
          "fid",
          sortedSubmitters.map((s) => s.fid)
        );

      const userMap = new Map(users?.map((u) => [u.fid, u]) || []);

      const leaderboard = sortedSubmitters.map((submitter, index) => {
        const user = userMap.get(submitter.fid);
        return {
          rank: index + 1,
          fid: submitter.fid,
          name: user?.display_name || user?.username || `fid:${submitter.fid}`,
          pfp_url: user?.pfp_url || null,
          ideas: submitter.ideas,
          earnings: submitter.earnings,
        };
      });

      return NextResponse.json({ data: leaderboard, type: "submitters" });
    } else {
      return NextResponse.json(
        { error: "Invalid type. Use 'builders' or 'submitters'" },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Leaderboard error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
