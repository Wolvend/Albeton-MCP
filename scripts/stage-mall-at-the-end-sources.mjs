/* global console, process */
import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import crypto from "node:crypto";
import { URL } from "node:url";

const root = process.cwd();
const slug = "mall-at-the-end-of-sleep";
const sourceDir = path.join(root, "samples", "staging", slug, "sources");
fs.mkdirSync(sourceDir, { recursive: true });

const archiveItem = "valentinosoundeffectslibrary";
const sourcePage = `https://archive.org/details/${archiveItem}`;
const license = "Public Domain Mark 1.0";
const licenseUrl = "https://creativecommons.org/publicdomain/mark/1.0/";

const sources = [
  {
    id: "department-store-ambience",
    file: "department-store-ambience.wav",
    archivePath: "CD04 - Traffic, Ambience, Planes/CD04/54. Department Store Ambience.wav",
    role: "primary empty-mall air and distant store memory"
  },
  {
    id: "crowded-store-walla",
    file: "crowded-store-walla.wav",
    archivePath: "CD02 - Audience, Applause, Office sounds/CD02/23. Walla, Interior Of Crowded Store.wav",
    role: "buried unintelligible public-space memory texture"
  },
  {
    id: "supermarket-checkout",
    file: "supermarket-checkout.wav",
    archivePath: "CD02 - Audience, Applause, Office sounds/CD02/05. Supermarket Checkout Counter.wav",
    role: "cash-register ghosts and distant retail rhythm"
  },
  {
    id: "electric-sign-letter-flips",
    file: "electric-sign-letter-flips.wav",
    archivePath: "CD02 - Audience, Applause, Office sounds/CD02/60. Electric Sign (Letter Flips).wav",
    role: "neon sign ticks, cassette scars, and wrong PA chirps"
  },
  {
    id: "freight-elevator-interior",
    file: "freight-elevator-interior.wav",
    archivePath: "CD07 - Airplanes, Helicopters, Machine Guns/CD07/46. Elevator - Freight - Interior.wav",
    role: "dead escalator and infrastructure groan"
  },
  {
    id: "elevator-switching-room",
    file: "elevator-switching-room.wav",
    archivePath: "CD08 - Clocks, Telephones, Airports/CD08/35. Elevator - switching room ambience.wav",
    role: "mechanical room tone and unstable mall guts"
  },
  {
    id: "store-door-bell",
    file: "store-door-bell.wav",
    archivePath: "CD10 - Trains, Farm animals, Dogs/CD10/40. Bell - Store - Door Entrance.wav",
    role: "familiar retail bell transformed into a decaying motif accent"
  },
  {
    id: "humidifier-run",
    file: "humidifier-run.wav",
    archivePath: "CD08 - Clocks, Telephones, Airports/CD08/21. Humidifier - house - on, run.wav",
    role: "HVAC bed and fluorescent-air movement"
  }
];

function archiveUrl(archivePath) {
  return `https://archive.org/download/${archiveItem}/${archivePath.split("/").map(encodeURIComponent).join("/")}`;
}

function download(url, destination) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { "User-Agent": "ableton-mcp-source-stager/1.0" } }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
        const location = response.headers.location;
        response.resume();
        if (!location) {
          reject(new Error(`Redirect without location for ${url}`));
          return;
        }
        download(new URL(location, url).toString(), destination).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Download failed ${response.statusCode} for ${url}`));
        return;
      }
      const file = fs.createWriteStream(destination);
      response.pipe(file);
      file.on("finish", () => file.close(resolve));
      file.on("error", reject);
    });
    request.on("error", reject);
    request.setTimeout(60000, () => {
      request.destroy(new Error(`Timeout downloading ${url}`));
    });
  });
}

function sha256(file) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(file));
  return hash.digest("hex");
}

const manifest = {
  ok: true,
  title: "Mall at the End of Sleep source manifest",
  sourcePage,
  archiveItem,
  sourceCollection: "Valentino Sound Effects Library: ENTIRE COLLECTION",
  sourceCreator: "Thomas J. Valentino / Valentino Studios archive item",
  license,
  licenseUrl,
  sourcePolicy: "fixed_allowlisted_public_domain_internet_archive_sources_only",
  arbitraryUrlFetch: false,
  generatedAt: new Date().toISOString(),
  files: []
};

for (const source of sources) {
  const destination = path.join(sourceDir, source.file);
  const url = archiveUrl(source.archivePath);
  if (!fs.existsSync(destination)) {
    console.error(`Downloading ${source.id}`);
    await download(url, destination);
  }
  const stat = fs.statSync(destination);
  if (stat.size < 100000) throw new Error(`Downloaded file is unexpectedly small: ${destination}`);
  manifest.files.push({
    ...source,
    url,
    localPath: destination,
    bytes: stat.size,
    sha256: sha256(destination),
    attribution: `${source.archivePath} from Valentino Sound Effects Library: ENTIRE COLLECTION, Public Domain Mark 1.0, ${sourcePage}`
  });
}

const manifestPath = path.join(sourceDir, "sources-manifest.json");
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ ok: true, manifest: manifestPath, files: manifest.files.length }, null, 2));
