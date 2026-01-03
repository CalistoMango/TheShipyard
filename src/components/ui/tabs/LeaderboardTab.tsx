"use client";

import { useEffect, useState } from "react";
import { ProfileLink } from "~/components/ui/ProfileLink";

interface Builder {
  rank: number;
  fid: number;
  name: string;
  pfp_url: string | null;
  claimed: number;
  earned: number;
  streak: number;
}

interface Submitter {
  rank: number;
  fid: number;
  name: string;
  pfp_url: string | null;
  ideas: number;
  earnings: number;
}

interface Funder {
  rank: number;
  fid: number;
  name: string;
  pfp_url: string | null;
  funded: number;
  total: number;
}

function getRankStyle(index: number): string {
  if (index === 0) return "bg-yellow-500 text-yellow-900";
  if (index === 1) return "bg-gray-400 text-gray-900";
  return "bg-orange-700 text-orange-200";
}

export function LeaderboardTab() {
  const [builders, setBuilders] = useState<Builder[]>([]);
  const [submitters, setSubmitters] = useState<Submitter[]>([]);
  const [funders, setFunders] = useState<Funder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLeaderboards() {
      setLoading(true);
      try {
        const [buildersRes, submittersRes, fundersRes] = await Promise.all([
          fetch("/api/leaderboard?type=builders&limit=10"),
          fetch("/api/leaderboard?type=submitters&limit=10"),
          fetch("/api/leaderboard?type=funders&limit=10"),
        ]);

        if (buildersRes.ok) {
          const buildersData = await buildersRes.json();
          setBuilders(buildersData.data || []);
        }

        if (submittersRes.ok) {
          const submittersData = await submittersRes.json();
          setSubmitters(submittersData.data || []);
        }

        if (fundersRes.ok) {
          const fundersData = await fundersRes.json();
          setFunders(fundersData.data || []);
        }
      } catch (error) {
        console.error("Failed to fetch leaderboards:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchLeaderboards();
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white">Leaderboards</h2>
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-400">Loading leaderboards...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Leaderboards</h2>

      {/* Top Builders */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
        <h3 className="font-semibold text-white mb-3">🏆 Top Builders</h3>
        {builders.length === 0 ? (
          <p className="text-gray-500 text-sm">No builders yet. Be the first to claim a bounty!</p>
        ) : (
          <div className="space-y-3">
            {builders.map((b, i) => (
              <div key={b.fid} className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${getRankStyle(i)}`}
                >
                  {i + 1}
                </div>
                {b.pfp_url ? (
                  <img src={b.pfp_url} alt="" className="w-8 h-8 rounded-full" />
                ) : (
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full" />
                )}
                <div className="flex-1">
                  <ProfileLink fid={b.fid} className="text-white font-medium">
                    {b.name}
                  </ProfileLink>
                  <div className="text-gray-500 text-xs">{b.claimed} bounties</div>
                </div>
                <div className="text-emerald-400 font-bold">${b.earned}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top Idea Submitters */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
        <h3 className="font-semibold text-white mb-3">💡 Top Idea Submitters</h3>
        {submitters.length === 0 ? (
          <p className="text-gray-500 text-sm">No idea submitters yet.</p>
        ) : (
          <div className="space-y-3">
            {submitters.map((u, i) => (
              <div key={u.fid} className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${getRankStyle(i)}`}
                >
                  {i + 1}
                </div>
                {u.pfp_url ? (
                  <img src={u.pfp_url} alt="" className="w-8 h-8 rounded-full" />
                ) : (
                  <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full" />
                )}
                <div className="flex-1">
                  <ProfileLink fid={u.fid} className="text-white font-medium">
                    {u.name}
                  </ProfileLink>
                  <div className="text-gray-500 text-xs">{u.ideas} ideas built</div>
                </div>
                <div className="text-emerald-400 font-bold">${u.earnings}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top Funders */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
        <h3 className="font-semibold text-white mb-3">💰 Top Funders</h3>
        {funders.length === 0 ? (
          <p className="text-gray-500 text-sm">No funders yet. Be the first to fund an idea!</p>
        ) : (
          <div className="space-y-3">
            {funders.map((f, i) => (
              <div key={f.fid} className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${getRankStyle(i)}`}
                >
                  {i + 1}
                </div>
                {f.pfp_url ? (
                  <img src={f.pfp_url} alt="" className="w-8 h-8 rounded-full" />
                ) : (
                  <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-full" />
                )}
                <div className="flex-1">
                  <ProfileLink fid={f.fid} className="text-white font-medium">
                    {f.name}
                  </ProfileLink>
                  <div className="text-gray-500 text-xs">{f.funded} ideas funded</div>
                </div>
                <div className="text-emerald-400 font-bold">${f.total}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
