"use strict";

const https             = require("https");
const EventEmitter      = require("events");
const fs                = require("fs");

const cacheFolder       = "./cache";
const maxDownloads      = 2;

const requestOptions    = {
    hostname: "api.twitch.tv",
    method: "GET",
    headers: {
        "Accept": "application/vnd.twitchtv.v5+json",
        "Client-ID": "kimne78kx3ncx6brgo4mv6wki5h1ko" // Client ID used by the web version of Twitch, exempt from the v5 deprecation.
    }
}



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
            created: msg.created_at,
            stream_timestamp: msg.content_offset_seconds,
            user: {
                display_name: msg.commenter.display_name,
                name: msg.commenter.name.toLowerCase(),
                id: msg.commenter._id
            },
            message: msg.message.body
        };
    } catch(err) {
        throw new Error("Invalid message format");
    }
    return ret;
}

/**
 * @param {string} videoID
 * @param {string} cursor
 * @param {AbortSignal} abortSignal
 * @param {function():void} progressEvent
 * @returns {Promise<any>}
 */
async function downloadPart(videoID, cursor, abortSignal) {
    const requestPath   = `/v5/videos/${videoID}/comments?` + (cursor ? `cursor=${cursor}` : "content_offset_seconds=0");
    const options       = Object.assign({ path: requestPath }, requestOptions);

    return new Promise((resolve, reject) => {
        https.get(options, (res) => {
            let data = "";

            let checkAbortSignal = () => {
                if (abortSignal.aborted) reject(-1); // Special code for quiet termination
            };

            res.setEncoding("utf-8");

            res.on("data", d => {
                checkAbortSignal();
                data += d;
            });
            res.on("error", e => reject(e));
            res.on("end", async () => {
                checkAbortSignal();
                let parsedData = null;
                try { parsedData = JSON.parse(data); }
                catch (err) {
                    reject(err);
                    return;
                }
                resolve(parsedData);
            });
        }).on("error", e => reject(e)).end();
    });
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
    do {
        const part = await downloadPart(videoID, cursor, abortSignal, progressEvent);
        if (!Array.isArray(part?.comments)) throw new Error("Invalid response");
        ret        = ret.concat(part.comments.map(transformMessage));
        cursor     = part._next;
        progressEvent();
    } while (cursor);
    fs.writeFileSync(cachePath, JSON.stringify(ret));
    // console.log(`Finished download for ${videoID}...`);
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
     * @param {boolean} forceDownload Always download the chat replay even if it's present in the local cache.
     */
    async getChatReplays(videoIDs, forceDownload = false) {
        let retrieveData = async (videoID) => {
            const cachePath             = `${cacheFolder}/${videoID}.json`;
            let data                    = [];
            let incrementedDownloads    = false;

            try {
                if (forceDownload || !fs.existsSync(cachePath)) {
                    // Wait if there are too many downloads going on
                    while (this.#currentDownloads >= maxDownloads) await resolveAfter(250);
                    this.#currentDownloads++;
                    incrementedDownloads = true;
                    data = await cacheChat(videoID, cachePath, this.#abortController.signal, () => this.emit("progress"));
                } else {
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
}

module.exports = ChatDownloader;