import { Injectable } from '@nestjs/common';
import { NameInitialsHelper } from '../../common/utils/name-initials.helper';

/**
 * Service that generates on-the-fly, scalable vector graphics (SVG) avatars
 * displaying user initials against a branded, deterministic color palette.
 */
@Injectable()
export class AvatarSvgService {
  // Amanah Healthcare accessible clinical theme palette (Primary blues, teals, cyans)
  private readonly BRAND_PALETTE = [
    '#0284c7', // Sky 600
    '#0f766e', // Teal 700
    '#0369a1', // Sky 700
    '#4338ca', // Indigo 700
    '#0d9488', // Teal 600
    '#2563eb', // Blue 600
    '#0891b2', // Cyan 600
  ];

  private escapeXml(unsafe: string): string {
    return unsafe.replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '&':
          return '&amp;';
        case "'":
          return '&apos;';
        case '"':
          return '&quot;';
        default:
          return c;
      }
    });
  }

  private getColorForName(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % this.BRAND_PALETTE.length;
    return this.BRAND_PALETTE[index];
  }

  public generateSvg(nameOrInitials: string, fullName?: string): string {
    let initials = nameOrInitials;
    const name = fullName || nameOrInitials || 'User';
    if (!initials || initials.length > 3) {
      initials = NameInitialsHelper.getInitials(nameOrInitials);
    }
    const escapedInitials = this.escapeXml(initials);
    const escapedName = this.escapeXml(name);
    const bgColor = this.getColorForName(name);

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="Avatar for ${escapedName}">
  <circle cx="256" cy="256" r="256" fill="${bgColor}" />
  <text x="50%" y="54%" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="200" font-weight="700" fill="#ffffff" text-anchor="middle" dominant-baseline="middle" letter-spacing="4">${escapedInitials}</text>
</svg>`;
  }
}
