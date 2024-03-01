import jsdom from "jsdom";
import { translateContent } from "./translate-content.js";

const separator = "&nbsp;";
const separatorTags = ["span", "i", "em", "b", "strong", "u", "a"];

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
          currentText === "" ||
          !childTagName ||
          (separatorTags.includes(childTagName) && childTagName !== "br");
        await getNodeContent(child);
      }
    }
  }

  await getNodeContent(body);

  return body.innerHTML;
}