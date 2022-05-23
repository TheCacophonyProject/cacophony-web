import fs from "fs/promises";
import * as Handlebars from "handlebars";
import config from "@config";
import {JSDOM} from "jsdom";

const SEPARATOR_LINE = "-----------";

const depthFirstTraversal = (emailRootElement) => {
    let rawText = "";
    const nodesToVisit = [];
    const visitedNodes = [];
    nodesToVisit.push(emailRootElement);
    while (nodesToVisit.length > 0) {
        const currentNode = nodesToVisit.pop();
        visitedNodes.push(currentNode);

        if (currentNode.nodeType === 3) { // A regular text node
            rawText += currentNode.textContent;
        }
        if (currentNode.parentNode.nodeName === "A") {
            rawText += ` (${currentNode.parentNode.href})`;
        }
        [].slice.call(currentNode.childNodes).reverse()
            .forEach((node) => {
                nodesToVisit.push(node);
            });
        if (currentNode.parentNode.nodeName === "TR" && currentNode === currentNode.parentNode.childNodes[currentNode.parentNode.childNodes.length - 1]) {
            if (rawText.trim().length !== 0) {
                rawText += `${SEPARATOR_LINE}\n`;
            }
        }

    }
    return rawText;
};

export const urlNormaliseGroupName = (name: string): string => {
    return decodeURIComponent(name).trim().replace(/ /g, "-").toLowerCase();
};

const scrapePlainTextFromHtml = (html: string): string => {
    const output = [];
    const dom = new JSDOM(html);
    // Text content, but we want to make the links have (...)
    const text = depthFirstTraversal(dom.window.document.body.querySelector("#email-body"));

    // Now get the lines, and collapse where there are too many new lines in a row.
    const lines = text.split("\n");
    const cleaned = lines.map((line) => line.trim());

    for (const line of cleaned) {
        const prevLine = output[output.length - 1] || "";
        if (line.length !== 0) {
            output.push(line);
        }
        if (line.length === 0 && prevLine.length !== 0) {
            output.push(line);
        }
    }
    // remove the last "------" line.
    while (output.length) {
        const r = output.pop();
        if (r === SEPARATOR_LINE) {
            break;
        }
    }
    return output.join("\r\n");
};

export interface StoppedDevice {
    id: number;
    deviceName: string;
    lastHeartbeat: Date;
    nextHeartbeat: Date;
}


export const createEmailWithTemplate = async (templatePath: string, interpolants: Record<string, string | number | StoppedDevice[]>) => {
    const baseTemplate = (await fs.readFile("./templates/base-template.html")).toString();
    const contentAndFooter = (await fs.readFile(templatePath)).toString();
    try {
        const full = Handlebars.compile(baseTemplate, { noEscape: true });
        const fullTemplate = full({contentAndFooter});
        const template = Handlebars.compile(fullTemplate, {strict: true});
        // Interpolate values into file
        const targetSpecies = "Possum"; // TODO - Make sure we upper-case this.
        const groupName = "My Group name";
        const deviceName = "My device name";
        const stationName = "My station name";
        const recordingId = 1234;
        const trackId = 5678;

        const cacophonyBrowseUrl = config.server.browse_url;
        const emailSettingsUrl = `${cacophonyBrowseUrl}/${urlNormaliseGroupName(groupName)}/settings`;
        const stationUrl = `${cacophonyBrowseUrl}/${urlNormaliseGroupName(groupName)}/station/${urlNormaliseGroupName(stationName)}`;
        const recordingUrl = `${cacophonyBrowseUrl}/${urlNormaliseGroupName(groupName)}/station/${urlNormaliseGroupName(stationName)}/recording/${recordingId}/track/${trackId}`;
        const cacophonyDisplayUrl = "cacophony.org.nz";

        // FIXME Emails - we need to make sure we're sending emails with the recipients time-zone, so add timezone offsets to users when they login.
        const recordingTime = new Date();
        const html = template({
            targetSpecies,
            groupName,
            stationName,
            deviceName,
            recordingTime,
            cacophonyBrowseUrl,
            cacophonyDisplayUrl,
            emailSettingsUrl,
            stationUrl,
            recordingUrl
        });
        const plainText = scrapePlainTextFromHtml(html);
        return { text: plainText, html };
    } catch (e) {
        console.log("Template compile error: ", e);
    }
};
