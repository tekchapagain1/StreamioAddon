const axios = require("axios");

// Seedr API Configuration
const SEEDR_BASE_URL = "https://www.seedr.cc";
const CLIENT_ID = "seedr_xbmc"; // Long-lived token (1 year)

/**
 * Request a device code for authorization
 * @returns {Promise<{device_code: string, user_code: string, expires_in: number, interval: number}>}
 */
async function getDeviceCode() {
    const response = await axios.get(`${SEEDR_BASE_URL}/api/device/code`, {
        params: { client_id: CLIENT_ID }
    });
    return response.data;
}

/**
 * Poll for authorization token after user enters code
 * @param {string} deviceCode - The device code from getDeviceCode
 * @returns {Promise<{access_token: string, token_type: string, expires_in: number}|null>}
 */
async function pollForToken(deviceCode) {
    try {
        const response = await axios.get(`${SEEDR_BASE_URL}/api/device/authorize`, {
            params: {
                device_code: deviceCode,
                client_id: CLIENT_ID
            }
        });

        if (response.data && response.data.access_token) {
            return response.data;
        }
        return null;
    } catch (error) {
        // Authorization pending - user hasn't entered code yet
        if (error.response && error.response.status === 400) {
            return null;
        }
        throw error;
    }
}

/**
 * Get contents of a folder (or root folder if no folderId)
 * @param {string} accessToken - The access token
 * @param {string|null} folderId - Optional folder ID (null for root)
 * @returns {Promise<{folders: Array, files: Array}>}
 */
async function getFolder(accessToken, folderId = null) {
    let url = `${SEEDR_BASE_URL}/api/folder`;
    if (folderId) {
        url = `${SEEDR_BASE_URL}/api/folder/${folderId}`;
    }

    const response = await axios.get(url, {
        params: { access_token: accessToken }
    });
    return response.data;
}

/**
 * Recursively get all video files from Seedr account
 * @param {string} accessToken - The access token
 * @param {string|null} folderId - Folder ID to start from (null for root)
 * @param {string} parentPath - Path prefix for folder hierarchy
 * @returns {Promise<Array<{id: string, name: string, size: number, path: string}>>}
 */
async function getAllVideoFiles(accessToken, folderId = null, parentPath = "") {
    const videos = [];

    try {
        const folderData = await getFolder(accessToken, folderId);

        // Add video files from current folder
        if (folderData.files) {
            for (const file of folderData.files) {
                if (file.play_video) {
                    videos.push({
                        id: file.folder_file_id.toString(),
                        name: file.name,
                        size: file.size,
                        path: parentPath ? `${parentPath}/${file.name}` : file.name
                    });
                }
            }
        }

        // Recursively scan subfolders
        if (folderData.folders) {
            for (const folder of folderData.folders) {
                const folderPath = parentPath ? `${parentPath}/${folder.name}` : folder.name;
                const subVideos = await getAllVideoFiles(accessToken, folder.id.toString(), folderPath);
                videos.push(...subVideos);
            }
        }
    } catch (error) {
        console.error("Error fetching folder:", folderId, error.message);
    }

    return videos;
}

/**
 * Get streaming URL for a file
 * @param {string} accessToken - The access token
 * @param {string} fileId - The folder_file_id of the file
 * @returns {Promise<{url: string, name: string, size: number}>}
 */
async function getStreamUrl(accessToken, fileId) {
    const formData = new URLSearchParams();
    formData.append("access_token", accessToken);
    formData.append("func", "fetch_file");
    formData.append("folder_file_id", fileId);

    const response = await axios.post(`${SEEDR_BASE_URL}/oauth_test/resource.php`, formData, {
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        }
    });

    return response.data;
}

/**
 * Get user account information and storage stats
 * @param {string} accessToken - The access token
 * @returns {Promise<{storage_used: number, storage_limit: number, remaining_space: number, username: string}>}
 */
async function getAccountInfo(accessToken) {
    try {
        const formData = new URLSearchParams();
        formData.append("access_token", accessToken);
        formData.append("func", "get_account_info");

        const response = await axios.post(`${SEEDR_BASE_URL}/oauth_test/resource.php`, formData, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            timeout: 10000
        });

        // Parse storage info
        const info = response.data;
        if (info.storage_used !== undefined && info.storage_limit !== undefined) {
            const remaining = info.storage_limit - info.storage_used;
            console.log(`📊 Storage: ${(info.storage_used / 1024 / 1024 / 1024).toFixed(2)}GB / ${(info.storage_limit / 1024 / 1024 / 1024).toFixed(2)}GB (${(remaining / 1024 / 1024 / 1024).toFixed(2)}GB free)`);
            return {
                storage_used: info.storage_used,
                storage_limit: info.storage_limit,
                remaining_space: remaining,
                username: info.username
            };
        }

        return info;
    } catch (error) {
        console.error("Error getting account info:", error.message);
        return {
            storage_used: 0,
            storage_limit: 0,
            remaining_space: 0,
            error: error.message
        };
    }
}

/**
 * Get user account information (legacy - use getAccountInfo instead)
 * @param {string} accessToken - The access token
 * @returns {Promise<Object>}
 */
async function getUserInfo(accessToken) {
    const formData = new URLSearchParams();
    formData.append("access_token", accessToken);
    formData.append("func", "get_settings");

    const response = await axios.post(`${SEEDR_BASE_URL}/oauth_test/resource.php`, formData, {
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        }
    });

    return response.data;
}

/**
 * Create a new folder in Seedr
 * @param {string} accessToken - The access token
 * @param {string} folderName - Name for the new folder
 * @returns {Promise<{result: boolean, folder_id?: string, error?: string}>}
 */
async function createFolder(accessToken, folderName) {
    try {
        const formData = new URLSearchParams();
        formData.append("access_token", accessToken);
        formData.append("func", "add_folder");
        formData.append("name", folderName);

        const response = await axios.post(`${SEEDR_BASE_URL}/oauth_test/resource.php`, formData, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            timeout: 10000
        });

        console.log("Create folder response:", JSON.stringify(response.data));
        return response.data;
    } catch (error) {
        console.error("Error creating folder:", {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data
        });

        return {
            error: error.response?.data?.error || error.message,
            status: error.response?.status
        };
    }
}

/**
 * Get a folder by name (for finding info_hash folders)
 * @param {string} accessToken - The access token
 * @param {string} folderName - Name to search for
 * @returns {Promise<Object|null>}
 */
async function getFolderByName(accessToken, folderName) {
    try {
        const folderData = await getFolder(accessToken, null);

        if (folderData.folders) {
            return folderData.folders.find(f => f.name === folderName);
        }

        return null;
    } catch (error) {
        console.error("Error finding folder:", error.message);
        return null;
    }
}

/**
 * Add a torrent file to Seedr for downloading
 * @param {string} accessToken - The access token
 * @param {Buffer|string} torrentFileContent - The torrent file content (base64 or binary)
 * @param {string} filename - Optional filename for the torrent
 * @returns {Promise<{result: boolean, user_torrent_id?: number, error?: string}>}
 */
async function addTorrentFile(accessToken, torrentFileContent, filename = "torrent.torrent") {
    try {
        const FormData = require('form-data');
        const fs = require('fs');

        const formData = new FormData();
        formData.append("access_token", accessToken);
        formData.append("func", "add_torrent");

        // Handle base64 encoded content
        let content = torrentFileContent;
        if (typeof torrentFileContent === 'string' && torrentFileContent.startsWith('data:')) {
            // data URI format
            const matches = torrentFileContent.match(/data:.*?;base64,(.*)/);
            if (matches) {
                content = Buffer.from(matches[1], 'base64');
            }
        } else if (typeof torrentFileContent === 'string') {
            // Assume base64
            content = Buffer.from(torrentFileContent, 'base64');
        }

        formData.append("torrent_file", content, filename);

        const response = await axios.post(`${SEEDR_BASE_URL}/oauth_test/resource.php`, formData, {
            headers: formData.getHeaders(),
            timeout: 10000
        });

        console.log("Add torrent file response:", JSON.stringify(response.data));
        return response.data;
    } catch (error) {
        console.error("Error adding torrent file:", {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data,
            filename: filename
        });

        return {
            error: error.response?.data?.error || error.message,
            status: error.response?.status
        };
    }
}

/**
 * Add a magnet link to Seedr for downloading
 * @param {string} accessToken - The access token
 * @param {string} magnetLink - The magnet URI to add
 * @param {number} folderId - Target folder ID (-1 for root folder)
 * @returns {Promise<{result: boolean, user_torrent_id?: number, error?: string}>}
 */
async function addMagnet(accessToken, magnetLink, folderId = -1) {
    const formData = new URLSearchParams();
    formData.append("access_token", accessToken);
    formData.append("func", "add_torrent");
    formData.append("torrent_magnet", magnetLink);
    formData.append("folder_id", folderId.toString());

    const response = await axios.post(`${SEEDR_BASE_URL}/oauth_test/resource.php`, formData, {
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        }
    });

    const result = response.data;

    if (result.error) {
        throw new Error(`Failed to add magnet: ${result.error}`);
    }

    return result;
}

/**
 * Get active transfers (downloading torrents) from Seedr
 * The transfers are included in the root folder response
 * @param {string} accessToken - The access token
 * @returns {Promise<Array<{id: number, name: string, progress: number, size: number}>>}
 */
async function getActiveTransfers(accessToken) {
    try {
        const folderData = await getFolder(accessToken, null);
        return folderData.transfers || [];
    } catch (error) {
        console.error("Error getting active transfers:", error.message);
        return [];
    }
}

/**
 * Get wishlist (torrents waiting to be downloaded)
 * @param {string} accessToken - The access token
 * @returns {Promise<Array<{id: number, title: string, size: number, torrent_hash: string}>>}
 */
async function getWishlist(accessToken) {
    try {
        const formData = new URLSearchParams();
        formData.append("access_token", accessToken);
        // Try multiple possible function names since we're getting 500 errors
        formData.append("func", "get_wish_list");

        const response = await axios.post(`${SEEDR_BASE_URL}/oauth_test/resource.php`, formData, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            timeout: 10000
        });

        console.log("Wishlist API response:", JSON.stringify(response.data).substring(0, 300));

        // Handle different response formats
        if (response.data.wish_list && Array.isArray(response.data.wish_list)) {
            return response.data.wish_list;
        } else if (response.data.result && typeof response.data.result === "object") {
            // Maybe the result itself contains wishlist data
            if (Array.isArray(response.data.result)) {
                return response.data.result;
            }
            return [];
        } else if (Array.isArray(response.data)) {
            return response.data;
        } else if (response.data.result === false && response.data.error) {
            console.log("Wishlist API error:", response.data.error);
            return [];
        }

        return [];
    } catch (error) {
        // If get_wish_list fails with 500, it means the endpoint may not exist
        // Try fallback: get folder data which might contain wishlist info
        console.warn("Main wishlist API failed, trying fallback...", error.response?.status);

        try {
            const folderData = await getFolder(accessToken, null);
            // Some Seedr API versions might return wish list with folder data
            if (folderData.wish_list) {
                console.log("✓ Got wishlist from folder data");
                return folderData.wish_list;
            }
            return [];
        } catch (fallbackError) {
            console.error("Wishlist fallback also failed:", fallbackError.message);
            return [];
        }
    }
}

/**
 * Promote a torrent from wishlist to active downloads
 * @param {string} accessToken - The access token
 * @param {number} wishlistId - The wishlist item ID
 * @returns {Promise<{result: boolean, error?: string}>}
 */
async function promoteFromWishlist(accessToken, wishlistId) {
    try {
        const formData = new URLSearchParams();
        formData.append("access_token", accessToken);
        // Try the most likely function name based on other API patterns
        formData.append("func", "start_wish");
        formData.append("wish_id", wishlistId);

        const response = await axios.post(`${SEEDR_BASE_URL}/oauth_test/resource.php`, formData, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            timeout: 10000
        });

        console.log("✓ Promote wishlist response:", JSON.stringify(response.data).substring(0, 200));
        return response.data;
    } catch (error) {
        // If start_wish fails, the API might not support promotion
        // This is not necessarily an error - Seedr may auto-promote when space available
        console.log("⚠️  Wishlist promotion not available (API may auto-promote when space available)");

        return {
            result: false,
            error: "Promotion endpoint unavailable",
            willAutoPromote: true
        };
    }
}

/**
 * Delete a torrent from wishlist
 * @param {string} accessToken - The access token
 * @param {number} wishlistId - The wishlist item ID
 * @returns {Promise<{result: boolean, error?: string}>}
 */
async function deleteFromWishlist(accessToken, wishlistId) {
    try {
        const formData = new URLSearchParams();
        formData.append("access_token", accessToken);
        formData.append("func", "wish_delete");
        formData.append("wish_id", wishlistId);

        const response = await axios.post(`${SEEDR_BASE_URL}/oauth_test/resource.php`, formData, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            timeout: 10000
        });

        return response.data;
    } catch (error) {
        console.error("Error deleting from wishlist:", error.message);
        return {
            error: error.message
        };
    }
}

/**
 * Delete a folder from Seedr
 * @param {string} accessToken - The access token
 * @param {string} folderId - The folder ID to delete
 * @returns {Promise<Object>}
 */
async function deleteFolder(accessToken, folderId) {
    const formData = new URLSearchParams();
    formData.append("access_token", accessToken);
    formData.append("func", "delete");
    formData.append("delete_arr", JSON.stringify([{ type: "folder", id: folderId }]));

    const response = await axios.post(`${SEEDR_BASE_URL}/oauth_test/resource.php`, formData, {
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        }
    });

    return response.data;
}

/**
 * Delete a torrent from Seedr active downloads
 * @param {string} accessToken - The access token
 * @param {number|string} torrentId - The torrent ID to delete
 * @returns {Promise<Object>}
 */
async function deleteTorrent(accessToken, torrentId) {
    const formData = new URLSearchParams();
    formData.append("access_token", accessToken);
    formData.append("func", "delete");
    formData.append("delete_arr", JSON.stringify([{ type: "torrent", id: torrentId.toString() }]));

    const response = await axios.post(`${SEEDR_BASE_URL}/oauth_test/resource.php`, formData, {
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        }
    });

    console.log("Delete torrent response:", JSON.stringify(response.data));
    return response.data;
}

/**
 * Clear ALL files, folders, and active transfers from Seedr account
 * @param {string} accessToken - The access token
 * @returns {Promise<{result: boolean, deleted_count: number}>}
 */
async function clearAccount(accessToken) {
    try {
        console.log("🧹 Starting full account cleanup...");
        const folderData = await getFolder(accessToken, null); // Get root

        const contentToDelete = [];

        // Collect folders
        if (folderData.folders && folderData.folders.length > 0) {
            folderData.folders.forEach(f => {
                contentToDelete.push({ type: "folder", id: f.id.toString() });
            });
        }

        // Collect files
        if (folderData.files && folderData.files.length > 0) {
            folderData.files.forEach(f => {
                contentToDelete.push({ type: "file", id: f.folder_file_id.toString() });
            });
        }

        // Collect active transfers (torrents)
        // Note: The API might return transfers mixed in or we might need to check separately
        // But typically delete_arr works for "torrent" type too if we have IDs
        // For now, let's delete what we found in root. 
        // If transfers show up in `transfers` array, we catch them too.
        if (folderData.transfers && folderData.transfers.length > 0) {
            folderData.transfers.forEach(t => {
                // Transfers might not have 'id' same as folder/file, usually 'user_torrent_id'
                // API typically expects type "torrent"
                contentToDelete.push({ type: "torrent", id: t.user_torrent_id || t.id });
            });
        }

        if (contentToDelete.length === 0) {
            console.log("✨ Account already empty");
            return { result: true, deleted_count: 0 };
        }

        console.log(`🗑️  Deleting ${contentToDelete.length} items...`);

        const formData = new URLSearchParams();
        formData.append("access_token", accessToken);
        formData.append("func", "delete");
        formData.append("delete_arr", JSON.stringify(contentToDelete));

        const response = await axios.post(`${SEEDR_BASE_URL}/oauth_test/resource.php`, formData, {
            headers: { "Content-Type": "application/x-www-form-urlencoded" }
        });

        console.log("Cleanup response:", JSON.stringify(response.data));
        return { result: true, deleted_count: contentToDelete.length };

    } catch (error) {
        console.error("❌ Error clearing account:", error.message);
        return { result: false, error: error.message };
    }
}

module.exports = {
    getDeviceCode,
    pollForToken,
    getFolder,
    getAllVideoFiles,
    getStreamUrl,
    getUserInfo,
    getAccountInfo,
    createFolder,
    getFolderByName,
    addMagnet,
    addTorrentFile,
    getWishlist,
    promoteFromWishlist,
    deleteFromWishlist,
    deleteTorrent,
    clearAccount,
    getActiveTransfers,
    deleteFolder,
    validateCredentials
};

/**
 * Validate Seedr credentials by making a simple API call
 * @param {string} accessToken - The access token to validate
 * @returns {Promise<{status: string, message?: string}>}
 */
async function validateCredentials(accessToken) {
    try {
        // Try to get account info - this validates the token is valid
        const accountInfo = await getAccountInfo(accessToken);

        if (accountInfo.error) {
            return {
                status: "error",
                message: `Failed to validate Seedr credentials: ${accountInfo.error}`
            };
        }

        return { status: "success" };
    } catch (error) {
        return {
            status: "error",
            message: `Failed to validate Seedr credentials: ${error.message}`
        };
    }
}
