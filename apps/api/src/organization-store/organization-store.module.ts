import { Global, Module } from '@nestjs/common';
import { OrganizationStoreService } from './organization-store.service';

@Global()
@Module({
  providers: [OrganizationStoreService],
  exports: [OrganizationStoreService],
})
export class OrganizationStoreModule {}
