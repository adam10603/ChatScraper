"use strict";

const https = require("https");

const requestOptions = {
    hostname: "gql.twitch.tv",
    path: "/gql",
    method: "POST",
    headers: {
        "Accept": "*/*",
        "Client-ID": "kimne78kx3ncx6brgo4mv6wki5h1ko" // Client ID used by the web version of Twitch
        // "Authorization": "OAuth yfj66zcapq3aodtr7ykjidfdh8csjo"
    }
}

const chatRequestData = {
        "operationName": "VideoCommentsByOffsetOrCursor",
        // "variables": {
        //     "videoID": "",
        //     "cursor": "",
        //     "contentOffsetSeconds": 0
        // },
        "extensions": {
            "persistedQuery": {
                "version": 1,
                "sha256Hash": "b70a3591ff0f4e0313d126c6a1502d79a1c02baebb288227c582044aa76adf6a"
            }
        }
};

const VODRequestData = {
    "operationName": "FilterableVideoTower_Videos",
    // "variables": {
    //     "limit": 1,
    //     "channelOwnerLogin": "",
    //     "broadcastType": "ARCHIVE",
    //     "videoSort": "TIME",
    //     "cursor": "MTQ1" // Probably not needed
    // },
    "extensions": {
        "persistedQuery": {
            "version": 1,
            // "sha256Hash":"2023a089fca2860c46dcdeb37b2ab2b60899b52cca1bfa4e720b260216ec2dc6"
            "sha256Hash":"a937f1d22e269e39a03b509f65a7490f9fc247d7f83d6ac1421523e3b68042cb"
        }
    }
};

/**
 * Promise handler for making Twitch GQL requests
 * @param {object} sendData
 * @param {AbortSignal} abortSignal
 * @param {function} resolve
 * @param {function} reject
 */
function requestPromiseHandler(sendData, abortSignal, resolve, reject, tryCount = 0) {
    let rejectOrRetry = function(reason) {
        if (tryCount === 0) {
            requestPromiseHandler(sendData, abortSignal, resolve, reject, 1);
        } else {
            reject(reason);
        }
    };

    let req = https.request(requestOptions, (res) => {
        let data = "";

        let checkAbortSignal = () => {
            if (abortSignal.aborted) reject(-1); // Special code for quiet termination
        };

        res.setEncoding("utf-8");

        res.on("data", d => {
            checkAbortSignal();
            data += d;
        });

        res.on("error", e => rejectOrRetry(e));

        res.on("end", () => {
            checkAbortSignal();
            let parsedData = null;
            try {
                parsedData = JSON.parse(data);
                // disabling this check for now because one of the endpoints does report an error with certain parameters, but that shouldnt be considered an error here
                // if (parsedData[0].errors) throw new Error(`Error reported by server: ${JSON.stringify(parsedData[0].errors)}\nRequest data: ${JSON.stringify(sendData)}`);
            }
            catch (err) {
                rejectOrRetry(err);
                return;
            }
            resolve(parsedData);
        });
    });

    req.on("error", e => rejectOrRetry(e));
    req.write(JSON.stringify(sendData));
    req.end();
}

/**
 * @param {string} videoID
 * @param {number} offset
 * @param {AbortSignal} abortSignal
 * @returns {Promise<any>}
 */
async function getChatReplayPart(videoID, offset, abortSignal) {
    let sendVariables = {"variables": {"videoID": `${videoID}`}};

    sendVariables["variables"]["contentOffsetSeconds"] = offset;

    return new Promise(requestPromiseHandler.bind(null, [Object.assign(sendVariables, chatRequestData)], abortSignal));
}
// async function getChatReplayPart(videoID, cursor, abortSignal) {
//     let sendVariables = {"variables": {"videoID": `${videoID}`}};

//     if (cursor) sendVariables["variables"]["cursor"] = cursor;
//     else sendVariables["variables"]["contentOffsetSeconds"] = 0;

//     return new Promise(requestPromiseHandler.bind(null, [Object.assign(sendVariables, chatRequestData)], abortSignal));
// }

/**
 * @param {string} username
 * @param {number} limit
 * @param {AbortSignal} abortSignal
 * @returns {Promise<any>}
 */
async function getVODList(username, limit, abortSignal) {
    let sendVariables = {
        "variables": {
            "limit": limit,
            "channelOwnerLogin": username,
            "broadcastType": "ARCHIVE",
            "videoSort": "TIME"
            // "cursor": "MTQ1"
        }
    };

    return new Promise(requestPromiseHandler.bind(null, [Object.assign(sendVariables, VODRequestData)], abortSignal));
}

module.exports = {
    getChatReplayPart: getChatReplayPart,
    getVODList: getVODList
};