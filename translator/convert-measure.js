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
      return { value: Math.round(convertedValue), unit: "kilogram" };
    }
  }

  return null;
}

export function convertTextMeasurements(text) {
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
