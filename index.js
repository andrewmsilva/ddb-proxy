import express from "express";
import cors from "cors";
import crypto from "crypto";

import { CONFIG } from "./config.js";
import { getBearerToken, getCacheId } from "./auth.js";

import filterModifiers from "./filterModifiers.js";
import { getConfig } from "./lookup.js";

import { loadSpells, getSpellAdditions, filterHomebrew } from "./spells.js";
import { extractCharacterData, getOptionalClassFeatures, getOptionalOrigins } from "./character.js";
import { extractItems } from "./items.js";
import { extractMonsters, extractMonstersById } from "./monsters.js";
import { getCampaigns } from "./campaign.js";

const app = express();
const port = process.env.PORT || 3000;

/**
 * A simple ping to tell if the proxy is running
 */
app.get("/ping", cors(), (req, res) => res.send("pong"));

const authPath = ["/proxy/auth"];
app.options(authPath, cors(), (req, res) => res.status(200).send());
app.post(authPath, cors(), express.json(), (req, res) => {
  if (!req.body.cobalt || req.body.cobalt == "") return res.json({ success: false, message: "No cobalt token" });
  const cacheId = getCacheId(req.body.cobalt);

  getBearerToken(cacheId, req.body.cobalt).then((token) => {
    if (!token) return res.json({ success: false, message: "You must supply a valid cobalt value." });
    return res.status(200).json({ success: true, message: "Authenticated." });
  });
});

const configLookupCall = "/proxy/api/config/json";
app.options(configLookupCall, cors(), (req, res) => res.status(200).send());
app.get(configLookupCall, cors(), express.json(), (req, res) => {
  getConfig()
    .then((data) => {
      return res.status(200).json({ success: true, message: "Config retrieved.", data: data });
    })
    .catch((error) => {
      console.log(error);
      if (error === "Forbidden") {
        return res.json({ success: false, message: "Forbidden." });
      }
      return res.json({ success: false, message: "Unknown error during config loading: " + error });
    });
});

/**
 * Returns raw json from DDB
 */
app.options("/proxy/items", cors(), (req, res) => res.status(200).send());
app.post("/proxy/items", cors(), express.json(), (req, res) => {
  if (!req.body.cobalt || req.body.cobalt == "") return res.json({ success: false, message: "No cobalt token" });

  const cacheId = getCacheId(req.body.cobalt);
  const campaignId = req.body.campaignId;

  getBearerToken(cacheId, req.body.cobalt).then((token) => {
    if (!token) return res.json({ success: false, message: "You must supply a valid cobalt value." });
    extractItems(cacheId, campaignId)
      .then((data) => {
        return res
          .status(200)
          .json({ success: true, message: "All available items successfully received.", data: data });
      })
      .catch((error) => {
        console.log(error);
        if (error === "Forbidden") {
          return res.json({ success: false, message: "You must supply a valid bearer token." });
        }
        return res.json({ success: false, message: "Unknown error during item loading: " + error });
      });
  });
});

/**
 * Get Class Spells RAW
 */
app.options("/proxy/class/spells", cors(), (req, res) => res.status(200).send());
app.post("/proxy/class/spells", cors(), express.json(), (req, res) => {
  const className = req.body.className ? req.body.className : req.params.className;
  const campaignId = req.body.campaignId;

  const klass = CONFIG.classMap.find((cls) => cls.name == className);
  if (!klass) return res.json({ success: false, message: "Invalid query" });
  if (!req.body.cobalt || req.body.cobalt == "") return res.json({ success: false, message: "No cobalt token" });
  const cobaltToken = req.body.cobalt;

  const cacheId = getCacheId(cobaltToken);

  const mockClass = [
    {
      characterClassId: cacheId,
      name: klass.name,
      id: klass.id,
      level: 20,
      spellLevelAccess: 20,
      spells: [],
      classId: klass.id,
      subclassId: klass.id,
      characterClass: klass.name,
      characterSubclass: klass.name,
      characterId: cacheId,
      spellType: klass.spells,
      campaignId: campaignId,
    },
  ];

  getBearerToken(cacheId, cobaltToken).then((token) => {
    if (!token) return res.json({ success: false, message: "You must supply a valid cobalt value." });
    loadSpells(mockClass, cacheId, true)
      .then((data) => {
        // console.log(data);
        const rawSpells = data.map((d) => d.spells).flat();
        // const parsedSpells = getSpells(rawSpells);
        // return parsedSpells;
        return rawSpells;
      })
      .then((data) => {
        // console.log(data);
        return res
          .status(200)
          .json({ success: true, message: "All available spells successfully received.", data: data });
      })
      .catch((error) => {
        console.log(error);
        if (error === "Forbidden") {
          return res.json({ success: false, message: "You must supply a valid cobalt value." });
        }
        return res.json({ success: false, message: "Unknown error during spell loading: " + error });
      });
  });
});

/**
 * Attempt to parse the character remotely
 */
app.options(["/proxy/character", "/proxy/v5/character"], cors(), (req, res) => res.status(200).send());
app.post(["/proxy/character", "/proxy/v5/character"], cors(), express.json(), (req, res) => {
  // check for cobalt token
  const cobalt = req.body.cobalt;

  let characterId = 0;
  try {
    const characterIdString = req.body.characterId ? req.body.characterId : req.params.characterId;
    characterId = parseInt(characterIdString);
  } catch (exception) {
    return res.json({ message: "Invalid query" });
  }

  const updateId = req.body.updateId ? req.body.updateId : 0;
  const cobaltId = `${characterId}${cobalt}`;
  let campaignId = null;

  getBearerToken(cobaltId, cobalt).then(() => {
    extractCharacterData(cobaltId, characterId, updateId) // this caches
      .then((data) => {
        console.log(`Name: ${data.name}, URL: ${CONFIG.urls.baseUrl}/character/${data.id}`);
        return Promise.resolve(data);
      })
      .then((data) => {
        if (data.campaign && data.campaign.id && data.campaign.id !== "") campaignId = data.campaign.id;
        const result = {
          character: data,
          name: data.name,
          decorations: data.decorations,
          classOptions: [],
          originOptions: [],
        };
        return result;
      })
      .then((result) => {
        if (cobalt) {
          const optionIds = result.character.optionalClassFeatures.map((opt) => opt.classFeatureId);
          return getOptionalClassFeatures(result, optionIds, campaignId, cobaltId);
        } else {
          console.warn("No cobalt token provided, not fetching optional class features");
          return result;
        }
      })
      .then((result) => {
        if (cobalt) {
          const optionIds = result.character.optionalOrigins.map((opt) => opt.racialTraitId);
          return getOptionalOrigins(result, optionIds, campaignId, cobaltId);
        } else {
          console.warn("No cobalt token provided, not fetching optional origins");
          return result;
        }
      })
      .then((result) => {
        return getSpellAdditions(result, cobaltId);
      })
      .then((result) => {
        const includeHomebrew = result.character.preferences.useHomebrewContent;
        return filterHomebrew(result, includeHomebrew);
      })
      .then((data) => {
        data = filterModifiers(data);
        return { success: true, messages: ["Character successfully received."], ddb: data };
      })
      .then((data) => {
        return res.status(200).json(data);
      })
      .catch((error) => {
        console.log(error);
        if (error === "Forbidden") {
          return res.json({ success: false, message: "Character must be set to public in order to be accessible." });
        }
        return res.json({ success: false, message: "Unknown error during character parsing: " + error });
      });
  });
});

/**
 * Return RAW monster data from DDB
 */
const getMonsterProxyRoutes = ["/proxy/monster", "/proxy/monsters"];
app.options(getMonsterProxyRoutes, cors(), (req, res) => res.status(200).send());
app.post(getMonsterProxyRoutes, cors(), express.json(), (req, res) => {
  // check for cobalt token
  const cobalt = req.body.cobalt;
  if (!cobalt || cobalt == "") return res.json({ success: false, message: "No cobalt token" });

  const search = req.body.search ? req.body.search : req.params.search;
  const searchTerm = req.body.searchTerm ? req.body.searchTerm : req.params.searchTerm;

  const homebrew = req.body.homebrew ? req.body.homebrew : false;
  const homebrewOnly = req.body.homebrewOnly ? req.body.homebrewOnly : false;
  const excludeLegacy = req.body.excludeLegacy ? req.body.excludeLegacy : false;

  const exactNameMatch = req.body.exactMatch || false;
  const performExactMatch = exactNameMatch && searchTerm && searchTerm !== "";

  const sources = req.body.sources || [];

  const hash = crypto.createHash("sha256");
  hash.update(cobalt + searchTerm);
  const cacheId = hash.digest("hex");

  getBearerToken(cacheId, cobalt).then((token) => {
    if (!token) return res.json({ success: false, message: "You must supply a valid cobalt value." });

    extractMonsters(cacheId, searchTerm, homebrew, homebrewOnly, sources)
      .then((data) => {
        if (excludeLegacy) {
          const filteredMonsters = data.filter((monster) => !monster.isLegacy);
          return filteredMonsters;
        } else {
          return data;
        }
      })
      .then((data) => {
        if (performExactMatch) {
          const filteredMonsters = data.filter((monster) => monster.name.toLowerCase() === search.toLowerCase());
          return filteredMonsters;
        } else {
          return data;
        }
      })
      .then((data) => {
        return res
          .status(200)
          .json({ success: true, message: "All available monsters successfully received.", data: data });
      })
      .catch((error) => {
        console.log(error);
        if (error === "Forbidden") {
          return res.json({ success: false, message: "You must supply a valid cobalt value." });
        }
        return res.json({ success: false, message: "Unknown error during monster loading: " + error });
      });
  });
});

/**
 * Return RAW monster data from DDB
 */
const getMonsterIdsProxyRoutes = ["/proxy/monstersById", "/proxy/monsters/ids"];
app.options(getMonsterIdsProxyRoutes, cors(), (req, res) => res.status(200).send());
app.post(getMonsterIdsProxyRoutes, cors(), express.json(), (req, res) => {
  // check for cobalt token
  const cobalt = req.body.cobalt;
  if (!cobalt || cobalt == "") return res.json({ success: false, message: "No cobalt token" });

  const ids = req.body.ids;
  if (!ids) {
    return res.json({
      success: false,
      message: "Please supply required monster ids.",
    });
  }

  const hash = crypto.createHash("sha256");
  hash.update(cobalt + ids.join("-"));
  const cacheId = hash.digest("hex");

  getBearerToken(cacheId, cobalt).then((token) => {
    if (!token) return res.json({ success: false, message: "You must supply a valid cobalt value." });

    extractMonstersById(cacheId, ids)
      .then((data) => {
        return res
          .status(200)
          .json({ success: true, message: "All available monsters successfully received.", data: data });
      })
      .catch((error) => {
        console.log(error);
        if (error === "Forbidden") {
          return res.json({ success: false, message: "You must supply a valid cobalt value." });
        }
        return res.json({ success: false, message: "Unknown error during monster loading: " + error });
      });
  });
});

app.options("/proxy/campaigns", cors(), (req, res) => res.status(200).send());
app.post("/proxy/campaigns", cors(), express.json(), (req, res) => {
  if (!req.body.cobalt || req.body.cobalt == "") return res.json({ success: false, message: "No cobalt token" });

  const cacheId = getCacheId(req.body.cobalt);

  getBearerToken(cacheId, req.body.cobalt).then((token) => {
    if (!token) return res.json({ success: false, message: "You must supply a valid cobalt value." });
    getCampaigns(req.body.cobalt, cacheId)
      .then((data) => {
        return res
          .status(200)
          .json({ success: true, message: "All available campaigns successfully received.", data: data });
      })
      .catch((error) => {
        console.log(error);
        if (error === "Forbidden") {
          return res.json({ success: false, message: "You must supply a valid bearer token." });
        }
        return res.json({ success: false, message: "Unknown error during campaign get: " + error });
      });
  });
});

app.listen(port, () => {
  console.log(`DDB Proxy started on :${port}`);
});
