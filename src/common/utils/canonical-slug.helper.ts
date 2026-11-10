/**
 * Canonical Slug & Prefix Helper
 *
 * Agnostic utility for generating safe, valid, database-compliant snake_case
 * slugs and human-readable acronym prefixes from Indonesian medical & clinical names.
 * Ensures PostgreSQL check constraint compliance (e.g. `^[a-z][a-z0-9_]*$`).
 */
export class CanonicalSlugHelper {
  private static readonly NON_ALPHANUMERIC_REGEX = /[^a-z0-9]+/g;
  private static readonly MULTIPLE_UNDERSCORES_REGEX = /_+/g;
  private static readonly LEADING_TRAILING_UNDERSCORES_REGEX = /^_+|_+$/g;
  private static readonly STARTS_WITH_LETTER_REGEX = /^[a-z]/;

  /**
   * Converts any human clinical name into a safe, valid snake_case code.
   * Guaranteed to start with a letter for postgres `^[a-z][a-z0-9_]*$` compliance.
   *
   * Example:
   * - "Poliklinik Rawat Jalan" -> "poliklinik_rawat_jalan"
   * - "1. Ruang Konsultasi Dokter" -> "item_1_ruang_konsultasi_dokter"
   * - "Gigi & Mulut" -> "gigi_mulut"
   */
  public static toSnakeCase(rawName: string | null | undefined, fallbackPrefix = 'item'): string {
    if (!rawName || !rawName.trim()) {
      return `${fallbackPrefix}_${Date.now().toString(36)}`;
    }

    const normalized = rawName
      .toLowerCase()
      .trim()
      .replace(this.NON_ALPHANUMERIC_REGEX, '_')
      .replace(this.MULTIPLE_UNDERSCORES_REGEX, '_')
      .replace(this.LEADING_TRAILING_UNDERSCORES_REGEX, '');

    if (!normalized) {
      return `${fallbackPrefix}_${Date.now().toString(36)}`;
    }

    // PostgreSQL constraints like `clinic_units_code_format` require starting with a letter [a-z]
    if (!this.STARTS_WITH_LETTER_REGEX.test(normalized)) {
      return `${fallbackPrefix}_${normalized}`;
    }

    return normalized;
  }

  /**
   * Generates a clean, 1-4 character uppercase acronym / prefix from a clinical name.
   *
   * Example:
   * - "Poli Umum" -> "PU"
   * - "Kesehatan Ibu dan Anak" -> "KIA"
   * - "Pagi" -> "P"
   * - "Laboratorium" -> "LAB"
   */
  public static toPrefix(rawName: string | null | undefined, maxLen = 4): string {
    if (!rawName || !rawName.trim()) {
      return 'GEN';
    }

    const words = rawName
      .trim()
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .split(/\s+/)
      .filter(Boolean);

    if (words.length >= 2) {
      // Take first letter of each significant word up to maxLen
      const acronym = words
        .filter((w) => !['dan', 'atau', 'di', 'ke', 'dari', 'yang', '&'].includes(w.toLowerCase()))
        .map((w) => w[0].toUpperCase())
        .join('');

      if (acronym.length >= 2) {
        return acronym.slice(0, maxLen);
      }
    }

    // Single word fallback: take first N uppercase characters
    const cleanWord = words[0] || 'GEN';
    return cleanWord.slice(0, maxLen).toUpperCase();
  }

  /**
   * Generates a clean URL slug (kebab-case) from a string.
   *
   * Example:
   * - "Ruang Persalinan 24 Jam" -> "ruang-persalinan-24-jam"
   * - "Baby Care Center" -> "baby-care-center"
   */
  public static toSlug(rawName: string | null | undefined, fallbackPrefix = 'item'): string {
    if (!rawName || !rawName.trim()) {
      return `${fallbackPrefix}-${Date.now().toString(36)}`;
    }

    const normalized = rawName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (!normalized) {
      return `${fallbackPrefix}-${Date.now().toString(36)}`;
    }

    return normalized;
  }
}
