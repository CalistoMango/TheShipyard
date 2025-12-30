"use client";

import { useState, useEffect, useCallback } from "react";
import { useMiniApp } from "@neynar/react";
import sdk from "@farcaster/miniapp-sdk";

interface PendingBuild {
  id: string;
  idea_id: number;
  idea_title: string;
  builder_fid: number;
  builder_name: string;
  url: string;
  description: string | null;
  created_at: string;
}

interface PendingReport {
  id: string;
  idea_id: number;
  idea_title: string;
  reporter_fid: number;
  reporter_name: string;
  url: string;
  note: string | null;
  created_at: string;
}

interface AdminData {
  pending_builds: PendingBuild[];
  pending_reports: PendingReport[];
  stats: {
    total_ideas: number;
    total_pool: number;
    ideas_in_voting: number;
  };
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

export function AdminTab() {
  const { context } = useMiniApp();
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const userFid = context?.user?.fid;

  const fetchData = useCallback(async () => {
    if (!userFid) return;

    try {
      const res = await fetch(`/api/admin/dashboard?fid=${userFid}`);
      if (res.status === 403) {
        setError("Access denied. You are not an admin.");
        return;
      }
      if (!res.ok) {
        setError("Failed to load admin data");
        return;
      }
      const json = await res.json();
      setData(json.data);
    } catch (err) {
      console.error("Failed to fetch admin data:", err);
      setError("Failed to load admin data");
    } finally {
      setLoading(false);
    }
  }, [userFid]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleApproveBuild = async (buildId: string) => {
    if (!userFid) return;
    setActionLoading(buildId);
    try {
      const res = await fetch(`/api/admin/dashboard/builds/${buildId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_fid: userFid }),
      });
      if (res.ok) {
        fetchData();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to approve build");
      }
    } catch (err) {
      console.error("Approve error:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectBuild = async (buildId: string) => {
    if (!userFid) return;
    setActionLoading(buildId);
    try {
      const res = await fetch(`/api/admin/dashboard/builds/${buildId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_fid: userFid }),
      });
      if (res.ok) {
        fetchData();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to reject build");
      }
    } catch (err) {
      console.error("Reject error:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleApproveReport = async (reportId: string) => {
    if (!userFid) return;
    setActionLoading(reportId);
    try {
      const res = await fetch(`/api/admin/dashboard/reports/${reportId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_fid: userFid, action: "approve" }),
      });
      if (res.ok) {
        fetchData();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to approve report");
      }
    } catch (err) {
      console.error("Approve error:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDismissReport = async (reportId: string) => {
    if (!userFid) return;
    setActionLoading(reportId);
    try {
      const res = await fetch(`/api/admin/dashboard/reports/${reportId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admin_fid: userFid, action: "dismiss" }),
      });
      if (res.ok) {
        fetchData();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to dismiss report");
      }
    } catch (err) {
      console.error("Dismiss error:", err);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white">Admin Dashboard</h2>
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-400">Loading...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white">Admin Dashboard</h2>
        <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-4 text-red-300">
          {error}
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">Admin Dashboard</h2>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-white">{data.stats.total_ideas}</div>
          <div className="text-xs text-gray-500">Total Ideas</div>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-emerald-400">${data.stats.total_pool.toLocaleString()}</div>
          <div className="text-xs text-gray-500">Total Pool</div>
        </div>
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-yellow-400">{data.stats.ideas_in_voting}</div>
          <div className="text-xs text-gray-500">In Voting</div>
        </div>
      </div>

      {/* Pending Builds */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
        <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
          Pending Builds
          {data.pending_builds.length > 0 && (
            <span className="bg-orange-500 text-white text-xs px-2 py-0.5 rounded-full">
              {data.pending_builds.length}
            </span>
          )}
        </h3>
        {data.pending_builds.length === 0 ? (
          <p className="text-gray-500 text-sm">No pending builds to review.</p>
        ) : (
          <div className="space-y-3">
            {data.pending_builds.map((build) => (
              <div key={build.id} className="border border-gray-600 rounded-lg p-3 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-white font-medium">{build.idea_title}</div>
                    <div className="text-gray-400 text-xs">by fid:{build.builder_fid} - {formatTimeAgo(build.created_at)}</div>
                  </div>
                </div>
                <div
                  className="text-blue-400 text-sm truncate cursor-pointer hover:underline"
                  onClick={() => sdk.actions.openUrl(build.url)}
                >
                  {build.url}
                </div>
                {build.description && (
                  <p className="text-gray-400 text-sm">{build.description}</p>
                )}
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => handleApproveBuild(build.id)}
                    disabled={actionLoading === build.id}
                    className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-green-600/50 text-white py-2 rounded-lg text-sm font-medium"
                  >
                    {actionLoading === build.id ? "..." : "Start Voting"}
                  </button>
                  <button
                    onClick={() => handleRejectBuild(build.id)}
                    disabled={actionLoading === build.id}
                    className="flex-1 bg-red-600 hover:bg-red-500 disabled:bg-red-600/50 text-white py-2 rounded-lg text-sm font-medium"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pending Reports */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
        <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
          Solution Reports
          {data.pending_reports.length > 0 && (
            <span className="bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full">
              {data.pending_reports.length}
            </span>
          )}
        </h3>
        {data.pending_reports.length === 0 ? (
          <p className="text-gray-500 text-sm">No pending reports to review.</p>
        ) : (
          <div className="space-y-3">
            {data.pending_reports.map((report) => (
              <div key={report.id} className="border border-gray-600 rounded-lg p-3 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-white font-medium">{report.idea_title}</div>
                    <div className="text-gray-400 text-xs">reported by fid:{report.reporter_fid} - {formatTimeAgo(report.created_at)}</div>
                  </div>
                </div>
                <div
                  className="text-blue-400 text-sm truncate cursor-pointer hover:underline"
                  onClick={() => sdk.actions.openUrl(report.url)}
                >
                  {report.url}
                </div>
                {report.note && (
                  <p className="text-gray-400 text-sm">{report.note}</p>
                )}
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => handleApproveReport(report.id)}
                    disabled={actionLoading === report.id}
                    className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-green-600/50 text-white py-2 rounded-lg text-sm font-medium"
                  >
                    {actionLoading === report.id ? "..." : "Mark Built"}
                  </button>
                  <button
                    onClick={() => handleDismissReport(report.id)}
                    disabled={actionLoading === report.id}
                    className="flex-1 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-600/50 text-white py-2 rounded-lg text-sm font-medium"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
