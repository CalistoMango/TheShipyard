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

      const { data: completedIdeas } = await supabase
        .from("ideas")
        .select("submitter_fid")
        .eq("status", "completed")
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

      // Count completed (built) ideas per submitter
      const submitterBuilt = new Map<number, number>();
      for (const idea of completedIdeas || []) {
        if (idea.submitter_fid) {
          submitterBuilt.set(
            idea.submitter_fid,
            (submitterBuilt.get(idea.submitter_fid) || 0) + 1
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
        built: submitterBuilt.get(fid) || 0,
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
          built: submitter.built,
          earnings: submitter.earnings,
        };
      });

      return NextResponse.json({ data: leaderboard, type: "submitters" });
    } else if (type === "funders") {
      // Top funders by total amount funded (excluding refunded)
      const { data: fundings } = await supabase
        .from("funding")
        .select("funder_fid, idea_id, amount")
        .is("refunded_at", null);

      // Aggregate fundings by funder (count unique ideas, not transactions)
      const funderStats = new Map<
        number,
        { fid: number; total: number; ideas: Set<number> }
      >();

      for (const f of fundings || []) {
        const existing = funderStats.get(f.funder_fid) || {
          fid: f.funder_fid,
          total: 0,
          ideas: new Set<number>(),
        };
        existing.total += Number(f.amount);
        existing.ideas.add(f.idea_id);
        funderStats.set(f.funder_fid, existing);
      }

      // Get user info for top funders
      const sortedFunders = Array.from(funderStats.values())
        .map((f) => ({ fid: f.fid, total: f.total, funded: f.ideas.size }))
        .sort((a, b) => b.total - a.total)
        .slice(0, limit);

      if (sortedFunders.length === 0) {
        return NextResponse.json({ data: [], type: "funders" });
      }

      const { data: users } = await supabase
        .from("users")
        .select("fid, username, display_name, pfp_url")
        .in(
          "fid",
          sortedFunders.map((f) => f.fid)
        );

      const userMap = new Map(users?.map((u) => [u.fid, u]) || []);

      const leaderboard = sortedFunders.map((funder, index) => {
        const user = userMap.get(funder.fid);
        return {
          rank: index + 1,
          fid: funder.fid,
          name: user?.display_name || user?.username || `fid:${funder.fid}`,
          pfp_url: user?.pfp_url || null,
          funded: funder.funded,
          total: funder.total,
        };
      });

      return NextResponse.json({ data: leaderboard, type: "funders" });
    } else {
      return NextResponse.json(
        { error: "Invalid type. Use 'builders', 'submitters', or 'funders'" },
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
