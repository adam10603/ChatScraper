"use strict";

function clamp(v, min, max) {
    return Math.min(Math.max(v, min), max);
}

/**
 * Represents an RGB color.
 */
class RGBColor {
    /**
     * @param {number} r 0-255
     * @param {number} g 0-255
     * @param {number} b 0-255
     */
    constructor(r, g, b) {
        this.r = Math.round(clamp(r, 0, 255));
        this.g = Math.round(clamp(g, 0, 255));
        this.b = Math.round(clamp(b, 0, 255));
    }

    /**
     * @param {RGBColor} other 
     * @returns {boolean}
     */
    equals = (other) => this.r === other.r && this.g === other.g && this.b === other.b;
}

/**
 * Represents formatting to be applied to a string when printed to the terminal.
 */
class StringFormat {
    /**
     * @param {number} start 
     * @param {number} end 
     * @param {RGBColor|"default"} foreground 
     * @param {RGBColor|"default"} background
     * @param {boolean} underline 
     */
    constructor(start, end, foreground, background = "default", underline = false) {
        this.start      = start;
        this.end        = end;
        this.foreground = foreground;
        this.background = background;
        this.underline  = underline;
    }
}

/**
 * Ensures that the list of formats aren't overlapping in problematic ways and don't have out-of-bounds indicies.
 * @param {string} str
 * @param {StringFormat[]} formatList 
 * @returns {StringFormat[]} A new format list that's been sanity checked.
 */
function prepareFormatList(str, formatList) {
    for (let s of formatList) {
        if (s.start < 0) s.start = 0;
        if (s.end > str.length) s.end = str.length;
    }

    formatList.sort((a, b) => a.start - b.start);

    for (let i = 1; i < formatList.length; i++) {
        if (formatList[i - 1].end > formatList[i].start) {
            formatList[i].start = formatList[i - 1].end;
        }

        formatList[i].end = Math.max(formatList[i].end, formatList[i - 1].end);
    }

    return formatList.filter(v => v.start < v.end);
}

/**
 * @param {boolean} underline 
 */
const escUnderline = (underline) => `\x1b[${ underline ? 4 : 24 }m`;

/**
 * @param {RGBColor | "default"} color
 */
const escFgColor = (color) => (color === "default") ? "\x1b[39m" : `\x1b[38;2;${color.r};${color.g};${color.b}m`;

/**
 * @param {RGBColor | "default"} color
 */
const escBgColor = (color) => (color === "default") ? "\x1b[49m" : `\x1b[48;2;${color.r};${color.g};${color.b}m`;

const escReset = () => "\x1b[0m";

/**
 * @module ./utils/string_highlighter
 */
module.exports = {
    /**
     * Creates a new StringFormat object.
     * @param {number} start 
     * @param {number} end 
     * @param {RGBColor|"default"} foreground 
     * @param {RGBColor|"default"} background
     * @param {boolean} underline 
     * @returns {StringFormat}
     */
    format: (start, end, foreground, background = "default", underline = false) => {
        return new StringFormat(start, end, foreground, background, underline);
    },

    /**
     * Creates a new RGBColor object.
     * @param {number} r 0-255
     * @param {number} g 0-255
     * @param {number} b 0-255
     * @returns {RGBColor}
     */
    color: (r, g, b) => {
        return new RGBColor(r, g, b);
    },
    
    /**
     * Returns a new string with the desired formatting applied.
     * @param {string} str
     * @param {StringFormat[]} formatList
     * @returns {string}
     */
    prettify: function(str, formatList) {
        let ret = "";
        let i   = 0;

        for (let fmt of prepareFormatList(str, formatList)) {
            if (i < fmt.start)
                ret += str.substring(i, fmt.start);

            if (fmt.underline)
                ret += escUnderline(fmt.underline);

            if (fmt.foreground !== "default")
                ret += escFgColor(fmt.foreground);

            if (fmt.background !== "default")
                ret += escBgColor(fmt.background);

            ret += str.substring(fmt.start, fmt.end);
            ret += escReset();

            i = fmt.end;
        }

        if (i < str.length) {
            ret += str.substring(i);
            ret += escReset();
        }

        return ret;
    }
};