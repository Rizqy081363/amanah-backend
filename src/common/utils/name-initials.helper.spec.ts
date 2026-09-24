import { NameInitialsHelper } from './name-initials.helper';

describe('NameInitialsHelper', () => {
  it('should extract first two initials for standard 3-word name per specification', () => {
    // Specification example: Fadilah Ahmad Zikri -> FA
    expect(NameInitialsHelper.extract('Fadilah Ahmad Zikri')).toBe('FA');
  });

  it('should extract initials for 2-word name', () => {
    expect(NameInitialsHelper.extract('Dewi Lestari')).toBe('DL');
  });

  it('should extract two letters for single-word name', () => {
    expect(NameInitialsHelper.extract('Budi')).toBe('BU');
    expect(NameInitialsHelper.extract('A')).toBe('A');
  });

  it('should strip medical and academic prefixes (dr., Bdn., drg., Prof.)', () => {
    expect(NameInitialsHelper.extract('dr. Ahmad Santoso')).toBe('AS');
    expect(NameInitialsHelper.extract('drg. Maya Putri')).toBe('MP');
    expect(NameInitialsHelper.extract('Bdn. Siti Rahmawati')).toBe('SR');
    expect(NameInitialsHelper.extract('dr. Zikri Ahmad, Sp.A')).toBe('ZA');
  });

  it('should strip clinical specialty suffixes (, Sp.A, , Sp.OG, M.Kes, etc.)', () => {
    expect(NameInitialsHelper.extract('dr. Ahmad Santoso, Sp.A')).toBe('AS');
    expect(NameInitialsHelper.extract('Bdn. Laras Wulandari, S.Tr.Keb')).toBe(
      'LW',
    );
  });

  it('should handle fallback for empty or whitespace-only names', () => {
    expect(NameInitialsHelper.extract('')).toBe('AH');
    expect(NameInitialsHelper.extract('   ')).toBe('AH');
  });
});
