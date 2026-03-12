export interface AvatarConfig {
  sprite_id: string;
  body_shape: string;
  skin_tone: string;
  hair_style: string;
  hair_color: string;
  eyes: string;
  outfit_top: string;
  outfit_bottom: string;
  accessory: string | null;
  aura_color: string;
}

export const defaultAvatarConfig: AvatarConfig = {
  sprite_id: "human_shorthair_light_default",
  body_shape: "slender",
  skin_tone: "amber",
  hair_style: "wave",
  hair_color: "black",
  eyes: "focused",
  outfit_top: "linen",
  outfit_bottom: "sand",
  accessory: null,
  aura_color: "#d4af37"
};

const bodyShapes = ["slender", "athletic", "soft"] as const;
const skinTones = ["amber", "olive", "ebony", "rose"] as const;
const hairStyles = ["wave", "buzz", "braid", "curl"] as const;
const hairColors = ["black", "brown", "copper", "silver"] as const;
const eyeStyles = ["focused", "soft", "bright", "sleepy"] as const;
const outfitTops = ["linen", "indigo", "ochre", "sage"] as const;
const outfitBottoms = ["sand", "night", "stone", "terracotta"] as const;
const accessories = [null, "glasses", "earring", "hat"] as const;
const auraColors = ["#d4af37", "#4f8fba", "#d97b66", "#6fa87a", "#9f7aea"] as const;
const spriteIds = [
  "human_bowlhair_light_default", "human_bowlhair_light_blonde", "human_bowlhair_light_ginger", "human_bowlhair_light_black", "human_bowlhair_light_white",
  "human_bowlhair_medium_default", "human_bowlhair_medium_blonde", "human_bowlhair_medium_ginger", "human_bowlhair_medium_black", "human_bowlhair_medium_white",
  "human_bowlhair_dark_default", "human_bowlhair_dark_blonde", "human_bowlhair_dark_ginger", "human_bowlhair_dark_black", "human_bowlhair_dark_white",
  "human_curlyhair_light_default", "human_curlyhair_light_blonde", "human_curlyhair_light_ginger", "human_curlyhair_light_black", "human_curlyhair_light_white",
  "human_curlyhair_medium_default", "human_curlyhair_medium_blonde", "human_curlyhair_medium_ginger", "human_curlyhair_medium_black", "human_curlyhair_medium_white",
  "human_curlyhair_dark_default", "human_curlyhair_dark_blonde", "human_curlyhair_dark_ginger", "human_curlyhair_dark_black", "human_curlyhair_dark_white",
  "human_longhair_light_default", "human_longhair_light_blonde", "human_longhair_light_ginger", "human_longhair_light_black", "human_longhair_light_white",
  "human_longhair_medium_default", "human_longhair_medium_blonde", "human_longhair_medium_ginger", "human_longhair_medium_black", "human_longhair_medium_white",
  "human_longhair_dark_default", "human_longhair_dark_blonde", "human_longhair_dark_ginger", "human_longhair_dark_black", "human_longhair_dark_white",
  "human_mophair_light_default", "human_mophair_light_blonde", "human_mophair_light_ginger", "human_mophair_light_black", "human_mophair_light_white",
  "human_mophair_medium_default", "human_mophair_medium_blonde", "human_mophair_medium_ginger", "human_mophair_medium_black", "human_mophair_medium_white",
  "human_mophair_dark_default", "human_mophair_dark_blonde", "human_mophair_dark_ginger", "human_mophair_dark_black", "human_mophair_dark_white",
  "human_shorthair_light_default", "human_shorthair_light_blonde", "human_shorthair_light_ginger", "human_shorthair_light_black", "human_shorthair_light_white",
  "human_shorthair_medium_default", "human_shorthair_medium_blonde", "human_shorthair_medium_ginger", "human_shorthair_medium_black", "human_shorthair_medium_white",
  "human_shorthair_dark_default", "human_shorthair_dark_blonde", "human_shorthair_dark_ginger", "human_shorthair_dark_black", "human_shorthair_dark_white",
  "human_spikeyhair_light_default", "human_spikeyhair_light_blonde", "human_spikeyhair_light_ginger", "human_spikeyhair_light_black", "human_spikeyhair_light_white",
  "human_spikeyhair_medium_default", "human_spikeyhair_medium_blonde", "human_spikeyhair_medium_ginger", "human_spikeyhair_medium_black", "human_spikeyhair_medium_white",
  "human_spikeyhair_dark_default", "human_spikeyhair_dark_blonde", "human_spikeyhair_dark_ginger", "human_spikeyhair_dark_black", "human_spikeyhair_dark_white",
  "goblin", "skeleton"
] as const;

function hashSeed(seed: string) {
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash >>> 0;
}

function seededPick<T>(seed: number, values: readonly T[], offset: number): T {
  return values[(seed + offset) % values.length];
}

export function avatarForSeed(seedText: string): AvatarConfig {
  const seed = hashSeed(seedText);
  return {
    sprite_id: seededPick(seed, spriteIds, 0),
    body_shape: seededPick(seed, bodyShapes, 1),
    skin_tone: seededPick(seed, skinTones, 3),
    hair_style: seededPick(seed, hairStyles, 5),
    hair_color: seededPick(seed, hairColors, 7),
    eyes: seededPick(seed, eyeStyles, 11),
    outfit_top: seededPick(seed, outfitTops, 13),
    outfit_bottom: seededPick(seed, outfitBottoms, 17),
    accessory: seededPick(seed, accessories, 19),
    aura_color: seededPick(seed, auraColors, 23)
  };
}
