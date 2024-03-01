import { Sources, translateWord, getLanguages } from "@parvineyvazov/json-translator";
import { convertTextMeasurements } from "./convert-measurements.js";
import jsdom from "jsdom";

global.source = Sources.BingTranslate;
export const languages = getLanguages();

const separator = "&nbsp;";
const internalSeparator = separator.repeat(2);
const separatorTags = ["span", "i", "em", "b", "strong", "u", "a"];

export async function translateContent(content, attempts = 0) {
  if (!content || !/[a-zA-Z]/.test(content)) {
    return content;
  }

  if (content.includes("@Compendium")) {
    const splitContent = content.split(/(@Compendium\[[a-zA-Z0-9.]*\]\{[a-zA-Z0-9]*\})/);

    const compendiumLinks = [];
    let contentWithoutLinks = "";

    splitContent.forEach((part, index) => {
      if (part.includes("@Compendium")) {
        const splitParts = part.split(/{|}/);
        compendiumLinks[index] = [splitParts[0], splitParts[2]];

        contentWithoutLinks += `${index === 0 ? "" : internalSeparator}${splitParts[1]}${
          index === splitContent.length - 1 ? "" : internalSeparator
        }`;
      } else {
        contentWithoutLinks += part;
      }
    });

    const translatedContent = await translateContent(contentWithoutLinks);

    const translatedSplitContent = translatedContent.split(internalSeparator);

    compendiumLinks.forEach(([link, after], index) => {
      translatedSplitContent[index] = `${link}{${translatedSplitContent[index]}}${after ?? ""}`;
    });

    return translatedSplitContent.join("");
  }

  const convertedContent = convertTextMeasurements(content);

  let translatedContent = await translateWord(convertedContent, languages.English, languages.Portuguese_Brazil);

  if (translatedContent === "--") {
    if (attempts !== 100) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return translateContent(content, (attempts ?? 0) + 1);
    } else {
      throw new Error(`Failed to translate:\n${content}`);
    }
  }

  if (content[0] === " " && translatedContent[0] !== " ") {
    translatedContent = ` ${translatedContent}`;
  }

  if (content[content.length - 1] === " " && translatedContent[translatedContent.length - 1] !== " ") {
    translatedContent = `${translatedContent} `;
  }

  return translatedContent;
}

export async function translateHtml(html) {
  if (html === "") {
    return html;
  }

  const dom = new jsdom.JSDOM(`<body>${html}</body>`);
  const body = dom.window.document.querySelector("body");

  const allTextNodes = [];

  function getAllTextNodes(node) {
    for (const childNode of node.childNodes) {
      if (childNode.nodeType === 3) {
        allTextNodes.push(childNode);
      } else if (childNode.nodeType === 1) {
        getAllTextNodes(childNode);
      }
    }
  }

  getAllTextNodes(body);
  const lastTextNode = allTextNodes[allTextNodes.length - 1];

  let currentText = "";
  let contentNodeStack = [];
  let keepStacking = true;

  async function getNodeContent(node) {
    if (node.nodeType === 3 && node.nodeValue.trim() !== "" && keepStacking) {
      contentNodeStack.push(node);
      const nodeValue = node.nodeValue.replace(/&nbsp;/g, "&#160;");
      currentText += `${currentText === "" ? "" : separator}${nodeValue}`;

      if (node === lastTextNode) {
        keepStacking = false;
      }
    }

    if (currentText !== "" && !keepStacking) {
      const translatedText = await translateContent(currentText);
      const splitTranslatedText = translatedText.split(separator);

      contentNodeStack.forEach((contentNode) => {
        contentNode.nodeValue = splitTranslatedText.shift();
      });

      currentText = "";
      contentNodeStack = [];
      keepStacking = true;
    }

    if (node.nodeType === 1) {
      for (const child of node.childNodes) {
        const childTagName = child.tagName?.toLowerCase();
        keepStacking =
          currentText === "" || !childTagName || (separatorTags.includes(childTagName) && childTagName !== "br");
        await getNodeContent(child);
      }
    }
  }

  await getNodeContent(body);

  return body.innerHTML;
}
