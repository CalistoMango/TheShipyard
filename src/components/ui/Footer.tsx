import React from "react";
import { Tab } from "~/components/App";

interface FooterProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
}

export const Footer: React.FC<FooterProps> = ({ activeTab, setActiveTab }) => (
  <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-gray-900 border-t border-gray-800">
    <div className="flex items-center justify-around py-3">
      <button
        onClick={() => setActiveTab(Tab.Browse)}
        className={`flex flex-col items-center gap-1 ${activeTab === Tab.Browse ? "text-white" : "text-gray-500"}`}
      >
        <span className="text-xl">🚢</span>
        <span className="text-xs">Ideas</span>
      </button>
      <button
        onClick={() => setActiveTab(Tab.Leaderboard)}
        className={`flex flex-col items-center gap-1 ${activeTab === Tab.Leaderboard ? "text-white" : "text-gray-500"}`}
      >
        <span className="text-xl">🏅</span>
        <span className="text-xs">Contributors</span>
      </button>
      <button
        onClick={() => setActiveTab(Tab.Dashboard)}
        className={`flex flex-col items-center gap-1 ${activeTab === Tab.Dashboard ? "text-white" : "text-gray-500"}`}
      >
        <span className="text-xl">📊</span>
        <span className="text-xs">Dashboard</span>
      </button>
      <button
        onClick={() => setActiveTab(Tab.Profile)}
        className={`flex flex-col items-center gap-1 ${activeTab === Tab.Profile ? "text-white" : "text-gray-500"}`}
      >
        <span className="text-xl">👤</span>
        <span className="text-xs">Profile</span>
      </button>
    </div>
  </div>
);
