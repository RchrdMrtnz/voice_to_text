/** @type {import('next').NextConfig} */
const nextConfig = {}

module.exports = {
  async rewrites() {
    return [
      // Rutas que NO llevan /api/ en el backend
      {
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL}/:path*`,
      },
      // Rutas que SÍ llevan /api/ en el backend (como /api/resumen/)
      {
        source: "/backend-api/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL}/api/:path*`,
      },
    ];
  }
};