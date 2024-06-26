import fs from "fs/promises";
import Handlebars from "handlebars";
import { JSDOM } from "jsdom";
import path from "path";
import { fileURLToPath } from "url";
import type { EmailImageAttachment } from "@/scripts/emailUtil.js";
import type { ResizeOptions } from "sharp";
import sharp from "sharp";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEPARATOR_LINE = "-----------";

const depthFirstTraversal = (emailRootElement) => {
  let rawText = "";
  const nodesToVisit = [];
  const visitedNodes = [];
  nodesToVisit.push(emailRootElement);
  while (nodesToVisit.length > 0) {
    const currentNode = nodesToVisit.pop();
    visitedNodes.push(currentNode);

    if (currentNode.nodeType === 3) {
      // A regular text node
      rawText += currentNode.textContent;
    }
    if (currentNode.parentNode.nodeName === "A") {
      rawText += ` (${currentNode.parentNode.href})`;
    }
    [].slice
      .call(currentNode.childNodes)
      .reverse()
      .forEach((node) => {
        nodesToVisit.push(node);
      });
    if (
      currentNode.parentNode.nodeName === "TR" &&
      currentNode ===
        currentNode.parentNode.childNodes[
          currentNode.parentNode.childNodes.length - 1
        ]
    ) {
      if (rawText.trim().length !== 0) {
        rawText += `${SEPARATOR_LINE}\n`;
      }
    }
  }
  return rawText;
};

export const urlNormaliseName = (name: string): string => {
  return decodeURIComponent(name).trim().replace(/ /g, "-").toLowerCase();
};

const scrapePlainTextFromHtml = (html: string): string => {
  const output = [];
  const dom = new JSDOM(html);
  // Text content, but we want to make the links have (...)
  const text = depthFirstTraversal(
    dom.window.document.body.querySelector("#email-body")
  );

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

export const createEmailWithTemplate = async (
  templateFilename: string,
  interpolants: Record<
    string,
    string | number | StoppedDevice[] | string[] | boolean | any
  >
) => {
  const baseTemplate = (
    await fs.readFile(`${__dirname}/templates/base-template.html`)
  ).toString();
  const contentAndFooter = (
    await fs.readFile(`${__dirname}/templates/${templateFilename}`)
  ).toString();
  try {
    const full = Handlebars.compile(baseTemplate, { noEscape: true });
    const fullTemplate = full({ contentAndFooter });
    const template = Handlebars.compile(fullTemplate, {
      strict: true,
      noEscape: true,
    });
    // FIXME Emails - we need to make sure we're sending emails with the recipients time-zone, so add timezone offsets to users when they login.
    const html = template(interpolants);
    const plainText = scrapePlainTextFromHtml(html);
    return { text: plainText, html };
  } catch (e) {
    console.log("Template compile error: ", e);
  }
};

export const embedImage = async (
  cid: string,
  imageAttachments: EmailImageAttachment[],
  src: string
) => {
  const filePath = `${__dirname}/templates/image-attachments/${src}`;
  let imageBuffer: Buffer;
  const sharpOptions = {
    density: 216,
  };
  const resizeOptions: ResizeOptions = {
    fit: "cover",
    width: 600,
    height: null,
  };
  try {
    imageBuffer = await fs.readFile(filePath);
    if (imageBuffer.toString("utf8").trim().startsWith("<svg")) {
      imageBuffer = await sharp(imageBuffer, sharpOptions)
        .resize(resizeOptions)
        .png({
          palette: false,
          compressionLevel: 9,
        })
        .toBuffer();
    }
  } catch (e) {
    // File doesn't exist, check if it's an svg string
    if (src.trim().startsWith("<svg")) {
      imageBuffer = await sharp(Buffer.from(src), sharpOptions)
        .resize(resizeOptions)
        .png({
          palette: false,
          compressionLevel: 9,
        })
        .toBuffer();
    } else {
      // TODO Handle file missing errors
      throw new Error(`File not found: ${filePath}`);
    }
  }
  imageAttachments.push({
    buffer: imageBuffer,
    mimeType: "image/png",
    cid,
  });
  return `cid:${cid}`;
};
