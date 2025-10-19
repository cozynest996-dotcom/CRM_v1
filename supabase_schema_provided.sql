-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.admin_actions (
  id integer NOT NULL DEFAULT nextval('admin_actions_id_seq'::regclass),
  admin_email character varying NOT NULL,
  action_type character varying NOT NULL,
  target_user_id integer NOT NULL,
  old_value text,
  new_value text,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT admin_actions_pkey PRIMARY KEY (id)
);
CREATE TABLE public.ai_analyses (
  id integer NOT NULL DEFAULT nextval('ai_analyses_id_seq'::regclass),
  customer_id uuid NOT NULL,
  message_id uuid,
  analysis_type character varying NOT NULL,
  input_data json NOT NULL,
  output_data json NOT NULL,
  confidence double precision,
  model_used character varying,
  handoff_triggered boolean,
  handoff_reason text,
  processing_time double precision,
  created_at timestamp with time zone DEFAULT now(),
  user_id integer NOT NULL,
  CONSTRAINT ai_analyses_pkey PRIMARY KEY (id),
  CONSTRAINT ai_analyses_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id),
  CONSTRAINT ai_analyses_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id),
  CONSTRAINT ai_analyses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.ai_prompts (
  id uuid NOT NULL,
  user_id integer NOT NULL,
  name character varying NOT NULL,
  description text,
  system_prompt text,
  user_prompt text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT ai_prompts_pkey PRIMARY KEY (id),
  CONSTRAINT ai_prompts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.alembic_version (
  version_num character varying NOT NULL,
  CONSTRAINT alembic_version_pkey PRIMARY KEY (version_num)
);
CREATE TABLE public.audit_logs (
  id integer NOT NULL DEFAULT nextval('audit_logs_id_seq'::regclass),
  entity_type character varying NOT NULL,
  entity_id uuid NOT NULL,
  action character varying NOT NULL,
  old_values json,
  new_values json,
  user_id integer,
  source character varying,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT audit_logs_pkey PRIMARY KEY (id),
  CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.custom_entity_records (
  id integer NOT NULL DEFAULT nextval('custom_entity_records_id_seq'::regclass),
  user_id integer NOT NULL,
  entity_type_id integer NOT NULL,
  data json,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT custom_entity_records_pkey PRIMARY KEY (id),
  CONSTRAINT custom_entity_records_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT custom_entity_records_entity_type_id_fkey FOREIGN KEY (entity_type_id) REFERENCES public.custom_entity_types(id)
);
CREATE TABLE public.custom_entity_types (
  id integer NOT NULL DEFAULT nextval('custom_entity_types_id_seq'::regclass),
  user_id integer NOT NULL,
  name character varying NOT NULL,
  description text,
  icon character varying,
  is_active boolean NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT custom_entity_types_pkey PRIMARY KEY (id),
  CONSTRAINT custom_entity_types_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.custom_fields (
  id integer NOT NULL DEFAULT nextval('custom_fields_id_seq'::regclass),
  entity_type_id integer NOT NULL,
  name character varying NOT NULL,
  field_key character varying NOT NULL,
  field_type character varying NOT NULL,
  is_required boolean,
  default_value text,
  is_searchable boolean NOT NULL,
  options json,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  reference_entity_type_id integer,
  CONSTRAINT custom_fields_pkey PRIMARY KEY (id),
  CONSTRAINT custom_fields_entity_type_id_fkey FOREIGN KEY (entity_type_id) REFERENCES public.custom_entity_types(id),
  CONSTRAINT custom_fields_reference_entity_type_id_fkey FOREIGN KEY (reference_entity_type_id) REFERENCES public.custom_entity_types(id)
);
CREATE TABLE public.customer_stages (
  id integer NOT NULL DEFAULT nextval('customer_stages_id_seq'::regclass),
  name character varying NOT NULL,
  description text,
  color character varying,
  order_index integer,
  is_default boolean,
  card_display_fields json,
  user_id integer NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT customer_stages_pkey PRIMARY KEY (id),
  CONSTRAINT customer_stages_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.customers (
  id uuid NOT NULL,
  name text,
  phone text,
  email text,
  status text,
  custom_fields json,
  photo_url character varying,
  last_message character varying,
  last_timestamp timestamp with time zone,
  unread_count integer,
  stage_id integer,
  updated_at timestamp with time zone DEFAULT now(),
  version bigint,
  user_id integer NOT NULL,
  telegram_chat_id text,
  CONSTRAINT customers_pkey PRIMARY KEY (id),
  CONSTRAINT customers_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.customer_stages(id),
  CONSTRAINT customers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.knowledge_bases (
  id uuid NOT NULL,
  user_id integer NOT NULL,
  name character varying NOT NULL,
  description text,
  category character varying,
  content text NOT NULL,
  tags json,
  is_active boolean,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT knowledge_bases_pkey PRIMARY KEY (id),
  CONSTRAINT knowledge_bases_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.media_files (
  id uuid NOT NULL,
  user_id integer NOT NULL,
  filename character varying NOT NULL,
  filepath character varying NOT NULL UNIQUE,
  file_url character varying,
  file_type character varying,
  folder character varying,
  size integer,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT media_files_pkey PRIMARY KEY (id),
  CONSTRAINT media_files_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.messages (
  id uuid NOT NULL,
  content text NOT NULL,
  direction character varying NOT NULL,
  whatsapp_id character varying,
  timestamp timestamp with time zone DEFAULT now(),
  ack integer,
  customer_id uuid NOT NULL,
  user_id integer NOT NULL,
  channel character varying,
  telegram_message_id character varying,
  CONSTRAINT messages_pkey PRIMARY KEY (id),
  CONSTRAINT messages_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id),
  CONSTRAINT messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.settings (
  id integer NOT NULL DEFAULT nextval('settings_id_seq'::regclass),
  key character varying NOT NULL UNIQUE,
  value text,
  description character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  user_id integer NOT NULL,
  CONSTRAINT settings_pkey PRIMARY KEY (id),
  CONSTRAINT settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.subscription_plans (
  id integer NOT NULL DEFAULT nextval('subscription_plans_id_seq'::regclass),
  name character varying NOT NULL UNIQUE,
  display_name character varying NOT NULL,
  price double precision,
  max_customers integer,
  max_messages_per_month integer,
  is_active boolean,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT subscription_plans_pkey PRIMARY KEY (id)
);
CREATE TABLE public.telegram_codes (
  id integer NOT NULL DEFAULT nextval('telegram_codes_id_seq'::regclass),
  user_id integer NOT NULL,
  phone_code_hash character varying,
  sent_at timestamp with time zone DEFAULT now(),
  CONSTRAINT telegram_codes_pkey PRIMARY KEY (id),
  CONSTRAINT telegram_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.telegram_sessions (
  id integer NOT NULL DEFAULT nextval('telegram_sessions_id_seq'::regclass),
  user_id integer NOT NULL,
  session_key character varying NOT NULL UNIQUE,
  connected boolean,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT telegram_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT telegram_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.users (
  id integer NOT NULL DEFAULT nextval('users_id_seq'::regclass),
  email character varying NOT NULL,
  name character varying,
  avatar_url character varying,
  google_id character varying,
  subscription_plan_id integer,
  subscription_status character varying,
  activated_by_admin boolean,
  admin_notes text,
  last_login_at timestamp with time zone,
  trial_ends_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_subscription_plan_id_fkey FOREIGN KEY (subscription_plan_id) REFERENCES public.subscription_plans(id)
);
CREATE TABLE public.whatsapp_sessions (
  id integer NOT NULL DEFAULT nextval('whatsapp_sessions_id_seq'::regclass),
  user_id integer NOT NULL,
  session_key character varying NOT NULL UNIQUE,
  qr text,
  connected boolean,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT whatsapp_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT whatsapp_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.workflow_executions (
  id integer NOT NULL DEFAULT nextval('workflow_executions_id_seq'::regclass),
  workflow_id integer NOT NULL,
  status character varying NOT NULL,
  triggered_by character varying NOT NULL,
  execution_data json,
  started_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  error_message text,
  user_id integer,
  CONSTRAINT workflow_executions_pkey PRIMARY KEY (id),
  CONSTRAINT workflow_executions_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflows(id),
  CONSTRAINT workflow_executions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.workflow_node_templates (
  id integer NOT NULL DEFAULT nextval('workflow_node_templates_id_seq'::regclass),
  node_type character varying NOT NULL,
  name character varying NOT NULL,
  description text,
  input_schema json NOT NULL,
  output_schema json NOT NULL,
  default_config json NOT NULL,
  is_system boolean,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT workflow_node_templates_pkey PRIMARY KEY (id)
);
CREATE TABLE public.workflow_step_executions (
  id integer NOT NULL DEFAULT nextval('workflow_step_executions_id_seq'::regclass),
  execution_id integer NOT NULL,
  node_id character varying NOT NULL,
  node_type character varying NOT NULL,
  status character varying NOT NULL,
  branch_taken character varying,
  input_data json,
  output_data json,
  error_message text,
  started_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  duration_ms integer,
  CONSTRAINT workflow_step_executions_pkey PRIMARY KEY (id),
  CONSTRAINT workflow_step_executions_execution_id_fkey FOREIGN KEY (execution_id) REFERENCES public.workflow_executions(id)
);
CREATE TABLE public.workflows (
  id integer NOT NULL DEFAULT nextval('workflows_id_seq'::regclass),
  name character varying NOT NULL,
  description text,
  nodes json NOT NULL,
  edges json NOT NULL,
  is_active boolean,
  is_deleted boolean,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  user_id integer,
  CONSTRAINT workflows_pkey PRIMARY KEY (id),
  CONSTRAINT workflows_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
