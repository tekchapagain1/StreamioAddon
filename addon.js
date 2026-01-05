const seedrApi = require("./seedrApi");
const torrentioApi = require("./torrentioApi");

// ============================================
// Manifest Definition
// ============================================
const manifest = {
    id: "org.seedr.stremio",
    version: "1.0.0",
    name: "Seedr Cloud Player",
    description: "Stream videos from your Seedr cloud storage account. Supports downloading torrents via Torrentio and streaming from Seedr.",
    resources: ["catalog", "stream"],
    types: ["movie", "series", "channel", "tv", "other"],
    catalogs: [
        {
            type: "other",
            id: "seedr-files",
            name: "My Seedr Files",
            extra: [{ name: "search", isRequired: false }]
        },
        {
            type: "other",
            id: "seedr-downloads",
            name: "Seedr Downloads"
        }
    ],
    idPrefixes: ["seedr:", "tt"],
    behaviorHints: {
        configurable: true,
        configurationRequired: false
    }
};

// Cache for video files (to avoid repeated API calls)
const videoCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get videos with caching
 */
async function getCachedVideos(accessToken) {
    const cached = videoCache.get(accessToken);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.videos;
    }

    const videos = await seedrApi.getAllVideoFiles(accessToken);
    videoCache.set(accessToken, {
        videos,
        timestamp: Date.now()
    });

    return videos;
}

// ============================================
// Catalog Handler - List Seedr Videos
// ============================================
async function catalogHandler(args) {
    console.log("Catalog request:", args);

    // Extract token from config
    const accessToken = args.config?.token;

    if (!accessToken) {
        console.log("No access token provided");
        return { metas: [] };
    }

    // Handle "My Seedr Files" catalog
    if (args.type === "other" && args.id === "seedr-files") {
        try {
            const videos = await getCachedVideos(accessToken);
            let filteredVideos = videos;

            // Handle search
            if (args.extra && args.extra.search) {
                const query = args.extra.search.toLowerCase();
                filteredVideos = videos.filter(v => v.name.toLowerCase().includes(query));
            }

            const metas = filteredVideos.map(video => ({
                id: `seedr:${video.id}`,
                type: "other",
                name: video.name.replace(/\.[^/.]+$/, ""), // Remove file extension
                poster: "https://www.seedr.cc/favicon.ico", // Seedr icon as placeholder
                description: `📁 ${video.path}\n📦 Size: ${formatFileSize(video.size)}`,
                releaseInfo: "Seedr Cloud"
            }));

            console.log("Returning", metas.length, "videos from Seedr");
            return { metas };
        } catch (error) {
            console.error("Error fetching Seedr catalog:", error.message);
            return { metas: [] };
        }
    }

    // Handle "Seedr Downloads" catalog - shows active transfers
    if (args.type === "other" && args.id === "seedr-downloads") {
        try {
            const transfers = await seedrApi.getActiveTransfers(accessToken);

            const metas = transfers.map(transfer => {
                const progress = transfer.progress || 0;
                const statusIcon = progress >= 100 ? "✅" : "🔽";
                const statusText = progress >= 100 ? "Complete" : `${progress}%`;

                return {
                    id: `seedr:transfer:${transfer.id}`,
                    type: "other",
                    name: transfer.name,
                    poster: "https://www.seedr.cc/favicon.ico",
                    description: `${statusIcon} ${statusText}\n📦 Size: ${formatFileSize(transfer.size || 0)}`,
                    releaseInfo: statusText
                };
            });

            console.log("Returning", metas.length, "active downloads from Seedr");
            return { metas };
        } catch (error) {
            console.error("Error fetching Seedr downloads:", error.message);
            return { metas: [] };
        }
    }

    return { metas: [] };
}

// ============================================
// Stream Handler - Get Streaming URL
// ============================================
async function streamHandler(args, serverBaseUrl = "http://127.0.0.1:7000") {
    console.log("Stream request:", args);

    // Extract token from config
    const accessToken = args.config?.token;

    if (!accessToken) {
        console.log("No access token provided");
        return { streams: [] };
    }

    // Check if this is a Seedr file ID (from catalog)
    if (args.type === "other" && args.id.startsWith("seedr:")) {
        const fileId = args.id.replace("seedr:", "");

        // Skip transfer IDs (they're not playable directly)
        if (fileId.startsWith("transfer:")) {
            return { streams: [] };
        }

        try {
            const streamData = await seedrApi.getStreamUrl(accessToken, fileId);

            if (streamData && streamData.url) {
                console.log("Returning stream URL for file:", streamData.name);

                return {
                    streams: [
                        {
                            url: streamData.url,
                            title: `🎬 ${streamData.name || "Play Video"}`,
                            name: "Seedr"
                        }
                    ]
                };
            }
        } catch (error) {
            console.error("Error getting stream URL:", error.message);
        }

        return { streams: [] };
    }

    // Handle movie/series streams via Torrentio
    const isSeries = args.type === "series" || args.id.includes(":");

    if ((args.type === "movie" || args.type === "series" || args.type === "tv" || args.type === "channel" || args.type === "anime") && args.id.startsWith("tt")) {
        try {
            console.log(`Fetching Torrentio streams for ${args.type}: ${args.id}`);

            let torrentStreams = [];
            if (isSeries) {
                torrentStreams = await torrentioApi.getSeriesStreams(args.id);
            } else {
                torrentStreams = await torrentioApi.getMovieStreams(args.id);
            }

            if (!torrentStreams || torrentStreams.length === 0) {
                console.log("No Torrentio streams found for:", args.id);
                return { streams: [] };
            }

            console.log("Found", torrentStreams.length, "Torrentio streams");

            // Sort by seeders (descending)
            torrentStreams.sort((a, b) => (b.seeders || 0) - (a.seeders || 0));

            // For series, filter/match specific episode if possible?
            // Torrentio already returns streams for the specific episode ID "tt:s:e" passed to it.

            // Also check if we already have this content in Seedr
            const existingVideos = await getCachedVideos(accessToken);

            const streams = [];

            // Map Torrentio streams to Seedr download streams
            for (const stream of torrentStreams) {
                // Build the resolve URL that will handle downloading and streaming
                const resolveParams = new URLSearchParams({
                    name: stream.filename || stream.title,
                    trackers: stream.trackers.join(","),
                    fileIdx: stream.fileIdx.toString()
                });

                const resolveUrl = `${serverBaseUrl}/${encodeURIComponent(accessToken)}/resolve/${stream.infoHash}?${resolveParams.toString()}`;

                const streamTitle = torrentioApi.formatStreamTitle(stream);

                streams.push({
                    url: resolveUrl,
                    title: `${streamTitle}`,
                    name: "Seedr",
                    behaviorHints: {
                        notWebReady: true
                    }
                });
            }

            // Check if any matching file already exists in Seedr (by filename similarity)
            for (const video of existingVideos) {
                const videoNameLower = video.name.toLowerCase();
                // Check if this video might match the movie/episode
                for (const stream of torrentStreams) {
                    const streamNameLower = (stream.filename || stream.title).toLowerCase();
                    // Simple matching - could be improved
                    // For series, we might need stricter matching (SxxExx)
                    if (videoNameLower.includes(args.id.replace("tt", "")) ||
                        streamNameLower.includes(videoNameLower.replace(/\.[^/.]+$/, ""))) {

                        try {
                            const streamData = await seedrApi.getStreamUrl(accessToken, video.id);
                            if (streamData && streamData.url) {
                                streams.unshift({
                                    url: streamData.url,
                                    title: `✅ Ready | ${video.name}`,
                                    name: "Seedr",
                                    behaviorHints: {
                                        notWebReady: false
                                    }
                                });
                                break;
                            }
                        } catch (e) {
                            // Ignore errors
                        }
                    }
                }
            }

            return { streams };
        } catch (error) {
            console.error("Error handling movie/series stream:", error.message);
            return { streams: [] };
        }
    }

    return { streams: [] };
}

// ============================================
// Helper Functions
// ============================================
function formatFileSize(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// Export manifest and handlers for server.js
module.exports = {
    manifest,
    catalogHandler,
    streamHandler
};
