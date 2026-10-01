"use client";

// Replaces the root layout when it fails, so it can't rely on globals.css.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "grid",
          placeItems: "center",
          minHeight: "100vh",
          margin: 0,
          padding: 16,
          textAlign: "center",
        }}
      >
        <title>Something went wrong · Artisan Market</title>
        <div>
          <h1 style={{ fontSize: 24, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ color: "#666" }}>Artisan Market hit an unexpected error.</p>
          {error.digest && <p style={{ fontFamily: "monospace", fontSize: 12, color: "#888" }}>Reference: {error.digest}</p>}
          <button onClick={() => retry()} style={{ marginTop: 16, padding: "8px 16px", cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
