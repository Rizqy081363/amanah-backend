import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';
import { FileType } from '../../files/domain/file';
import { Role } from '../../roles/domain/role';
import { Status } from '../../statuses/domain/status';

export class User {
  @ApiProperty({
    type: Number,
  })
  id: number | string;

  @ApiProperty({
    type: String,
    example: 'john.doe@example.com',
  })
  @Expose({ groups: ['me', 'admin'] })
  email: string | null;

  @Exclude({ toPlainOnly: true })
  password?: string;

  @ApiProperty({
    type: String,
    example: 'email',
  })
  @Expose({ groups: ['me', 'admin'] })
  provider: string;

  @ApiProperty({
    type: String,
    example: '1234567890',
  })
  @Expose({ groups: ['me', 'admin'] })
  socialId?: string | null;

  @ApiProperty({
    type: String,
    example: 'John',
  })
  firstName: string | null;

  @ApiProperty({
    type: String,
    example: 'Doe',
  })
  lastName: string | null;

  @ApiProperty({
    type: () => FileType,
  })
  photo?: FileType | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '/api/v1/users/00000000-0000-0000-0000-000000000000/avatar',
    description: 'URL kanonikal avatar profil pengguna',
  })
  @Expose({ groups: ['me', 'admin'] })
  avatarUrl?: string | null;

  @ApiProperty({
    type: Object,
    nullable: true,
    description:
      'Informasi avatar terpadu (url, inisial, jenis avatar, status custom)',
  })
  @Expose({ groups: ['me', 'admin'] })
  avatar?: {
    url: string;
    initials: string;
    type: 'custom' | 'oauth' | 'initials';
    hasCustomAvatar: boolean;
    directUrl?: string | null;
  } | null;

  @ApiProperty({
    type: () => Role,
  })
  role?: Role | null;

  @ApiProperty({
    type: () => Status,
  })
  status?: Status;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty()
  deletedAt: Date;
}
