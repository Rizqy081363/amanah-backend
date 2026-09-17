import { Type } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CursorPaginationMetaDto {
  @ApiPropertyOptional({
    description:
      'Opaque cursor untuk mengambil halaman berikutnya (null jika sudah di halaman terakhir per API-089)',
    example: 'eyJ0IjoiMjAyNi0wOS0xOFQwMDowMDowMC4wMDBaIiwiaWQiOiIxMjMifQ',
    nullable: true,
  })
  nextCursor: string | null;

  @ApiProperty({
    description:
      'Indikator apakah masih terdapat data pada halaman selanjutnya',
    example: true,
  })
  hasNextPage: boolean;

  @ApiProperty({
    description: 'Jumlah record per halaman yang diminta (ARC-080)',
    example: 20,
  })
  limit: number;

  @ApiPropertyOptional({
    description: 'Total record jika dihitung atau diestimasi (API-091)',
    example: 100,
  })
  total?: number;
}

export class CursorPaginatedResponseDto<T> {
  @ApiProperty({ isArray: true })
  data: T[];

  @ApiProperty({ type: () => CursorPaginationMetaDto })
  meta: CursorPaginationMetaDto;
}

export function ApiCursorPaginatedResponse<T>(itemType: Type<T>) {
  abstract class GenericCursorPaginatedResponse {
    @ApiProperty({ type: [itemType] })
    data!: T[];

    @ApiProperty({ type: () => CursorPaginationMetaDto })
    meta!: CursorPaginationMetaDto;
  }

  Object.defineProperty(GenericCursorPaginatedResponse, 'name', {
    writable: false,
    value: `CursorPaginated${itemType.name}ResponseDto`,
  });

  return GenericCursorPaginatedResponse;
}
