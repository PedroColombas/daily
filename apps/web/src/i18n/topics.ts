import type { Language } from "@shared/types";

// How a topic is SHOWN, as opposed to what it is. Every topic keeps one internal name — the English
// one — because that name is what the pipeline searches with, what the shared per-day search cache
// is keyed on, and what topic history and section order refer to. Translating the name itself would
// split one shared search into one per language. So the stored value stays "Semiconductors" and a
// Spanish reader is shown "Semiconductores".
//
// This covers the built-in genres and the built-in subtopics (preferences-options.ts). Topics
// suggested live are labelled at suggestion time and stored per reader (preferences.topic_labels).
// Anything with no label is shown under its own name.
const ES: Record<string, string> = {
  // Genres
  Technology: "Tecnología",
  Politics: "Política",
  Finance: "Finanzas",
  Business: "Empresas",
  Science: "Ciencia",
  Health: "Salud",
  Sport: "Deportes",
  Culture: "Cultura",
  World: "Internacional",
  Climate: "Clima",
  Entertainment: "Entretenimiento",
  Media: "Medios",

  // Built-in subtopics
  AI: "IA",
  Semiconductors: "Semiconductores",
  Startups: "Startups",
  Cybersecurity: "Ciberseguridad",
  "Consumer Tech": "Tecnología de consumo",
  "Big Tech": "Grandes tecnológicas",
  Elections: "Elecciones",
  Geopolitics: "Geopolítica",
  Policy: "Políticas públicas",
  Defense: "Defensa",
  Democracy: "Democracia",
  Markets: "Mercados",
  "Central Banks": "Bancos centrales",
  Crypto: "Criptomonedas",
  Deals: "Fusiones y adquisiciones",
  Earnings: "Resultados empresariales",
  Strategy: "Estrategia",
  Leadership: "Liderazgo",
  Retail: "Comercio minorista",
  Energy: "Energía",
  "Supply Chains": "Cadenas de suministro",
  Space: "Espacio",
  Physics: "Física",
  Biology: "Biología",
  "Climate Science": "Ciencia del clima",
  Research: "Investigación",
  Medicine: "Medicina",
  "Mental Health": "Salud mental",
  Nutrition: "Nutrición",
  "Public Health": "Salud pública",
  Biotech: "Biotecnología",
  Football: "Fútbol",
  Basketball: "Baloncesto",
  Tennis: "Tenis",
  Motorsport: "Motor",
  Transfers: "Fichajes",
  Film: "Cine",
  Music: "Música",
  Books: "Libros",
  Art: "Arte",
  Television: "Televisión",
  Conflicts: "Conflictos",
  Diplomacy: "Diplomacia",
  Migration: "Migración",
  "Global Economy": "Economía global",
  Renewables: "Renovables",
  "Extreme Weather": "Fenómenos extremos",
  Emissions: "Emisiones",
  Biodiversity: "Biodiversidad",
  Movies: "Películas",
  Streaming: "Streaming",
  Celebrity: "Famosos",
  Awards: "Premios",
  Gaming: "Videojuegos",
  Journalism: "Periodismo",
  "Social Media": "Redes sociales",
  "Streaming Wars": "Guerra del streaming",
  Advertising: "Publicidad",
  Creators: "Creadores",
};

export function topicLabel(
  name: string,
  lang: Language,
  labels?: Record<string, string> | null,
): string {
  if (lang === "en") return name;
  return capitalFirst(labels?.[name] ?? ES[name] ?? name);
}

// Topic names always start with a capital — "Regulación de la IA", never "regulación de la IA".
// Live-suggested labels sometimes come back all lower case, so this is applied wherever a topic is
// shown rather than trusted to the model; it also fixes labels already stored or cached.
export function capitalFirst(text: string): string {
  return text.charAt(0).toLocaleUpperCase("es") + text.slice(1);
}
