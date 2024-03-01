import { Sources, translateWord, getLanguages } from "@parvineyvazov/json-translator";

global.source = Sources.BingTranslate;
export const languages = getLanguages();

const separator = "&nbsp;".repeat(2);

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

        contentWithoutLinks += `${index === 0 ? "" : separator}${splitParts[1]}${
          index === splitContent.length - 1 ? "" : separator
        }`;
      } else {
        contentWithoutLinks += part;
      }
    });

    const translatedContent = await translateContent(contentWithoutLinks);

    const translatedSplitContent = translatedContent.split(separator);

    compendiumLinks.forEach(([link, after], index) => {
      translatedSplitContent[index] = `${link}{${translatedSplitContent[index]}}${after ?? ""}`;
    });

    return translatedSplitContent.join("");
  }

  const convertedContent = convertMeasurements(content);

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

function convertMeasurements(text) {
  const regex = /(\d+(\.\d+)?)\s*(inch(es)?|foot|feet|yd|yard|mile|oz|ounce|lb|pound)s?/gi;

  function replaceMeasurement(match, value, _, unit) {
    const measurementInMeters = convertToMeters(value, unit.toLowerCase());

    if (!measurementInMeters) {
      return match;
    } else {
      return `${measurementInMeters.value} ${measurementInMeters.unit}s`;
    }
  }

  function replaceWeight(match, value, _, unit) {
    const weightInKilograms = convertToKilograms(value, unit.toLowerCase());

    if (!weightInKilograms) {
      return match;
    } else {
      return `${weightInKilograms.value} ${weightInKilograms.unit}s`;
    }
  }

  text = text.replace(regex, replaceMeasurement);
  text = text.replace(regex, replaceWeight);

  return text;
}

export function convertToMeters(value, unit) {
  const conversionToMeters = {
    inch: 0.0254,
    inches: 0.0254,
    foot: 0.3048,
    feet: 0.3048,
    yd: 0.9144,
    yard: 0.9144,
    mile: 1609.34,
  };

  if (unit in conversionToMeters) {
    const convertedValue = value * conversionToMeters[unit];

    if (convertedValue < 1) {
      return { value: Math.round(convertedValue * 100), unit: "centimeter" };
    } else if (convertedValue > 1000) {
      return { value: Math.round(convertedValue / 1000), unit: "kilometer" };
    } else {
      return { value: Math.round(convertedValue), unit: "meters" };
    }
  }

  return null;
}

export function convertToKilograms(value, unit) {
  const conversionToKilograms = {
    oz: 0.0283495,
    ounce: 0.0283495,
    lb: 0.453592,
    pound: 0.453592,
  };

  if (unit in conversionToKilograms) {
    const convertedValue = value * conversionToKilograms[unit];

    if (convertedValue < 1) {
      return { value: Math.round(convertedValue * 1000), unit: "gram" };
    } else {
      return { value: Math.round(convertedValue), unit: "kilograms" };
    }
  }

  return null;
}
