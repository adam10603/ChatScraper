"use strict";

const common       = require("./internal/common");
const EventEmitter = require("events");
const fs           = require("fs");

const cacheFolder  = "./cache";
const maxDownloads = 3; // Max number of concurrent downloads

Object.defineProperty(Array.prototype, "last", {
    get: function last() {
        return this[this.length - 1];
    }
});

/**
 * @typedef {object} ChatMessage
 * @property {string} created The absolute time the message was sent, as an ISO string.
 * @property {number} stream_timestamp The relative time of the message within the stream, in seconds.
 * @property {object} user Represents the user who sent the message.
 * @property {string} user.display_name Display name (might include capitalized or non-English characters).
 * @property {string} user.name Username.
 * @property {string} user.id User ID.
 * @property {string} message The message body.
 */


/**
 * Translates a message object from the Twitch API to our own format.
 * @param {object} msg
 * @returns {ChatMessage}
 */
function transformMessage(msg) {
    let ret = {};
    try {
        ret = {
            created: msg.node.createdAt ?? "1970-01-01T00:00:00.000Z",
            stream_timestamp: msg.node.contentOffsetSeconds ?? 0,
            user: {
                display_name: msg.node.commenter?.displayName ?? "null",
                name: ((msg.node.commenter?.login ?? msg.node.commenter?.displayName) ?? "null").toLowerCase(),
                id: msg.node.commenter?.id ?? "0"
            },
            message: ""
        };
        for (let i = 0; i < msg.node.message.fragments.length; i++) ret.message += msg.node.message.fragments[i].text
    } catch(err) {
        throw new Error("Invalid message format");
    }
    return ret;
}

/**
 * Downloads the chat replay from a stream, stores the messages in the local cache, and returns the messages.
 * @param {string} videoID
 * @param {string} cachePath
 * @param {AbortSignal} abortSignal
 * @param {function():void} progressEvent
 * @returns {Promise<ChatMessage[]>}
 */
async function cacheChat(videoID, cachePath, abortSignal, progressEvent) {
    // console.log(`Downloading chat for  ${videoID}...`);
    let ret    = [];
    let cursor = undefined;
    let offset = 0;
    let lastIDSet = new Set();
    do {
        const part = await common.getChatReplayPart(videoID, offset, abortSignal, progressEvent);

        const partIsArray = Array.isArray(part);

        if (partIsArray) {
            if (part[0]?.data?.video?.comments === null) break; // This indicates that we are past the end of the VOD
        } else if (!Array.isArray(part[0]?.data?.video?.comments?.edges)) {
            throw new Error(`Invalid response:\n${JSON.stringify(part)}`);
        }

        // not using the cursor bc the requests get rejected
        // gonna use the last offset instead, then filter for duplicate messages

        let backEdges = part.last.data.video.comments.edges;
        offset = backEdges.last?.node?.contentOffsetSeconds ?? undefined;
        if (!offset) throw new Error("Cannot find last message offset");

        part[0].data.video.comments.edges = part[0].data.video.comments.edges.filter((msg) => !lastIDSet.has(msg.node.id));
        lastIDSet.clear();
        backEdges.forEach((msg) => lastIDSet.add(msg.node.id));

        // i think theres always 1 part but using a loop just in case
        for (let i = 0; i < part.length; i++) ret = ret.concat(part[i].data.video.comments.edges.map(transformMessage));
        cursor = backEdges.last?.cursor ?? undefined;
        progressEvent();
    } while (cursor);
    fs.writeFileSync(cachePath, JSON.stringify(ret));
    // console.log(`Finished download for ${videoID}.`);
    return ret;
}

function resolveAfter(ms) {
    return new Promise(resolve => setTimeout(() => resolve(), ms));
}

/**
 * Utility class for downloading chat replays from Twitch VODs.
 */
class ChatDownloader extends EventEmitter {

    #currentDownloads   = 0;
    #abortController    = new AbortController();

    /** @constructor */
    constructor() {
        super();
        if (!fs.existsSync(cacheFolder)) fs.mkdirSync(cacheFolder);
    }

    /**
     * @param {["data" | "error" | "success" | "failure" | "progress", ...any[]]} args
     */
    addListener(...args) {
        super.addListener(...args);
    }

    /**
     * @param {["data" | "error" | "success" | "failure" | "progress", ...any[]]} args
     */
    on(...args) {
        super.on(...args);
    }

    /**
     * Stops all current operations as soon as possible. Use this if a fatal error was encountered and the pending operations are not required anymore.
     */
    abortAll() {
        this.#abortController.abort();
    }

    /**
     * Gets the chat replays from any number of streams.
     * @param {string[]} videoIDs Array of video IDs to get the chat replays from.
     * @param {boolean} forceDownload Downloads the chat replay even if it's present in the cache.
     */
    async getChatReplays(videoIDs, forceDownload = false) {
        let retrieveData = async (videoID) => {
            const cachePath             = `${cacheFolder}/${videoID}.json`;
            let data                    = [];
            let incrementedDownloads    = false;

            try {
                let cacheExists = fs.existsSync(cachePath);
                if (forceDownload || !cacheExists) {
                    // Downloading chat replay if either force download is on, or the cache doesn't exist.
                    while (this.#currentDownloads >= maxDownloads) await resolveAfter(250); // Wait if there are too many downloads going on
                    this.#currentDownloads++;
                    incrementedDownloads = true;
                    data = await cacheChat(videoID, cachePath, this.#abortController.signal, () => this.emit("progress"));
                } else {
                    // Reading the cached version
                    data = JSON.parse(fs.readFileSync(cachePath));
                }
                if (incrementedDownloads) this.#currentDownloads--;
                this.emit("data", data, videoID);
                return true;
            } catch (err) {
                if (incrementedDownloads) this.#currentDownloads--;
                if (err !== -1) this.emit("error", err, videoID);
                return false;
            }
        };

        let workers = videoIDs.map(retrieveData);
        if ((await Promise.all(workers)).every(v => v === true)) this.emit("success");
        else this.emit("failure");
    }

    /**
     * Takes an array of VOD IDs and only returns the ones that are not found in the cache.
     * @param {any[]} videoIDs
     */
    removeCachedVODsFromList(videoIDs) {
        return videoIDs.filter((ID) => { return !fs.existsSync(`${cacheFolder}/${ID}.json`); });
    }
}

module.exports = ChatDownloader;