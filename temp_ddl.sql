CREATE TABLE admin_actions (
	id SERIAL PRIMARY KEY, 
	admin_email VARCHAR NOT NULL, 
	action_type VARCHAR NOT NULL, 
	target_user_id INTEGER NOT NULL, 
	old_value TEXT, 
	new_value TEXT, 
	notes TEXT, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE subscription_plans (
	id SERIAL PRIMARY KEY, 
	name VARCHAR NOT NULL UNIQUE, 
	display_name VARCHAR NOT NULL, 
	price REAL DEFAULT 0.0, 
	max_customers INTEGER, 
	max_messages_per_month INTEGER, 
	is_active BOOLEAN DEFAULT TRUE, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE workflow_node_templates (
	id SERIAL PRIMARY KEY, 
	node_type VARCHAR NOT NULL, 
	name VARCHAR NOT NULL, 
	description TEXT, 
	input_schema JSONB NOT NULL, 
	output_schema JSONB NOT NULL, 
	default_config JSONB NOT NULL, 
	is_system BOOLEAN DEFAULT FALSE, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE users (
	id SERIAL PRIMARY KEY, 
	email VARCHAR NOT NULL UNIQUE, 
	name VARCHAR, 
	avatar_url VARCHAR, 
	google_id VARCHAR, 
	subscription_plan_id INTEGER,
	subscription_status VARCHAR DEFAULT 'active', 
	activated_by_admin BOOLEAN DEFAULT FALSE, 
	admin_notes TEXT, 
	last_login_at TIMESTAMP WITH TIME ZONE, 
	trial_ends_at TIMESTAMP WITH TIME ZONE, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE users ADD CONSTRAINT fk_users_subscription_plan_id FOREIGN KEY(subscription_plan_id) REFERENCES subscription_plans (id);


CREATE TABLE audit_logs (
	id SERIAL PRIMARY KEY, 
	entity_type VARCHAR NOT NULL, 
	entity_id VARCHAR NOT NULL, 
	action VARCHAR NOT NULL, 
	old_values JSONB, 
	new_values JSONB, 
	user_id INTEGER, 
	source VARCHAR, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE audit_logs ADD CONSTRAINT fk_audit_logs_user_id FOREIGN KEY(user_id) REFERENCES users (id);


CREATE TABLE custom_entity_types (
	id SERIAL PRIMARY KEY, 
	user_id INTEGER NOT NULL, 
	name VARCHAR(100) NOT NULL, 
	description TEXT, 
	is_active BOOLEAN DEFAULT TRUE, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, 
	UNIQUE (user_id, name)
);

ALTER TABLE custom_entity_types ADD CONSTRAINT fk_custom_entity_types_user_id FOREIGN KEY(user_id) REFERENCES users (id);


CREATE TABLE customer_stages (
	id SERIAL PRIMARY KEY, 
	name VARCHAR NOT NULL, 
	description TEXT, 
	color VARCHAR DEFAULT '#3B82F6', 
	order_index INTEGER DEFAULT 0, 
	is_default BOOLEAN DEFAULT FALSE, 
	card_display_fields JSONB DEFAULT '["name", "phone", "email"]'::jsonb, 
	user_id INTEGER NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE customer_stages ADD CONSTRAINT fk_customer_stages_user_id FOREIGN KEY(user_id) REFERENCES users (id);


CREATE TABLE settings (
	id SERIAL PRIMARY KEY, 
	"key" VARCHAR NOT NULL UNIQUE, 
	value TEXT, 
	description VARCHAR, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, 
	user_id INTEGER NOT NULL
);

ALTER TABLE settings ADD CONSTRAINT fk_settings_user_id FOREIGN KEY(user_id) REFERENCES users (id);


CREATE TABLE telegram_codes (
	id SERIAL PRIMARY KEY, 
	user_id INTEGER NOT NULL, 
	phone_code_hash VARCHAR, 
	sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE telegram_codes ADD CONSTRAINT fk_telegram_codes_user_id FOREIGN KEY(user_id) REFERENCES users (id);


CREATE TABLE telegram_sessions (
	id SERIAL PRIMARY KEY, 
	user_id INTEGER NOT NULL, 
	session_key VARCHAR NOT NULL UNIQUE, 
	connected BOOLEAN DEFAULT FALSE, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE telegram_sessions ADD CONSTRAINT fk_telegram_sessions_user_id FOREIGN KEY(user_id) REFERENCES users (id);


CREATE TABLE whatsapp_sessions (
	id SERIAL PRIMARY KEY, 
	user_id INTEGER NOT NULL, 
	session_key VARCHAR NOT NULL UNIQUE, 
	qr TEXT, 
	connected BOOLEAN DEFAULT FALSE, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE whatsapp_sessions ADD CONSTRAINT fk_whatsapp_sessions_user_id FOREIGN KEY(user_id) REFERENCES users (id);


CREATE TABLE workflows (
	id SERIAL PRIMARY KEY, 
	name VARCHAR NOT NULL, 
	description TEXT, 
	nodes JSONB NOT NULL, 
	edges JSONB NOT NULL, 
	is_active BOOLEAN DEFAULT FALSE, 
	is_deleted BOOLEAN DEFAULT FALSE, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, 
	user_id INTEGER
);

ALTER TABLE workflows ADD CONSTRAINT fk_workflows_user_id FOREIGN KEY(user_id) REFERENCES users (id);


CREATE TABLE custom_entity_records (
	id SERIAL PRIMARY KEY, 
	user_id INTEGER NOT NULL, 
	entity_type_id INTEGER NOT NULL, 
	data JSONB NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE custom_entity_records ADD CONSTRAINT fk_custom_entity_records_user_id FOREIGN KEY(user_id) REFERENCES users (id);
ALTER TABLE custom_entity_records ADD CONSTRAINT fk_custom_entity_records_entity_type_id FOREIGN KEY(entity_type_id) REFERENCES custom_entity_types (id);


CREATE TABLE custom_fields (
	id SERIAL PRIMARY KEY, 
	entity_type_id INTEGER NOT NULL, 
	name VARCHAR(100) NOT NULL, 
	field_key VARCHAR(100) NOT NULL UNIQUE, 
	field_type VARCHAR(50) NOT NULL, 
	is_required BOOLEAN DEFAULT FALSE, 
	default_value TEXT, 
	is_searchable BOOLEAN DEFAULT FALSE, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE custom_fields ADD CONSTRAINT fk_custom_fields_entity_type_id FOREIGN KEY(entity_type_id) REFERENCES custom_entity_types (id);


CREATE TABLE customers (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
	name TEXT, 
	phone TEXT, 
	email TEXT, 
	status TEXT, 
	custom_fields JSONB DEFAULT '{}'::jsonb, 
	photo_url VARCHAR, 
	last_message VARCHAR, 
	last_timestamp TIMESTAMP WITH TIME ZONE, 
	unread_count INTEGER DEFAULT 0, 
	stage_id INTEGER, 
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, 
	version BIGINT DEFAULT 0, 
	user_id INTEGER NOT NULL
);

ALTER TABLE customers ADD CONSTRAINT fk_customers_user_id FOREIGN KEY(user_id) REFERENCES users (id);
ALTER TABLE customers ADD CONSTRAINT fk_customers_stage_id FOREIGN KEY(stage_id) REFERENCES customer_stages (id);


CREATE TABLE workflow_executions (
	id SERIAL PRIMARY KEY, 
	workflow_id INTEGER NOT NULL, 
	status VARCHAR NOT NULL, 
	triggered_by VARCHAR NOT NULL, 
	execution_data JSONB, 
	started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, 
	completed_at TIMESTAMP WITH TIME ZONE, 
	error_message TEXT, 
	user_id INTEGER
);

ALTER TABLE workflow_executions ADD CONSTRAINT fk_workflow_executions_user_id FOREIGN KEY(user_id) REFERENCES users (id);
ALTER TABLE workflow_executions ADD CONSTRAINT fk_workflow_executions_workflow_id FOREIGN KEY(workflow_id) REFERENCES workflows (id);


CREATE TABLE messages (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
	content TEXT NOT NULL, 
	direction VARCHAR NOT NULL, 
	whatsapp_id VARCHAR, 
	timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, 
	ack INTEGER DEFAULT 0, 
	customer_id UUID NOT NULL, 
	user_id INTEGER NOT NULL
);

ALTER TABLE messages ADD CONSTRAINT fk_messages_user_id FOREIGN KEY(user_id) REFERENCES users (id);
ALTER TABLE messages ADD CONSTRAINT fk_messages_customer_id FOREIGN KEY(customer_id) REFERENCES customers (id);


CREATE TABLE workflow_step_executions (
	id SERIAL PRIMARY KEY, 
	execution_id INTEGER NOT NULL, 
	node_id VARCHAR NOT NULL, 
	node_type VARCHAR NOT NULL, 
	status VARCHAR NOT NULL, 
	branch_taken VARCHAR, 
	input_data JSONB, 
	output_data JSONB, 
	error_message TEXT, 
	started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, 
	completed_at TIMESTAMP WITH TIME ZONE, 
	duration_ms INTEGER
);

ALTER TABLE workflow_step_executions ADD CONSTRAINT fk_workflow_step_executions_execution_id FOREIGN KEY(execution_id) REFERENCES workflow_executions (id);


CREATE TABLE ai_analyses (
	id SERIAL PRIMARY KEY, 
	customer_id UUID NOT NULL, 
	message_id UUID, 
	analysis_type VARCHAR NOT NULL, 
	input_data JSONB NOT NULL, 
	output_data JSONB NOT NULL, 
	confidence REAL, 
	model_used VARCHAR, 
	handoff_triggered BOOLEAN DEFAULT FALSE, 
	handoff_reason TEXT, 
	processing_time REAL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, 
	user_id INTEGER NOT NULL
);

ALTER TABLE ai_analyses ADD CONSTRAINT fk_ai_analyses_message_id FOREIGN KEY(message_id) REFERENCES messages (id);
ALTER TABLE ai_analyses ADD CONSTRAINT fk_ai_analyses_customer_id FOREIGN KEY(customer_id) REFERENCES customers (id);
ALTER TABLE ai_analyses ADD CONSTRAINT fk_ai_analyses_user_id FOREIGN KEY(user_id) REFERENCES users (id);
