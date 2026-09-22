/**
 * Utility to extract clean, standardized 2-letter initials from full names,
 * accounting for Indonesian medical and academic honorifics/titles.
 */
export class NameInitialsHelper {
  private static readonly PREFIX_REGEX =
    /^(dr\.|drg\.|bdn\.|prof\.|ns\.|apt\.|dr|drg|bdn|prof|ns|apt|h\.|hj\.)\s+/gi;

  private static readonly SUFFIX_REGEX =
    /,?\s*(sp\.[a-z]+|s\.ked|s\.tr\.keb|s\.kep|m\.kes|ph\.d|m\.sc|s\.e|s\.kom|m\.kom|s\.farm|apt\.)(\.[a-z]+)?/gi;

  public static extract(rawName: string | null | undefined): string {
    if (!rawName || !rawName.trim()) {
      return 'AH'; // Default fallback: Amanah Healthcare
    }

    // 1. Strip suffixes (e.g. ", Sp.A", ", S.Tr.Keb")
    let cleaned = rawName.replace(this.SUFFIX_REGEX, '').trim();

    // 2. Strip prefixes repeatedly (e.g. "Prof. Dr. Ir. ")
    let prev = '';
    while (cleaned !== prev) {
      prev = cleaned;
      cleaned = cleaned.replace(this.PREFIX_REGEX, '').trim();
    }

    // 3. Remove punctuation and extra whitespace
    cleaned = cleaned.replace(/[^\p{L}\s]/gu, '').replace(/\s+/g, ' ').trim();

    if (!cleaned) {
      return 'AH';
    }

    const words = cleaned.split(' ').filter(Boolean);

    if (words.length >= 2) {
      // First letter of word 1 + First letter of word 2 (e.g. "Fadilah Ahmad Zikri" -> "FA")
      const first = words[0][0];
      const second = words[1][0];
      return (first + second).toUpperCase();
    }

    if (words.length === 1) {
      const single = words[0];
      return single.slice(0, 2).toUpperCase();
    }

    return 'AH';
  }

  public static getInitials(rawName: string | null | undefined): string {
    return NameInitialsHelper.extract(rawName);
  }
}
