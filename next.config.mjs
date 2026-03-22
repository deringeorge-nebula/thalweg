// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
    transpilePackages: [
        'deck.gl',
        '@deck.gl/core',
        '@deck.gl/layers',
        '@deck.gl/geo-layers',
        '@deck.gl/react',
        '@luma.gl/core',
        '@luma.gl/webgl-legacy',
    ],
    async headers() {
        return [
            {
                source: '/api/:path*',
                headers: [
                    { key: 'Access-Control-Allow-Origin', value: '*' },
                    { key: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' },
                    { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
                ],
            },
        ];
    },
};

export default nextConfig;
