"use strict";

const common       = require("./internal/common");
const EventEmitter = require("events");

/**
 * Utility class for getting a list of VOD IDs from a channel.
 */
class VODList extends EventEmitter {

    #abortController = new AbortController();

    /** @constructor */
    constructor() {
        super();
    }

    /**
     * @param {["data" | "error" | "success" | "failure" | "progress", ...any[]]} args
     */
    addListener(...args) {
        super.addListener(...args);
    }

    /**
     * @param {["data" | "error" | "success" | "failure", ...any[]]} args
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
     * Gets the most recent VOD IDs from a channel.
     * @param {string} channel The channel name to get VODs from.
     * @param {number} limit How many VOD IDs to return. E.g. `5` will get the 5 most recent VODs.
     */
    async getRecentVODs(channel, limit) {
        let retrieveData = async (channelName, maxVODs) => {
            try {
                let rawData = await common.getVODList(channelName, Math.round(Math.max(1, maxVODs)), this.#abortController.signal);
                if (!Array.isArray(rawData)) throw new Error("Invalid response");
                if (!(rawData[0].data?.user)) throw new Error(`Failed to fetch VODs from '${channel}'`);
                if (!Array.isArray(rawData[0].data?.user?.videos?.edges)) throw new Error("Invalid response");
                let data = rawData[0].data.user.videos.edges.map((em) => { return em.node.id; });
                this.emit("data", data);
                return true;
            } catch (err) {
                if (err !== -1) this.emit("error", err);
                return false;
            }
        };

        if ((await retrieveData(channel, limit)) === true) this.emit("success");
        else this.emit("failure");
    }
}

module.exports = VODList;