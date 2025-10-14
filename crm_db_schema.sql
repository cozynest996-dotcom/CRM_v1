;
CREATE TABLE public.admin_actions (
;
CREATE SEQUENCE public.admin_actions_id_seq
;
ALTER SEQUENCE public.admin_actions_id_seq OWNED BY public.admin_actions.id
;
CREATE TABLE public.ai_analyses (
;
CREATE SEQUENCE public.ai_analyses_id_seq
;
ALTER SEQUENCE public.ai_analyses_id_seq OWNED BY public.ai_analyses.id
;
CREATE TABLE public.audit_logs (
;
CREATE SEQUENCE public.audit_logs_id_seq
;
ALTER SEQUENCE public.audit_logs_id_seq OWNED BY public.audit_logs.id
;
CREATE TABLE public.custom_entity_records (
;
CREATE SEQUENCE public.custom_entity_records_id_seq
;
ALTER SEQUENCE public.custom_entity_records_id_seq OWNED BY public.custom_entity_records.id
;
CREATE TABLE public.custom_entity_types (
;
CREATE SEQUENCE public.custom_entity_types_id_seq
;
ALTER SEQUENCE public.custom_entity_types_id_seq OWNED BY public.custom_entity_types.id
;
CREATE TABLE public.custom_fields (
;
CREATE SEQUENCE public.custom_fields_id_seq
;
ALTER SEQUENCE public.custom_fields_id_seq OWNED BY public.custom_fields.id
;
CREATE TABLE public.customer_stages (
;
CREATE SEQUENCE public.customer_stages_id_seq
;
ALTER SEQUENCE public.customer_stages_id_seq OWNED BY public.customer_stages.id
;
CREATE TABLE public.customers (
;
CREATE TABLE public.messages (
;
CREATE TABLE public.settings (
;
CREATE SEQUENCE public.settings_id_seq
;
ALTER SEQUENCE public.settings_id_seq OWNED BY public.settings.id
;
CREATE TABLE public.subscription_plans (
;
CREATE SEQUENCE public.subscription_plans_id_seq
;
ALTER SEQUENCE public.subscription_plans_id_seq OWNED BY public.subscription_plans.id
;
CREATE TABLE public.telegram_codes (
;
CREATE SEQUENCE public.telegram_codes_id_seq
;
ALTER SEQUENCE public.telegram_codes_id_seq OWNED BY public.telegram_codes.id
;
CREATE TABLE public.telegram_sessions (
;
CREATE SEQUENCE public.telegram_sessions_id_seq
;
ALTER SEQUENCE public.telegram_sessions_id_seq OWNED BY public.telegram_sessions.id
;
CREATE TABLE public.users (
;
CREATE SEQUENCE public.users_id_seq
;
ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id
;
CREATE TABLE public.whatsapp_sessions (
;
CREATE SEQUENCE public.whatsapp_sessions_id_seq
;
ALTER SEQUENCE public.whatsapp_sessions_id_seq OWNED BY public.whatsapp_sessions.id
;
CREATE TABLE public.workflow_executions (
;
CREATE SEQUENCE public.workflow_executions_id_seq
;
ALTER SEQUENCE public.workflow_executions_id_seq OWNED BY public.workflow_executions.id
;
CREATE TABLE public.workflow_node_templates (
;
CREATE SEQUENCE public.workflow_node_templates_id_seq
;
ALTER SEQUENCE public.workflow_node_templates_id_seq OWNED BY public.workflow_node_templates.id
;
CREATE TABLE public.workflow_step_executions (
;
CREATE SEQUENCE public.workflow_step_executions_id_seq
;
ALTER SEQUENCE public.workflow_step_executions_id_seq OWNED BY public.workflow_step_executions.id
;
CREATE TABLE public.workflows (
;
CREATE SEQUENCE public.workflows_id_seq
;
ALTER SEQUENCE public.workflows_id_seq OWNED BY public.workflows.id
;
ALTER TABLE ONLY public.admin_actions ALTER COLUMN id SET DEFAULT nextval('public.admin_actions_id_seq'::regclass)
;
ALTER TABLE ONLY public.ai_analyses ALTER COLUMN id SET DEFAULT nextval('public.ai_analyses_id_seq'::regclass)
;
ALTER TABLE ONLY public.audit_logs ALTER COLUMN id SET DEFAULT nextval('public.audit_logs_id_seq'::regclass)
;
ALTER TABLE ONLY public.custom_entity_records ALTER COLUMN id SET DEFAULT nextval('public.custom_entity_records_id_seq'::regclass)
;
ALTER TABLE ONLY public.custom_entity_types ALTER COLUMN id SET DEFAULT nextval('public.custom_entity_types_id_seq'::regclass)
;
ALTER TABLE ONLY public.custom_fields ALTER COLUMN id SET DEFAULT nextval('public.custom_fields_id_seq'::regclass)
;
ALTER TABLE ONLY public.customer_stages ALTER COLUMN id SET DEFAULT nextval('public.customer_stages_id_seq'::regclass)
;
ALTER TABLE ONLY public.settings ALTER COLUMN id SET DEFAULT nextval('public.settings_id_seq'::regclass)
;
ALTER TABLE ONLY public.subscription_plans ALTER COLUMN id SET DEFAULT nextval('public.subscription_plans_id_seq'::regclass)
;
ALTER TABLE ONLY public.telegram_codes ALTER COLUMN id SET DEFAULT nextval('public.telegram_codes_id_seq'::regclass)
;
ALTER TABLE ONLY public.telegram_sessions ALTER COLUMN id SET DEFAULT nextval('public.telegram_sessions_id_seq'::regclass)
;
ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass)
;
ALTER TABLE ONLY public.whatsapp_sessions ALTER COLUMN id SET DEFAULT nextval('public.whatsapp_sessions_id_seq'::regclass)
;
ALTER TABLE ONLY public.workflow_executions ALTER COLUMN id SET DEFAULT nextval('public.workflow_executions_id_seq'::regclass)
;
ALTER TABLE ONLY public.workflow_node_templates ALTER COLUMN id SET DEFAULT nextval('public.workflow_node_templates_id_seq'::regclass)
;
ALTER TABLE ONLY public.workflow_step_executions ALTER COLUMN id SET DEFAULT nextval('public.workflow_step_executions_id_seq'::regclass)
;
ALTER TABLE ONLY public.workflows ALTER COLUMN id SET DEFAULT nextval('public.workflows_id_seq'::regclass)
;
ALTER TABLE ONLY public.admin_actions
;
ALTER TABLE ONLY public.ai_analyses
;
ALTER TABLE ONLY public.audit_logs
;
ALTER TABLE ONLY public.custom_entity_records
;
ALTER TABLE ONLY public.custom_entity_types
;
ALTER TABLE ONLY public.custom_fields
;
ALTER TABLE ONLY public.custom_fields
;
ALTER TABLE ONLY public.customer_stages
;
ALTER TABLE ONLY public.customers
;
ALTER TABLE ONLY public.messages
;
ALTER TABLE ONLY public.settings
;
ALTER TABLE ONLY public.settings
;
ALTER TABLE ONLY public.subscription_plans
;
ALTER TABLE ONLY public.subscription_plans
;
ALTER TABLE ONLY public.telegram_codes
;
ALTER TABLE ONLY public.telegram_sessions
;
ALTER TABLE ONLY public.telegram_sessions
;
ALTER TABLE ONLY public.users
;
ALTER TABLE ONLY public.whatsapp_sessions
;
ALTER TABLE ONLY public.whatsapp_sessions
;
ALTER TABLE ONLY public.workflow_executions
;
ALTER TABLE ONLY public.workflow_node_templates
;
ALTER TABLE ONLY public.workflow_step_executions
;
ALTER TABLE ONLY public.workflows
;
ALTER TABLE ONLY public.ai_analyses
;
ALTER TABLE ONLY public.ai_analyses
;
ALTER TABLE ONLY public.ai_analyses
;
ALTER TABLE ONLY public.audit_logs
;
ALTER TABLE ONLY public.custom_entity_records
;
ALTER TABLE ONLY public.custom_entity_records
;
ALTER TABLE ONLY public.custom_entity_types
;
ALTER TABLE ONLY public.custom_fields
;
ALTER TABLE ONLY public.customer_stages
;
ALTER TABLE ONLY public.customers
;
ALTER TABLE ONLY public.customers
;
ALTER TABLE ONLY public.messages
;
ALTER TABLE ONLY public.messages
;
ALTER TABLE ONLY public.settings
;
ALTER TABLE ONLY public.telegram_codes
;
ALTER TABLE ONLY public.telegram_sessions
;
ALTER TABLE ONLY public.users
;
ALTER TABLE ONLY public.whatsapp_sessions
;
ALTER TABLE ONLY public.workflow_executions
;
ALTER TABLE ONLY public.workflow_executions
;
ALTER TABLE ONLY public.workflow_step_executions
;
ALTER TABLE ONLY public.workflows

