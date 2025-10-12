
CREATE TABLE admin_actions (
	id INTEGER NOT NULL, 
	admin_email VARCHAR NOT NULL, 
	action_type VARCHAR NOT NULL, 
	target_user_id INTEGER NOT NULL, 
	old_value TEXT, 
	new_value TEXT, 
	notes TEXT, 
	created_at DATETIME, 
	PRIMARY KEY (id)
)




CREATE TABLE subscription_plans (
	id INTEGER NOT NULL, 
	name VARCHAR NOT NULL, 
	display_name VARCHAR NOT NULL, 
	price FLOAT, 
	max_customers INTEGER, 
	max_messages_per_month INTEGER, 
	is_active BOOLEAN, 
	created_at DATETIME, 
	PRIMARY KEY (id), 
	UNIQUE (name)
)




CREATE TABLE workflow_node_templates (
	id INTEGER NOT NULL, 
	node_type VARCHAR NOT NULL, 
	name VARCHAR NOT NULL, 
	description TEXT, 
	input_schema JSON NOT NULL, 
	output_schema JSON NOT NULL, 
	default_config JSON NOT NULL, 
	is_system BOOLEAN, 
	created_at DATETIME, 
	PRIMARY KEY (id)
)




CREATE TABLE users (
	id INTEGER NOT NULL, 
	email VARCHAR NOT NULL, 
	name VARCHAR, 
	avatar_url VARCHAR, 
	google_id VARCHAR, 
	subscription_plan_id INTEGER, 
	subscription_status VARCHAR, 
	activated_by_admin BOOLEAN, 
	admin_notes TEXT, 
	last_login_at DATETIME, 
	trial_ends_at DATETIME, 
	created_at DATETIME, 
	updated_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(subscription_plan_id) REFERENCES subscription_plans (id)
)



ALTER TABLE users ADD FOREIGN KEY(subscription_plan_id) REFERENCES subscription_plans (id)


CREATE TABLE audit_logs (
	id INTEGER NOT NULL, 
	entity_type VARCHAR NOT NULL, 
	entity_id VARCHAR NOT NULL, 
	action VARCHAR NOT NULL, 
	old_values JSON, 
	new_values JSON, 
	user_id INTEGER, 
	source VARCHAR, 
	created_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id)
)



ALTER TABLE audit_logs ADD FOREIGN KEY(user_id) REFERENCES users (id)


CREATE TABLE custom_entity_types (
	id INTEGER NOT NULL, 
	user_id INTEGER NOT NULL, 
	name VARCHAR(100) NOT NULL, 
	description TEXT, 
	is_active BOOLEAN, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
	updated_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id)
)



ALTER TABLE custom_entity_types ADD FOREIGN KEY(user_id) REFERENCES users (id)


CREATE TABLE customer_stages (
	id INTEGER NOT NULL, 
	name VARCHAR NOT NULL, 
	description TEXT, 
	color VARCHAR, 
	order_index INTEGER, 
	is_default BOOLEAN, 
	card_display_fields JSON, 
	user_id INTEGER NOT NULL, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id)
)



ALTER TABLE customer_stages ADD FOREIGN KEY(user_id) REFERENCES users (id)


CREATE TABLE settings (
	id INTEGER NOT NULL, 
	"key" VARCHAR NOT NULL, 
	value TEXT, 
	description VARCHAR, 
	created_at DATETIME, 
	updated_at DATETIME, 
	user_id INTEGER NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id), 
	UNIQUE ("key")
)



ALTER TABLE settings ADD FOREIGN KEY(user_id) REFERENCES users (id)


CREATE TABLE telegram_codes (
	id INTEGER NOT NULL, 
	user_id INTEGER NOT NULL, 
	phone_code_hash VARCHAR, 
	sent_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id)
)



ALTER TABLE telegram_codes ADD FOREIGN KEY(user_id) REFERENCES users (id)


CREATE TABLE telegram_sessions (
	id INTEGER NOT NULL, 
	user_id INTEGER NOT NULL, 
	session_key VARCHAR NOT NULL, 
	connected BOOLEAN, 
	created_at DATETIME, 
	updated_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id), 
	UNIQUE (session_key)
)



ALTER TABLE telegram_sessions ADD FOREIGN KEY(user_id) REFERENCES users (id)


CREATE TABLE whatsapp_sessions (
	id INTEGER NOT NULL, 
	user_id INTEGER NOT NULL, 
	session_key VARCHAR NOT NULL, 
	qr TEXT, 
	connected BOOLEAN, 
	created_at DATETIME, 
	updated_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id), 
	UNIQUE (session_key)
)



ALTER TABLE whatsapp_sessions ADD FOREIGN KEY(user_id) REFERENCES users (id)


CREATE TABLE workflows (
	id INTEGER NOT NULL, 
	name VARCHAR NOT NULL, 
	description TEXT, 
	nodes JSON NOT NULL, 
	edges JSON NOT NULL, 
	is_active BOOLEAN, 
	is_deleted BOOLEAN, 
	created_at DATETIME, 
	updated_at DATETIME, 
	user_id INTEGER, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id)
)



ALTER TABLE workflows ADD FOREIGN KEY(user_id) REFERENCES users (id)


CREATE TABLE custom_entity_records (
	id INTEGER NOT NULL, 
	user_id INTEGER NOT NULL, 
	entity_type_id INTEGER NOT NULL, 
	data TEXT NOT NULL, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id), 
	FOREIGN KEY(entity_type_id) REFERENCES custom_entity_types (id)
)



ALTER TABLE custom_entity_records ADD FOREIGN KEY(user_id) REFERENCES users (id)

ALTER TABLE custom_entity_records ADD FOREIGN KEY(entity_type_id) REFERENCES custom_entity_types (id)


CREATE TABLE custom_fields (
	id INTEGER NOT NULL, 
	entity_type_id INTEGER NOT NULL, 
	name VARCHAR(100) NOT NULL, 
	field_key VARCHAR(100) NOT NULL, 
	field_type VARCHAR(50) NOT NULL, 
	is_required BOOLEAN, 
	default_value TEXT, 
	is_searchable BOOLEAN, 
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
	PRIMARY KEY (id), 
	FOREIGN KEY(entity_type_id) REFERENCES custom_entity_types (id), 
	UNIQUE (field_key)
)



ALTER TABLE custom_fields ADD FOREIGN KEY(entity_type_id) REFERENCES custom_entity_types (id)


CREATE TABLE customers (
	id VARCHAR NOT NULL, 
	name TEXT, 
	phone TEXT, 
	email TEXT, 
	status TEXT, 
	custom_fields JSON, 
	photo_url VARCHAR, 
	last_message VARCHAR, 
	last_timestamp DATETIME, 
	unread_count INTEGER, 
	stage_id INTEGER, 
	updated_at DATETIME, 
	version BIGINT, 
	user_id INTEGER NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(stage_id) REFERENCES customer_stages (id), 
	FOREIGN KEY(user_id) REFERENCES users (id)
)



ALTER TABLE customers ADD FOREIGN KEY(user_id) REFERENCES users (id)

ALTER TABLE customers ADD FOREIGN KEY(stage_id) REFERENCES customer_stages (id)


CREATE TABLE workflow_executions (
	id INTEGER NOT NULL, 
	workflow_id INTEGER NOT NULL, 
	status VARCHAR NOT NULL, 
	triggered_by VARCHAR NOT NULL, 
	execution_data JSON, 
	started_at DATETIME, 
	completed_at DATETIME, 
	error_message TEXT, 
	user_id INTEGER, 
	PRIMARY KEY (id), 
	FOREIGN KEY(workflow_id) REFERENCES workflows (id), 
	FOREIGN KEY(user_id) REFERENCES users (id)
)



ALTER TABLE workflow_executions ADD FOREIGN KEY(user_id) REFERENCES users (id)

ALTER TABLE workflow_executions ADD FOREIGN KEY(workflow_id) REFERENCES workflows (id)


CREATE TABLE messages (
	id VARCHAR NOT NULL, 
	content TEXT NOT NULL, 
	direction VARCHAR NOT NULL, 
	whatsapp_id VARCHAR, 
	timestamp DATETIME, 
	ack INTEGER, 
	customer_id VARCHAR NOT NULL, 
	user_id INTEGER NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(customer_id) REFERENCES customers (id), 
	FOREIGN KEY(user_id) REFERENCES users (id)
)



ALTER TABLE messages ADD FOREIGN KEY(user_id) REFERENCES users (id)

ALTER TABLE messages ADD FOREIGN KEY(customer_id) REFERENCES customers (id)


CREATE TABLE workflow_step_executions (
	id INTEGER NOT NULL, 
	execution_id INTEGER NOT NULL, 
	node_id VARCHAR NOT NULL, 
	node_type VARCHAR NOT NULL, 
	status VARCHAR NOT NULL, 
	branch_taken VARCHAR, 
	input_data JSON, 
	output_data JSON, 
	error_message TEXT, 
	started_at DATETIME, 
	completed_at DATETIME, 
	duration_ms INTEGER, 
	PRIMARY KEY (id), 
	FOREIGN KEY(execution_id) REFERENCES workflow_executions (id)
)



ALTER TABLE workflow_step_executions ADD FOREIGN KEY(execution_id) REFERENCES workflow_executions (id)


CREATE TABLE ai_analyses (
	id INTEGER NOT NULL, 
	customer_id VARCHAR NOT NULL, 
	message_id VARCHAR, 
	analysis_type VARCHAR NOT NULL, 
	input_data JSON NOT NULL, 
	output_data JSON NOT NULL, 
	confidence FLOAT, 
	model_used VARCHAR, 
	handoff_triggered BOOLEAN, 
	handoff_reason TEXT, 
	processing_time FLOAT, 
	created_at DATETIME, 
	user_id INTEGER NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(customer_id) REFERENCES customers (id), 
	FOREIGN KEY(message_id) REFERENCES messages (id), 
	FOREIGN KEY(user_id) REFERENCES users (id)
)



ALTER TABLE ai_analyses ADD FOREIGN KEY(message_id) REFERENCES messages (id)

ALTER TABLE ai_analyses ADD FOREIGN KEY(customer_id) REFERENCES customers (id)

ALTER TABLE ai_analyses ADD FOREIGN KEY(user_id) REFERENCES users (id)