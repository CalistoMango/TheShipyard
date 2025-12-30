"use client";

import { useEffect, useState } from "react";
import { useMiniApp } from "@neynar/react";
import { Footer } from "~/components/ui/Footer";
import { BrowseTab } from "~/components/ui/tabs/BrowseTab";
import { LeaderboardTab } from "~/components/ui/tabs/LeaderboardTab";
import { DashboardTab } from "~/components/ui/tabs/DashboardTab";
import { ProfileTab } from "~/components/ui/tabs/ProfileTab";
import { AdminTab } from "~/components/ui/tabs/AdminTab";
import { IdeaDetail } from "~/components/ui/IdeaDetail";
import type { Idea } from "~/lib/types";

export enum Tab {
  Browse = "browse",
  Leaderboard = "leaderboard",
  Dashboard = "dashboard",
  Profile = "profile",
  Admin = "admin",
}

export default function App() {
  const {
    isSDKLoaded,
    context,
    setInitialTab,
    setActiveTab,
    currentTab,
  } = useMiniApp();

  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);

  useEffect(() => {
    if (isSDKLoaded) {
      setInitialTab(Tab.Browse);
    }
  }, [isSDKLoaded, setInitialTab]);

  const handleTabChange = (tab: Tab) => {
    setSelectedIdea(null);
    setActiveTab(tab);
  };

  if (!isSDKLoaded) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-950">
        <div className="text-center">
          <div className="spinner h-8 w-8 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-gray-950 text-white"
      style={{
        paddingTop: context?.client.safeAreaInsets?.top ?? 0,
        paddingBottom: context?.client.safeAreaInsets?.bottom ?? 0,
        paddingLeft: context?.client.safeAreaInsets?.left ?? 0,
        paddingRight: context?.client.safeAreaInsets?.right ?? 0,
      }}
    >
      <div className="px-4 pt-4 pb-24">
        {selectedIdea ? (
          <IdeaDetail idea={selectedIdea} onBack={() => setSelectedIdea(null)} />
        ) : (
          <>
            {currentTab === Tab.Browse && <BrowseTab onSelectIdea={setSelectedIdea} />}
            {currentTab === Tab.Leaderboard && <LeaderboardTab />}
            {currentTab === Tab.Dashboard && <DashboardTab />}
            {currentTab === Tab.Profile && <ProfileTab onOpenAdmin={() => handleTabChange(Tab.Admin)} />}
            {currentTab === Tab.Admin && <AdminTab />}
          </>
        )}
      </div>

      <Footer activeTab={currentTab as Tab} setActiveTab={handleTabChange} />
    </div>
  );
}

