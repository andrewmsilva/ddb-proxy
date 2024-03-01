// This data is the light version of data available in the character builder
import fetch from "node-fetch";
import { CONFIG } from "./config.js";
import { CACHE_AUTH } from "./auth.js";
import { Cache } from "./cache.js";

const CACHE_CAMPAIGNS = new Cache("CAMPAIGNS", 0.25);

// this endpoint aggressively caches campaigns as it's prone to been marked as a bot
export const getCampaigns = (cobalt, cacheId) => {
  return new Promise((resolve, reject) => {
    const cache = CACHE_CAMPAIGNS.exists(cacheId);
    if (cache !== undefined) {
      return resolve(cache.data);
    }

    const auth = CACHE_AUTH.exists(cacheId);
    if (!auth || !auth.data) {
      reject("Unable to authorise cobalt cookie");
    }

    const headers = {
      Authorization: `Bearer ${auth.data}`,
      "User-Agent": "Foundry VTT Character Integrator",
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate, br",
      Cookie: `CobaltSession=${cobalt}`,
    };

    const options = {
      method: "GET",
      headers: headers,
    };

    fetch(CONFIG.urls.campaignsAPI, options)
      .then((res) => res.json())
      .then((json) => {
        if (json.status == "success") {
          CACHE_CAMPAIGNS.add(cacheId, json.data);
          resolve(json.data);
        } else if (json.blockScript) {
          reject("You've been marked as a bot by DDB, please try again later");
        } else {
          reject("Unknown error");
        }
      })
      .catch((error) => {
        console.error(`Error fetching campaigns: ${error}`);
        reject(error);
      });
  });
};
