/** @type {import('next').NextConfig} */
const nextConfig = {}

module.exports = {
  async rewrites() {
    return [
      {
        source: "/api/:path*", // Todas las solicitudes que comiencen con /api
        destination: `${process.env.NEXT_PUBLIC_API_URL}/:path*`, // Redirige al backend
      },
    ];
  },
};
