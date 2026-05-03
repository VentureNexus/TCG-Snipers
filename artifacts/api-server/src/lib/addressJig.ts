const streetAbbreviations: Record<string, string[]> = {
  Street: ["St", "St.", "Street"],
  Avenue: ["Ave", "Ave.", "Avenue"],
  Boulevard: ["Blvd", "Blvd.", "Boulevard"],
  Drive: ["Dr", "Dr.", "Drive"],
  Road: ["Rd", "Rd.", "Road"],
  Lane: ["Ln", "Ln.", "Lane"],
  Court: ["Ct", "Ct.", "Court"],
  Place: ["Pl", "Pl.", "Place"],
  Circle: ["Cir", "Cir.", "Circle"],
};

export function jigAddress(address: string): string {
  let result = address;
  for (const [full, variants] of Object.entries(streetAbbreviations)) {
    const regex = new RegExp(`\\b${full}\\b`, "gi");
    if (regex.test(result)) {
      const variant = variants[Math.floor(Math.random() * variants.length)];
      result = result.replace(regex, variant);
      break;
    }
  }
  // Occasionally add or change unit formatting
  result = result.replace(/\bApt\b/gi, Math.random() > 0.5 ? "Apartment" : "Apt");
  result = result.replace(/\bSte\b/gi, Math.random() > 0.5 ? "Suite" : "Ste");
  return result;
}
