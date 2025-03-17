import { Html, Head, Main, NextScript } from "next/document";
import Script from "next/script"; // Importa el componente Script

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* Agrega el script de RecordRTC */}
        <Script
          src="https://cdnjs.cloudflare.com/ajax/libs/RecordRTC/5.6.2/RecordRTC.min.js"
          strategy="beforeInteractive" // Carga el script antes de que la página sea interactiva
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}