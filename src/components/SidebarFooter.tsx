'use client';

import React from 'react';

interface SidebarFooterProps {
  onOpenSettings: () => void;
}

export default function SidebarFooter({ onOpenSettings }: SidebarFooterProps) {
  return (
    <div className="mt-auto w-full border-t border-gray-200 pt-4 dark:border-zinc-800 bg-transparent">
      
      {/* アカウント・設定アイコン */}
      <div className="px-4 pb-4">
        <button
          onClick={onOpenSettings} // クリックで親モーダルを開く
          className="flex h-10 w-10 items-center justify-center rounded-full bg-black shadow-sm border border-zinc-800 hover:opacity-80 transition-all focus:outline-none"
          aria-label="設定画面を開く"
        >
          {/* Next.js SVGロゴマーク */}
          <svg width="100%" height="100%" viewBox="0 0 180 180" fill="none" xmlns="http://www.w3.org/2000/svg" className="p-1">
            <mask id="mask0" maskUnits="userSpaceOnUse" x="0" y="0" width="180" height="180">
              <circle cx="90" cy="90" r="90" fill="black" />
            </mask>
            <g mask="url(#mask0)">
              <circle cx="90" cy="90" r="90" fill="black" />
              <path d="M149.508 157.52L69.142 54H54V126H65.8136V73.4122L138.266 166.423C142.154 163.682 145.91 160.71 149.508 157.52Z" fill="white" />
              <path d="M115 54H127V126H115V54Z" fill="url(#paint0_linear)" />
            </g>
            <defs>
              <linearGradient id="paint0_linear" x1="121" y1="54" x2="121" y2="126" gradientUnits="userSpaceOnUse">
                <stop stopColor="white" />
                <stop offset="1" stopColor="white" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>
        </button>
      </div>

    </div>
  );
}