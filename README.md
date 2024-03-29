# Chat Scraper
![Version](https://img.shields.io/badge/Version-1.1-blue.svg)

This Node.JS command-line tool helps to quickly search the chat history of any number of Twitch VODs. It can filter by message content or username in a few different ways.

![Example use](https://i.imgur.com/bdmsCCD.png)

## Usage 🖥️

The code is self-contained and doesn't rely on any other packages or libraries that aren't a default part of Node.JS. You can just [download the code](https://github.com/adam10603/ChatScraper/releases/latest) and run the command with `node`, nothing else to install or configure.

## Command-line Arguments ⌨

`node scrape_chat [options] [Video ID]...`

### Options

#### `--dict=<Ruleset>`

Defines the "dictionary" [ruleset](#rulesets) that will be used for matching messages by content.

#### `--users=<Ruleset>`

Defines the [ruleset](#rulesets) that will be used for matching usernames. Unlike with the dictionary, every rule here will be treated as "standalone" (just like the `=` prefix). This is because partially matching usernames doesn't make much sense. Only exact matches are considered.

#### `--vods-from=<User>`

Specifies a channel whose most recent VODs will be automatically added to the list of VODs to search. This makes it so that you don't have to supply VOD IDs by hand, but you can still do that in conjunction with this if you want to. By default this option gets the 5 most recent VODs from the channel, but you can use the [--max-vods](#--max-vodsnumber) option to change that.

Note that currently this option also includes the VOD of the current stream, while the stream is still live. This results in a partial version of that VOD's chat replay being cached. If this happens, you can wait until the stream is over, then use the [--force-download](#--force-download) option to re-download the entirety of the chat replay in question.

#### `--max-vods=<Number>`

Limits how many of the channel's most recent VOD IDs to get when using the [--vods-from](#--vods-fromuser) option. The default is 5 if this option is omitted.

#### `--print-links`

Displays timestamped VOD URLs next to each message that was found. This makes it very easy to jump to the VOD and see the conversation.

#### `--plain`

Prevents the script from using escape sequences to color the output. Use this if you're redirecting the output to a file, or if your terminal is showing junk characters instead of colors.

#### `--force-download`

The script will always save a copy of each VOD's chat log in a local cache which speeds up future searches of the same VOD. The cache directory is called `cache` and it's automatically created in the same directory the script is in.

This flag will re-download the chat logs even if they are in the cache. This also refreshes the cached version. This option is mutually exclusive with [--skip-cached](#--skip-cached).

#### `--skip-cached`

Skips searching VODs that are present in the local cache. This is useful if you're using the [--vods-from](#--vods-fromuser) option to search a streamer's most recent VODs, but you don't want any overlaps with VODs you've already searched in the past. This option is mutually exclusive with [--force-download](#--force-download).

#### `[Video ID]...`

Here you can specify any number of video IDs (separated by a space) to search their chat history at once. Note that this is optional if you use the [--vods-from](#--vods-fromuser) flag.

### Rulesets

A ruleset is a list of rules you can use to find the messages you want.

The `--dict=` and `--users=` flags both take a ruleset to filter the messages and usernames respectively.

A ruleset can be provided in one of two ways:
 - A comma-separated list, such as: `--dict="booba,cocka"`
   - Commas can be escaped with `\` if they are a part of a phrase
 - A path to a JSON file containing an array of strings: `--dict=my_dict.json`

A rule is considered positive by default, but can be marked negative with a `^` prefix.

An item (a message or username) is only considered a match if it satisfies at least one positive rule and no negative rules at all.

Rule-matching is always case-insensitive.

Rulsets can also contain a special rule that matches everything. This rule is a single `*` character. Wildcards are **not** supported in rulesets in general, however, this special rule exists to enable rulesets that only contain negative rules. A set of negative-only rules would otherwise not show any results.

Positive rules can be marked "standalone" with an `=` prefix. These will only produce a match if the word is **not** a part of a bigger word. This means it can't be bordered by anything other than whitespaces or characters like `?` `.` `,` etc. For example this can be useful if a search term is also an emote prefix.

#### Example Rulesets

Here are a few random rulesets and things they would or wouldn't match.

 - Using `--dict="boob,^boobs"` :
   - ✅ "*Boob!*"
   - ✅ "*BOOBA*"
   - ❌ "*boobs LMAO*"

 - Using `--dict="=boob"` :
   - ✅ "*Boob!*"
   - ❌ "*BOOBA*"
   - ❌ "*boobs LMAO*"

 - Using `--dict="*,^boob"` :
   - ✅ (Every message except ones containing "boob")

 - Using `--users=no_bots.json` :
   - ✅ (Every message except those sent by certain bots)

The `no_bots.json` ruleset is included with the repository by default. Here's what it looks like:

```json
[
    "*",
    "^nightbot",
    "^streamlabs",
    "^streamelements",
    "^moobot"
]
```

_____________________
![MIT Logo](https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/MIT_logo.svg/32px-MIT_logo.svg.png) Distributed under the [MIT License](LICENSE).