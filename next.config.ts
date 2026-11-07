import type { NextConfig } from "next";

const backendUrl = (process.env.BACKEND_URL ?? "http://127.0.0.1:8000").replace(/\/+$/, "");

const nextConfig: NextConfig = {
    /* config options here */
    allowedDevOrigins: ["localhost", "10.0.0.108", "map-favorite-consensus.ngrok-free.dev"],
    async rewrites() {
        return [
            {
                source: "/media/:path*",
                destination: `${backendUrl}/media/:path*`,
            },
        ];
    },
};

export default nextConfig;
