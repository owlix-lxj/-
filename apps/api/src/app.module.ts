import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MysqlModule } from './database/mysql.module';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { UserStoreModule } from './user-store/user-store.module';
import { OrganizationStoreModule } from './organization-store/organization-store.module';
import { OrganizationModule } from './organization/organization.module';
import { ProjectStoreModule } from './project-store/project-store.module';
import { ProjectWorkspaceStoreModule } from './project-workspace-store/project-workspace-store.module';
import { ProjectModule } from './project/project.module';
import { BrandStoreModule } from './brand-store/brand-store.module';
import { BrandModule } from './brand/brand.module';
import { DomainStoreModule } from './domain-store/domain-store.module';
import { GeoAuditStoreModule } from './geo-audit-store/geo-audit-store.module';
import { GeoBootstrapModule } from './geo-bootstrap/geo-bootstrap.module';
import { SiteStoreModule } from './site-store/site-store.module';
import { SiteVersionStoreModule } from './site-version-store/site-version-store.module';
import { DomainModule } from './domain/domain.module';
import { SiteModule } from './site/site.module';
import { SiteVersionModule } from './site-version/site-version.module';
import { IntegrationStoreModule } from './integration-store/integration-store.module';
import { IntegrationModule } from './integration/integration.module';
import { PublishedSiteModule } from './published-site/published-site.module';
import { MonitorModule } from './monitor/monitor.module';
import { ContentStudioModule } from './content-studio/content-studio.module';
import { KnowledgeBaseStoreModule } from './knowledge-base-store/knowledge-base-store.module';
import { KnowledgeBaseModule } from './knowledge-base/knowledge-base.module';
import { CopilotSessionStoreModule } from './copilot-session-store/copilot-session-store.module';
import { CopilotToolRegistryModule } from './copilot-tool-registry/copilot-tool-registry.module';
import { CopilotSkillRegistryModule } from './copilot-skill-registry/copilot-skill-registry.module';
import { CopilotCoreModule } from './copilot-core/copilot-core.module';
import { MiaoshechatAdapterModule } from './miaoshechat-adapter/miaoshechat-adapter.module';
import { IdeCopilotModule } from './ide-copilot/ide-copilot.module';
import { CodexGatewayModule } from './codex-gateway/codex-gateway.module';
import { FuelStationModule } from './fuel-station/fuel-station.module';
import { SiteAuditModule } from './site-audit/site-audit.module';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { DatasheetStoreModule } from './datasheet-store/datasheet-store.module';
import { DatasheetModule } from './datasheet/datasheet.module';
import { FilesModule } from './files/files.module';
import { DatasheetCollaborationModule } from './datasheet-collaboration/datasheet-collaboration.module';
import { DatasheetCopilotModule } from './datasheet-copilot/datasheet-copilot.module';
import { DatasheetApiModule } from './datasheet-api/datasheet-api.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MysqlModule,
    UserStoreModule,
    OrganizationStoreModule,
    ProjectStoreModule,
    ProjectWorkspaceStoreModule,
    BrandStoreModule,
    DomainStoreModule,
    GeoAuditStoreModule,
    SiteStoreModule,
    SiteVersionStoreModule,
    IntegrationStoreModule,
    KnowledgeBaseStoreModule,
    DatasheetStoreModule,
    CopilotSessionStoreModule,
    FilesModule,
    DatasheetCollaborationModule,
    DatasheetCopilotModule,
    DatasheetApiModule,
    AuthModule,
    OrganizationModule,
    ProjectModule,
    BrandModule,
    DomainModule,
    GeoBootstrapModule,
    SiteModule,
    SiteVersionModule,
    IntegrationModule,
    PublishedSiteModule,
    MonitorModule,
    ContentStudioModule,
    KnowledgeBaseModule,
    CopilotToolRegistryModule,
    CopilotSkillRegistryModule,
    CopilotCoreModule,
    MiaoshechatAdapterModule,
    IdeCopilotModule,
    CodexGatewayModule,
    FuelStationModule,
    SiteAuditModule,
    MarketplaceModule,
    DatasheetModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
