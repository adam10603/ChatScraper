# Chat Scraper
![Version](https://img.shields.io/badge/Version-1.0-blue.svg)

This Node.JS command-line tool helps to quickly search the chat history of any number of Twitch VODs. It can filter by message content or username in a few different ways.

![Example use](https://i.imgur.com/bdmsCCD.png)

## Usage 🖥️

The code is self-contained and doesn't rely on any other packages or libraries that aren't a default part of Node.JS. You can just [download the code](/adam10603/ChatScraper/releases) and run the command with `node`, nothing else to install or configure.

## Command-line Arguments ⌨

`node scrape_chat [options] <Video ID>...`

### Options

#### `--dict=<Ruleset>`

Defines the "dictionary" [ruleset](#rulesets) that will be used for matching messages by content.

#### `--users=<Ruleset>`

Defines the [ruleset](#rulesets) that will be used for matching usernames. Unlike with the dictionary, the `=` prefix in a rule has no effect here. Usernames are a single word, so rules trying to match a standalone word are meaningless.

#### `--print-links`

Displays timestamped VOD URLs next to each message that was found. This makes it very easy to jump to the VOD and see the conversation.

#### `--plain`

Prevents the script from using escape sequences to color the output. Use this if your terminal is showing junk characters instead of colors.

#### `--force-download`

The script will always save a copy of each VOD's chat log in a local cache which speeds up future searches of the same VOD. Use this flag to re-download the chat logs even if they are present in the cache.

This directory is called `cache` by default and it's automatically created in the same directory the script is in.

#### `<Video ID>...`

Specify one or more video IDs to search their chat history at once. Concurrent downloads are limited to 2, but I might add a flag to change it in the future.

### Rulesets

A ruleset is a list of rules you can use to find the content you want. You can supply rulesets to the `--dict=` and `--users=` flags to filter the messages and/or usernames respectively.

A ruleset can be provided in one of two ways:
 - A comma-separated list, such as: `--dict="booba,cocka"`
   - Commas can be escaped with `\` if they are a part of a phrase
 - A path to a JSON file containing an array of strings: `--dict=my_dict.json`

A rule is considered positive by default, but can be marked negative with a `^` prefix.

An item (a message or username) is only considered a match if it satisfies at least one positive rule and no negative rules at all.

Rule-matching is always case-insensitive.

Rulsets can also contain a special rule that matches everything. This rule is a single `*` character. Wildcards are **not** supported in rulesets in general, however, this special rule exists to enable rulesets that only contain negative rules. A set of negative-only rules would otherwise not show any results.

Positive rules can be marked "standalone" with an `=` prefix. These will only produce a match if the word is **not** a part of a bigger word. This means it can only be surrounded by whitespaces, characters like `?` `.` `,` etc, or the start/end of the string. For example this is useful if searching for the streamer's name which also happens to be their emote prefix.

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
   - ✅ (Literally every message except ones containing "boob")

 - Using `--users=no_bots.json` :
   - ✅ (Every message except those sent by certain bots)

The `no_bots.json` ruleset is included by default. Here's what it looks like:

```json
[
    "*",
    "^nightbot",
    "^streamlabs",
    "^streamelements"
]
```

## Version History 📃

* v1.0
  * Initial release

_____________________
![MIT Logo](https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/MIT_logo.svg/32px-MIT_logo.svg.png) Distributed under the [MIT License](LICENSE).