import { Module } from '@nestjs/common';
import { SearchController } from './presentation/search.controller';

@Module({
  controllers: [SearchController],
})
export class SearchModule {}
