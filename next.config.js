/** @type {import('next').NextConfig} */
const nextConfig = {}

module.exports = {
    async rewrites() {
      return [
        {
          source: "/api/:path*", // Todas las solicitudes que comiencen con /api
          destination: "http://34.192.168.88:8000/:path*", // Redirige al backend
        },
      ];
    },
  };