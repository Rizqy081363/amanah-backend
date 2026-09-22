import { AvatarSvgService } from './avatar-svg.service';

describe('AvatarSvgService', () => {
  let service: AvatarSvgService;

  beforeEach(() => {
    service = new AvatarSvgService();
  });

  it('should generate a valid SVG with the specified initials', () => {
    const svg = service.generateSvg('FA', 'Fadilah Ahmad Zikri');
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('viewBox="0 0 512 512"');
    expect(svg).toContain('>FA<');
  });

  it('should escape special XML characters in initials and name', () => {
    const svg = service.generateSvg('A&B', 'Test <Name>');
    expect(svg).toContain('&amp;');
    expect(svg).not.toContain('A&B');
    expect(svg).toContain('&lt;Name&gt;');
  });

  it('should pick a deterministic background color from brand palette', () => {
    const svg1 = service.generateSvg('FA', 'Fadilah Ahmad Zikri');
    const svg2 = service.generateSvg('FA', 'Fadilah Ahmad Zikri');
    expect(svg1).toBe(svg2);
  });
});
