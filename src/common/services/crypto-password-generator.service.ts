import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { IPasswordGenerator } from './password-generator.interface';

@Injectable()
export class CryptoPasswordGeneratorService implements IPasswordGenerator {
  private readonly uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  private readonly lowercase = 'abcdefghijkmnopqrstuvwxyz';
  private readonly numbers = '23456789';
  private readonly symbols = '!@#$%&*';

  generate(length = 14): string {
    const minLength = 8;
    const targetLength = Math.max(length, minLength);

    const allChars =
      this.uppercase + this.lowercase + this.numbers + this.symbols;
    const chars: string[] = [
      this.uppercase[randomInt(0, this.uppercase.length)],
      this.lowercase[randomInt(0, this.lowercase.length)],
      this.numbers[randomInt(0, this.numbers.length)],
      this.symbols[randomInt(0, this.symbols.length)],
    ];

    while (chars.length < targetLength) {
      chars.push(allChars[randomInt(0, allChars.length)]);
    }

    // Fisher-Yates shuffle using cryptographically secure random integers
    for (let i = chars.length - 1; i > 0; i--) {
      const j = randomInt(0, i + 1);
      const temp = chars[i];
      chars[i] = chars[j];
      chars[j] = temp;
    }

    return chars.join('');
  }
}
