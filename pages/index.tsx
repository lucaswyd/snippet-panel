import React, { useState } from "react";
import Head from "next/head";
import SnippetForm from "@/components/SnippetForm";
import QueuePanel from "@/components/QueuePanel";
import SnippetLibrary from "@/components/SnippetLibrary";
import RepostModal from "@/components/RepostModal";
import { RepostProvider, useRepost } from "@/components/RepostContext";

function HomeInner() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeView, setActiveView] = useState<"queue" | "library">("queue");
  const { openRepostFromMenu } = useRepost();
  const triggerPrivateFullArchive = async () => {
    await fetch("/api/trigger-full-post-private", { method: "POST" });
  };

  return (
    <>
      <Head>
        <title>Snippet Panel</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "2rem 1.5rem 3rem",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "1.5rem",
            right: "1.5rem",
            zIndex: 10,
          }}
        >
          <div style={{ position: "relative" }}>
            <button
              type="button"
              className="gear-btn"
              aria-label="Menu"
              onClick={() => setMenuOpen((o) => !o)}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
            {menuOpen && (
              <>
                <div
                  role="presentation"
                  style={{ position: "fixed", inset: 0, zIndex: 5 }}
                  onClick={() => setMenuOpen(false)}
                />
                <div className="menu" style={{ zIndex: 20 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      openRepostFromMenu();
                    }}
                  >
                    Post full public archive
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      void triggerPrivateFullArchive();
                    }}
                  >
                    Post full private archive
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <header style={{ marginBottom: "2rem", maxWidth: 560 }}>
          <p className="page-kicker">Snippet control room</p>
          <h1 style={{ fontSize: "2.35rem" }}>Snippet Panel</h1>
          <p className="subtle" style={{ fontSize: "0.95rem", lineHeight: 1.7 }}>
            Queue new uploads, track processing, and step into the archive view to
            edit posted snippet metadata without leaving the panel.
          </p>
        </header>

        <div className="panel page-switcher">
          <button
            type="button"
            className={`page-tab${activeView === "queue" ? " active" : ""}`}
            onClick={() => setActiveView("queue")}
          >
            Queue
          </button>
          <button
            type="button"
            className={`page-tab${activeView === "library" ? " active" : ""}`}
            onClick={() => setActiveView("library")}
          >
            Snippet Library
          </button>
        </div>

        {activeView === "queue" ? (
          <div
            className="layout-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 340px",
              gap: "1.5rem",
              alignItems: "start",
            }}
          >
            <SnippetForm />
            <QueuePanel />
          </div>
        ) : (
          <SnippetLibrary />
        )}
        <style jsx>{`
          @media (max-width: 960px) {
            .layout-grid {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
      </div>
      <RepostModal />
    </>
  );
}

export default function Home() {
  return (
    <RepostProvider>
      <HomeInner />
    </RepostProvider>
  );
}
