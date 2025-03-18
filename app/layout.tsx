import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "react-hot-toast"; 

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Transcripción de Audio",
  description: "Transcribe un audio con Whisper",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className={inter.className}>
        <Toaster position="top-right" reverseOrder={false} /> 
        {children}
      </body>
    </html>
  );
}