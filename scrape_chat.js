"use strict";

const FS             = require("fs");
const ChatDownloader = require("./utils/twitch/chat_downloader");
const VODList        = require("./utils/twitch/vod_list");
const Highlighter    = require("./utils/string_highlighter");
const { prettify } = require("./utils/string_highlighter");

const getFormat = {
    notice: (start = 0, end = 9999) => Highlighter.format(start, end, Highlighter.color(160, 128, 0)),
    match:  (start = 0, end = 9999) => Highlighter.format(start, end, Highlighter.color(120, 192, 90)),
    link:   (start = 0, end = 9999) => Highlighter.format(start, end, Highlighter.color(122, 171, 249), "default", true)
};

let dict            = [];
let IDs             = [];
let users           = [];
let printLinks      = false;
let plain           = false;
let forceDownload   = false;
let VODsFrom        = "";
let maxVODs         = 5;
let skipCached      = false;
let noSearch        = false;

// ============ Helper functions

/**
 * 
 * @param {string} str
 * @param {Highlighter.StringFormat | Highlighter.StringFormat[]} formatList
 */
function prettifyString(str, formatList) {
    if (plain) return str;
    return Highlighter.prettify(str, Array.isArray(formatList) ? formatList : [formatList]);
}

/**
 * Hello
 * @param {Downloader.ChatMessage} msg
 * @param {string} vod
 * @param {Highlighter.StringFormat[]} highlights
 * @param {number} maxNameLen
 */
function printChatMessage(msg, vod, highlights, maxNameLen = 20) {
    let link = "";

    if (printLinks) {
        link = "https://twitch.tv/videos/";
        const baseLength = link.length;
        link += `${vod}?t=${Math.max(Math.floor(msg.stream_timestamp - 5), 0)}s`;
        link = prettifyString(link, getFormat.link(0, link.length)).padEnd(plain ? (baseLength + 23) : (baseLength + 50), " ");
    }

    process.stdout.write(`${link}[${msg.created.replace(/\.\d+Z$/, "Z")}] ${(msg.user.name + ": ").padEnd(maxNameLen + 4, " ")}`);

    console.log(prettifyString(msg.message, highlights));
}

function processCommaList(list) {
    let matched = list.match(/(\\.|[^(,)])+/g); // /(\\.|[^(,\s*)])+/g
    if (matched !== null) return matched.map(s => s.replace("\\,", ","));
    return null;
}

// Processes a list-type arg (dictionary or user list)
function processListArg(listArg) {
    const jsonFile = /^["']?(.+\.json)["']?$/.exec(listArg);

    if (jsonFile?.length === 2) {
        let ret = null;

        try {
            ret = JSON.parse(FS.readFileSync(jsonFile[1]));
            if (!Array.isArray(ret) || !ret.every(v => typeof(v) === "string")) throw 0;
        } catch(err) {
            console.error(`The file "${jsonFile[1]}" either couldn't be opened or doesn't contain a valid list.`);
            return null;
        }

        return ret;
    }

    const commaList = /^["']?(.+)["']?$/.exec(listArg);

    if (commaList?.length === 2) {
        return processCommaList(commaList[1]);
    }

    return null;
}

function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 
 * @param {string} msgLowerCase
 * @param {string} word
 * @param {boolean} dictWildcard
 * @param {Highlighter.StringFormat[]} highlightsOut
 * @returns {{blackFound: boolean, whiteFound: boolean}}
 */
function searchMessage(msgLowerCase, word, dictWildcard, highlightsOut) {
    let blackFound = false;
    let whiteFound = false;
    if (word.startsWith("^")) {
        if (msgLowerCase.includes(word.substring(1))) {
            blackFound = true;
        }
    } else if (!dictWildcard) {
        let matches = [];
        if (word.startsWith("=")) {
            word = word.substring(1);
            matches = [...msgLowerCase.matchAll(new RegExp(`\\b${escapeRegExp(word)}\\b`, "g"))];
        } else {
            matches = [...msgLowerCase.matchAll(word)];
        }
        if (matches.length > 0) {
            whiteFound = true;
            for (let match of matches) {
                highlightsOut.push(getFormat.match(match.index, match.index + word.length));
            }
        }
    }
    return { blackFound, whiteFound };
}

// ============

if (process.argv.length < 3) {
    const msg = `
    Usage:
        node scrape_chat [Options] [Video ID]...

    Options:
        --dict=<Ruleset>    Defines the ruleset used as the dictionary. This is
                            used to filter messages by their content.

        --users=<Ruleset>   Defines the ruleset used for matching usernames.
                            Unlike the dictionary, every rule in this list is
                            "standalone" by default, as that makes more sense
                            for usernames.

        --vods-from=<User>  Specifies a channel whose most recent VODs will be
                            automatically added to the list of VODs to search.
                            By default it gets the 5 most recent VODs but you can
                            use the --max-vods option to change that.

        --max-vods=<Number> Limits how many VOD IDs to get from the channel when
                            using the --vods-from option. Default is 5 if omitted.

        --print-links       Prints timestamped VOD links for each message.

        --plain             Won't use escape sequences to format the output.

        --force-download    Re-downloads the chat history even if it's present in
                            the local cache (also refreshing the cached version).
                            Mutually exclusive with --skip-cached.

        --skip-cached       Skips searching VODs that are present in the cache.
                            Mutually exclusive with --force-download.

        --no-search         Skips downloading and searching chat replays. Only
                            prints the list of IDs that would have been searched.

    Video IDs:
        These are the IDs of the VODs you want to search the chat replays of.
        You can supply as many as you like. Alternatively you can use the
        --vods-from option to automatically obtain the most recent VODs from
        a specific channel.

    Rulesets:
        See the documentation in README.md or on the GitHub page of the project:
        https://github.com/adam10603/ChatScraper
    `;

    console.log(msg);
    process.exit(0);
}

function bruh() {
    console.error("Invalid arguments. Run the script with no arguments for help!");
    process.exit(1);
}

// Processing args
for (let arg of process.argv.splice(2)) {

    // Dictionary arg
    if (dict.length === 0) {
        const dictFlag = /^--dict=(.+)/.exec(arg);

        if (dictFlag) {
            dict = processListArg(dictFlag[1]);
            if (!dict) bruh();
            dict = dict.map(s => s.toLowerCase());
            continue;
        }
    }

    // User list arg
    if (users.length === 0) {
        const usersFlag = /^--users=(.+)/.exec(arg);

        if (usersFlag) {
            users = processListArg(usersFlag[1]);
            if (!users) bruh();
            users = users.map(s => {
                s = s.toLowerCase();
                if (s.startsWith("=")) s = s.substring(1);
                return s;
            });
            continue;
        }
    }

    // VODs from option
    if (!VODsFrom) {
        const VODsFromFlag = /^--vods-from=(.+)/.exec(arg);

        if (VODsFromFlag) {
            VODsFrom = VODsFromFlag[1];
            continue;
        }
    }

    // Max VODs option
    const maxVODsFlag = /^--max-vods=(\d+)/.exec(arg);
    if (maxVODsFlag) {
        maxVODs = parseInt(maxVODsFlag[1]);
        continue;
    }

    // Print links option
    if (/^--print-links$/.test(arg)) {
        printLinks = true;
        continue;
    }

    // Plain option
    if (/^--plain$/.test(arg)) {
        plain = true;
        continue;
    }

    // Force download option
    if (/^--force-download$/.test(arg)) {
        forceDownload = true;
        continue;
    }

    // Skip cached option
    if (/^--skip-cached$/.test(arg)) {
        skipCached = true;
        continue;
    }

    // No search option
    if (/^--no-search$/.test(arg)) {
        noSearch = true;
        continue;
    }

    // Video ID
    if (/^\d+$/.test(arg)) {
        IDs.push(parseInt(arg));
        continue;
    }

    bruh();
}

(async () => { // I hate this


    if (skipCached && forceDownload) bruh(); // Mutually exclusive options

    // Adding the most recend VODs from a channel to the list (if the option was used)
    if (VODsFrom) {
        const VODScraper = new VODList();

        VODScraper.on("data", (VODs) => {
            IDs = IDs.concat(VODs);
        });

        VODScraper.on("error", (err) => {
            console.error(err);
            VODScraper.abortAll(); // Not really necessary for this
            process.exit(1);
        });

        console.log(prettifyString(`\nObtaining the ${maxVODs} most recent VOD IDs from '${VODsFrom}' ...`, getFormat.notice()));

        await VODScraper.getRecentVODs(VODsFrom, maxVODs);
    }

    if (IDs.length === 0) {
        console.error("No VOD IDs provided.");
        process.exit(1);
    }

    IDs = [...new Set(IDs)]; // Removing duplicates

    // Obtaining chat replays

    let nFound          = 0;
    let indicatorLen    = 0;
    const userWildcard  = users.includes("*");
    const dictWildcard  = dict.includes("*");
    const useDict       = (dict.length > (dictWildcard ? 1 : 0));
    const useUserList   = (users.length > (userWildcard ? 1 : 0));

    // if (!useDict && !useUserList) bruh();

    const downloader    = new ChatDownloader();

    downloader.on("data",
    /**
     * @param {Downloader.ChatMessage[]} messages
     * @param {string} videoID
     */
    (messages, videoID) => {
        // let maxNameLen   = 0;
        let results      = [];

        for (let msg of messages) {
            if (useUserList) {
                if (users.includes(`^${msg.user.name}`)) continue;
                if (!userWildcard && !users.includes(msg.user.name)) continue;
            }

            let blackFound      = false;
            let whiteFound      = dictWildcard || !useDict;
            let highlights      = [];
            let msgLowerCase    = msg.message.toLowerCase();

            if (useDict) {
                for (let word of dict) {
                    const result = searchMessage(msgLowerCase, word, dictWildcard, highlights);
                    blackFound = blackFound || result.blackFound;
                    whiteFound = whiteFound || result.whiteFound;
                    if (blackFound) break;
                }
            }

            if (whiteFound && !blackFound) {
                // maxNameLen = Math.max(maxNameLen, msg.user.name.length);
                nFound++;
                results.push([msg, videoID, highlights]);
            }
        }

        if (results.length > 0) {
            process.stdout.clearLine();
            console.log("");
            indicatorLen = 0;
        }
    
        for (let args of results) printChatMessage(...args);
    });

    downloader.on("progress", () => {
        if (indicatorLen >= 20) {
            process.stdout.clearLine();
            process.stdout.moveCursor(-20, 0);
            indicatorLen = 0;
        }
        indicatorLen++;
        process.stdout.write("░");
    });

    downloader.on("error", (err) => {
        if (indicatorLen > 0) {
            process.stdout.clearLine();
            console.log("");
            indicatorLen = 0;
        }
        console.error(err);
        downloader.abortAll();
    });

    downloader.on("success", () => {
        if (indicatorLen > 0) {
            process.stdout.clearLine();
            console.log("");
            indicatorLen = 0;
        }
        console.log(prettifyString(`\nFound ${nFound} messages in total.\n`, getFormat.notice()));
    });

    downloader.on("failure", () => {
        console.log("");
        console.error("One or more operations have failed.");
    });

    if (skipCached) IDs = downloader.removeCachedVODsFromList(IDs);

    if (IDs.length === 0) {
        console.log(prettifyString("\nNo VODs to search!\n", getFormat.notice()));
        process.exit(0);
    }

    if (noSearch) {
        console.log(prettifyString(`\nSkipping search. VOD IDs that would have been searched: ${IDs.join(" ")}\n`, getFormat.notice()));
    } else {
        console.log(prettifyString(`\nSearching chat replays from: ${IDs.join(" ")} ...`, getFormat.notice()));
        downloader.getChatReplays(IDs, forceDownload);
    }


})();