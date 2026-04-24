/**
 * Static catalog entries for ONE Portrait (MVP).
 *
 * Replace this module with a CMS/JSON fetch later without touching callers —
 * the public helpers in `@/lib/catalog` already expose an async-friendly API.
 *
 */

import type { AthleteCatalogEntry } from "../lib/catalog/types";
import { demoUnitId } from "../lib/demo";

export const athleteCatalogEntries: readonly AthleteCatalogEntry[] = [
  {
    unitId: demoUnitId,
    slug: "yuya-wakamatsu",
    displayName: "Yuya Wakamatsu",
    thumbnailUrl:
      "/demo/one-athletes/Yuya_Wakamatsu-avatar-champ-500x345-1.png",
    region: "Japan",
    status: "Active portrait",
  },
  {
    unitId:
      "0x00000000000000000000000000000000000000000000000000000000000000d4",
    slug: "takeru",
    displayName: "Takeru",
    thumbnailUrl: "/demo/one-athletes/Takeru-500x345-1.png",
    region: "Japan",
    status: "Opening soon",
  },
  {
    unitId:
      "0x00000000000000000000000000000000000000000000000000000000000000d5",
    slug: "rodtang-jitmuangnon",
    displayName: "Rodtang Jitmuangnon",
    thumbnailUrl: "/demo/one-athletes/Rodtang_Jitmuangnon-Avatar-500x345-1.png",
    region: "Thailand",
    status: "Active portrait",
  },
  {
    slug: "ayaka-miura",
    displayName: "Ayaka Miura",
    thumbnailUrl: "/demo/one-athletes/Ayaka_Miura-avatar-500x345-1.png",
    region: "Japan",
    status: "Waiting room",
  },
  {
    slug: "itsuki-hirata",
    displayName: "Itsuki Hirata",
    thumbnailUrl: "/demo/one-athletes/Itsuki_Hirata-avatar-500x345-4.png",
    region: "Japan",
    status: "Opening soon",
  },
  {
    slug: "jonathan-haggerty",
    displayName: "Jonathan Haggerty",
    thumbnailUrl: "/demo/one-athletes/Jonathan_Haggerty-avatar-500x345-4.png",
    region: "United Kingdom",
    status: "Active portrait",
  },
  {
    slug: "ritu-phogat",
    displayName: "Ritu Phogat",
    thumbnailUrl: "/demo/one-athletes/Ritu_Phogat-avatar-500x345-1.png",
    region: "India",
    status: "Waiting room",
  },
  {
    slug: "toma-kuroda",
    displayName: "Toma Kuroda",
    thumbnailUrl: "/demo/one-athletes/Toma_Kuroda-avatar-500x345-1.png",
    region: "Japan",
    status: "Opening soon",
  },
  {
    slug: "yuki-yoza",
    displayName: "Yuki Yoza",
    thumbnailUrl: "/demo/one-athletes/Yuki_Yoza-avatar-500x345-1.png",
    region: "Japan",
    status: "Waiting room",
  },
  {
    slug: "chihiro-sawada",
    displayName: "Chihiro Sawada",
    thumbnailUrl: "/demo/one-athletes/Chihiro_Sawada-avatar-500x345-3.png",
    region: "Japan",
    status: "Opening soon",
  },
  {
    slug: "avazbek-kholmirzaev",
    displayName: "Avazbek Kholmirzaev",
    thumbnailUrl: "/demo/one-athletes/Avazbek_Kholmirzaev-Avatar-500x345-1.png",
    region: "Uzbekistan",
    status: "Waiting room",
  },
] as const;
