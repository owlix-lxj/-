CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(32) NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(120) NOT NULL,
  invite_code VARCHAR(120) NULL,
  invite_code_updated_at DATETIME NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS datasheet_documents (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  owner_user_id VARCHAR(36) NULL,
  state_json JSON NOT NULL,
  revision BIGINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_datasheet_documents_owner (owner_user_id),
  KEY idx_datasheet_documents_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE datasheet_documents
  ADD COLUMN revision BIGINT NOT NULL DEFAULT 0 AFTER state_json;

ALTER TABLE datasheet_documents
  ADD COLUMN owner_user_id VARCHAR(36) NULL AFTER name;

ALTER TABLE datasheet_documents
  ADD KEY idx_datasheet_documents_owner (owner_user_id);

CREATE TABLE IF NOT EXISTS datasheet_collaborators (
  datasheet_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'editor',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (datasheet_id, user_id),
  KEY idx_datasheet_collaborators_user (user_id),
  CONSTRAINT fk_datasheet_collaborators_datasheet FOREIGN KEY (datasheet_id) REFERENCES datasheet_documents(id) ON DELETE CASCADE,
  CONSTRAINT fk_datasheet_collaborators_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS datasheet_collaboration_invites (
  token CHAR(36) NOT NULL,
  datasheet_id VARCHAR(64) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'editor',
  created_by_user_id VARCHAR(36) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (token),
  KEY idx_datasheet_collaboration_invites_datasheet_expiry (datasheet_id, expires_at),
  CONSTRAINT fk_datasheet_collaboration_invites_datasheet FOREIGN KEY (datasheet_id) REFERENCES datasheet_documents(id) ON DELETE CASCADE,
  CONSTRAINT fk_datasheet_collaboration_invites_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS datasheet_api_tokens (
  id VARCHAR(36) PRIMARY KEY,
  datasheet_id VARCHAR(64) NOT NULL,
  created_by_user_id VARCHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  token_prefix VARCHAR(24) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  last_used_at DATETIME NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  KEY idx_datasheet_api_tokens_datasheet_created (datasheet_id, created_at),
  UNIQUE KEY uniq_datasheet_api_tokens_hash (token_hash),
  CONSTRAINT fk_datasheet_api_tokens_datasheet FOREIGN KEY (datasheet_id) REFERENCES datasheet_documents(id) ON DELETE CASCADE,
  CONSTRAINT fk_datasheet_api_tokens_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS datasheet_operations (
  id VARCHAR(36) PRIMARY KEY,
  datasheet_id VARCHAR(64) NOT NULL,
  revision BIGINT NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  user_name VARCHAR(120) NULL,
  operation_type VARCHAR(80) NOT NULL,
  operation_json JSON NOT NULL,
  client_id VARCHAR(120) NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uniq_datasheet_operations_revision (datasheet_id, revision),
  KEY idx_datasheet_operations_user_created (user_id, created_at),
  CONSTRAINT fk_datasheet_operations_datasheet FOREIGN KEY (datasheet_id) REFERENCES datasheet_documents(id) ON DELETE CASCADE,
  CONSTRAINT fk_datasheet_operations_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS datasheet_button_runs (
  id VARCHAR(36) PRIMARY KEY,
  datasheet_id VARCHAR(64) NOT NULL,
  record_id VARCHAR(120) NOT NULL,
  field_id VARCHAR(120) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  user_name VARCHAR(120) NULL,
  button_label VARCHAR(160) NOT NULL,
  action_type VARCHAR(64) NOT NULL,
  target_ref TEXT NULL,
  status VARCHAR(32) NOT NULL,
  input_json JSON NULL,
  result_json JSON NULL,
  error_message TEXT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_datasheet_button_runs_datasheet_created (datasheet_id, created_at),
  KEY idx_datasheet_button_runs_record_created (datasheet_id, record_id, created_at),
  KEY idx_datasheet_button_runs_user_created (user_id, created_at),
  CONSTRAINT fk_datasheet_button_runs_datasheet FOREIGN KEY (datasheet_id) REFERENCES datasheet_documents(id) ON DELETE CASCADE,
  CONSTRAINT fk_datasheet_button_runs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS datasheet_automations (
  id VARCHAR(36) PRIMARY KEY,
  datasheet_id VARCHAR(64) NOT NULL,
  owner_user_id VARCHAR(36) NOT NULL,
  title VARCHAR(160) NOT NULL,
  description TEXT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  trigger_json JSON NOT NULL,
  actions_json JSON NOT NULL,
  notify_on_error TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_datasheet_automations_datasheet_updated (datasheet_id, updated_at),
  KEY idx_datasheet_automations_owner_updated (owner_user_id, updated_at),
  CONSTRAINT fk_datasheet_automations_datasheet FOREIGN KEY (datasheet_id) REFERENCES datasheet_documents(id) ON DELETE CASCADE,
  CONSTRAINT fk_datasheet_automations_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS datasheet_automation_runs (
  id VARCHAR(36) PRIMARY KEY,
  automation_id VARCHAR(36) NOT NULL,
  datasheet_id VARCHAR(64) NOT NULL,
  record_id VARCHAR(120) NULL,
  field_id VARCHAR(120) NULL,
  button_run_id VARCHAR(36) NULL,
  trigger_type VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL,
  input_json JSON NULL,
  result_json JSON NULL,
  error_message TEXT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_datasheet_automation_runs_automation_created (automation_id, created_at),
  KEY idx_datasheet_automation_runs_datasheet_created (datasheet_id, created_at),
  CONSTRAINT fk_datasheet_automation_runs_automation FOREIGN KEY (automation_id) REFERENCES datasheet_automations(id) ON DELETE CASCADE,
  CONSTRAINT fk_datasheet_automation_runs_datasheet FOREIGN KEY (datasheet_id) REFERENCES datasheet_documents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS datasheet_automation_schedule_ticks (
  automation_id VARCHAR(36) NOT NULL,
  schedule_key VARCHAR(120) NOT NULL,
  datasheet_id VARCHAR(64) NOT NULL,
  claimed_at DATETIME NOT NULL,
  PRIMARY KEY (automation_id, schedule_key),
  KEY idx_datasheet_automation_schedule_ticks_datasheet (datasheet_id, claimed_at),
  CONSTRAINT fk_datasheet_automation_schedule_ticks_automation FOREIGN KEY (automation_id) REFERENCES datasheet_automations(id) ON DELETE CASCADE,
  CONSTRAINT fk_datasheet_automation_schedule_ticks_datasheet FOREIGN KEY (datasheet_id) REFERENCES datasheet_documents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS datasheet_automation_retry_jobs (
  id VARCHAR(36) PRIMARY KEY,
  automation_id VARCHAR(36) NOT NULL,
  datasheet_id VARCHAR(64) NOT NULL,
  action_json JSON NOT NULL,
  context_json JSON NOT NULL,
  attempt INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  next_run_at DATETIME NOT NULL,
  last_error TEXT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_datasheet_automation_retry_jobs_due (status, next_run_at),
  KEY idx_datasheet_automation_retry_jobs_datasheet (datasheet_id, created_at),
  CONSTRAINT fk_datasheet_automation_retry_jobs_automation FOREIGN KEY (automation_id) REFERENCES datasheet_automations(id) ON DELETE CASCADE,
  CONSTRAINT fk_datasheet_automation_retry_jobs_datasheet FOREIGN KEY (datasheet_id) REFERENCES datasheet_documents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS datasheet_audit_logs (
  id VARCHAR(36) PRIMARY KEY,
  datasheet_id VARCHAR(64) NOT NULL,
  actor_user_id VARCHAR(36) NULL,
  actor_name VARCHAR(120) NULL,
  event_type VARCHAR(80) NOT NULL,
  target_type VARCHAR(80) NULL,
  target_id VARCHAR(160) NULL,
  summary VARCHAR(255) NOT NULL,
  metadata_json JSON NULL,
  created_at DATETIME NOT NULL,
  KEY idx_datasheet_audit_logs_datasheet_created (datasheet_id, created_at),
  KEY idx_datasheet_audit_logs_actor_created (actor_user_id, created_at),
  CONSTRAINT fk_datasheet_audit_logs_datasheet FOREIGN KEY (datasheet_id) REFERENCES datasheet_documents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS datasheet_snapshots (
  id VARCHAR(36) PRIMARY KEY,
  datasheet_id VARCHAR(64) NOT NULL,
  revision BIGINT NOT NULL,
  name VARCHAR(160) NOT NULL,
  state_json JSON NOT NULL,
  reason VARCHAR(120) NOT NULL,
  actor_user_id VARCHAR(36) NULL,
  actor_name VARCHAR(120) NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uniq_datasheet_snapshots_revision (datasheet_id, revision),
  KEY idx_datasheet_snapshots_datasheet_created (datasheet_id, created_at),
  CONSTRAINT fk_datasheet_snapshots_datasheet FOREIGN KEY (datasheet_id) REFERENCES datasheet_documents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS files (
  id VARCHAR(36) PRIMARY KEY,
  owner_user_id VARCHAR(36) NOT NULL,
  scope VARCHAR(64) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(160) NOT NULL,
  size_bytes BIGINT NOT NULL,
  sha256 CHAR(64) NOT NULL,
  storage_provider VARCHAR(32) NOT NULL,
  bucket VARCHAR(160) NOT NULL,
  object_key VARCHAR(512) NOT NULL,
  public_url TEXT NULL,
  metadata_json JSON NULL,
  preview_status VARCHAR(32) NOT NULL DEFAULT 'pending',
  thumbnail_url TEXT NULL,
  scan_status VARCHAR(32) NOT NULL DEFAULT 'pending',
  deleted_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uniq_files_object_key (object_key),
  KEY idx_files_owner_scope_created (owner_user_id, scope, created_at),
  KEY idx_files_sha256 (sha256),
  CONSTRAINT fk_files_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE files
  ADD COLUMN preview_status VARCHAR(32) NOT NULL DEFAULT 'pending' AFTER metadata_json;

ALTER TABLE files
  ADD COLUMN thumbnail_url TEXT NULL AFTER preview_status;

ALTER TABLE files
  ADD COLUMN scan_status VARCHAR(32) NOT NULL DEFAULT 'pending' AFTER thumbnail_url;

ALTER TABLE users
  ADD COLUMN invite_code VARCHAR(120) NULL AFTER name;

ALTER TABLE users
  ADD COLUMN invite_code_updated_at DATETIME NULL AFTER invite_code;

ALTER TABLE users
  ADD COLUMN phone VARCHAR(32) NULL AFTER email;

ALTER TABLE users
  ADD UNIQUE KEY uniq_users_phone (phone);

CREATE TABLE IF NOT EXISTS user_auth_identities (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  provider_user_id VARCHAR(128) NOT NULL,
  union_id VARCHAR(128) NULL,
  nickname VARCHAR(255) NULL,
  avatar_url TEXT NULL,
  profile_json JSON NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uniq_user_auth_identity_provider_user (provider, provider_user_id),
  UNIQUE KEY uniq_user_auth_identity_provider_union (provider, union_id),
  KEY idx_user_auth_identity_user (user_id),
  CONSTRAINT fk_user_auth_identities_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS api_keys (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  name VARCHAR(80) NOT NULL,
  prefix VARCHAR(24) NOT NULL,
  key_hash CHAR(64) NOT NULL,
  last_used_at DATETIME NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uniq_api_keys_hash (key_hash),
  KEY idx_api_keys_user_created (user_id, created_at),
  CONSTRAINT fk_api_keys_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS owlix_points_wallets (
  user_id VARCHAR(36) PRIMARY KEY,
  balance DECIMAL(18,6) NOT NULL DEFAULT 0,
  token_balance BIGINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_owlix_points_wallets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS owlix_fuel_station_claims (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  phase_number INT NOT NULL,
  phase_name VARCHAR(32) NOT NULL,
  claim_date DATE NOT NULL,
  credits BIGINT NOT NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uniq_owlix_fuel_station_user_date (user_id, claim_date),
  KEY idx_owlix_fuel_station_user_phase (user_id, phase_number),
  CONSTRAINT fk_owlix_fuel_station_claims_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_business_authorizations (
  user_id VARCHAR(36) NOT NULL,
  provider VARCHAR(64) NOT NULL DEFAULT 'vectorengine',
  key_ciphertext TEXT NOT NULL,
  key_iv VARCHAR(64) NOT NULL,
  key_auth_tag VARCHAR(64) NOT NULL,
  key_hash CHAR(64) NOT NULL,
  key_prefix VARCHAR(32) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (user_id, provider),
  UNIQUE KEY uniq_user_business_authorizations_key_hash (key_hash),
  CONSTRAINT fk_user_business_authorizations_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS owlix_points_transactions (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  transaction_type VARCHAR(32) NOT NULL,
  amount DECIMAL(18,6) NOT NULL,
  balance_after DECIMAL(18,6) NOT NULL,
  title VARCHAR(120) NOT NULL,
  description VARCHAR(255) NULL,
  reference_type VARCHAR(32) NULL,
  reference_id VARCHAR(128) NULL,
  metadata_json JSON NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uniq_owlix_points_transaction_reference (reference_type, reference_id),
  KEY idx_owlix_points_transactions_user_created (user_id, created_at),
  CONSTRAINT fk_owlix_points_transactions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE owlix_points_transactions
  MODIFY COLUMN amount DECIMAL(18,6) NOT NULL;

ALTER TABLE owlix_points_transactions
  MODIFY COLUMN balance_after DECIMAL(18,6) NOT NULL;

ALTER TABLE owlix_points_wallets
  MODIFY COLUMN balance DECIMAL(18,6) NOT NULL DEFAULT 0;

ALTER TABLE owlix_points_wallets
  ADD COLUMN token_balance BIGINT NOT NULL DEFAULT 0;

ALTER TABLE owlix_fuel_station_claims
  MODIFY COLUMN credits BIGINT NOT NULL;

CREATE TABLE IF NOT EXISTS owlix_points_purchase_orders (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  package_id VARCHAR(64) NOT NULL,
  credits DECIMAL(18,6) NOT NULL,
  amount_cents INT NOT NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'CNY',
  out_trade_no VARCHAR(64) NOT NULL,
  transaction_id VARCHAR(128) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  paid_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uniq_owlix_points_purchase_out_trade_no (out_trade_no),
  KEY idx_owlix_points_purchase_user_created (user_id, created_at),
  CONSTRAINT fk_owlix_points_purchase_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE owlix_points_purchase_orders
  MODIFY COLUMN credits DECIMAL(18,6) NOT NULL;

CREATE TABLE IF NOT EXISTS owlix_provider_usage_logs (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  provider VARCHAR(64) NOT NULL DEFAULT 'vectorengine',
  provider_log_id VARCHAR(64) NOT NULL,
  model_name VARCHAR(128) NULL,
  token_name VARCHAR(128) NULL,
  quota DECIMAL(12,4) NOT NULL DEFAULT 0,
  points DECIMAL(18,6) NOT NULL DEFAULT 0,
  prompt_tokens INT NOT NULL DEFAULT 0,
  completion_tokens INT NOT NULL DEFAULT 0,
  reasoning_tokens INT NOT NULL DEFAULT 0,
  cache_tokens INT NOT NULL DEFAULT 0,
  is_stream TINYINT(1) NOT NULL DEFAULT 0,
  provider_created_at BIGINT NOT NULL DEFAULT 0,
  raw_json JSON NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uniq_owlix_provider_usage_log (user_id, provider, provider_log_id),
  KEY idx_owlix_provider_usage_user_created (user_id, provider_created_at),
  CONSTRAINT fk_owlix_provider_usage_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE owlix_provider_usage_logs
  MODIFY COLUMN points DECIMAL(18,6) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS auth_oauth_states (
  id VARCHAR(36) PRIMARY KEY,
  provider VARCHAR(32) NOT NULL,
  state_token VARCHAR(96) NOT NULL,
  redirect_uri VARCHAR(512) NOT NULL,
  return_to VARCHAR(512) NOT NULL,
  source VARCHAR(32) NULL,
  invite_code VARCHAR(120) NULL,
  purpose VARCHAR(64) NULL,
  bind_user_id VARCHAR(36) NULL,
  status VARCHAR(32) NOT NULL,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uniq_auth_oauth_states_state (state_token),
  KEY idx_auth_oauth_states_provider_status (provider, status, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE auth_oauth_states
  ADD COLUMN source VARCHAR(32) NULL AFTER return_to;

ALTER TABLE auth_oauth_states
  ADD COLUMN invite_code VARCHAR(120) NULL AFTER source;

ALTER TABLE auth_oauth_states
  ADD COLUMN purpose VARCHAR(64) NULL AFTER invite_code;

ALTER TABLE auth_oauth_states
  ADD COLUMN bind_user_id VARCHAR(36) NULL AFTER purpose;

CREATE TABLE IF NOT EXISTS auth_sms_codes (
  id VARCHAR(36) PRIMARY KEY,
  phone VARCHAR(32) NOT NULL,
  purpose VARCHAR(32) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_auth_sms_codes_phone_purpose_created (phone, purpose, created_at),
  KEY idx_auth_sms_codes_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS organizations (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(160) NOT NULL UNIQUE,
  owner_user_id VARCHAR(36) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  plan VARCHAR(32) NOT NULL DEFAULT 'starter',
  subscription_status VARCHAR(32) NOT NULL DEFAULT 'inactive',
  plan_overrides JSON NULL,
  stripe_customer_id VARCHAR(255) NULL,
  stripe_subscription_id VARCHAR(255) NULL,
  subscription_ends_at DATETIME NULL,
  business_license TEXT NULL,
  unified_social_credit_code VARCHAR(32) NULL,
  registered_address VARCHAR(255) NULL,
  industry_category VARCHAR(120) NULL,
  business_code VARCHAR(64) NULL,
  legal_representative_name VARCHAR(120) NULL,
  legal_representative_id_card_no VARCHAR(64) NULL,
  legal_representative_id_card_front TEXT NULL,
  legal_representative_id_card_back TEXT NULL,
  enterprise_verification_status VARCHAR(32) NULL,
  enterprise_verification_message VARCHAR(255) NULL,
  enterprise_verified_at DATETIME NULL,
  country VARCHAR(16) NULL,
  currency VARCHAR(16) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uniq_organizations_business_code (business_code),
  UNIQUE KEY uniq_organizations_stripe_customer_id (stripe_customer_id),
  UNIQUE KEY uniq_organizations_stripe_subscription_id (stripe_subscription_id),
  CONSTRAINT fk_organizations_owner FOREIGN KEY (owner_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE organizations
  ADD COLUMN plan VARCHAR(32) NOT NULL DEFAULT 'starter' AFTER status;

ALTER TABLE organizations
  ADD COLUMN subscription_status VARCHAR(32) NOT NULL DEFAULT 'inactive' AFTER plan;

ALTER TABLE organizations
  ADD COLUMN plan_overrides JSON NULL AFTER subscription_status;

ALTER TABLE organizations
  ADD COLUMN stripe_customer_id VARCHAR(255) NULL AFTER plan_overrides;

ALTER TABLE organizations
  ADD COLUMN stripe_subscription_id VARCHAR(255) NULL AFTER stripe_customer_id;

ALTER TABLE organizations
  ADD COLUMN subscription_ends_at DATETIME NULL AFTER stripe_subscription_id;

ALTER TABLE organizations
  ADD COLUMN business_license TEXT NULL AFTER status;

ALTER TABLE organizations
  ADD COLUMN unified_social_credit_code VARCHAR(32) NULL AFTER business_license;

ALTER TABLE organizations
  ADD COLUMN registered_address VARCHAR(255) NULL AFTER unified_social_credit_code;

ALTER TABLE organizations
  ADD COLUMN industry_category VARCHAR(120) NULL AFTER registered_address;

ALTER TABLE organizations
  ADD COLUMN business_code VARCHAR(64) NULL AFTER industry_category;

ALTER TABLE organizations
  ADD COLUMN legal_representative_name VARCHAR(120) NULL AFTER business_code;

ALTER TABLE organizations
  ADD COLUMN legal_representative_id_card_no VARCHAR(64) NULL AFTER legal_representative_name;

ALTER TABLE organizations
  ADD COLUMN legal_representative_id_card_front TEXT NULL AFTER legal_representative_id_card_no;

ALTER TABLE organizations
  ADD COLUMN legal_representative_id_card_back TEXT NULL AFTER legal_representative_id_card_front;

ALTER TABLE organizations
  ADD COLUMN enterprise_verification_status VARCHAR(32) NULL AFTER legal_representative_id_card_back;

ALTER TABLE organizations
  ADD COLUMN enterprise_verification_message VARCHAR(255) NULL AFTER enterprise_verification_status;

ALTER TABLE organizations
  ADD COLUMN enterprise_verified_at DATETIME NULL AFTER enterprise_verification_message;

ALTER TABLE organizations
  ADD UNIQUE KEY uniq_organizations_business_code (business_code);

ALTER TABLE organizations
  ADD UNIQUE KEY uniq_organizations_stripe_customer_id (stripe_customer_id);

ALTER TABLE organizations
  ADD UNIQUE KEY uniq_organizations_stripe_subscription_id (stripe_subscription_id);

CREATE TABLE IF NOT EXISTS memberships (
  id VARCHAR(36) PRIMARY KEY,
  organization_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  role VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL,
  joined_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uniq_membership_org_user (organization_id, user_id),
  CONSTRAINT fk_memberships_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_memberships_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS organization_invitations (
  id VARCHAR(36) PRIMARY KEY,
  organization_id VARCHAR(36) NOT NULL,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL,
  token VARCHAR(96) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  invited_by VARCHAR(36) NULL,
  expires_at DATETIME NOT NULL,
  accepted_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uniq_org_invitation_token (token),
  KEY idx_org_invitation_org_status (organization_id, status),
  KEY idx_org_invitation_email_status (email, status),
  CONSTRAINT fk_org_invitations_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_org_invitations_invited_by FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS projects (
  id VARCHAR(36) PRIMARY KEY,
  organization_id VARCHAR(36) NOT NULL,
  name VARCHAR(160) NOT NULL,
  slug VARCHAR(180) NOT NULL,
  industry VARCHAR(120) NULL,
  business_type VARCHAR(120) NULL,
  target_country VARCHAR(16) NULL,
  target_language VARCHAR(32) NULL,
  project_template VARCHAR(120) NULL,
  instruction_text MEDIUMTEXT NULL,
  connectors_json JSON NULL,
  skills_json JSON NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_by VARCHAR(36) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uniq_project_org_slug (organization_id, slug),
  CONSTRAINT fk_projects_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_projects_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE projects
  ADD COLUMN project_template VARCHAR(120) NULL;

ALTER TABLE projects
  ADD COLUMN instruction_text MEDIUMTEXT NULL;

ALTER TABLE projects
  ADD COLUMN connectors_json JSON NULL;

ALTER TABLE projects
  ADD COLUMN skills_json JSON NULL;

CREATE TABLE IF NOT EXISTS project_workspace_activities (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL,
  actor_user_id VARCHAR(36) NULL,
  actor_name VARCHAR(160) NOT NULL,
  activity_type VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NULL,
  entity_type VARCHAR(64) NULL,
  entity_id VARCHAR(36) NULL,
  visibility VARCHAR(32) NOT NULL DEFAULT 'team',
  metadata_json JSON NOT NULL,
  created_at DATETIME NOT NULL,
  KEY idx_project_workspace_activities_project_created (project_id, created_at),
  KEY idx_project_workspace_activities_entity (entity_type, entity_id),
  CONSTRAINT fk_project_workspace_activities_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_workspace_activities_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_plan_todos (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  parent_todo_id VARCHAR(36) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'todo',
  assignee_user_id VARCHAR(36) NULL,
  assignee_name VARCHAR(160) NULL,
  start_at DATETIME NULL,
  due_at DATETIME NULL,
  priority VARCHAR(32) NULL,
  source VARCHAR(64) NOT NULL DEFAULT 'manual',
  position BIGINT NOT NULL DEFAULT 0,
  created_by VARCHAR(36) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_project_plan_todos_project_status (project_id, status, position),
  KEY idx_project_plan_todos_parent (parent_todo_id, position),
  KEY idx_project_plan_todos_assignee (assignee_user_id),
  CONSTRAINT fk_project_plan_todos_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_plan_todos_parent FOREIGN KEY (parent_todo_id) REFERENCES project_plan_todos(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_plan_todos_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_project_plan_todos_assignee FOREIGN KEY (assignee_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE project_plan_todos
  MODIFY position BIGINT NOT NULL DEFAULT 0;

ALTER TABLE project_plan_todos
  ADD COLUMN start_at DATETIME NULL AFTER assignee_name;

ALTER TABLE project_plan_todos
  ADD COLUMN priority VARCHAR(32) NULL AFTER due_at;

ALTER TABLE project_plan_todos
  ADD COLUMN parent_todo_id VARCHAR(36) NULL AFTER description;

ALTER TABLE project_plan_todos
  ADD KEY idx_project_plan_todos_parent (parent_todo_id, position);

ALTER TABLE project_plan_todos
  ADD CONSTRAINT fk_project_plan_todos_parent FOREIGN KEY (parent_todo_id) REFERENCES project_plan_todos(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS project_todo_attachments (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL,
  todo_id VARCHAR(36) NOT NULL,
  file_id VARCHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(160) NULL,
  size_bytes BIGINT NULL,
  position INT NOT NULL DEFAULT 0,
  created_by VARCHAR(36) NOT NULL,
  created_at DATETIME NOT NULL,
  KEY idx_project_todo_attachments_project (project_id),
  KEY idx_project_todo_attachments_todo (todo_id, position),
  KEY idx_project_todo_attachments_file (file_id),
  CONSTRAINT fk_project_todo_attachments_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_todo_attachments_todo FOREIGN KEY (todo_id) REFERENCES project_plan_todos(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_todo_attachments_file FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_todo_attachments_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_tasks (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'open',
  task_type VARCHAR(64) NOT NULL DEFAULT 'ai_session',
  source VARCHAR(64) NOT NULL DEFAULT 'manual',
  session_id VARCHAR(120) NULL,
  composer_context_json JSON NULL,
  created_by VARCHAR(36) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_project_tasks_project_status (project_id, status, created_at),
  CONSTRAINT fk_project_tasks_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_tasks_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE project_tasks
  ADD COLUMN composer_context_json JSON NULL AFTER session_id;

CREATE TABLE IF NOT EXISTS project_assets (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL,
  parent_id VARCHAR(36) NULL,
  name VARCHAR(255) NOT NULL,
  asset_type VARCHAR(64) NOT NULL DEFAULT 'file',
  mime_type VARCHAR(160) NULL,
  file_id VARCHAR(36) NULL,
  source VARCHAR(64) NOT NULL DEFAULT 'manual_upload',
  source_task_id VARCHAR(36) NULL,
  size_bytes BIGINT NULL,
  created_by VARCHAR(36) NOT NULL,
  updated_by VARCHAR(36) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_project_assets_project_parent (project_id, parent_id),
  KEY idx_project_assets_source_task (source_task_id),
  CONSTRAINT fk_project_assets_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_assets_parent FOREIGN KEY (parent_id) REFERENCES project_assets(id) ON DELETE SET NULL,
  CONSTRAINT fk_project_assets_file FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE SET NULL,
  CONSTRAINT fk_project_assets_source_task FOREIGN KEY (source_task_id) REFERENCES project_tasks(id) ON DELETE SET NULL,
  CONSTRAINT fk_project_assets_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_project_assets_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS brands (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL UNIQUE,
  brand_name VARCHAR(160) NOT NULL,
  legal_name VARCHAR(160) NULL,
  brand_description TEXT NULL,
  website VARCHAR(255) NULL,
  phone VARCHAR(64) NULL,
  email VARCHAR(255) NULL,
  same_as JSON NOT NULL,
  competitors JSON NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_brands_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS domains (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL,
  domain_name VARCHAR(255) NOT NULL UNIQUE,
  registrar VARCHAR(120) NULL,
  registration_type VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL,
  verification_status VARCHAR(32) NOT NULL,
  ssl_status VARCHAR(32) NOT NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_domains_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE domains
  ADD COLUMN icp_status VARCHAR(32) NOT NULL DEFAULT 'pending';

ALTER TABLE domains
  ADD COLUMN icp_confirmed_at DATETIME NULL;

ALTER TABLE domains
  ADD COLUMN txt_record_name VARCHAR(255) NULL;

ALTER TABLE domains
  ADD COLUMN txt_record_value VARCHAR(255) NULL;

ALTER TABLE domains
  ADD COLUMN txt_verified_at DATETIME NULL;

ALTER TABLE domains
  ADD COLUMN cname_access_name VARCHAR(255) NULL;

ALTER TABLE domains
  ADD COLUMN cname_access_value VARCHAR(255) NULL;

ALTER TABLE domains
  ADD COLUMN cname_access_verified_at DATETIME NULL;

ALTER TABLE domains
  ADD COLUMN cname_challenge_name VARCHAR(255) NULL;

ALTER TABLE domains
  ADD COLUMN cname_challenge_value VARCHAR(255) NULL;

ALTER TABLE domains
  ADD COLUMN cname_challenge_verified_at DATETIME NULL;

ALTER TABLE domains
  ADD COLUMN last_dns_check_at DATETIME NULL;

ALTER TABLE domains
  ADD COLUMN last_dns_check_error VARCHAR(255) NULL;

ALTER TABLE domains
  ADD COLUMN filing_platform VARCHAR(32) NOT NULL DEFAULT 'aliyun';

ALTER TABLE domains
  ADD COLUMN filing_status VARCHAR(32) NOT NULL DEFAULT 'draft';

ALTER TABLE domains
  ADD COLUMN filing_subject_name VARCHAR(160) NULL;

ALTER TABLE domains
  ADD COLUMN filing_license_no VARCHAR(64) NULL;

ALTER TABLE domains
  ADD COLUMN filing_contact_name VARCHAR(120) NULL;

ALTER TABLE domains
  ADD COLUMN filing_contact_phone VARCHAR(32) NULL;

ALTER TABLE domains
  ADD COLUMN filing_number VARCHAR(64) NULL;

ALTER TABLE domains
  ADD COLUMN filing_official_query_url VARCHAR(255) NULL;

ALTER TABLE domains
  ADD COLUMN filing_query_screenshot_url VARCHAR(255) NULL;

ALTER TABLE domains
  ADD COLUMN filing_query_screenshot_name VARCHAR(255) NULL;

ALTER TABLE domains
  ADD COLUMN filing_query_note VARCHAR(255) NULL;

ALTER TABLE domains
  ADD COLUMN filing_submitted_at DATETIME NULL;

ALTER TABLE domains
  ADD COLUMN filing_queried_at DATETIME NULL;

ALTER TABLE domains
  ADD COLUMN filing_verified_at DATETIME NULL;

ALTER TABLE domains
  ADD COLUMN filing_rejected_reason VARCHAR(255) NULL;


CREATE TABLE IF NOT EXISTS sites (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL,
  domain_id VARCHAR(36) NULL,
  name VARCHAR(160) NOT NULL,
  site_type VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL,
  published_version_id VARCHAR(36) NULL,
  preview_version_id VARCHAR(36) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_sites_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_sites_domain FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS site_versions (
  id VARCHAR(36) PRIMARY KEY,
  site_id VARCHAR(36) NOT NULL,
  version_no INT NOT NULL,
  source_type VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL,
  dsl_json JSON NOT NULL,
  change_summary VARCHAR(255) NULL,
  created_by VARCHAR(36) NULL,
  published_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uniq_site_version_no (site_id, version_no),
  CONSTRAINT fk_site_versions_site FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS integrations (
  id VARCHAR(36) PRIMARY KEY,
  organization_id VARCHAR(36) NOT NULL,
  platform VARCHAR(64) NOT NULL,
  auth_type VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL,
  callback_status VARCHAR(32) NOT NULL,
  account_name VARCHAR(160) NULL,
  external_account_id VARCHAR(160) NULL,
  publish_enabled TINYINT(1) NOT NULL DEFAULT 0,
  crawl_enabled TINYINT(1) NOT NULL DEFAULT 0,
  access_token_meta JSON NOT NULL,
  meta_json JSON NOT NULL,
  notes VARCHAR(255) NULL,
  last_sync_at DATETIME NULL,
  created_by VARCHAR(36) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uniq_integrations_org_platform (organization_id, platform),
  CONSTRAINT fk_integrations_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_integrations_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE integrations
  ADD COLUMN oauth_connected_at DATETIME NULL AFTER last_sync_at;

ALTER TABLE integrations
  ADD COLUMN oauth_last_error VARCHAR(255) NULL AFTER oauth_connected_at;

CREATE TABLE IF NOT EXISTS integration_oauth_sessions (
  id VARCHAR(36) PRIMARY KEY,
  organization_id VARCHAR(36) NOT NULL,
  integration_id VARCHAR(36) NOT NULL,
  platform VARCHAR(64) NOT NULL,
  brand_id VARCHAR(36) NULL,
  state_token VARCHAR(160) NOT NULL,
  redirect_uri VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL,
  code_verifier VARCHAR(255) NULL,
  code_challenge VARCHAR(255) NULL,
  scopes_json JSON NOT NULL,
  meta_json JSON NOT NULL,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uniq_integration_oauth_state (state_token),
  KEY idx_integration_oauth_org_platform (organization_id, platform),
  CONSTRAINT fk_integration_oauth_sessions_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_integration_oauth_sessions_integration FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wechat_open_platform_states (
  component_appid VARCHAR(64) PRIMARY KEY,
  component_verify_ticket VARCHAR(255) NULL,
  component_access_token VARCHAR(512) NULL,
  component_access_token_expires_at DATETIME NULL,
  meta_json JSON NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS geo_audit_runs (
  id VARCHAR(36) PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL,
  domain_id VARCHAR(36) NOT NULL,
  audit_source VARCHAR(64) NOT NULL DEFAULT 'geo-seo-claude',
  status VARCHAR(32) NOT NULL,
  homepage_url VARCHAR(255) NULL,
  brand_name VARCHAR(160) NULL,
  geo_score INT NULL,
  rating VARCHAR(32) NULL,
  executive_summary TEXT NULL,
  progress_json JSON NULL,
  scores_json JSON NULL,
  platforms_json JSON NULL,
  crawler_access_json JSON NULL,
  findings_json JSON NULL,
  quick_wins_json JSON NULL,
  raw_result_json JSON NULL,
  error_message TEXT NULL,
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  failed_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_geo_audit_runs_domain_created (domain_id, created_at),
  KEY idx_geo_audit_runs_project_created (project_id, created_at),
  CONSTRAINT fk_geo_audit_runs_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_geo_audit_runs_domain FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS monitor_user_settings (
  user_id VARCHAR(36) PRIMARY KEY,
  current_organization_id VARCHAR(36) NULL,
  onboarding_completed TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_monitor_user_settings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_monitor_user_settings_org FOREIGN KEY (current_organization_id) REFERENCES organizations(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS monitor_brands (
  id VARCHAR(36) PRIMARY KEY,
  organization_id VARCHAR(36) NOT NULL,
  name VARCHAR(160) NOT NULL,
  slug VARCHAR(180) NOT NULL,
  logo_url VARCHAR(255) NULL,
  industry VARCHAR(120) NULL,
  description TEXT NULL,
  region VARCHAR(120) NULL,
  language VARCHAR(32) NULL,
  tracking_code VARCHAR(120) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uniq_monitor_brands_org_slug (organization_id, slug),
  KEY idx_monitor_brands_org_created (organization_id, created_at),
  CONSTRAINT fk_monitor_brands_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE monitor_brands
  ADD UNIQUE KEY uk_monitor_brands_tracking_code (tracking_code);

CREATE TABLE IF NOT EXISTS monitor_brand_domains (
  id VARCHAR(36) PRIMARY KEY,
  brand_id VARCHAR(36) NOT NULL,
  domain VARCHAR(255) NOT NULL,
  country VARCHAR(32) NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uniq_monitor_brand_domain (brand_id, domain),
  KEY idx_monitor_brand_domains_brand (brand_id, created_at),
  CONSTRAINT fk_monitor_brand_domains_brand FOREIGN KEY (brand_id) REFERENCES monitor_brands(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS monitor_site_audits (
  id VARCHAR(36) PRIMARY KEY,
  brand_id VARCHAR(36) NOT NULL,
  url TEXT NOT NULL,
  final_url TEXT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'running',
  total_score DECIMAL(7,4) NULL,
  category_scores_json JSON NOT NULL,
  signals_evaluated INT NULL,
  signals_total INT NOT NULL DEFAULT 47,
  rubric_version VARCHAR(32) NULL,
  recommendations_json JSON NOT NULL,
  error_message TEXT NULL,
  completed_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_monitor_site_audits_brand_created (brand_id, created_at),
  KEY idx_monitor_site_audits_status (status),
  CONSTRAINT fk_monitor_site_audits_brand FOREIGN KEY (brand_id) REFERENCES monitor_brands(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS monitor_site_audit_signal_results (
  id VARCHAR(36) PRIMARY KEY,
  audit_id VARCHAR(36) NOT NULL,
  signal_key VARCHAR(96) NOT NULL,
  category VARCHAR(32) NULL,
  status VARCHAR(16) NOT NULL,
  score DECIMAL(7,4) NULL,
  evidence_json JSON NOT NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uniq_monitor_site_audit_signal (audit_id, signal_key),
  KEY idx_monitor_site_audit_signal_audit (audit_id),
  CONSTRAINT fk_monitor_site_audit_signal_audit FOREIGN KEY (audit_id) REFERENCES monitor_site_audits(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS monitor_topics (
  id VARCHAR(36) PRIMARY KEY,
  brand_id VARCHAR(36) NOT NULL,
  name VARCHAR(160) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uniq_monitor_topics_brand_name (brand_id, name),
  KEY idx_monitor_topics_brand_created (brand_id, created_at),
  CONSTRAINT fk_monitor_topics_brand FOREIGN KEY (brand_id) REFERENCES monitor_brands(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS monitor_prompt_sets (
  id VARCHAR(36) PRIMARY KEY,
  brand_id VARCHAR(36) NOT NULL,
  name VARCHAR(160) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_monitor_prompt_sets_brand_created (brand_id, created_at),
  CONSTRAINT fk_monitor_prompt_sets_brand FOREIGN KEY (brand_id) REFERENCES monitor_brands(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS monitor_prompts (
  id VARCHAR(36) PRIMARY KEY,
  prompt_set_id VARCHAR(36) NOT NULL,
  topic_id VARCHAR(36) NULL,
  text TEXT NOT NULL,
  category VARCHAR(160) NULL,
  platforms_json JSON NULL,
  regions_json JSON NULL,
  models_json JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_monitor_prompts_set_created (prompt_set_id, created_at),
  KEY idx_monitor_prompts_topic_created (topic_id, created_at),
  CONSTRAINT fk_monitor_prompts_set FOREIGN KEY (prompt_set_id) REFERENCES monitor_prompt_sets(id) ON DELETE CASCADE,
  CONSTRAINT fk_monitor_prompts_topic FOREIGN KEY (topic_id) REFERENCES monitor_topics(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS monitor_competitors (
  id VARCHAR(36) PRIMARY KEY,
  brand_id VARCHAR(36) NOT NULL,
  name VARCHAR(160) NOT NULL,
  domain VARCHAR(255) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_monitor_competitors_brand_created (brand_id, created_at),
  CONSTRAINT fk_monitor_competitors_brand FOREIGN KEY (brand_id) REFERENCES monitor_brands(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS monitor_tracking_jobs (
  id VARCHAR(36) PRIMARY KEY,
  brand_id VARCHAR(36) NOT NULL,
  prompt_id VARCHAR(36) NULL,
  status VARCHAR(32) NOT NULL,
  progress_current INT NULL,
  progress_total INT NULL,
  prompt_text TEXT NULL,
  model VARCHAR(64) NULL,
  region VARCHAR(120) NULL,
  platform VARCHAR(64) NULL,
  result_count INT NULL,
  failed_reason TEXT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_monitor_tracking_jobs_brand_created (brand_id, created_at),
  CONSTRAINT fk_monitor_tracking_jobs_brand FOREIGN KEY (brand_id) REFERENCES monitor_brands(id) ON DELETE CASCADE,
  CONSTRAINT fk_monitor_tracking_jobs_prompt FOREIGN KEY (prompt_id) REFERENCES monitor_prompts(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE monitor_tracking_jobs
  ADD COLUMN started_at DATETIME NULL AFTER failed_reason;

ALTER TABLE monitor_tracking_jobs
  ADD COLUMN completed_at DATETIME NULL AFTER started_at;

ALTER TABLE monitor_tracking_jobs
  ADD COLUMN requested_by_user_id VARCHAR(36) NULL AFTER failed_reason;

ALTER TABLE monitor_tracking_jobs
  ADD COLUMN billing_mode VARCHAR(16) NULL AFTER requested_by_user_id;

CREATE TABLE IF NOT EXISTS monitor_tracking_job_items (
  id VARCHAR(36) PRIMARY KEY,
  job_id VARCHAR(36) NOT NULL,
  prompt_id VARCHAR(36) NOT NULL,
  platform VARCHAR(64) NOT NULL,
  model VARCHAR(120) NULL,
  region VARCHAR(120) NULL,
  status VARCHAR(32) NOT NULL,
  prompt_text TEXT NOT NULL,
  result_id VARCHAR(36) NULL,
  error_message TEXT NULL,
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_monitor_tracking_job_items_job_created (job_id, created_at),
  KEY idx_monitor_tracking_job_items_prompt_created (prompt_id, created_at),
  CONSTRAINT fk_monitor_tracking_job_items_job FOREIGN KEY (job_id) REFERENCES monitor_tracking_jobs(id) ON DELETE CASCADE,
  CONSTRAINT fk_monitor_tracking_job_items_prompt FOREIGN KEY (prompt_id) REFERENCES monitor_prompts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS monitor_on_demand_tracking_runs (
  id VARCHAR(36) PRIMARY KEY,
  organization_id VARCHAR(36) NOT NULL,
  brand_id VARCHAR(36) NOT NULL,
  prompt_id VARCHAR(36) NULL,
  user_id VARCHAR(36) NOT NULL,
  job_id VARCHAR(36) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_monitor_on_demand_tracking_runs_org_created (organization_id, created_at),
  KEY idx_monitor_on_demand_tracking_runs_brand_created (brand_id, created_at),
  KEY idx_monitor_on_demand_tracking_runs_job (job_id),
  CONSTRAINT fk_monitor_on_demand_tracking_runs_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_monitor_on_demand_tracking_runs_brand FOREIGN KEY (brand_id) REFERENCES monitor_brands(id) ON DELETE CASCADE,
  CONSTRAINT fk_monitor_on_demand_tracking_runs_prompt FOREIGN KEY (prompt_id) REFERENCES monitor_prompts(id) ON DELETE SET NULL,
  CONSTRAINT fk_monitor_on_demand_tracking_runs_job FOREIGN KEY (job_id) REFERENCES monitor_tracking_jobs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS monitor_prompt_results (
  id VARCHAR(36) PRIMARY KEY,
  job_id VARCHAR(36) NOT NULL,
  job_item_id VARCHAR(36) NOT NULL,
  brand_id VARCHAR(36) NOT NULL,
  prompt_id VARCHAR(36) NOT NULL,
  platform VARCHAR(64) NOT NULL,
  model_used VARCHAR(120) NULL,
  region VARCHAR(120) NULL,
  response LONGTEXT NOT NULL,
  mention_count INT NOT NULL DEFAULT 0,
  citation_count INT NOT NULL DEFAULT 0,
  sentiment VARCHAR(32) NOT NULL DEFAULT 'neutral',
  visibility_score INT NOT NULL DEFAULT 0,
  is_recommended TINYINT(1) NOT NULL DEFAULT 0,
  recommendation_score INT NOT NULL DEFAULT 0,
  raw_response_json JSON NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_monitor_prompt_results_brand_created (brand_id, created_at),
  KEY idx_monitor_prompt_results_prompt_created (prompt_id, created_at),
  KEY idx_monitor_prompt_results_job_item (job_item_id),
  CONSTRAINT fk_monitor_prompt_results_job FOREIGN KEY (job_id) REFERENCES monitor_tracking_jobs(id) ON DELETE CASCADE,
  CONSTRAINT fk_monitor_prompt_results_job_item FOREIGN KEY (job_item_id) REFERENCES monitor_tracking_job_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_monitor_prompt_results_brand FOREIGN KEY (brand_id) REFERENCES monitor_brands(id) ON DELETE CASCADE,
  CONSTRAINT fk_monitor_prompt_results_prompt FOREIGN KEY (prompt_id) REFERENCES monitor_prompts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS monitor_prompt_public_heat (
  id VARCHAR(36) PRIMARY KEY,
  prompt_id VARCHAR(36) NOT NULL,
  brand_id VARCHAR(36) NOT NULL,
  prompt_text TEXT NOT NULL,
  prompt_category VARCHAR(160) NULL,
  intent VARCHAR(64) NOT NULL,
  keywords_json JSON NOT NULL,
  keyword_scores_json JSON NOT NULL,
  signal_sources_json JSON NOT NULL,
  total_heat_score INT NOT NULL DEFAULT 0,
  opportunity_multiplier DECIMAL(5,2) NOT NULL DEFAULT 1.00,
  opportunity_score INT NOT NULL DEFAULT 0,
  competition_index INT NULL,
  competition VARCHAR(16) NULL,
  source_count INT NOT NULL DEFAULT 0,
  language_code VARCHAR(16) NULL,
  location_code INT NULL,
  fetched_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uniq_monitor_prompt_public_heat_prompt (prompt_id),
  KEY idx_monitor_prompt_public_heat_brand_fetched (brand_id, fetched_at),
  CONSTRAINT fk_monitor_prompt_public_heat_prompt FOREIGN KEY (prompt_id) REFERENCES monitor_prompts(id) ON DELETE CASCADE,
  CONSTRAINT fk_monitor_prompt_public_heat_brand FOREIGN KEY (brand_id) REFERENCES monitor_brands(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS monitor_prompt_public_heat_history (
  id VARCHAR(36) PRIMARY KEY,
  prompt_public_heat_id VARCHAR(36) NULL,
  prompt_id VARCHAR(36) NOT NULL,
  brand_id VARCHAR(36) NOT NULL,
  prompt_text TEXT NOT NULL,
  prompt_category VARCHAR(160) NULL,
  intent VARCHAR(64) NOT NULL,
  keywords_json JSON NOT NULL,
  keyword_scores_json JSON NOT NULL,
  total_heat_score INT NOT NULL DEFAULT 0,
  opportunity_multiplier DECIMAL(5,2) NOT NULL DEFAULT 1.00,
  opportunity_score INT NOT NULL DEFAULT 0,
  competition_index INT NULL,
  competition VARCHAR(16) NULL,
  source_count INT NOT NULL DEFAULT 0,
  language_code VARCHAR(16) NULL,
  location_code INT NULL,
  fetched_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  KEY idx_monitor_prompt_public_heat_history_prompt_fetched (prompt_id, fetched_at),
  KEY idx_monitor_prompt_public_heat_history_brand_fetched (brand_id, fetched_at),
  CONSTRAINT fk_monitor_prompt_public_heat_history_prompt FOREIGN KEY (prompt_id) REFERENCES monitor_prompts(id) ON DELETE CASCADE,
  CONSTRAINT fk_monitor_prompt_public_heat_history_brand FOREIGN KEY (brand_id) REFERENCES monitor_brands(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS monitor_result_citations (
  id VARCHAR(36) PRIMARY KEY,
  result_id VARCHAR(36) NOT NULL,
  title VARCHAR(255) NULL,
  url VARCHAR(1024) NOT NULL,
  start_index INT NOT NULL DEFAULT 0,
  end_index INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  KEY idx_monitor_result_citations_result_created (result_id, created_at),
  CONSTRAINT fk_monitor_result_citations_result FOREIGN KEY (result_id) REFERENCES monitor_prompt_results(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS monitor_result_references (
  id VARCHAR(36) PRIMARY KEY,
  result_id VARCHAR(36) NOT NULL,
  title VARCHAR(512) NULL,
  url VARCHAR(2048) NULL,
  domain VARCHAR(255) NULL,
  snippet TEXT NULL,
  source VARCHAR(120) NULL,
  position INT NOT NULL DEFAULT 0,
  raw_json JSON NULL,
  created_at DATETIME NOT NULL,
  KEY idx_monitor_result_references_result_created (result_id, created_at),
  KEY idx_monitor_result_references_domain (domain),
  CONSTRAINT fk_monitor_result_references_result FOREIGN KEY (result_id) REFERENCES monitor_prompt_results(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS monitor_result_competitors (
  id VARCHAR(36) PRIMARY KEY,
  result_id VARCHAR(36) NOT NULL,
  competitor_id VARCHAR(36) NULL,
  name VARCHAR(160) NOT NULL,
  domain VARCHAR(255) NOT NULL DEFAULT '',
  mention_count INT NOT NULL DEFAULT 0,
  citation_count INT NOT NULL DEFAULT 0,
  visibility_score INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  KEY idx_monitor_result_competitors_result_created (result_id, created_at),
  KEY idx_monitor_result_competitors_competitor (competitor_id),
  CONSTRAINT fk_monitor_result_competitors_result FOREIGN KEY (result_id) REFERENCES monitor_prompt_results(id) ON DELETE CASCADE,
  CONSTRAINT fk_monitor_result_competitors_competitor FOREIGN KEY (competitor_id) REFERENCES monitor_competitors(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS monitor_content_opportunities (
  id VARCHAR(36) PRIMARY KEY,
  brand_id VARCHAR(36) NOT NULL,
  prompt_id VARCHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  type VARCHAR(32) NOT NULL DEFAULT 'owned',
  impact VARCHAR(16) NOT NULL DEFAULT 'medium',
  opportunity_score INT NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'new',
  source_data_json JSON NULL,
  brief_json JSON NULL,
  brief_generated_at DATETIME NULL,
  webhook_sent_at DATETIME NULL,
  webhook_response_json JSON NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uniq_monitor_content_opportunities_prompt (prompt_id),
  KEY idx_monitor_content_opportunities_brand_status (brand_id, status, updated_at),
  KEY idx_monitor_content_opportunities_brand_score (brand_id, opportunity_score, updated_at),
  CONSTRAINT fk_monitor_content_opportunities_brand FOREIGN KEY (brand_id) REFERENCES monitor_brands(id) ON DELETE CASCADE,
  CONSTRAINT fk_monitor_content_opportunities_prompt FOREIGN KEY (prompt_id) REFERENCES monitor_prompts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS monitor_content_webhook_configs (
  id VARCHAR(36) PRIMARY KEY,
  brand_id VARCHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL DEFAULT 'Default',
  webhook_url TEXT NOT NULL,
  webhook_secret TEXT NULL,
  events_json JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uniq_monitor_content_webhook_configs_brand_name (brand_id, name),
  KEY idx_monitor_content_webhook_configs_brand_active (brand_id, is_active, updated_at),
  CONSTRAINT fk_monitor_content_webhook_configs_brand FOREIGN KEY (brand_id) REFERENCES monitor_brands(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS monitor_brand_platforms (
  id VARCHAR(36) PRIMARY KEY,
  brand_id VARCHAR(36) NOT NULL,
  platform VARCHAR(64) NOT NULL,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  check_frequency VARCHAR(32) NOT NULL DEFAULT 'daily',
  api_model VARCHAR(128) NULL,
  last_checked_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uniq_monitor_brand_platforms_brand_platform (brand_id, platform),
  KEY idx_monitor_brand_platforms_brand_created (brand_id, created_at),
  CONSTRAINT fk_monitor_brand_platforms_brand FOREIGN KEY (brand_id) REFERENCES monitor_brands(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS monitor_ai_traffic_logs (
  id VARCHAR(36) PRIMARY KEY,
  brand_id VARCHAR(36) NOT NULL,
  tracking_code VARCHAR(120) NOT NULL,
  url VARCHAR(1024) NOT NULL,
  path VARCHAR(512) NOT NULL DEFAULT '/',
  referrer VARCHAR(1024) NULL,
  referrer_host VARCHAR(255) NULL,
  source_platform VARCHAR(64) NOT NULL,
  country VARCHAR(32) NULL,
  language VARCHAR(32) NULL,
  screen VARCHAR(32) NULL,
  session_id VARCHAR(120) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_monitor_ai_traffic_logs_brand_created (brand_id, created_at),
  KEY idx_monitor_ai_traffic_logs_tracking_created (tracking_code, created_at),
  KEY idx_monitor_ai_traffic_logs_platform_created (source_platform, created_at),
  CONSTRAINT fk_monitor_ai_traffic_logs_brand FOREIGN KEY (brand_id) REFERENCES monitor_brands(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS monitor_ai_conversion_events (
  id VARCHAR(36) PRIMARY KEY,
  brand_id VARCHAR(36) NOT NULL,
  tracking_code VARCHAR(120) NOT NULL,
  url VARCHAR(1024) NOT NULL,
  path VARCHAR(512) NOT NULL DEFAULT '/',
  referrer VARCHAR(1024) NULL,
  referrer_host VARCHAR(255) NULL,
  source_platform VARCHAR(64) NOT NULL,
  country VARCHAR(32) NULL,
  language VARCHAR(32) NULL,
  session_id VARCHAR(120) NULL,
  tracking_link_id VARCHAR(36) NULL,
  tracking_link_click_id VARCHAR(36) NULL,
  source_channel VARCHAR(64) NULL,
  source_placement VARCHAR(64) NULL,
  event_name VARCHAR(120) NOT NULL,
  event_label VARCHAR(255) NULL,
  event_value DECIMAL(12,2) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_monitor_ai_conversion_events_brand_created (brand_id, created_at),
  KEY idx_monitor_ai_conversion_events_tracking_created (tracking_code, created_at),
  KEY idx_monitor_ai_conversion_events_platform_created (source_platform, created_at),
  KEY idx_monitor_ai_conversion_events_path_created (path, created_at),
  CONSTRAINT fk_monitor_ai_conversion_events_brand FOREIGN KEY (brand_id) REFERENCES monitor_brands(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE monitor_ai_traffic_logs
  ADD COLUMN tracking_link_id VARCHAR(36) NULL AFTER session_id;

ALTER TABLE monitor_ai_traffic_logs
  ADD COLUMN tracking_link_click_id VARCHAR(36) NULL AFTER tracking_link_id;

ALTER TABLE monitor_ai_traffic_logs
  ADD COLUMN source_channel VARCHAR(64) NULL AFTER tracking_link_click_id;

ALTER TABLE monitor_ai_traffic_logs
  ADD COLUMN source_placement VARCHAR(64) NULL AFTER source_channel;

ALTER TABLE monitor_ai_traffic_logs
  ADD KEY idx_monitor_ai_traffic_logs_link_created (tracking_link_id, created_at);

CREATE TABLE IF NOT EXISTS monitor_tracking_links (
  id VARCHAR(36) PRIMARY KEY,
  brand_id VARCHAR(36) NOT NULL,
  name VARCHAR(160) NOT NULL,
  channel VARCHAR(64) NOT NULL,
  placement VARCHAR(64) NOT NULL,
  slug VARCHAR(64) NOT NULL,
  target_url VARCHAR(1024) NOT NULL,
  note VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uniq_monitor_tracking_links_slug (slug),
  KEY idx_monitor_tracking_links_brand_created (brand_id, created_at),
  CONSTRAINT fk_monitor_tracking_links_brand FOREIGN KEY (brand_id) REFERENCES monitor_brands(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS monitor_tracking_link_clicks (
  id VARCHAR(36) PRIMARY KEY,
  tracking_link_id VARCHAR(36) NOT NULL,
  brand_id VARCHAR(36) NOT NULL,
  slug VARCHAR(64) NOT NULL,
  channel VARCHAR(64) NOT NULL,
  placement VARCHAR(64) NOT NULL,
  target_url VARCHAR(1024) NOT NULL,
  referrer VARCHAR(1024) NULL,
  referrer_host VARCHAR(255) NULL,
  user_agent VARCHAR(1024) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_monitor_tracking_link_clicks_link_created (tracking_link_id, created_at),
  KEY idx_monitor_tracking_link_clicks_brand_created (brand_id, created_at),
  CONSTRAINT fk_monitor_tracking_link_clicks_link FOREIGN KEY (tracking_link_id) REFERENCES monitor_tracking_links(id) ON DELETE CASCADE,
  CONSTRAINT fk_monitor_tracking_link_clicks_brand FOREIGN KEY (brand_id) REFERENCES monitor_brands(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS monitor_content_drafts (
  id VARCHAR(36) PRIMARY KEY,
  brand_id VARCHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  content LONGTEXT NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_monitor_content_drafts_brand_updated (brand_id, updated_at),
  CONSTRAINT fk_monitor_content_drafts_brand FOREIGN KEY (brand_id) REFERENCES monitor_brands(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS monitor_content_messages (
  id VARCHAR(36) PRIMARY KEY,
  draft_id VARCHAR(36) NOT NULL,
  brand_id VARCHAR(36) NOT NULL,
  role VARCHAR(16) NOT NULL,
  content LONGTEXT NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_monitor_content_messages_draft_created (draft_id, created_at),
  KEY idx_monitor_content_messages_brand_created (brand_id, created_at),
  CONSTRAINT fk_monitor_content_messages_draft FOREIGN KEY (draft_id) REFERENCES monitor_content_drafts(id) ON DELETE CASCADE,
  CONSTRAINT fk_monitor_content_messages_brand FOREIGN KEY (brand_id) REFERENCES monitor_brands(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS monitor_miaoshe_chat_uploads (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  brand_id VARCHAR(36) NOT NULL,
  thread_id VARCHAR(64) NOT NULL,
  client_message_id VARCHAR(64) NULL,
  message_text TEXT NOT NULL,
  attachments_json LONGTEXT NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_monitor_miaoshe_chat_uploads_thread_created (brand_id, thread_id, created_at),
  KEY idx_monitor_miaoshe_chat_uploads_user_created (user_id, created_at),
  CONSTRAINT fk_monitor_miaoshe_chat_uploads_brand FOREIGN KEY (brand_id) REFERENCES monitor_brands(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS monitor_media_assets (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  brand_id VARCHAR(36) NOT NULL,
  asset_type VARCHAR(16) NOT NULL,
  title VARCHAR(255) NOT NULL,
  asset_url VARCHAR(2048) NOT NULL,
  thumbnail_url VARCHAR(2048) NULL,
  mime_type VARCHAR(128) NULL,
  provider VARCHAR(64) NULL,
  model VARCHAR(128) NULL,
  source VARCHAR(64) NULL,
  prompt LONGTEXT NULL,
  metadata_json LONGTEXT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_monitor_media_assets_user_type_created (user_id, asset_type, created_at),
  KEY idx_monitor_media_assets_brand_type_created (brand_id, asset_type, created_at),
  KEY idx_monitor_media_assets_user_brand_url (user_id, brand_id, asset_type, asset_url(255)),
  CONSTRAINT fk_monitor_media_assets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_monitor_media_assets_brand FOREIGN KEY (brand_id) REFERENCES monitor_brands(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS public_image_generation_daily_usage (
  account_id VARCHAR(128) NOT NULL,
  usage_date DATE NOT NULL,
  request_count INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (account_id, usage_date),
  INDEX idx_public_image_generation_daily_usage_date (usage_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS monitor_wechatsync_bridge_sessions (
  id VARCHAR(36) PRIMARY KEY,
  organization_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  public_id VARCHAR(64) NOT NULL,
  session_token VARCHAR(128) NOT NULL,
  status VARCHAR(24) NOT NULL,
  last_error VARCHAR(255) NULL,
  connected_at DATETIME NULL,
  last_seen_at DATETIME NULL,
  disconnected_at DATETIME NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uniq_monitor_wechatsync_bridge_sessions_public_id (public_id),
  UNIQUE KEY uniq_monitor_wechatsync_bridge_sessions_token (session_token),
  KEY idx_monitor_wechatsync_bridge_sessions_org_user (organization_id, user_id, revoked_at, updated_at),
  CONSTRAINT fk_monitor_wechatsync_bridge_sessions_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_monitor_wechatsync_bridge_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS monitor_creator_platform_connections (
  id VARCHAR(36) PRIMARY KEY,
  organization_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  brand_id VARCHAR(36) NOT NULL,
  bridge_session_public_id VARCHAR(64) NULL,
  platform VARCHAR(64) NOT NULL,
  platform_label VARCHAR(128) NOT NULL,
  account_key VARCHAR(255) NOT NULL,
  external_account_id VARCHAR(255) NULL,
  account_name VARCHAR(255) NULL,
  creator_url VARCHAR(2048) NULL,
  dashboard_url VARCHAR(2048) NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'connected',
  metadata_json LONGTEXT NULL,
  last_seen_at DATETIME NULL,
  last_crawled_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uniq_creator_conn_brand_user_platform_account (brand_id, user_id, platform, account_key),
  KEY idx_monitor_creator_platform_connections_brand_platform (brand_id, platform, updated_at),
  KEY idx_monitor_creator_platform_connections_org_user (organization_id, user_id, updated_at),
  CONSTRAINT fk_monitor_creator_platform_connections_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_monitor_creator_platform_connections_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_monitor_creator_platform_connections_brand FOREIGN KEY (brand_id) REFERENCES monitor_brands(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS monitor_creator_platform_snapshots (
  id VARCHAR(36) PRIMARY KEY,
  connection_id VARCHAR(36) NULL,
  organization_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  brand_id VARCHAR(36) NOT NULL,
  platform VARCHAR(64) NOT NULL,
  platform_label VARCHAR(128) NOT NULL,
  account_key VARCHAR(255) NOT NULL,
  account_name VARCHAR(255) NULL,
  snapshot_kind VARCHAR(32) NOT NULL DEFAULT 'creator_overview',
  source VARCHAR(32) NOT NULL DEFAULT 'bridge',
  status VARCHAR(24) NOT NULL DEFAULT 'success',
  metric_date DATE NULL,
  summary_text TEXT NULL,
  metrics_json LONGTEXT NOT NULL,
  raw_json LONGTEXT NULL,
  error_message VARCHAR(512) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_monitor_creator_platform_snapshots_brand_platform_created (brand_id, platform, created_at),
  KEY idx_monitor_creator_platform_snapshots_connection_created (connection_id, created_at),
  CONSTRAINT fk_monitor_creator_platform_snapshots_connection FOREIGN KEY (connection_id) REFERENCES monitor_creator_platform_connections(id) ON DELETE SET NULL,
  CONSTRAINT fk_monitor_creator_platform_snapshots_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_monitor_creator_platform_snapshots_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_monitor_creator_platform_snapshots_brand FOREIGN KEY (brand_id) REFERENCES monitor_brands(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS monitor_creator_platform_jobs (
  id VARCHAR(36) PRIMARY KEY,
  organization_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  brand_id VARCHAR(36) NOT NULL,
  bridge_session_public_id VARCHAR(64) NULL,
  requested_platforms_json LONGTEXT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  summary_text TEXT NULL,
  result_json LONGTEXT NULL,
  error_message VARCHAR(512) NULL,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_monitor_creator_platform_jobs_brand_created (brand_id, created_at),
  KEY idx_monitor_creator_platform_jobs_org_user_created (organization_id, user_id, created_at),
  CONSTRAINT fk_monitor_creator_platform_jobs_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_monitor_creator_platform_jobs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_monitor_creator_platform_jobs_brand FOREIGN KEY (brand_id) REFERENCES monitor_brands(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS knowledge_bases (
  id VARCHAR(36) PRIMARY KEY,
  organization_id VARCHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  category VARCHAR(64) NULL,
  visibility VARCHAR(16) NOT NULL DEFAULT 'private',
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_by VARCHAR(36) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_knowledge_bases_org_created (organization_id, created_at),
  KEY idx_knowledge_bases_org_default (organization_id, is_default, updated_at),
  CONSTRAINT fk_knowledge_bases_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_knowledge_bases_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS knowledge_base_items (
  id VARCHAR(36) PRIMARY KEY,
  organization_id VARCHAR(36) NOT NULL,
  knowledge_base_id VARCHAR(36) NOT NULL,
  parent_id VARCHAR(36) NULL,
  sort_order BIGINT NOT NULL DEFAULT 0,
  item_type VARCHAR(16) NOT NULL,
  item_subtype VARCHAR(32) NULL,
  name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(128) NULL,
  size_bytes BIGINT NULL,
  storage_path VARCHAR(1024) NULL,
  public_url VARCHAR(1024) NULL,
  snapshot_storage_path VARCHAR(1024) NULL,
  snapshot_public_url VARCHAR(1024) NULL,
  snapshot_version INT NOT NULL DEFAULT 1,
  content_json LONGTEXT NULL,
  created_by VARCHAR(36) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_knowledge_base_items_kb_type_updated (knowledge_base_id, item_type, updated_at),
  KEY idx_knowledge_base_items_parent_updated (parent_id, updated_at),
  KEY idx_knowledge_base_items_parent_sort (knowledge_base_id, parent_id, sort_order),
  KEY idx_knowledge_base_items_org_created (organization_id, created_at),
  CONSTRAINT fk_knowledge_base_items_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_knowledge_base_items_kb FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  CONSTRAINT fk_knowledge_base_items_parent FOREIGN KEY (parent_id) REFERENCES knowledge_base_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_knowledge_base_items_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS knowledge_base_item_share_settings (
  item_id VARCHAR(36) PRIMARY KEY,
  organization_id VARCHAR(36) NOT NULL,
  knowledge_base_id VARCHAR(36) NOT NULL,
  link_access VARCHAR(32) NOT NULL DEFAULT 'private',
  allow_copy TINYINT(1) NOT NULL DEFAULT 1,
  password_hash CHAR(64) NULL,
  password_salt VARCHAR(64) NULL,
  created_by VARCHAR(36) NULL,
  updated_by VARCHAR(36) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_knowledge_base_item_share_settings_kb (knowledge_base_id, updated_at),
  CONSTRAINT fk_knowledge_base_item_share_settings_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_knowledge_base_item_share_settings_kb FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  CONSTRAINT fk_knowledge_base_item_share_settings_item FOREIGN KEY (item_id) REFERENCES knowledge_base_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_knowledge_base_item_share_settings_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_knowledge_base_item_share_settings_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS knowledge_base_item_versions (
  id VARCHAR(36) PRIMARY KEY,
  organization_id VARCHAR(36) NOT NULL,
  knowledge_base_id VARCHAR(36) NOT NULL,
  item_id VARCHAR(36) NOT NULL,
  version_number INT NOT NULL,
  title VARCHAR(255) NULL,
  summary VARCHAR(255) NULL,
  snapshot_storage_path VARCHAR(1024) NULL,
  snapshot_public_url VARCHAR(1024) NULL,
  content_json LONGTEXT NULL,
  created_by VARCHAR(36) NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uniq_knowledge_base_item_versions_number (item_id, version_number),
  KEY idx_knowledge_base_item_versions_item_created (item_id, created_at),
  KEY idx_knowledge_base_item_versions_kb_created (knowledge_base_id, created_at),
  CONSTRAINT fk_knowledge_base_item_versions_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_knowledge_base_item_versions_kb FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  CONSTRAINT fk_knowledge_base_item_versions_item FOREIGN KEY (item_id) REFERENCES knowledge_base_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_knowledge_base_item_versions_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS knowledge_base_item_collaborators (
  id VARCHAR(36) PRIMARY KEY,
  organization_id VARCHAR(36) NOT NULL,
  knowledge_base_id VARCHAR(36) NOT NULL,
  item_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NULL,
  identifier VARCHAR(255) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'editor',
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_by VARCHAR(36) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uniq_knowledge_base_item_collaborators_identifier (item_id, identifier),
  KEY idx_knowledge_base_item_collaborators_item (item_id, created_at),
  KEY idx_knowledge_base_item_collaborators_user (user_id),
  CONSTRAINT fk_knowledge_base_item_collaborators_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_knowledge_base_item_collaborators_kb FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  CONSTRAINT fk_knowledge_base_item_collaborators_item FOREIGN KEY (item_id) REFERENCES knowledge_base_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_knowledge_base_item_collaborators_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_knowledge_base_item_collaborators_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS knowledge_base_item_comments (
  id VARCHAR(36) PRIMARY KEY,
  organization_id VARCHAR(36) NOT NULL,
  knowledge_base_id VARCHAR(36) NOT NULL,
  item_id VARCHAR(36) NOT NULL,
  parent_id VARCHAR(36) NULL,
  block_id VARCHAR(128) NULL,
  quote_text TEXT NULL,
  body TEXT NOT NULL,
  resolved TINYINT(1) NOT NULL DEFAULT 0,
  created_by VARCHAR(36) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_knowledge_base_item_comments_item_created (item_id, created_at),
  KEY idx_knowledge_base_item_comments_parent_created (parent_id, created_at),
  KEY idx_knowledge_base_item_comments_kb_updated (knowledge_base_id, updated_at),
  CONSTRAINT fk_knowledge_base_item_comments_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_knowledge_base_item_comments_kb FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  CONSTRAINT fk_knowledge_base_item_comments_item FOREIGN KEY (item_id) REFERENCES knowledge_base_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_knowledge_base_item_comments_parent FOREIGN KEY (parent_id) REFERENCES knowledge_base_item_comments(id) ON DELETE CASCADE,
  CONSTRAINT fk_knowledge_base_item_comments_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS knowledge_base_chunks (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(36) NOT NULL,
  knowledge_base_id VARCHAR(36) NOT NULL,
  item_id VARCHAR(36) NOT NULL,
  chunk_index INT NOT NULL,
  content MEDIUMTEXT NOT NULL,
  embedding_json JSON NOT NULL,
  embedding_model VARCHAR(128) NOT NULL,
  token_count INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uniq_knowledge_base_chunks_item_index (item_id, chunk_index),
  KEY idx_knowledge_base_chunks_kb_item (knowledge_base_id, item_id),
  CONSTRAINT fk_knowledge_base_chunks_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_knowledge_base_chunks_kb FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  CONSTRAINT fk_knowledge_base_chunks_item FOREIGN KEY (item_id) REFERENCES knowledge_base_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS knowledge_base_personal_workspaces (
  user_id VARCHAR(36) PRIMARY KEY,
  organization_id VARCHAR(36) NOT NULL UNIQUE,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_knowledge_base_personal_workspaces_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_knowledge_base_personal_workspaces_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS knowledge_base_index_jobs (
  id VARCHAR(64) PRIMARY KEY,
  organization_id VARCHAR(36) NOT NULL,
  knowledge_base_id VARCHAR(36) NOT NULL,
  item_id VARCHAR(36) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'queued',
  source_version INT NOT NULL DEFAULT 1,
  attempt_count INT NOT NULL DEFAULT 0,
  chunk_count INT NOT NULL DEFAULT 0,
  error_message TEXT NULL,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uniq_knowledge_base_index_jobs_item (item_id),
  KEY idx_knowledge_base_index_jobs_pending (status, updated_at),
  KEY idx_knowledge_base_index_jobs_kb (knowledge_base_id, status),
  CONSTRAINT fk_knowledge_base_index_jobs_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_knowledge_base_index_jobs_kb FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  CONSTRAINT fk_knowledge_base_index_jobs_item FOREIGN KEY (item_id) REFERENCES knowledge_base_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE knowledge_bases
  ADD COLUMN category VARCHAR(64) NULL AFTER description;

ALTER TABLE knowledge_bases
  ADD COLUMN visibility VARCHAR(16) NOT NULL DEFAULT 'private' AFTER category;

ALTER TABLE knowledge_base_items
  ADD COLUMN item_subtype VARCHAR(32) NULL AFTER item_type;

ALTER TABLE knowledge_base_items
  ADD COLUMN sort_order BIGINT NOT NULL DEFAULT 0 AFTER parent_id;

ALTER TABLE knowledge_base_items
  ADD KEY idx_knowledge_base_items_parent_sort (knowledge_base_id, parent_id, sort_order);

ALTER TABLE knowledge_base_items
  ADD COLUMN snapshot_storage_path VARCHAR(1024) NULL AFTER public_url;

ALTER TABLE knowledge_base_items
  ADD COLUMN snapshot_public_url VARCHAR(1024) NULL AFTER snapshot_storage_path;

ALTER TABLE knowledge_base_items
  ADD COLUMN snapshot_version INT NOT NULL DEFAULT 1 AFTER snapshot_public_url;

ALTER TABLE knowledge_base_items
  ADD COLUMN content_json LONGTEXT NULL AFTER public_url;

CREATE TABLE IF NOT EXISTS copilot_sessions (
  id VARCHAR(64) PRIMARY KEY,
  product_type VARCHAR(32) NOT NULL,
  scene_type VARCHAR(64) NOT NULL,
  scope_type VARCHAR(32) NOT NULL,
  scope_id VARCHAR(128) NULL,
  organization_id VARCHAR(36) NULL,
  user_id VARCHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  client_context_json JSON NOT NULL,
  context_summary TEXT NULL,
  context_json JSON NULL,
  message_count INT NOT NULL DEFAULT 0,
  run_count INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_copilot_sessions_user_product_created (user_id, product_type, created_at),
  KEY idx_copilot_sessions_org_product_created (organization_id, product_type, created_at),
  KEY idx_copilot_sessions_scope (scope_type, scope_id),
  CONSTRAINT fk_copilot_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_copilot_sessions_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS copilot_messages (
  id VARCHAR(64) PRIMARY KEY,
  session_id VARCHAR(64) NOT NULL,
  role VARCHAR(16) NOT NULL,
  content LONGTEXT NOT NULL,
  content_json JSON NULL,
  source VARCHAR(64) NULL,
  client_message_id VARCHAR(128) NULL,
  created_at DATETIME NOT NULL,
  KEY idx_copilot_messages_session_created (session_id, created_at),
  CONSTRAINT fk_copilot_messages_session FOREIGN KEY (session_id) REFERENCES copilot_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS copilot_runs (
  id VARCHAR(64) PRIMARY KEY,
  session_id VARCHAR(64) NOT NULL,
  message_id VARCHAR(64) NULL,
  product_type VARCHAR(32) NOT NULL,
  scene_type VARCHAR(64) NOT NULL,
  skill_name VARCHAR(128) NOT NULL,
  execution_mode VARCHAR(32) NOT NULL,
  tool_choice VARCHAR(32) NOT NULL,
  streamed TINYINT(1) NOT NULL DEFAULT 1,
  model_provider VARCHAR(64) NOT NULL,
  model_name VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL,
  error_message TEXT NULL,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_copilot_runs_session_created (session_id, created_at),
  KEY idx_copilot_runs_product_status (product_type, status, created_at),
  CONSTRAINT fk_copilot_runs_session FOREIGN KEY (session_id) REFERENCES copilot_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_copilot_runs_message FOREIGN KEY (message_id) REFERENCES copilot_messages(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS copilot_tool_calls (
  id VARCHAR(64) PRIMARY KEY,
  run_id VARCHAR(64) NOT NULL,
  tool_name VARCHAR(128) NOT NULL,
  risk_level VARCHAR(16) NOT NULL,
  input_json JSON NULL,
  output_json JSON NULL,
  status VARCHAR(32) NOT NULL,
  requires_confirmation TINYINT(1) NOT NULL DEFAULT 0,
  confirmed_by_user TINYINT(1) NOT NULL DEFAULT 0,
  error_message TEXT NULL,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_copilot_tool_calls_run_created (run_id, created_at),
  KEY idx_copilot_tool_calls_status (status, updated_at),
  CONSTRAINT fk_copilot_tool_calls_run FOREIGN KEY (run_id) REFERENCES copilot_runs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS copilot_artifacts (
  id VARCHAR(64) PRIMARY KEY,
  run_id VARCHAR(64) NOT NULL,
  artifact_type VARCHAR(64) NOT NULL,
  storage_type VARCHAR(32) NOT NULL,
  storage_path VARCHAR(512) NOT NULL,
  metadata_json JSON NULL,
  created_at DATETIME NOT NULL,
  KEY idx_copilot_artifacts_run_created (run_id, created_at),
  CONSTRAINT fk_copilot_artifacts_run FOREIGN KEY (run_id) REFERENCES copilot_runs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS copilot_usage_logs (
  id VARCHAR(64) PRIMARY KEY,
  product_type VARCHAR(32) NOT NULL,
  organization_id VARCHAR(36) NULL,
  user_id VARCHAR(36) NOT NULL,
  run_id VARCHAR(64) NOT NULL,
  model_provider VARCHAR(64) NOT NULL,
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  tool_call_count INT NOT NULL DEFAULT 0,
  duration_ms INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  KEY idx_copilot_usage_logs_product_created (product_type, created_at),
  KEY idx_copilot_usage_logs_user_created (user_id, created_at),
  CONSTRAINT fk_copilot_usage_logs_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL,
  CONSTRAINT fk_copilot_usage_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_copilot_usage_logs_run FOREIGN KEY (run_id) REFERENCES copilot_runs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS owlix_marketplace_vendor_profiles (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  organization_id VARCHAR(36) NULL,
  display_name VARCHAR(120) NOT NULL,
  contact_email VARCHAR(255) NULL,
  payout_account_type VARCHAR(32) NULL,
  payout_account_ref VARCHAR(255) NULL,
  wechat_open_id VARCHAR(128) NULL,
  wechat_union_id VARCHAR(128) NULL,
  wechat_nickname VARCHAR(255) NULL,
  wechat_avatar_url TEXT NULL,
  wechat_bound_at DATETIME NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  default_commission_rate_bps INT NOT NULL DEFAULT 2000,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uniq_owlix_marketplace_vendor_user (user_id),
  KEY idx_owlix_marketplace_vendor_org (organization_id),
  CONSTRAINT fk_owlix_marketplace_vendor_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_owlix_marketplace_vendor_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE owlix_marketplace_vendor_profiles
  ADD COLUMN wechat_open_id VARCHAR(128) NULL AFTER payout_account_ref;

ALTER TABLE owlix_marketplace_vendor_profiles
  ADD COLUMN wechat_union_id VARCHAR(128) NULL AFTER wechat_open_id;

ALTER TABLE owlix_marketplace_vendor_profiles
  ADD COLUMN wechat_nickname VARCHAR(255) NULL AFTER wechat_union_id;

ALTER TABLE owlix_marketplace_vendor_profiles
  ADD COLUMN wechat_avatar_url TEXT NULL AFTER wechat_nickname;

ALTER TABLE owlix_marketplace_vendor_profiles
  ADD COLUMN wechat_bound_at DATETIME NULL AFTER wechat_avatar_url;

CREATE TABLE IF NOT EXISTS owlix_marketplace_listings (
  id VARCHAR(36) PRIMARY KEY,
  vendor_id VARCHAR(36) NOT NULL,
  organization_id VARCHAR(36) NULL,
  seller_user_id VARCHAR(36) NOT NULL,
  product_type VARCHAR(32) NOT NULL,
  project_kind VARCHAR(32) NULL,
  title VARCHAR(160) NOT NULL,
  slug VARCHAR(180) NOT NULL,
  summary VARCHAR(500) NOT NULL,
  description TEXT NULL,
  source_bundle_url TEXT NOT NULL,
  cover_image_url TEXT NULL,
  source_sha256 VARCHAR(128) NULL,
  source_size_bytes BIGINT NULL,
  version VARCHAR(64) NOT NULL DEFAULT '1.0.0',
  tags_json JSON NOT NULL,
  runtime_requirements_json JSON NOT NULL,
  pricing_type VARCHAR(32) NOT NULL DEFAULT 'one_time',
  price_cents INT NOT NULL DEFAULT 0,
  currency VARCHAR(8) NOT NULL DEFAULT 'CNY',
  commission_rate_bps INT NOT NULL DEFAULT 2000,
  status VARCHAR(32) NOT NULL DEFAULT 'pending_review',
  review_message VARCHAR(500) NULL,
  submitted_at DATETIME NULL,
  reviewed_at DATETIME NULL,
  reviewed_by VARCHAR(120) NULL,
  published_at DATETIME NULL,
  sale_count INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uniq_owlix_marketplace_listing_slug (slug),
  KEY idx_owlix_marketplace_listing_status (status, product_type, published_at),
  KEY idx_owlix_marketplace_listing_vendor (vendor_id, created_at),
  CONSTRAINT fk_owlix_marketplace_listing_vendor FOREIGN KEY (vendor_id) REFERENCES owlix_marketplace_vendor_profiles(id) ON DELETE CASCADE,
  CONSTRAINT fk_owlix_marketplace_listing_seller FOREIGN KEY (seller_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_owlix_marketplace_listing_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE owlix_marketplace_listings
  ADD COLUMN cover_image_url TEXT NULL AFTER source_bundle_url;

CREATE TABLE IF NOT EXISTS owlix_marketplace_orders (
  id VARCHAR(36) PRIMARY KEY,
  listing_id VARCHAR(36) NOT NULL,
  buyer_user_id VARCHAR(36) NOT NULL,
  vendor_id VARCHAR(36) NOT NULL,
  out_trade_no VARCHAR(64) NOT NULL,
  amount_cents INT NOT NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'CNY',
  platform_commission_cents INT NOT NULL DEFAULT 0,
  vendor_receivable_cents INT NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  transaction_id VARCHAR(128) NULL,
  paid_at DATETIME NULL,
  download_code_ciphertext TEXT NULL,
  download_code_iv VARCHAR(64) NULL,
  download_code_auth_tag VARCHAR(64) NULL,
  download_code_hash CHAR(64) NULL,
  download_code_prefix VARCHAR(32) NULL,
  download_code_issued_at DATETIME NULL,
  download_code_expires_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uniq_owlix_marketplace_order_out_trade_no (out_trade_no),
  KEY idx_owlix_marketplace_order_buyer (buyer_user_id, created_at),
  KEY idx_owlix_marketplace_order_vendor (vendor_id, created_at),
  KEY idx_owlix_marketplace_order_listing (listing_id, created_at),
  CONSTRAINT fk_owlix_marketplace_order_listing FOREIGN KEY (listing_id) REFERENCES owlix_marketplace_listings(id) ON DELETE RESTRICT,
  CONSTRAINT fk_owlix_marketplace_order_buyer FOREIGN KEY (buyer_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_owlix_marketplace_order_vendor FOREIGN KEY (vendor_id) REFERENCES owlix_marketplace_vendor_profiles(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS owlix_marketplace_settlements (
  id VARCHAR(36) PRIMARY KEY,
  vendor_id VARCHAR(36) NOT NULL,
  order_id VARCHAR(36) NOT NULL,
  amount_cents INT NOT NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'CNY',
  platform_commission_cents INT NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  payout_account_snapshot_json JSON NULL,
  payout_transaction_id VARCHAR(128) NULL,
  paid_at DATETIME NULL,
  failure_reason VARCHAR(500) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uniq_owlix_marketplace_settlement_order (order_id),
  KEY idx_owlix_marketplace_settlement_vendor_status (vendor_id, status, created_at),
  CONSTRAINT fk_owlix_marketplace_settlement_vendor FOREIGN KEY (vendor_id) REFERENCES owlix_marketplace_vendor_profiles(id) ON DELETE RESTRICT,
  CONSTRAINT fk_owlix_marketplace_settlement_order FOREIGN KEY (order_id) REFERENCES owlix_marketplace_orders(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE owlix_marketplace_settlements
  ADD COLUMN payout_transaction_id VARCHAR(128) NULL AFTER payout_account_snapshot_json;

CREATE TABLE IF NOT EXISTS owlix_marketplace_download_redemptions (
  id VARCHAR(36) PRIMARY KEY,
  order_id VARCHAR(36) NOT NULL,
  listing_id VARCHAR(36) NOT NULL,
  buyer_user_id VARCHAR(36) NOT NULL,
  download_code_hash CHAR(64) NOT NULL,
  requester_ip VARCHAR(64) NULL,
  user_agent VARCHAR(512) NULL,
  redeemed_at DATETIME NOT NULL,
  KEY idx_owlix_marketplace_redemption_order (order_id, redeemed_at),
  KEY idx_owlix_marketplace_redemption_buyer (buyer_user_id, redeemed_at),
  CONSTRAINT fk_owlix_marketplace_redemption_order FOREIGN KEY (order_id) REFERENCES owlix_marketplace_orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_owlix_marketplace_redemption_listing FOREIGN KEY (listing_id) REFERENCES owlix_marketplace_listings(id) ON DELETE CASCADE,
  CONSTRAINT fk_owlix_marketplace_redemption_buyer FOREIGN KEY (buyer_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS datasheet_record_watchers (
  datasheet_id VARCHAR(128) NOT NULL,
  record_id VARCHAR(128) NOT NULL,
  user_id VARCHAR(128) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (datasheet_id, record_id, user_id),
  KEY idx_datasheet_record_watchers_user (datasheet_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
