import type { AppProps } from "next/app";
import { Cormorant_Garamond, DM_Mono } from "next/font/google";
import "@/styles/globals.css";

const serif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

export default function App({ Component, pageProps }: AppProps) {
  return (
    <div
      className={`app-shell ${serif.className} ${serif.variable} ${dmMono.variable}`}
    >
      <Component {...pageProps} />
    </div>
  );
}
