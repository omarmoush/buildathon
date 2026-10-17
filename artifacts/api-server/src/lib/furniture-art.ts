// Deterministic furniture illustrations and colours, so every picture shown for a category,
// style, wood and finish actually depicts that combination (no stock photos that drift).

export const CATEGORIES = [
  "bed", "nightstand", "wardrobe", "dresser", "dining-table", "dining-chair", "sofa", "coffee-table",
] as const;
export type Category = (typeof CATEGORIES)[number];
export const STYLES = ["modern", "classic", "japandi", "scandinavian"] as const;
export type Style = (typeof STYLES)[number];

const WOOD: Record<string, string> = { oak: "#b07c4f", beech: "#d6ae7f", walnut: "#6a452a", pine: "#dfbf88" };
const STAIN: Record<string, string> = { white: "#eee8de", walnut: "#5e3d25" };

const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
const toHex = (rgb: number[]) => `#${rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
export const shade = (hex: string, factor: number) => toHex([0, 1, 2].map(i => channel(hex, i) * factor));
const mix = (hex: string, other: string, amount: number) =>
  toHex([0, 1, 2].map(i => channel(hex, i) * (1 - amount) + channel(other, i) * amount));

/** Body colour of a piece for a wood and finish. White paint and walnut stain cover the wood. */
export function woodHex(wood = "oak", finish = "natural"): string {
  const base = STAIN[finish] ?? WOOD[wood.toLowerCase()] ?? WOOD.oak!;
  return finish === "matte" ? mix(base, "#8a8178", .18) : base;
}
export const hexToLinear = (hex: string): [number, number, number, number] =>
  [0, 1, 2].map(i => Math.pow(channel(hex, i) / 255, 2.2)).concat(1) as [number, number, number, number];

const isCategory = (value: string): value is Category => (CATEGORIES as readonly string[]).includes(value);
const isStyle = (value: string): value is Style => (STYLES as readonly string[]).includes(value);

export function furnitureSvg(options: { category: string; style?: string; wood?: string; finish?: string }): string {
  const category: Category = isCategory(options.category) ? options.category : "dresser";
  const style: Style = options.style && isStyle(options.style) ? options.style : "modern";
  const body = woodHex(options.wood, options.finish);
  const dark = shade(body, .72), light = shade(body, 1.12);
  const metal = "#2f2b27";
  const fabric = { modern: "#9aa3a0", classic: "#b59d84", japandi: "#d8d0c2", scandinavian: "#e3e0d9" }[style];
  const r = { modern: 2, classic: 7, japandi: 10, scandinavian: 5 }[style];
  const floor = 172;

  const leg = (x: number, top: number, bottom = floor) => {
    const h = bottom - top;
    if (style === "modern") return `<rect x="${x - 2}" y="${top}" width="4" height="${h}" fill="${metal}"/>`;
    if (style === "classic") return `<path d="M${x - 5} ${top}h10l-3 ${h * .35}q5 ${h * .12} 0 ${h * .25}l2 ${h * .4}h-8l2 ${-h * .4}q-5 ${-h * .13} 0 ${-h * .25}z" fill="${dark}"/>`;
    if (style === "japandi") return `<rect x="${x - 6}" y="${top}" width="12" height="${h}" rx="3" fill="${dark}"/>`;
    const lean = x < 160 ? -6 : 6;
    return `<path d="M${x - 4} ${top}h8l${lean + 1.5} ${h}h-3z" fill="${dark}"/>`;
  };
  const legTop = (y: number) => style === "japandi" ? Math.max(y, floor - 12) : y;
  const knob = (x: number, y: number) => style === "modern"
    ? `<rect x="${x - 9}" y="${y - 1.5}" width="18" height="3" rx="1.5" fill="${metal}"/>`
    : `<circle cx="${x}" cy="${y}" r="${style === "classic" ? 3.5 : 2.5}" fill="${style === "classic" ? "#b8913a" : dark}"/>`;
  const drawers = (x: number, y: number, w: number, h: number, rows: number, cols: number) => {
    let out = "";
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      const dx = x + 6 + col * (w - 12) / cols, dy = y + 6 + row * (h - 12) / rows;
      const dw = (w - 12) / cols - 4, dh = (h - 12) / rows - 4;
      out += `<rect x="${dx}" y="${dy}" width="${dw}" height="${dh}" rx="${Math.min(r, 4)}" fill="${light}" stroke="${dark}" stroke-width="1.2"/>`;
      if (style !== "japandi") out += knob(dx + dw / 2, dy + dh / 2);
      else out += `<rect x="${dx + dw / 2 - 10}" y="${dy + 3}" width="20" height="5" rx="2.5" fill="${dark}"/>`;
    }
    return out;
  };

  let art = "";
  switch (category) {
    case "bed": {
      const top = style === "japandi" ? 120 : 112;
      const head = style === "classic"
        ? `<path d="M40 ${top + 16}V72Q160 22 280 72V${top + 16}Z" fill="${dark}"/><path d="M54 ${top + 6}V80Q160 40 266 80V${top + 6}Z" fill="none" stroke="${light}" stroke-width="3"/>`
        : `<rect x="40" y="${style === "japandi" ? 82 : 58}" width="240" height="${style === "japandi" ? 50 : 72}" rx="${r}" fill="${dark}"/>`
          + (style === "scandinavian" ? `<rect x="52" y="70" width="216" height="48" rx="${r}" fill="${fabric}"/>` : "");
      art = head
        + `<rect x="36" y="${top + 14}" width="248" height="22" rx="${r}" fill="${body}"/>`
        + `<rect x="46" y="${top - 6}" width="228" height="22" rx="8" fill="#f6f1e8"/>`
        + `<rect x="62" y="${top - 18}" width="70" height="18" rx="8" fill="${fabric}"/><rect x="188" y="${top - 18}" width="70" height="18" rx="8" fill="${fabric}"/>`
        + leg(56, legTop(top + 36)) + leg(264, legTop(top + 36));
      break;
    }
    case "nightstand":
      art = `<rect x="108" y="78" width="104" height="78" rx="${r}" fill="${body}"/>` + drawers(108, 78, 104, 78, 2, 1)
        + leg(120, legTop(156)) + leg(200, legTop(156));
      break;
    case "dresser":
      art = (style === "classic" ? `<ellipse cx="160" cy="48" rx="46" ry="34" fill="${dark}"/><ellipse cx="160" cy="48" rx="38" ry="27" fill="#dfe7ea"/>` : "")
        + `<rect x="58" y="86" width="204" height="72" rx="${r}" fill="${body}"/>` + drawers(58, 86, 204, 72, 2, 3)
        + leg(72, legTop(158)) + leg(248, legTop(158));
      break;
    case "wardrobe": {
      const doors = [0, 1, 2].map(i => `<rect x="${92 + i * 46}" y="${style === "classic" ? 32 : 24}" width="42" height="${style === "classic" ? 122 : 130}" rx="${Math.min(r, 4)}" fill="${light}" stroke="${dark}" stroke-width="1.2"/>`).join("");
      const handles = [0, 1, 2].map(i => style === "modern"
        ? `<rect x="${92 + i * 46 + (i === 1 ? 4 : 36)}" y="78" width="2.5" height="30" fill="${metal}"/>` : knob(92 + i * 46 + (i === 1 ? 7 : 35), 92)).join("");
      art = (style === "classic" ? `<rect x="78" y="14" width="164" height="14" rx="3" fill="${dark}"/>` : "")
        + `<rect x="84" y="${style === "classic" ? 26 : 18}" width="152" height="${style === "classic" ? 134 : 142}" rx="${r}" fill="${body}"/>` + doors + handles
        + leg(96, legTop(160)) + leg(224, legTop(160));
      break;
    }
    case "dining-table": {
      const top = style === "japandi" ? 120 : 96;
      art = `<rect x="34" y="${top}" width="252" height="${style === "modern" ? 8 : 13}" rx="${Math.min(r, 6)}" fill="${body}"/>`
        + (style === "classic" ? `<rect x="50" y="${top + 13}" width="220" height="12" fill="${dark}"/>` : "")
        + leg(62, top + (style === "classic" ? 25 : 12)) + leg(258, top + (style === "classic" ? 25 : 12))
        + (style === "japandi" ? "" : leg(100, top + 12) + leg(220, top + 12));
      break;
    }
    case "dining-chair": {
      const seat = style === "japandi" ? 118 : 108;
      const back = style === "classic"
        ? `<path d="M118 ${seat}V52Q160 26 202 52V${seat}Z" fill="${dark}"/><path d="M146 ${seat}V58Q160 50 174 58V${seat}Z" fill="${light}"/>`
        : style === "japandi" ? [0, 1, 2, 3, 4].map(i => `<rect x="${124 + i * 16}" y="64" width="8" height="${seat - 64}" rx="3" fill="${body}"/>`).join("") + `<rect x="118" y="58" width="84" height="12" rx="6" fill="${dark}"/>`
        : style === "scandinavian" ? [0, 1, 2, 3].map(i => `<rect x="${130 + i * 18}" y="54" width="5" height="${seat - 54}" fill="${body}"/>`).join("") + `<path d="M118 60Q160 44 202 60v10Q160 54 118 70z" fill="${dark}"/>`
        : `<rect x="118" y="48" width="84" height="${seat - 48}" rx="${r}" fill="none" stroke="${metal}" stroke-width="5"/><rect x="124" y="54" width="72" height="34" rx="2" fill="${body}"/>`;
      art = back + `<rect x="110" y="${seat}" width="100" height="11" rx="${Math.min(r, 5)}" fill="${style === "classic" ? fabric : body}"/>`
        + leg(120, legTop(seat + 11)) + leg(200, legTop(seat + 11));
      break;
    }
    case "sofa": {
      const base = style === "japandi" ? 128 : 116;
      art = `<rect x="52" y="${base - 46}" width="216" height="52" rx="${style === "classic" ? 22 : r + 4}" fill="${shade(fabric, .9)}"/>`
        + `<rect x="40" y="${base}" width="240" height="34" rx="${r + 2}" fill="${fabric}"/>`
        + `<rect x="62" y="${base - 10}" width="96" height="16" rx="7" fill="${shade(fabric, 1.06)}"/><rect x="162" y="${base - 10}" width="96" height="16" rx="7" fill="${shade(fabric, 1.06)}"/>`
        + `<rect x="30" y="${base - 22}" width="28" height="56" rx="${style === "classic" ? 14 : r + 3}" fill="${shade(fabric, .95)}"/><rect x="262" y="${base - 22}" width="28" height="56" rx="${style === "classic" ? 14 : r + 3}" fill="${shade(fabric, .95)}"/>`
        + (style === "japandi" ? `<rect x="34" y="${base + 34}" width="252" height="8" rx="3" fill="${body}"/>` : leg(56, base + 34) + leg(264, base + 34));
      break;
    }
    case "coffee-table": {
      const top = style === "japandi" ? 136 : 122;
      art = `<rect x="58" y="${top}" width="204" height="${style === "modern" ? 7 : 11}" rx="${Math.min(r, 6)}" fill="${body}"/>`
        + (style === "modern" || style === "japandi" ? `<rect x="72" y="${top + 26}" width="176" height="6" rx="2" fill="${dark}"/>` : "")
        + leg(74, top + 10) + leg(246, top + 10);
      break;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><rect width="320" height="200" fill="#f3ece1"/>`
    + `<ellipse cx="160" cy="${floor + 4}" rx="132" ry="10" fill="#e2d4c1"/>${art}</svg>`;
}
