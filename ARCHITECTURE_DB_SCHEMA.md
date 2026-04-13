# Database Schema Inventory

Generated from SQLAlchemy `Base` model declarations in `backend/app`.

## Shared Base Columns

- `id: Integer` primary key
- `created_at: DateTime(timezone=True)` with server default `now()`
- `updated_at: DateTime(timezone=True)` with server default `now()` and `onupdate=now()`

## app/accounting/models.py

### Table: `budgets` (`Budget`)

Source: `app/accounting/models.py`

- `account_id`: `Mapped[int]` = `mapped_column(
        Integer, ForeignKey("chart_of_accounts.id"), nullable=False
    )`
- `period`: `Mapped[str]` = `mapped_column(String(50), nullable=False)`
- `amount`: `Mapped[float]` = `mapped_column(Numeric(12, 2), nullable=False)`
- `actual_amount`: `Mapped[float]` = `mapped_column(Numeric(12, 2), default=0, nullable=False)`

### Table: `chart_of_accounts` (`ChartOfAccount`)

Source: `app/accounting/models.py`

- `code`: `Mapped[str]` = `mapped_column(String(50), unique=True, nullable=False)`
- `name`: `Mapped[str]` = `mapped_column(String(255), nullable=False)`
- `type`: `Mapped[str]` = `mapped_column(String(50), nullable=False)`
- `parent_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True
    )`
- `is_active`: `Mapped[bool]` = `mapped_column(Boolean, default=True, nullable=False)`

### Table: `gl_entries` (`GLEntry`)

Source: `app/accounting/models.py`

- `account_id`: `Mapped[int]` = `mapped_column(
        Integer, ForeignKey("chart_of_accounts.id"), nullable=False
    )`
- `date`: `Mapped[date]` = `mapped_column(Date, nullable=False)`
- `debit`: `Mapped[float]` = `mapped_column(Numeric(12, 2), default=0, nullable=False)`
- `credit`: `Mapped[float]` = `mapped_column(Numeric(12, 2), default=0, nullable=False)`
- `description`: `Mapped[str]` = `mapped_column(String(500), nullable=False)`
- `source_type`: `Mapped[str | None]` = `mapped_column(String(100), nullable=True)`
- `source_id`: `Mapped[int | None]` = `mapped_column(Integer, nullable=True)`

### Table: `invoices` (`Invoice`)

Source: `app/accounting/models.py`

- `vendor_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("vendors.id", ondelete="SET NULL"), nullable=True
    )`
- `invoice_number`: `Mapped[str]` = `mapped_column(String(100), nullable=False)`
- `date`: `Mapped[date]` = `mapped_column(Date, nullable=False)`
- `due_date`: `Mapped[date | None]` = `mapped_column(Date, nullable=True)`
- `total`: `Mapped[float]` = `mapped_column(Numeric(12, 2), nullable=False)`
- `status`: `Mapped[str]` = `mapped_column(String(20), default="pending", nullable=False)`
- `ocr_confidence`: `Mapped[float | None]` = `mapped_column(Float, nullable=True)`
- `raw_image_url`: `Mapped[str | None]` = `mapped_column(String(500), nullable=True)`
- `line_items_json`: `Mapped[dict | None]` = `mapped_column(JSON, nullable=True)`

### Table: `reconciliations` (`Reconciliation`)

Source: `app/accounting/models.py`

- `bank_transaction_id`: `Mapped[str]` = `mapped_column(String(255), nullable=False)`
- `gl_entry_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("gl_entries.id", ondelete="SET NULL"), nullable=True
    )`
- `status`: `Mapped[str]` = `mapped_column(String(20), default="unmatched", nullable=False)`
- `matched_at`: `Mapped[datetime | None]` = `mapped_column(DateTime(timezone=True), nullable=True)`

## app/auth/models.py

### Table: `restaurants` (`Restaurant`)

Source: `app/auth/models.py`

- `name`: `Mapped[str]` = `mapped_column(String(255), nullable=False)`
- `address`: `Mapped[str]` = `mapped_column(String(500), nullable=False)`
- `city`: `Mapped[str]` = `mapped_column(String(100), nullable=False)`
- `state`: `Mapped[str]` = `mapped_column(String(100), nullable=False)`
- `zip_code`: `Mapped[str]` = `mapped_column(String(20), nullable=False)`
- `phone`: `Mapped[str]` = `mapped_column(String(30), nullable=False)`
- `timezone`: `Mapped[str]` = `mapped_column(String(50), default="America/New_York", nullable=False)`
- `currency`: `Mapped[str]` = `mapped_column(String(10), default="USD", nullable=False)`
- `settings_json`: `Mapped[dict | None]` = `mapped_column(JSON, nullable=True)`
- `users`: `Mapped[list["User"]]` = `relationship(back_populates="restaurant")`

### Table: `users` (`User`)

Source: `app/auth/models.py`

- `email`: `Mapped[str]` = `mapped_column(String(255), unique=True, index=True, nullable=False)`
- `password_hash`: `Mapped[str]` = `mapped_column(String(255), nullable=False)`
- `full_name`: `Mapped[str]` = `mapped_column(String(255), nullable=False)`
- `role`: `Mapped[UserRole]` = `mapped_column(
        Enum(UserRole, name="user_role", native_enum=False),
        default=UserRole.staff,
        nullable=False,
        index=True,
    )`
- `is_active`: `Mapped[bool]` = `mapped_column(Boolean, default=True, nullable=False)`
- `restaurant_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True, index=True
    )`
- `restaurant`: `Mapped["Restaurant | None"]` = `relationship(back_populates="users")`

## app/billing/models.py

### Table: `bills` (`Bill`)

Source: `app/billing/models.py`

- `restaurant_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True
    )`
- `order_id`: `Mapped[int]` = `mapped_column(
        Integer, ForeignKey("table_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )`
- `bill_number`: `Mapped[str]` = `mapped_column(String(50), nullable=False)`
- `subtotal`: `Mapped[float]` = `mapped_column(Numeric(12, 2), nullable=False)`
- `tax_rate`: `Mapped[float]` = `mapped_column(Numeric(5, 3), default=0.10, nullable=False)`
- `tax_amount`: `Mapped[float]` = `mapped_column(Numeric(10, 2), nullable=False)`
- `service_charge`: `Mapped[float]` = `mapped_column(Numeric(10, 2), default=0, nullable=False)`
- `discount_amount`: `Mapped[float]` = `mapped_column(Numeric(10, 2), default=0, nullable=False)`
- `tip_amount`: `Mapped[float]` = `mapped_column(Numeric(10, 2), default=0, nullable=False)`
- `total`: `Mapped[float]` = `mapped_column(Numeric(12, 2), nullable=False)`
- `split_type`: `Mapped[str]` = `mapped_column(String(20), default="none", nullable=False)`
- `split_count`: `Mapped[int]` = `mapped_column(Integer, default=1, nullable=False)`
- `status`: `Mapped[str]` = `mapped_column(String(20), default="open", nullable=False)`
- `paid_at`: `Mapped[datetime | None]` = `mapped_column(DateTime(timezone=True), nullable=True)`
- `tip_suggestions_json`: `Mapped[dict | None]` = `mapped_column(JSON, nullable=True)`
- `receipt_email`: `Mapped[str | None]` = `mapped_column(String(255), nullable=True)`
- `receipt_phone`: `Mapped[str | None]` = `mapped_column(String(50), nullable=True)`
- `receipt_token`: `Mapped[str | None]` = `mapped_column(String(100), unique=True, nullable=True)`

### Table: `cash_shifts` (`CashShift`)

Source: `app/billing/models.py`

- `restaurant_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True
    )`
- `opened_by`: `Mapped[int]` = `mapped_column(
        Integer, ForeignKey("employees.id", ondelete="SET NULL"), nullable=False
    )`
- `closed_by`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("employees.id", ondelete="SET NULL"), nullable=True
    )`
- `opening_amount`: `Mapped[float]` = `mapped_column(Numeric(12, 2), nullable=False)`
- `closing_amount`: `Mapped[float | None]` = `mapped_column(Numeric(12, 2), nullable=True)`
- `expected_amount`: `Mapped[float | None]` = `mapped_column(Numeric(12, 2), nullable=True)`
- `variance`: `Mapped[float | None]` = `mapped_column(Numeric(12, 2), nullable=True)`
- `status`: `Mapped[str]` = `mapped_column(String(20), default="open", nullable=False)`
- `opened_at`: `Mapped[datetime]` = `mapped_column(
        DateTime(timezone=True), nullable=False
    )`
- `closed_at`: `Mapped[datetime | None]` = `mapped_column(
        DateTime(timezone=True), nullable=True
    )`
- `notes`: `Mapped[str | None]` = `mapped_column(String(500), nullable=True)`

### Table: `kds_station_configs` (`KDSStationConfig`)

Source: `app/billing/models.py`

- `restaurant_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True
    )`
- `name`: `Mapped[str]` = `mapped_column(String(50), nullable=False)`
- `display_name`: `Mapped[str]` = `mapped_column(String(100), nullable=False)`
- `color`: `Mapped[str]` = `mapped_column(String(20), default="#3b82f6", nullable=False)`
- `category_ids_json`: `Mapped[dict | None]` = `mapped_column(JSON, nullable=True)`
- `sort_order`: `Mapped[int]` = `mapped_column(Integer, default=0, nullable=False)`
- `is_active`: `Mapped[bool]` = `mapped_column(Boolean, default=True, nullable=False)`
- `alert_sound`: `Mapped[str | None]` = `mapped_column(String(100), nullable=True)`

### Table: `order_items` (`OrderItem`)

Source: `app/billing/models.py`

- `restaurant_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True
    )`
- `order_id`: `Mapped[int]` = `mapped_column(
        Integer, ForeignKey("table_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )`
- `menu_item_id`: `Mapped[int]` = `mapped_column(
        Integer, ForeignKey("menu_items.id", ondelete="SET NULL"), nullable=False
    )`
- `item_name`: `Mapped[str]` = `mapped_column(String(255), nullable=False)`
- `quantity`: `Mapped[int]` = `mapped_column(Integer, default=1, nullable=False)`
- `unit_price`: `Mapped[float]` = `mapped_column(Numeric(10, 2), nullable=False)`
- `total_price`: `Mapped[float]` = `mapped_column(Numeric(10, 2), nullable=False)`
- `modifiers_json`: `Mapped[dict | None]` = `mapped_column(JSON, nullable=True)`
- `status`: `Mapped[str]` = `mapped_column(String(20), default="pending", nullable=False, index=True)`
- `notes`: `Mapped[str | None]` = `mapped_column(String(500), nullable=True)`
- `sent_to_kitchen_at`: `Mapped[datetime | None]` = `mapped_column(
        DateTime(timezone=True), nullable=True
    )`
- `served_at`: `Mapped[datetime | None]` = `mapped_column(
        DateTime(timezone=True), nullable=True
    )`
- `station`: `Mapped[str | None]` = `mapped_column(String(50), nullable=True)`
- `course_number`: `Mapped[int]` = `mapped_column(Integer, default=1, nullable=False)`

### Table: `payments` (`Payment`)

Source: `app/billing/models.py`

- `restaurant_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True
    )`
- `bill_id`: `Mapped[int]` = `mapped_column(
        Integer, ForeignKey("bills.id", ondelete="CASCADE"), nullable=False, index=True
    )`
- `amount`: `Mapped[float]` = `mapped_column(Numeric(12, 2), nullable=False)`
- `method`: `Mapped[str]` = `mapped_column(String(30), nullable=False)`
- `reference`: `Mapped[str | None]` = `mapped_column(String(255), nullable=True)`
- `tip_amount`: `Mapped[float]` = `mapped_column(Numeric(10, 2), default=0, nullable=False)`
- `status`: `Mapped[str]` = `mapped_column(String(20), default="completed", nullable=False)`
- `paid_at`: `Mapped[datetime | None]` = `mapped_column(DateTime(timezone=True), nullable=True)`
- `processing_fee`: `Mapped[float]` = `mapped_column(Numeric(10, 2), default=0, nullable=False)`
- `gateway_reference`: `Mapped[str | None]` = `mapped_column(String(255), nullable=True)`
- `card_last_four`: `Mapped[str | None]` = `mapped_column(String(4), nullable=True)`
- `card_brand`: `Mapped[str | None]` = `mapped_column(String(30), nullable=True)`
- `wallet_type`: `Mapped[str | None]` = `mapped_column(String(30), nullable=True)`
- `refund_of_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("payments.id", ondelete="SET NULL"), nullable=True
    )`

### Table: `table_orders` (`TableOrder`)

Source: `app/billing/models.py`

- `restaurant_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True, index=True
    )`
- `session_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("table_sessions.id", ondelete="SET NULL"), nullable=True
    )`
- `table_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("tables.id", ondelete="SET NULL"), nullable=True
    )`
- `server_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("employees.id", ondelete="SET NULL"), nullable=True
    )`
- `status`: `Mapped[str]` = `mapped_column(String(20), default="open", nullable=False, index=True)`
- `order_type`: `Mapped[str]` = `mapped_column(String(20), default="dine_in", nullable=False)`
- `subtotal`: `Mapped[float]` = `mapped_column(Numeric(12, 2), default=0, nullable=False)`
- `tax_amount`: `Mapped[float]` = `mapped_column(Numeric(10, 2), default=0, nullable=False)`
- `discount_amount`: `Mapped[float]` = `mapped_column(Numeric(10, 2), default=0, nullable=False)`
- `discount_reason`: `Mapped[str | None]` = `mapped_column(String(255), nullable=True)`
- `tip_amount`: `Mapped[float]` = `mapped_column(Numeric(10, 2), default=0, nullable=False)`
- `total`: `Mapped[float]` = `mapped_column(Numeric(12, 2), default=0, nullable=False)`
- `notes`: `Mapped[str | None]` = `mapped_column(String(500), nullable=True)`
- `guest_name`: `Mapped[str | None]` = `mapped_column(String(255), nullable=True)`

## app/core/models.py

### Table: `agent_actions` (`AgentAction`)

Source: `app/core/models.py`

- `agent_name`: `Mapped[str]` = `mapped_column(String(100), nullable=False)`
- `action_type`: `Mapped[str]` = `mapped_column(String(100), nullable=False)`
- `description`: `Mapped[str]` = `mapped_column(String(500), nullable=False)`
- `input_data`: `Mapped[dict | None]` = `mapped_column(JSON, nullable=True)`
- `output_data`: `Mapped[dict | None]` = `mapped_column(JSON, nullable=True)`
- `status`: `Mapped[str]` = `mapped_column(String(50), default="pending", nullable=False)`
- `confidence`: `Mapped[float | None]` = `mapped_column(Float, nullable=True)`
- `requires_approval`: `Mapped[bool]` = `mapped_column(Boolean, default=False, nullable=False)`
- `approved_by`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )`
- `executed_at`: `Mapped[datetime | None]` = `mapped_column(DateTime(timezone=True), nullable=True)`

### Table: `agent_configs` (`AgentConfig`)

Source: `app/core/models.py`

- `agent_name`: `Mapped[str]` = `mapped_column(String(100), unique=True, nullable=False)`
- `autonomy_level`: `Mapped[str]` = `mapped_column(String(20), default="semi", nullable=False)`
- `thresholds_json`: `Mapped[dict | None]` = `mapped_column(JSON, nullable=True)`
- `is_active`: `Mapped[bool]` = `mapped_column(Boolean, default=True, nullable=False)`

### Table: `agent_logs` (`AgentLog`)

Source: `app/core/models.py`

- `agent_name`: `Mapped[str]` = `mapped_column(String(100), nullable=False)`
- `level`: `Mapped[str]` = `mapped_column(String(20), default="info", nullable=False)`
- `message`: `Mapped[str]` = `mapped_column(String(1000), nullable=False)`
- `context_json`: `Mapped[dict | None]` = `mapped_column(JSON, nullable=True)`

### Table: `revenue_control_policies` (`RevenueControlPolicy`)

Source: `app/core/models.py`

- `restaurant_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), unique=True, nullable=True
    )`
- `kill_switch`: `Mapped[bool]` = `mapped_column(Boolean, default=False, nullable=False)`
- `daily_budget_cap`: `Mapped[float]` = `mapped_column(Numeric(12, 2), default=500, nullable=False)`
- `experiment_budget_cap`: `Mapped[float]` = `mapped_column(Numeric(12, 2), default=200, nullable=False)`
- `max_discount_pct`: `Mapped[float]` = `mapped_column(Float, default=30, nullable=False)`
- `max_price_change_pct`: `Mapped[float]` = `mapped_column(Float, default=25, nullable=False)`
- `min_margin_pct`: `Mapped[float]` = `mapped_column(Float, default=15, nullable=False)`
- `is_active`: `Mapped[bool]` = `mapped_column(Boolean, default=True, nullable=False)`

### Table: `revenue_experiments` (`RevenueExperiment`)

Source: `app/core/models.py`

- `restaurant_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True
    )`
- `name`: `Mapped[str]` = `mapped_column(String(255), nullable=False)`
- `experiment_type`: `Mapped[str]` = `mapped_column(String(50), nullable=False)`
- `status`: `Mapped[str]` = `mapped_column(String(30), default="draft", nullable=False)`
- `config_json`: `Mapped[dict | None]` = `mapped_column(JSON, nullable=True)`
- `budget_cap`: `Mapped[float | None]` = `mapped_column(Numeric(12, 2), nullable=True)`
- `exposures`: `Mapped[int]` = `mapped_column(Integer, default=0, nullable=False)`
- `conversions`: `Mapped[int]` = `mapped_column(Integer, default=0, nullable=False)`
- `revenue_amount`: `Mapped[float]` = `mapped_column(Numeric(12, 2), default=0, nullable=False)`
- `spent_amount`: `Mapped[float]` = `mapped_column(Numeric(12, 2), default=0, nullable=False)`
- `started_at`: `Mapped[datetime | None]` = `mapped_column(DateTime(timezone=True), nullable=True)`
- `stopped_at`: `Mapped[datetime | None]` = `mapped_column(DateTime(timezone=True), nullable=True)`

### Table: `revenue_experiment_events` (`RevenueExperimentEvent`)

Source: `app/core/models.py`

- `restaurant_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True
    )`
- `experiment_id`: `Mapped[int]` = `mapped_column(
        Integer, ForeignKey("revenue_experiments.id", ondelete="CASCADE"), nullable=False
    )`
- `variant_key`: `Mapped[str]` = `mapped_column(String(80), nullable=False)`
- `exposures`: `Mapped[int]` = `mapped_column(Integer, default=0, nullable=False)`
- `conversions`: `Mapped[int]` = `mapped_column(Integer, default=0, nullable=False)`
- `revenue_amount`: `Mapped[float]` = `mapped_column(Numeric(12, 2), default=0, nullable=False)`
- `spend_amount`: `Mapped[float]` = `mapped_column(Numeric(12, 2), default=0, nullable=False)`
- `recorded_at`: `Mapped[datetime]` = `mapped_column(DateTime(timezone=True), nullable=False)`

### Table: `revenue_upsell_recommendations` (`RevenueUpsellRecommendation`)

Source: `app/core/models.py`

- `restaurant_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True
    )`
- `guest_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("guest_profiles.id", ondelete="SET NULL"), nullable=True
    )`
- `menu_item_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("menu_items.id", ondelete="SET NULL"), nullable=True
    )`
- `generated_at`: `Mapped[datetime]` = `mapped_column(DateTime(timezone=True), nullable=False)`
- `expected_uplift`: `Mapped[float]` = `mapped_column(Numeric(12, 2), nullable=False)`
- `factors_json`: `Mapped[dict | None]` = `mapped_column(JSON, nullable=True)`

### Table: `service_autopilot_predictions` (`ServiceAutopilotPrediction`)

Source: `app/core/models.py`

- `restaurant_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True
    )`
- `table_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("tables.id", ondelete="SET NULL"), nullable=True
    )`
- `horizon_minutes`: `Mapped[int]` = `mapped_column(Integer, default=15, nullable=False)`
- `generated_at`: `Mapped[datetime]` = `mapped_column(DateTime(timezone=True), nullable=False)`
- `target_time`: `Mapped[datetime]` = `mapped_column(DateTime(timezone=True), nullable=False)`
- `predicted_wait_min`: `Mapped[float]` = `mapped_column(Float, nullable=False)`
- `staffing_pressure_score`: `Mapped[float]` = `mapped_column(Float, nullable=False)`
- `confidence`: `Mapped[float]` = `mapped_column(Float, nullable=False)`
- `actual_wait_min`: `Mapped[float | None]` = `mapped_column(Float, nullable=True)`
- `error_abs_min`: `Mapped[float | None]` = `mapped_column(Float, nullable=True)`

## app/dashboard/models.py

### Table: `alerts` (`Alert`)

Source: `app/dashboard/models.py`

- `module`: `Mapped[str]` = `mapped_column(String(100), nullable=False)`
- `severity`: `Mapped[str]` = `mapped_column(String(20), default="info", nullable=False)`
- `title`: `Mapped[str]` = `mapped_column(String(255), nullable=False)`
- `message`: `Mapped[str]` = `mapped_column(String(1000), nullable=False)`
- `is_read`: `Mapped[bool]` = `mapped_column(Boolean, default=False, nullable=False)`
- `action_taken`: `Mapped[str | None]` = `mapped_column(String(500), nullable=True)`
- `owner`: `Mapped[str | None]` = `mapped_column(String(100), nullable=True)`
- `status`: `Mapped[str]` = `mapped_column(String(30), default="open", nullable=False)`
- `sla_status`: `Mapped[str]` = `mapped_column(String(30), default="on_track", nullable=False)`
- `sla_minutes`: `Mapped[int | None]` = `mapped_column(Integer, nullable=True)`
- `due_at`: `Mapped[datetime | None]` = `mapped_column(DateTime(timezone=True), nullable=True)`
- `resolved_at`: `Mapped[datetime | None]` = `mapped_column(DateTime(timezone=True), nullable=True)`
- `resolved_by`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )`

### Table: `audit_events` (`AuditEvent`)

Source: `app/dashboard/models.py`

- `restaurant_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True
    )`
- `actor_type`: `Mapped[str]` = `mapped_column(String(30), nullable=False)`
- `actor_name`: `Mapped[str]` = `mapped_column(String(255), nullable=False)`
- `actor_user_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )`
- `entity_type`: `Mapped[str | None]` = `mapped_column(String(100), nullable=True)`
- `entity_id`: `Mapped[int | None]` = `mapped_column(Integer, nullable=True)`
- `action`: `Mapped[str]` = `mapped_column(String(150), nullable=False)`
- `detail`: `Mapped[str]` = `mapped_column(String(1000), nullable=False)`
- `source_module`: `Mapped[str | None]` = `mapped_column(String(100), nullable=True)`
- `metadata_json`: `Mapped[dict | None]` = `mapped_column(JSON, nullable=True)`

### Table: `dashboard_queries` (`DashboardQuery`)

Source: `app/dashboard/models.py`

- `user_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )`
- `query_text`: `Mapped[str]` = `mapped_column(String(1000), nullable=False)`
- `ai_response`: `Mapped[str | None]` = `mapped_column(Text, nullable=True)`
- `response_data_json`: `Mapped[dict | None]` = `mapped_column(JSON, nullable=True)`

### Table: `kpi_snapshots` (`KPISnapshot`)

Source: `app/dashboard/models.py`

- `metric_name`: `Mapped[str]` = `mapped_column(String(255), nullable=False)`
- `value`: `Mapped[float]` = `mapped_column(Float, nullable=False)`
- `previous_value`: `Mapped[float | None]` = `mapped_column(Float, nullable=True)`
- `target_value`: `Mapped[float | None]` = `mapped_column(Float, nullable=True)`
- `timestamp`: `Mapped[datetime]` = `mapped_column(DateTime(timezone=True), nullable=False)`

## app/digital_twin/models.py

### Table: `scenarios` (`Scenario`)

Source: `app/digital_twin/models.py`

- `name`: `Mapped[str]` = `mapped_column(String(255), nullable=False)`
- `description`: `Mapped[str | None]` = `mapped_column(String(1000), nullable=True)`
- `scenario_type`: `Mapped[str]` = `mapped_column(String(50), nullable=False)`
- `parameters_json`: `Mapped[dict | None]` = `mapped_column(JSON, nullable=True)`
- `created_by`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )`

### Table: `simulation_runs` (`SimulationRun`)

Source: `app/digital_twin/models.py`

- `scenario_id`: `Mapped[int]` = `mapped_column(
        Integer, ForeignKey("scenarios.id"), nullable=False
    )`
- `status`: `Mapped[str]` = `mapped_column(String(20), default="pending", nullable=False)`
- `results_json`: `Mapped[dict | None]` = `mapped_column(JSON, nullable=True)`
- `started_at`: `Mapped[datetime | None]` = `mapped_column(
        DateTime(timezone=True), nullable=True
    )`
- `completed_at`: `Mapped[datetime | None]` = `mapped_column(
        DateTime(timezone=True), nullable=True
    )`

## app/email_inbox/models.py

### Table: `email_threads` (`EmailThread`)

Source: `app/email_inbox/models.py`

- `external_email_id`: `Mapped[str]` = `mapped_column(
        String(255),
        unique=True,
        nullable=False,
        index=True,
    )`
- `sender`: `Mapped[str]` = `mapped_column(String(255), nullable=False)`
- `subject`: `Mapped[str | None]` = `mapped_column(String(500), nullable=True)`
- `body`: `Mapped[str]` = `mapped_column(Text, nullable=False)`
- `received_at`: `Mapped[datetime]` = `mapped_column(DateTime(timezone=True), nullable=False, index=True)`
- `raw_email`: `Mapped[dict]` = `mapped_column(JSON, nullable=False)`
- `category`: `Mapped[str]` = `mapped_column(String(20), default="pending", nullable=False, index=True)`
- `classification_confidence`: `Mapped[float | None]` = `mapped_column(Float, nullable=True)`
- `extracted_data`: `Mapped[dict | None]` = `mapped_column(JSON, nullable=True)`
- `summary`: `Mapped[str | None]` = `mapped_column(String(500), nullable=True)`
- `reply_generated`: `Mapped[bool]` = `mapped_column(
        Boolean,
        default=False,
        server_default=text("false"),
        nullable=False,
    )`
- `reply_sent`: `Mapped[bool]` = `mapped_column(
        Boolean,
        default=False,
        server_default=text("false"),
        nullable=False,
    )`
- `reply_content`: `Mapped[str | None]` = `mapped_column(Text, nullable=True)`
- `reply_generated_at`: `Mapped[datetime | None]` = `mapped_column(DateTime(timezone=True), nullable=True)`
- `reply_sent_at`: `Mapped[datetime | None]` = `mapped_column(DateTime(timezone=True), nullable=True)`
- `replied_by_user_id`: `Mapped[int | None]` = `mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )`
- `status`: `Mapped[str]` = `mapped_column(
        String(20),
        default="pending",
        server_default=text("'pending'"),
        nullable=False,
        index=True,
    )`
- `reply_mode`: `Mapped[str]` = `mapped_column(
        String(20),
        default="generate_only",
        server_default=text("'generate_only'"),
        nullable=False,
    )`
- `processing_error`: `Mapped[str | None]` = `mapped_column(Text, nullable=True)`
- `reply_error`: `Mapped[str | None]` = `mapped_column(Text, nullable=True)`

## app/food_safety/models.py

### Table: `allergen_alerts` (`AllergenAlert`)

Source: `app/food_safety/models.py`

- `order_id`: `Mapped[int | None]` = `mapped_column(Integer, nullable=True)`
- `allergen`: `Mapped[str]` = `mapped_column(String(100), nullable=False)`
- `guest_id`: `Mapped[int | None]` = `mapped_column(Integer, nullable=True)`
- `severity`: `Mapped[str]` = `mapped_column(String(20), default="warning", nullable=False)`
- `action_taken`: `Mapped[str | None]` = `mapped_column(String(500), nullable=True)`

### Table: `compliance_scores` (`ComplianceScore`)

Source: `app/food_safety/models.py`

- `date`: `Mapped[date]` = `mapped_column(Date, nullable=False)`
- `score`: `Mapped[float]` = `mapped_column(Float, nullable=False)`
- `violations_count`: `Mapped[int]` = `mapped_column(Integer, default=0, nullable=False)`
- `auto_resolved`: `Mapped[int]` = `mapped_column(Integer, default=0, nullable=False)`
- `manual_resolved`: `Mapped[int]` = `mapped_column(Integer, default=0, nullable=False)`

### Table: `haccp_logs` (`HACCPLog`)

Source: `app/food_safety/models.py`

- `check_type`: `Mapped[str]` = `mapped_column(String(100), nullable=False)`
- `station`: `Mapped[str | None]` = `mapped_column(String(255), nullable=True)`
- `value`: `Mapped[str]` = `mapped_column(String(255), nullable=False)`
- `is_compliant`: `Mapped[bool]` = `mapped_column(Boolean, default=True, nullable=False)`
- `auto_logged`: `Mapped[bool]` = `mapped_column(Boolean, default=False, nullable=False)`
- `notes`: `Mapped[str | None]` = `mapped_column(String(1000), nullable=True)`

### Table: `temperature_readings` (`TemperatureReading`)

Source: `app/food_safety/models.py`

- `location`: `Mapped[str]` = `mapped_column(String(255), nullable=False)`
- `sensor_id`: `Mapped[str | None]` = `mapped_column(String(100), nullable=True)`
- `temp_f`: `Mapped[float]` = `mapped_column(Float, nullable=False)`
- `is_safe`: `Mapped[bool]` = `mapped_column(Boolean, default=True, nullable=False)`
- `timestamp`: `Mapped[datetime]` = `mapped_column(DateTime(timezone=True), nullable=False)`

## app/forecasting/models.py

### Table: `forecasts` (`Forecast`)

Source: `app/forecasting/models.py`

- `forecast_type`: `Mapped[str]` = `mapped_column(String(50), nullable=False)`
- `target_date`: `Mapped[date]` = `mapped_column(Date, nullable=False)`
- `item_id`: `Mapped[int | None]` = `mapped_column(Integer, nullable=True)`
- `predicted_value`: `Mapped[float]` = `mapped_column(Float, nullable=False)`
- `confidence_lower`: `Mapped[float | None]` = `mapped_column(Float, nullable=True)`
- `confidence_upper`: `Mapped[float | None]` = `mapped_column(Float, nullable=True)`
- `actual_value`: `Mapped[float | None]` = `mapped_column(Float, nullable=True)`
- `model_version`: `Mapped[str | None]` = `mapped_column(String(100), nullable=True)`

### Table: `forecast_inputs` (`ForecastInput`)

Source: `app/forecasting/models.py`

- `forecast_id`: `Mapped[int]` = `mapped_column(
        Integer, ForeignKey("forecasts.id"), nullable=False
    )`
- `variable_name`: `Mapped[str]` = `mapped_column(String(100), nullable=False)`
- `variable_value`: `Mapped[str]` = `mapped_column(String(500), nullable=False)`

## app/franchise/models.py

### Table: `benchmarks` (`Benchmark`)

Source: `app/franchise/models.py`

- `metric_name`: `Mapped[str]` = `mapped_column(String(255), nullable=False)`
- `group_avg`: `Mapped[float]` = `mapped_column(Float, nullable=False)`
- `top_performer_id`: `Mapped[int | None]` = `mapped_column(Integer, nullable=True)`
- `bottom_performer_id`: `Mapped[int | None]` = `mapped_column(Integer, nullable=True)`
- `date`: `Mapped[date]` = `mapped_column(Date, nullable=False)`

### Table: `locations` (`Location`)

Source: `app/franchise/models.py`

- `restaurant_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True
    )`
- `name`: `Mapped[str]` = `mapped_column(String(255), nullable=False)`
- `address`: `Mapped[str | None]` = `mapped_column(String(500), nullable=True)`
- `city`: `Mapped[str | None]` = `mapped_column(String(100), nullable=True)`
- `region`: `Mapped[str | None]` = `mapped_column(String(100), nullable=True)`
- `manager_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )`
- `is_active`: `Mapped[bool]` = `mapped_column(Boolean, default=True, nullable=False)`

### Table: `location_metrics` (`LocationMetric`)

Source: `app/franchise/models.py`

- `location_id`: `Mapped[int]` = `mapped_column(
        Integer, ForeignKey("locations.id"), nullable=False
    )`
- `date`: `Mapped[date]` = `mapped_column(Date, nullable=False)`
- `food_cost_pct`: `Mapped[float | None]` = `mapped_column(Float, nullable=True)`
- `labor_cost_pct`: `Mapped[float | None]` = `mapped_column(Float, nullable=True)`
- `net_margin`: `Mapped[float | None]` = `mapped_column(Float, nullable=True)`
- `guest_score`: `Mapped[float | None]` = `mapped_column(Float, nullable=True)`
- `compliance_score`: `Mapped[float | None]` = `mapped_column(Float, nullable=True)`
- `revenue`: `Mapped[float | None]` = `mapped_column(Numeric(12, 2), nullable=True)`

## app/guests/models.py

### Table: `guest_profiles` (`GuestProfile`)

Source: `app/guests/models.py`

- `restaurant_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True, index=True
    )`
- `name`: `Mapped[str | None]` = `mapped_column(String(255), nullable=True)`
- `email`: `Mapped[str | None]` = `mapped_column(String(255), unique=True, nullable=True, index=True)`
- `phone`: `Mapped[str | None]` = `mapped_column(String(50), nullable=True)`
- `dietary_json`: `Mapped[dict | None]` = `mapped_column(JSON, nullable=True)`
- `flavor_profile_json`: `Mapped[dict | None]` = `mapped_column(JSON, nullable=True)`
- `clv`: `Mapped[float]` = `mapped_column(Numeric(10, 2), default=0, nullable=False)`
- `churn_risk_score`: `Mapped[float]` = `mapped_column(Float, default=0, nullable=False)`
- `visit_count`: `Mapped[int]` = `mapped_column(Integer, default=0, nullable=False)`
- `last_visit`: `Mapped[datetime | None]` = `mapped_column(
        DateTime(timezone=True), nullable=True
    )`

### Table: `loyalty_accounts` (`LoyaltyAccount`)

Source: `app/guests/models.py`

- `restaurant_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True
    )`
- `guest_id`: `Mapped[int]` = `mapped_column(
        Integer, ForeignKey("guest_profiles.id"), unique=True, nullable=False
    )`
- `tier`: `Mapped[str]` = `mapped_column(String(20), default="bronze", nullable=False)`
- `points`: `Mapped[int]` = `mapped_column(Integer, default=0, nullable=False)`
- `rewards_json`: `Mapped[dict | None]` = `mapped_column(JSON, nullable=True)`

### Table: `orders` (`Order`)

Source: `app/guests/models.py`

- `restaurant_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True
    )`
- `guest_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("guest_profiles.id", ondelete="SET NULL"), nullable=True, index=True
    )`
- `order_date`: `Mapped[datetime]` = `mapped_column(DateTime(timezone=True), nullable=False)`
- `channel`: `Mapped[str]` = `mapped_column(String(50), default="dine_in", nullable=False)`
- `total`: `Mapped[float]` = `mapped_column(Numeric(10, 2), nullable=False)`
- `items_json`: `Mapped[dict]` = `mapped_column(JSON, nullable=False)`
- `discount`: `Mapped[float]` = `mapped_column(Numeric(10, 2), default=0, nullable=False)`
- `tip`: `Mapped[float]` = `mapped_column(Numeric(10, 2), default=0, nullable=False)`

### Table: `promotions` (`Promotion`)

Source: `app/guests/models.py`

- `restaurant_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True
    )`
- `guest_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("guest_profiles.id", ondelete="SET NULL"), nullable=True
    )`
- `type`: `Mapped[str]` = `mapped_column(String(100), nullable=False)`
- `offer`: `Mapped[str]` = `mapped_column(String(500), nullable=False)`
- `status`: `Mapped[str]` = `mapped_column(String(20), default="sent", nullable=False)`
- `sent_at`: `Mapped[datetime | None]` = `mapped_column(
        DateTime(timezone=True), nullable=True
    )`
- `redeemed_at`: `Mapped[datetime | None]` = `mapped_column(
        DateTime(timezone=True), nullable=True
    )`

## app/hms/models.py

### Table: `hms_properties` (`HotelProperty`)

Source: `app/hms/models.py`

- `name`: `Mapped[str]` = `mapped_column(String(255), nullable=False)`
- `address`: `Mapped[str]` = `mapped_column(String(500), nullable=False)`
- `city`: `Mapped[str]` = `mapped_column(String(100), nullable=False)`
- `country`: `Mapped[str]` = `mapped_column(String(100), nullable=False)`
- `timezone`: `Mapped[str]` = `mapped_column(String(50), default="UTC", nullable=False)`
- `currency`: `Mapped[str]` = `mapped_column(String(10), default="EUR", nullable=False)`
- `settings_json`: `Mapped[dict | None]` = `mapped_column(JSON, nullable=True)`
- `rooms`: `Mapped[list["Room"]]` = `relationship(back_populates="property", cascade="all, delete-orphan")`

### Table: `hms_reservations` (`HotelReservation`)

Source: `app/hms/models.py`

- `property_id`: `Mapped[int]` = `mapped_column(Integer, ForeignKey("hms_properties.id", ondelete="CASCADE"), nullable=False)`
- `guest_id`: `Mapped[int | None]` = `mapped_column(Integer, ForeignKey("guest_profiles.id", ondelete="SET NULL"), nullable=True)`
- `guest_name`: `Mapped[str]` = `mapped_column(String(255), nullable=False)`
- `guest_email`: `Mapped[str | None]` = `mapped_column(String(255), nullable=True)`
- `guest_phone`: `Mapped[str | None]` = `mapped_column(String(50), nullable=True)`
- `check_in`: `Mapped[date]` = `mapped_column(Date, nullable=False, index=True)`
- `check_out`: `Mapped[date]` = `mapped_column(Date, nullable=False, index=True)`
- `status`: `Mapped[str]` = `mapped_column(String(20), default="confirmed", nullable=False)`
- `total_amount`: `Mapped[float]` = `mapped_column(Float, nullable=False)`
- `currency`: `Mapped[str]` = `mapped_column(String(10), default="EUR", nullable=False)`
- `notes`: `Mapped[str | None]` = `mapped_column(String(1000), nullable=True)`
- `room_type_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("hms_room_types.id", ondelete="SET NULL"), nullable=True
    )`
- `payment_status`: `Mapped[str]` = `mapped_column(String(20), default="pending", nullable=False)`
- `stripe_payment_intent_id`: `Mapped[str | None]` = `mapped_column(String(255), nullable=True)`
- `booking_id`: `Mapped[str]` = `mapped_column(String(50), default="", nullable=False)`
- `anrede`: `Mapped[str | None]` = `mapped_column(String(20), nullable=True)`
- `phone`: `Mapped[str | None]` = `mapped_column(String(50), nullable=True)`
- `room`: `Mapped[str | None]` = `mapped_column(String(20), nullable=True)`
- `room_type_label`: `Mapped[str | None]` = `mapped_column(String(100), nullable=True)`
- `adults`: `Mapped[int]` = `mapped_column(Integer, default=1, nullable=False)`
- `children`: `Mapped[int]` = `mapped_column(Integer, default=0, nullable=False)`
- `zahlungs_methode`: `Mapped[str | None]` = `mapped_column(String(50), nullable=True)`
- `zahlungs_status`: `Mapped[str]` = `mapped_column(String(50), default="offen", nullable=True)`
- `special_requests`: `Mapped[str | None]` = `mapped_column(String(500), nullable=True)`

### Table: `hms_rooms` (`Room`)

Source: `app/hms/models.py`

- `property_id`: `Mapped[int]` = `mapped_column(Integer, ForeignKey("hms_properties.id", ondelete="CASCADE"), nullable=False)`
- `room_number`: `Mapped[str]` = `mapped_column(String(20), nullable=False)`
- `room_type_id`: `Mapped[int]` = `mapped_column(Integer, ForeignKey("hms_room_types.id", ondelete="CASCADE"), nullable=False)`
- `status`: `Mapped[str]` = `mapped_column(String(20), default="available", nullable=False)`
- `floor`: `Mapped[int | None]` = `mapped_column(Integer, nullable=True)`
- `property`: `Mapped["HotelProperty"]` = `relationship(back_populates="rooms")`

### Table: `hms_room_types` (`RoomType`)

Source: `app/hms/models.py`

- `property_id`: `Mapped[int]` = `mapped_column(Integer, ForeignKey("hms_properties.id", ondelete="CASCADE"), nullable=False)`
- `name`: `Mapped[str]` = `mapped_column(String(100), nullable=False)`
- `base_occupancy`: `Mapped[int]` = `mapped_column(Integer, default=2, nullable=False)`
- `max_occupancy`: `Mapped[int]` = `mapped_column(Integer, default=2, nullable=False)`
- `base_price`: `Mapped[float]` = `mapped_column(Float, nullable=False)`
- `description`: `Mapped[str | None]` = `mapped_column(String(500), nullable=True)`

## app/integrations/models.py

### Table: `webhook_audit` (`WebhookAudit`)

Source: `app/integrations/models.py`

- `event_id`: `Mapped[str]` = `mapped_column(String(50), ForeignKey("webhook_events.event_id", ondelete="CASCADE"), nullable=False)`
- `action`: `Mapped[str]` = `mapped_column(String(50), nullable=False)`
- `actor`: `Mapped[str]` = `mapped_column(String(50), nullable=False)`
- `message`: `Mapped[str]` = `mapped_column(String(500), nullable=False)`

### Table: `webhook_events` (`WebhookEvent`)

Source: `app/integrations/models.py`

- `event_id`: `Mapped[str]` = `mapped_column(String(50), unique=True, index=True, nullable=False)`
- `source`: `Mapped[str]` = `mapped_column(String(50), nullable=False)`
- `raw_payload`: `Mapped[dict | list]` = `mapped_column(JSON, nullable=False)`
- `headers`: `Mapped[dict | list]` = `mapped_column(JSON, nullable=False)`
- `received_at`: `Mapped[datetime]` = `mapped_column(DateTime(timezone=True), nullable=False)`
- `processed_at`: `Mapped[datetime | None]` = `mapped_column(DateTime(timezone=True), nullable=True)`
- `processing_status`: `Mapped[str]` = `mapped_column(String(20), default="received", nullable=False)`
- `error`: `Mapped[str | None]` = `mapped_column(Text, nullable=True)`

## app/inventory/models.py

### Table: `auto_purchase_rules` (`AutoPurchaseRule`)

Source: `app/inventory/models.py`

- `restaurant_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True
    )`
- `inventory_item_id`: `Mapped[int]` = `mapped_column(
        Integer, ForeignKey("inventory_items.id", ondelete="CASCADE"), nullable=False
    )`
- `vendor_id`: `Mapped[int]` = `mapped_column(
        Integer, ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False
    )`
- `trigger_type`: `Mapped[str]` = `mapped_column(String(30), default="below_par", nullable=False)`
- `reorder_point`: `Mapped[float]` = `mapped_column(Float, nullable=False)`
- `reorder_quantity`: `Mapped[float]` = `mapped_column(Float, nullable=False)`
- `is_active`: `Mapped[bool]` = `mapped_column(Boolean, default=True, nullable=False)`
- `last_triggered_at`: `Mapped[datetime | None]` = `mapped_column(
        DateTime(timezone=True), nullable=True
    )`

### Table: `inventory_items` (`InventoryItem`)

Source: `app/inventory/models.py`

- `restaurant_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True, index=True
    )`
- `name`: `Mapped[str]` = `mapped_column(String(255), nullable=False, index=True)`
- `category`: `Mapped[str]` = `mapped_column(String(100), nullable=False)`
- `unit`: `Mapped[str]` = `mapped_column(String(50), nullable=False)`
- `current_stock`: `Mapped[float]` = `mapped_column(Float, default=0, nullable=False)`
- `par_level`: `Mapped[float]` = `mapped_column(Float, default=0, nullable=False)`
- `cost_per_unit`: `Mapped[float]` = `mapped_column(Numeric(10, 2), default=0, nullable=False)`
- `vendor_id`: `Mapped[int | None]` = `mapped_column(Integer, nullable=True)`
- `location`: `Mapped[str | None]` = `mapped_column(String(100), nullable=True)`
- `last_counted_at`: `Mapped[datetime | None]` = `mapped_column(
        DateTime(timezone=True), nullable=True
    )`

### Table: `inventory_movements` (`InventoryMovement`)

Source: `app/inventory/models.py`

- `restaurant_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True
    )`
- `item_id`: `Mapped[int]` = `mapped_column(
        Integer, ForeignKey("inventory_items.id"), nullable=False
    )`
- `quantity`: `Mapped[float]` = `mapped_column(Float, nullable=False)`
- `movement_type`: `Mapped[str]` = `mapped_column(String(20), nullable=False)`
- `reason`: `Mapped[str | None]` = `mapped_column(String(500), nullable=True)`

### Table: `purchase_orders` (`PurchaseOrder`)

Source: `app/inventory/models.py`

- `restaurant_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True, index=True
    )`
- `vendor_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("vendors.id", ondelete="SET NULL"), nullable=True
    )`
- `status`: `Mapped[str]` = `mapped_column(String(20), default="draft", nullable=False, index=True)`
- `total`: `Mapped[float]` = `mapped_column(Numeric(12, 2), default=0, nullable=False)`
- `order_date`: `Mapped[date]` = `mapped_column(Date, nullable=False)`
- `delivery_date`: `Mapped[date | None]` = `mapped_column(Date, nullable=True)`
- `auto_generated`: `Mapped[bool]` = `mapped_column(Boolean, default=False, nullable=False)`
- `line_items_json`: `Mapped[dict | None]` = `mapped_column(JSON, nullable=True)`
- `expected_delivery_date`: `Mapped[date | None]` = `mapped_column(Date, nullable=True)`
- `actual_delivery_date`: `Mapped[date | None]` = `mapped_column(Date, nullable=True)`
- `delivery_status`: `Mapped[str]` = `mapped_column(String(20), default="pending", nullable=False)`
- `received_items_json`: `Mapped[dict | None]` = `mapped_column(JSON, nullable=True)`
- `notes`: `Mapped[str | None]` = `mapped_column(String(500), nullable=True)`

### Table: `supplier_catalog_items` (`SupplierCatalogItem`)

Source: `app/inventory/models.py`

- `restaurant_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True
    )`
- `vendor_id`: `Mapped[int]` = `mapped_column(
        Integer, ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False
    )`
- `inventory_item_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("inventory_items.id", ondelete="SET NULL"), nullable=True
    )`
- `supplier_sku`: `Mapped[str | None]` = `mapped_column(String(100), nullable=True)`
- `supplier_name`: `Mapped[str]` = `mapped_column(String(255), nullable=False)`
- `unit_price`: `Mapped[float]` = `mapped_column(Numeric(10, 2), nullable=False)`
- `unit`: `Mapped[str]` = `mapped_column(String(50), nullable=False)`
- `min_order_qty`: `Mapped[float]` = `mapped_column(Float, default=1, nullable=False)`
- `is_available`: `Mapped[bool]` = `mapped_column(Boolean, default=True, nullable=False)`

### Table: `tva_reports` (`TVAReport`)

Source: `app/inventory/models.py`

- `restaurant_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True
    )`
- `item_id`: `Mapped[int]` = `mapped_column(
        Integer, ForeignKey("inventory_items.id"), nullable=False
    )`
- `period`: `Mapped[str]` = `mapped_column(String(50), nullable=False)`
- `theoretical_usage`: `Mapped[float]` = `mapped_column(Float, nullable=False)`
- `actual_usage`: `Mapped[float]` = `mapped_column(Float, nullable=False)`
- `variance`: `Mapped[float]` = `mapped_column(Float, nullable=False)`
- `variance_cost`: `Mapped[float]` = `mapped_column(Numeric(10, 2), nullable=False)`

### Table: `vendors` (`Vendor`)

Source: `app/inventory/models.py`

- `restaurant_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True, index=True
    )`
- `name`: `Mapped[str]` = `mapped_column(String(255), nullable=False)`
- `contact_email`: `Mapped[str | None]` = `mapped_column(String(255), nullable=True)`
- `contact_phone`: `Mapped[str | None]` = `mapped_column(String(50), nullable=True)`
- `address`: `Mapped[str | None]` = `mapped_column(String(500), nullable=True)`
- `reliability_score`: `Mapped[float]` = `mapped_column(Float, default=0, nullable=False)`
- `avg_delivery_days`: `Mapped[float]` = `mapped_column(Float, default=0, nullable=False)`
- `pricing_json`: `Mapped[dict | None]` = `mapped_column(JSON, nullable=True)`
- `is_active`: `Mapped[bool]` = `mapped_column(Boolean, default=True, nullable=False)`
- `delivery_days_json`: `Mapped[dict | None]` = `mapped_column(JSON, nullable=True)`
- `minimum_order_value`: `Mapped[float]` = `mapped_column(Numeric(10, 2), default=0, nullable=False)`
- `catalog_url`: `Mapped[str | None]` = `mapped_column(String(500), nullable=True)`
- `payment_terms`: `Mapped[str | None]` = `mapped_column(String(100), nullable=True)`
- `lead_time_days`: `Mapped[int]` = `mapped_column(Integer, default=1, nullable=False)`

## app/maintenance/models.py

### Table: `energy_readings` (`EnergyReading`)

Source: `app/maintenance/models.py`

- `restaurant_id`: `Mapped[int]` = `mapped_column(ForeignKey("restaurants.id"), nullable=False, index=True)`
- `zone`: `Mapped[str]` = `mapped_column(String(100), nullable=False)`
- `reading_kwh`: `Mapped[float]` = `mapped_column(Float, nullable=False)`
- `cost`: `Mapped[float | None]` = `mapped_column(Numeric(10, 2), nullable=True)`
- `timestamp`: `Mapped[datetime]` = `mapped_column(DateTime(timezone=True), nullable=False)`

### Table: `equipment` (`Equipment`)

Source: `app/maintenance/models.py`

- `restaurant_id`: `Mapped[int]` = `mapped_column(ForeignKey("restaurants.id"), nullable=False, index=True)`
- `name`: `Mapped[str]` = `mapped_column(String(255), nullable=False)`
- `type`: `Mapped[str]` = `mapped_column(String(100), nullable=False)`
- `location`: `Mapped[str | None]` = `mapped_column(String(255), nullable=True)`
- `model_name`: `Mapped[str | None]` = `mapped_column(String(255), nullable=True)`
- `serial_number`: `Mapped[str | None]` = `mapped_column(String(255), nullable=True)`
- `install_date`: `Mapped[date | None]` = `mapped_column(Date, nullable=True)`
- `last_service`: `Mapped[date | None]` = `mapped_column(Date, nullable=True)`
- `health_score`: `Mapped[float]` = `mapped_column(Float, default=100, nullable=False)`
- `status`: `Mapped[str]` = `mapped_column(String(20), default="operational", nullable=False)`

### Table: `iot_readings` (`IoTReading`)

Source: `app/maintenance/models.py`

- `equipment_id`: `Mapped[int]` = `mapped_column(
        Integer, ForeignKey("equipment.id"), nullable=False
    )`
- `sensor_type`: `Mapped[str]` = `mapped_column(String(100), nullable=False)`
- `value`: `Mapped[float]` = `mapped_column(Float, nullable=False)`
- `unit`: `Mapped[str]` = `mapped_column(String(50), nullable=False)`
- `timestamp`: `Mapped[datetime]` = `mapped_column(DateTime(timezone=True), nullable=False)`

### Table: `maintenance_tickets` (`MaintenanceTicket`)

Source: `app/maintenance/models.py`

- `equipment_id`: `Mapped[int]` = `mapped_column(
        Integer, ForeignKey("equipment.id"), nullable=False
    )`
- `issue`: `Mapped[str]` = `mapped_column(String(1000), nullable=False)`
- `priority`: `Mapped[str]` = `mapped_column(String(20), default="medium", nullable=False)`
- `status`: `Mapped[str]` = `mapped_column(String(20), default="open", nullable=False)`
- `auto_generated`: `Mapped[bool]` = `mapped_column(Boolean, default=False, nullable=False)`
- `technician`: `Mapped[str | None]` = `mapped_column(String(255), nullable=True)`
- `resolved_at`: `Mapped[datetime | None]` = `mapped_column(
        DateTime(timezone=True), nullable=True
    )`

## app/marketing/models.py

### Table: `campaigns` (`Campaign`)

Source: `app/marketing/models.py`

- `restaurant_id`: `Mapped[int]` = `mapped_column(ForeignKey("restaurants.id"), nullable=False, index=True)`
- `name`: `Mapped[str]` = `mapped_column(String(255), nullable=False)`
- `type`: `Mapped[str]` = `mapped_column(String(20), nullable=False)`
- `target_segment`: `Mapped[str | None]` = `mapped_column(String(255), nullable=True)`
- `content`: `Mapped[str | None]` = `mapped_column(Text, nullable=True)`
- `status`: `Mapped[str]` = `mapped_column(String(20), default="draft", nullable=False)`
- `sent_count`: `Mapped[int]` = `mapped_column(Integer, default=0, nullable=False)`
- `open_rate`: `Mapped[float | None]` = `mapped_column(Float, nullable=True)`
- `conversion_rate`: `Mapped[float | None]` = `mapped_column(Float, nullable=True)`
- `scheduled_at`: `Mapped[datetime | None]` = `mapped_column(
        DateTime(timezone=True), nullable=True
    )`

### Table: `reviews` (`Review`)

Source: `app/marketing/models.py`

- `restaurant_id`: `Mapped[int]` = `mapped_column(ForeignKey("restaurants.id"), nullable=False, index=True)`
- `platform`: `Mapped[str]` = `mapped_column(String(100), nullable=False)`
- `rating`: `Mapped[float | None]` = `mapped_column(Float, nullable=True)`
- `text`: `Mapped[str | None]` = `mapped_column(Text, nullable=True)`
- `sentiment_score`: `Mapped[float | None]` = `mapped_column(Float, nullable=True)`
- `ai_response`: `Mapped[str | None]` = `mapped_column(Text, nullable=True)`
- `response_status`: `Mapped[str]` = `mapped_column(
        String(20), default="pending", nullable=False
    )`
- `author_name`: `Mapped[str | None]` = `mapped_column(String(255), nullable=True)`
- `review_date`: `Mapped[datetime | None]` = `mapped_column(
        DateTime(timezone=True), nullable=True
    )`

### Table: `social_posts` (`SocialPost`)

Source: `app/marketing/models.py`

- `restaurant_id`: `Mapped[int]` = `mapped_column(ForeignKey("restaurants.id"), nullable=False, index=True)`
- `platform`: `Mapped[str]` = `mapped_column(String(100), nullable=False)`
- `content`: `Mapped[str | None]` = `mapped_column(Text, nullable=True)`
- `media_urls`: `Mapped[dict | None]` = `mapped_column(JSON, nullable=True)`
- `status`: `Mapped[str]` = `mapped_column(String(20), default="draft", nullable=False)`
- `engagement_json`: `Mapped[dict | None]` = `mapped_column(JSON, nullable=True)`
- `scheduled_at`: `Mapped[datetime | None]` = `mapped_column(
        DateTime(timezone=True), nullable=True
    )`
- `published_at`: `Mapped[datetime | None]` = `mapped_column(
        DateTime(timezone=True), nullable=True
    )`

## app/menu/models.py

### Table: `menu_categories` (`MenuCategory`)

Source: `app/menu/models.py`

- `restaurant_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True, index=True
    )`
- `name`: `Mapped[str]` = `mapped_column(String(100), nullable=False)`
- `description`: `Mapped[str | None]` = `mapped_column(String(500), nullable=True)`
- `icon`: `Mapped[str | None]` = `mapped_column(String(50), nullable=True)`
- `color`: `Mapped[str | None]` = `mapped_column(String(20), nullable=True)`
- `sort_order`: `Mapped[int]` = `mapped_column(Integer, default=0, nullable=False)`
- `is_active`: `Mapped[bool]` = `mapped_column(Boolean, default=True, nullable=False)`

### Table: `menu_combos` (`MenuCombo`)

Source: `app/menu/models.py`

- `restaurant_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True
    )`
- `name`: `Mapped[str]` = `mapped_column(String(255), nullable=False)`
- `description`: `Mapped[str | None]` = `mapped_column(String(500), nullable=True)`
- `combo_price`: `Mapped[float]` = `mapped_column(Numeric(10, 2), nullable=False)`
- `items_json`: `Mapped[dict]` = `mapped_column(JSON, nullable=False)`
- `savings_amount`: `Mapped[float]` = `mapped_column(Numeric(10, 2), default=0, nullable=False)`
- `is_active`: `Mapped[bool]` = `mapped_column(Boolean, default=True, nullable=False)`

### Table: `menu_items` (`MenuItem`)

Source: `app/menu/models.py`

- `restaurant_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True, index=True
    )`
- `category_id`: `Mapped[int]` = `mapped_column(
        Integer, ForeignKey("menu_categories.id", ondelete="CASCADE"), nullable=False, index=True
    )`
- `name`: `Mapped[str]` = `mapped_column(String(255), nullable=False)`
- `description`: `Mapped[str | None]` = `mapped_column(String(1000), nullable=True)`
- `price`: `Mapped[float]` = `mapped_column(Numeric(10, 2), nullable=False)`
- `cost`: `Mapped[float]` = `mapped_column(Numeric(10, 2), default=0, nullable=False)`
- `image_url`: `Mapped[str | None]` = `mapped_column(String(500), nullable=True)`
- `is_available`: `Mapped[bool]` = `mapped_column(Boolean, default=True, nullable=False)`
- `is_featured`: `Mapped[bool]` = `mapped_column(Boolean, default=False, nullable=False)`
- `prep_time_min`: `Mapped[int]` = `mapped_column(Integer, default=15, nullable=False)`
- `allergens_json`: `Mapped[dict | None]` = `mapped_column(JSON, nullable=True)`
- `dietary_tags_json`: `Mapped[dict | None]` = `mapped_column(JSON, nullable=True)`
- `nutrition_json`: `Mapped[dict | None]` = `mapped_column(JSON, nullable=True)`
- `sort_order`: `Mapped[int]` = `mapped_column(Integer, default=0, nullable=False)`

### Table: `menu_item_modifiers` (`MenuItemModifier`)

Source: `app/menu/models.py`

- `item_id`: `Mapped[int]` = `mapped_column(
        Integer, ForeignKey("menu_items.id", ondelete="CASCADE"), nullable=False
    )`
- `modifier_id`: `Mapped[int]` = `mapped_column(
        Integer, ForeignKey("menu_modifiers.id", ondelete="CASCADE"), nullable=False
    )`

### Table: `menu_modifiers` (`MenuModifier`)

Source: `app/menu/models.py`

- `restaurant_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True
    )`
- `name`: `Mapped[str]` = `mapped_column(String(255), nullable=False)`
- `group_name`: `Mapped[str]` = `mapped_column(String(100), nullable=False)`
- `price_adjustment`: `Mapped[float]` = `mapped_column(Numeric(10, 2), default=0, nullable=False)`
- `is_default`: `Mapped[bool]` = `mapped_column(Boolean, default=False, nullable=False)`

### Table: `upsell_rules` (`UpsellRule`)

Source: `app/menu/models.py`

- `restaurant_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True
    )`
- `trigger_item_id`: `Mapped[int]` = `mapped_column(
        Integer, ForeignKey("menu_items.id", ondelete="CASCADE"), nullable=False
    )`
- `suggested_item_id`: `Mapped[int]` = `mapped_column(
        Integer, ForeignKey("menu_items.id", ondelete="CASCADE"), nullable=False
    )`
- `rule_type`: `Mapped[str]` = `mapped_column(String(50), nullable=False)`
- `message`: `Mapped[str | None]` = `mapped_column(String(500), nullable=True)`
- `priority`: `Mapped[int]` = `mapped_column(Integer, default=0, nullable=False)`
- `is_active`: `Mapped[bool]` = `mapped_column(Boolean, default=True, nullable=False)`
- `times_shown`: `Mapped[int]` = `mapped_column(Integer, default=0, nullable=False)`
- `times_accepted`: `Mapped[int]` = `mapped_column(Integer, default=0, nullable=False)`

## app/menu_designer/models.py

### Table: `menu_designs` (`MenuDesign`)

Source: `app/menu_designer/models.py`

- `restaurant_id`: `Mapped[int]` = `mapped_column(ForeignKey("restaurants.id"), nullable=False, index=True)`
- `name`: `Mapped[str]` = `mapped_column(String(255), nullable=False)`
- `template_id`: `Mapped[int | None]` = `mapped_column(Integer, nullable=True)`
- `design_data_json`: `Mapped[dict | None]` = `mapped_column(JSON, nullable=True)`
- `translations_json`: `Mapped[dict | None]` = `mapped_column(JSON, nullable=True)`
- `status`: `Mapped[str]` = `mapped_column(String(20), default="draft", nullable=False)`
- `language`: `Mapped[str]` = `mapped_column(String(10), default="de", nullable=False)`

### Table: `menu_templates` (`MenuTemplate`)

Source: `app/menu_designer/models.py`

- `restaurant_id`: `Mapped[int]` = `mapped_column(ForeignKey("restaurants.id"), nullable=False, index=True)`
- `name`: `Mapped[str]` = `mapped_column(String(255), nullable=False)`
- `description`: `Mapped[str | None]` = `mapped_column(String(500), nullable=True)`
- `layout_type`: `Mapped[str]` = `mapped_column(String(50), nullable=False)`
- `template_config_json`: `Mapped[dict | None]` = `mapped_column(JSON, nullable=True)`
- `is_system`: `Mapped[bool]` = `mapped_column(Boolean, default=False, nullable=False)`

## app/reservations/models.py

### Table: `floor_sections` (`FloorSection`)

Source: `app/reservations/models.py`

- `restaurant_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True
    )`
- `name`: `Mapped[str]` = `mapped_column(String(100), nullable=False)`
- `description`: `Mapped[str | None]` = `mapped_column(String(500), nullable=True)`
- `sort_order`: `Mapped[int]` = `mapped_column(Integer, default=0, nullable=False)`
- `is_active`: `Mapped[bool]` = `mapped_column(Boolean, default=True, nullable=False)`

### Table: `qr_table_codes` (`QRTableCode`)

Source: `app/reservations/models.py`

- `restaurant_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True
    )`
- `table_id`: `Mapped[int]` = `mapped_column(
        Integer, ForeignKey("tables.id", ondelete="CASCADE"), nullable=False
    )`
- `code`: `Mapped[str]` = `mapped_column(String(100), unique=True, nullable=False)`
- `is_active`: `Mapped[bool]` = `mapped_column(Boolean, default=True, nullable=False)`
- `scan_count`: `Mapped[int]` = `mapped_column(Integer, default=0, nullable=False)`
- `last_scanned_at`: `Mapped[datetime | None]` = `mapped_column(DateTime(timezone=True), nullable=True)`

### Table: `reservations` (`Reservation`)

Source: `app/reservations/models.py`

- `restaurant_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True, index=True
    )`
- `guest_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("guest_profiles.id", ondelete="SET NULL"), nullable=True
    )`
- `guest_name`: `Mapped[str]` = `mapped_column(String(255), nullable=False)`
- `guest_phone`: `Mapped[str | None]` = `mapped_column(String(50), nullable=True)`
- `guest_email`: `Mapped[str | None]` = `mapped_column(String(255), nullable=True)`
- `table_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("tables.id", ondelete="SET NULL"), nullable=True
    )`
- `party_size`: `Mapped[int]` = `mapped_column(Integer, nullable=False)`
- `reservation_date`: `Mapped[date]` = `mapped_column(Date, nullable=False, index=True)`
- `start_time`: `Mapped[time]` = `mapped_column(Time, nullable=False)`
- `end_time`: `Mapped[time | None]` = `mapped_column(Time, nullable=True)`
- `duration_min`: `Mapped[int]` = `mapped_column(Integer, default=90, nullable=False)`
- `status`: `Mapped[str]` = `mapped_column(String(20), default="confirmed", nullable=False, index=True)`
- `special_requests`: `Mapped[str | None]` = `mapped_column(String(1000), nullable=True)`
- `notes`: `Mapped[str | None]` = `mapped_column(String(500), nullable=True)`
- `source`: `Mapped[str]` = `mapped_column(String(20), default="phone", nullable=False)`
- `payment_status`: `Mapped[str]` = `mapped_column(String(20), default="pending", nullable=False)`
- `stripe_payment_intent_id`: `Mapped[str | None]` = `mapped_column(String(255), nullable=True)`

### Table: `tables` (`Table`)

Source: `app/reservations/models.py`

- `restaurant_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True, index=True
    )`
- `section_id`: `Mapped[int]` = `mapped_column(
        Integer, ForeignKey("floor_sections.id", ondelete="CASCADE"), nullable=False, index=True
    )`
- `table_number`: `Mapped[str]` = `mapped_column(String(50), nullable=False)`
- `capacity`: `Mapped[int]` = `mapped_column(Integer, nullable=False)`
- `min_capacity`: `Mapped[int]` = `mapped_column(Integer, default=1, nullable=False)`
- `shape`: `Mapped[str]` = `mapped_column(String(20), default="square", nullable=False)`
- `status`: `Mapped[str]` = `mapped_column(String(20), default="available", nullable=False)`
- `position_x`: `Mapped[int]` = `mapped_column(Integer, default=0, nullable=False)`
- `position_y`: `Mapped[int]` = `mapped_column(Integer, default=0, nullable=False)`
- `rotation`: `Mapped[float]` = `mapped_column(Float, default=0.0, nullable=False)`
- `width`: `Mapped[float]` = `mapped_column(Float, default=1.0, nullable=False)`
- `height`: `Mapped[float]` = `mapped_column(Float, default=1.0, nullable=False)`
- `is_active`: `Mapped[bool]` = `mapped_column(Boolean, default=True, nullable=False)`

### Table: `table_sessions` (`TableSession`)

Source: `app/reservations/models.py`

- `restaurant_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True
    )`
- `table_id`: `Mapped[int]` = `mapped_column(
        Integer, ForeignKey("tables.id", ondelete="CASCADE"), nullable=False, index=True
    )`
- `reservation_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("reservations.id", ondelete="SET NULL"), nullable=True
    )`
- `started_at`: `Mapped[datetime]` = `mapped_column(DateTime(timezone=True), nullable=False)`
- `ended_at`: `Mapped[datetime | None]` = `mapped_column(DateTime(timezone=True), nullable=True)`
- `status`: `Mapped[str]` = `mapped_column(String(20), default="active", nullable=False)`
- `covers`: `Mapped[int]` = `mapped_column(Integer, default=1, nullable=False)`

### Table: `waitlist` (`WaitlistEntry`)

Source: `app/reservations/models.py`

- `restaurant_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True
    )`
- `guest_name`: `Mapped[str]` = `mapped_column(String(255), nullable=False)`
- `guest_phone`: `Mapped[str | None]` = `mapped_column(String(50), nullable=True)`
- `party_size`: `Mapped[int]` = `mapped_column(Integer, nullable=False)`
- `estimated_wait_min`: `Mapped[int]` = `mapped_column(Integer, default=15, nullable=False)`
- `status`: `Mapped[str]` = `mapped_column(String(20), default="waiting", nullable=False)`
- `check_in_time`: `Mapped[datetime | None]` = `mapped_column(DateTime(timezone=True), nullable=True)`
- `seated_time`: `Mapped[datetime | None]` = `mapped_column(DateTime(timezone=True), nullable=True)`
- `notes`: `Mapped[str | None]` = `mapped_column(String(500), nullable=True)`

## app/signage/models.py

### Table: `signage_content` (`SignageContent`)

Source: `app/signage/models.py`

- `restaurant_id`: `Mapped[int]` = `mapped_column(ForeignKey("restaurants.id"), nullable=False, index=True)`
- `title`: `Mapped[str]` = `mapped_column(String(255), nullable=False)`
- `content_type`: `Mapped[str]` = `mapped_column(String(50), nullable=False)`
- `content_data_json`: `Mapped[dict | None]` = `mapped_column(JSON, nullable=True)`
- `duration_seconds`: `Mapped[int]` = `mapped_column(Integer, default=15, nullable=False)`
- `is_active`: `Mapped[bool]` = `mapped_column(Boolean, default=True, nullable=False)`

### Table: `signage_playlists` (`SignagePlaylist`)

Source: `app/signage/models.py`

- `restaurant_id`: `Mapped[int]` = `mapped_column(ForeignKey("restaurants.id"), nullable=False, index=True)`
- `name`: `Mapped[str]` = `mapped_column(String(255), nullable=False)`
- `items_json`: `Mapped[list | None]` = `mapped_column(JSON, nullable=True)`
- `schedule_json`: `Mapped[dict | None]` = `mapped_column(JSON, nullable=True)`
- `is_active`: `Mapped[bool]` = `mapped_column(Boolean, default=True, nullable=False)`

### Table: `signage_screens` (`SignageScreen`)

Source: `app/signage/models.py`

- `restaurant_id`: `Mapped[int]` = `mapped_column(ForeignKey("restaurants.id"), nullable=False, index=True)`
- `name`: `Mapped[str]` = `mapped_column(String(255), nullable=False)`
- `location`: `Mapped[str | None]` = `mapped_column(String(255), nullable=True)`
- `screen_code`: `Mapped[str]` = `mapped_column(String(100), unique=True, nullable=False)`
- `resolution`: `Mapped[str]` = `mapped_column(String(20), default="1920x1080", nullable=False)`
- `orientation`: `Mapped[str]` = `mapped_column(String(20), default="landscape", nullable=False)`
- `is_active`: `Mapped[bool]` = `mapped_column(Boolean, default=True, nullable=False)`
- `current_playlist_id`: `Mapped[int | None]` = `mapped_column(Integer, nullable=True)`
- `last_ping_at`: `Mapped[datetime | None]` = `mapped_column(DateTime(timezone=True), nullable=True)`

## app/vision/models.py

### Table: `compliance_events` (`ComplianceEvent`)

Source: `app/vision/models.py`

- `restaurant_id`: `Mapped[int]` = `mapped_column(ForeignKey("restaurants.id"), nullable=False, index=True)`
- `event_type`: `Mapped[str]` = `mapped_column(String(100), nullable=False)`
- `employee_id`: `Mapped[int | None]` = `mapped_column(Integer, nullable=True)`
- `station`: `Mapped[str | None]` = `mapped_column(String(100), nullable=True)`
- `details`: `Mapped[str | None]` = `mapped_column(String(500), nullable=True)`
- `image_url`: `Mapped[str | None]` = `mapped_column(String(500), nullable=True)`

### Table: `vision_alerts` (`VisionAlert`)

Source: `app/vision/models.py`

- `restaurant_id`: `Mapped[int]` = `mapped_column(ForeignKey("restaurants.id"), nullable=False, index=True)`
- `alert_type`: `Mapped[str]` = `mapped_column(String(100), nullable=False)`
- `severity`: `Mapped[str]` = `mapped_column(String(20), default="warning", nullable=False)`
- `description`: `Mapped[str]` = `mapped_column(String(500), nullable=False)`
- `image_url`: `Mapped[str | None]` = `mapped_column(String(500), nullable=True)`
- `confidence`: `Mapped[float | None]` = `mapped_column(Float, nullable=True)`
- `station`: `Mapped[str | None]` = `mapped_column(String(100), nullable=True)`
- `resolved`: `Mapped[bool]` = `mapped_column(Boolean, default=False, nullable=False)`
- `resolved_at`: `Mapped[datetime | None]` = `mapped_column(DateTime(timezone=True), nullable=True)`

### Table: `waste_logs` (`WasteLog`)

Source: `app/vision/models.py`

- `restaurant_id`: `Mapped[int]` = `mapped_column(ForeignKey("restaurants.id"), nullable=False, index=True)`
- `item_name`: `Mapped[str]` = `mapped_column(String(255), nullable=False)`
- `category`: `Mapped[str]` = `mapped_column(String(50), nullable=False)`
- `weight_g`: `Mapped[float]` = `mapped_column(Float, nullable=False)`
- `cost`: `Mapped[float]` = `mapped_column(Numeric(10, 2), nullable=False)`
- `reason`: `Mapped[str | None]` = `mapped_column(String(500), nullable=True)`
- `image_url`: `Mapped[str | None]` = `mapped_column(String(500), nullable=True)`

## app/vouchers/models.py

### Table: `customer_cards` (`CustomerCard`)

Source: `app/vouchers/models.py`

- `restaurant_id`: `Mapped[int]` = `mapped_column(ForeignKey("restaurants.id"), nullable=False, index=True)`
- `guest_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("guest_profiles.id", ondelete="SET NULL"), nullable=True
    )`
- `card_number`: `Mapped[str]` = `mapped_column(String(100), unique=True, nullable=False)`
- `card_type`: `Mapped[str]` = `mapped_column(String(50), nullable=False)`
- `points_balance`: `Mapped[int]` = `mapped_column(Integer, default=0, nullable=False)`
- `tier`: `Mapped[str | None]` = `mapped_column(String(50), nullable=True)`
- `stamps_count`: `Mapped[int]` = `mapped_column(Integer, default=0, nullable=False)`
- `stamps_target`: `Mapped[int]` = `mapped_column(Integer, default=10, nullable=False)`
- `total_spent`: `Mapped[float]` = `mapped_column(Numeric(10, 2), default=0, nullable=False)`
- `holder_name`: `Mapped[str | None]` = `mapped_column(String(255), nullable=True)`
- `is_active`: `Mapped[bool]` = `mapped_column(Boolean, default=True, nullable=False)`

### Table: `vouchers` (`Voucher`)

Source: `app/vouchers/models.py`

- `restaurant_id`: `Mapped[int]` = `mapped_column(ForeignKey("restaurants.id"), nullable=False, index=True)`
- `code`: `Mapped[str]` = `mapped_column(String(100), unique=True, nullable=False)`
- `amount_total`: `Mapped[float]` = `mapped_column(Numeric(10, 2), nullable=False)`
- `amount_remaining`: `Mapped[float]` = `mapped_column(Numeric(10, 2), nullable=False)`
- `customer_name`: `Mapped[str | None]` = `mapped_column(String(255), nullable=True)`
- `customer_email`: `Mapped[str | None]` = `mapped_column(String(255), nullable=True)`
- `status`: `Mapped[str]` = `mapped_column(String(50), default="active", nullable=False)`
- `expiry_date`: `Mapped[datetime | None]` = `mapped_column(DateTime(timezone=True), nullable=True)`
- `created_by_user_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )`
- `notes`: `Mapped[str | None]` = `mapped_column(String(500), nullable=True)`
- `is_gift_card`: `Mapped[bool]` = `mapped_column(Boolean, default=False, nullable=False)`
- `purchaser_name`: `Mapped[str | None]` = `mapped_column(String(255), nullable=True)`

### Table: `voucher_redemptions` (`VoucherRedemption`)

Source: `app/vouchers/models.py`

- `voucher_id`: `Mapped[int]` = `mapped_column(
        Integer, ForeignKey("vouchers.id", ondelete="CASCADE"), nullable=False
    )`
- `order_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("table_orders.id", ondelete="SET NULL"), nullable=True
    )`
- `discount_applied`: `Mapped[float]` = `mapped_column(Numeric(10, 2), nullable=False)`
- `redeemed_at`: `Mapped[datetime]` = `mapped_column(DateTime(timezone=True), nullable=False)`

## app/workforce/models.py

### Table: `applicants` (`Applicant`)

Source: `app/workforce/models.py`

- `restaurant_id`: `Mapped[int]` = `mapped_column(ForeignKey("restaurants.id"), nullable=False, index=True)`
- `name`: `Mapped[str]` = `mapped_column(String(255), nullable=False)`
- `email`: `Mapped[str]` = `mapped_column(String(255), nullable=False)`
- `phone`: `Mapped[str | None]` = `mapped_column(String(50), nullable=True)`
- `position`: `Mapped[str]` = `mapped_column(String(100), nullable=False)`
- `resume_url`: `Mapped[str | None]` = `mapped_column(String(500), nullable=True)`
- `ai_match_score`: `Mapped[float | None]` = `mapped_column(Float, nullable=True)`
- `status`: `Mapped[str]` = `mapped_column(String(20), default="new", nullable=False)`

### Table: `employees` (`Employee`)

Source: `app/workforce/models.py`

- `restaurant_id`: `Mapped[int]` = `mapped_column(ForeignKey("restaurants.id"), nullable=False, index=True)`
- `user_id`: `Mapped[int | None]` = `mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )`
- `name`: `Mapped[str]` = `mapped_column(String(255), nullable=False)`
- `email`: `Mapped[str | None]` = `mapped_column(String(255), nullable=True)`
- `role`: `Mapped[str]` = `mapped_column(String(100), nullable=False)`
- `hourly_rate`: `Mapped[float]` = `mapped_column(Numeric(8, 2), default=0, nullable=False)`
- `skills_json`: `Mapped[dict | None]` = `mapped_column(JSON, nullable=True)`
- `certifications_json`: `Mapped[dict | None]` = `mapped_column(JSON, nullable=True)`
- `hire_date`: `Mapped[date | None]` = `mapped_column(Date, nullable=True)`
- `status`: `Mapped[str]` = `mapped_column(String(20), default="active", nullable=False)`

### Table: `schedules` (`Schedule`)

Source: `app/workforce/models.py`

- `restaurant_id`: `Mapped[int]` = `mapped_column(ForeignKey("restaurants.id"), nullable=False, index=True)`
- `week_start`: `Mapped[date]` = `mapped_column(Date, nullable=False)`
- `status`: `Mapped[str]` = `mapped_column(String(20), default="draft", nullable=False)`
- `total_hours`: `Mapped[float]` = `mapped_column(Float, default=0, nullable=False)`
- `total_cost`: `Mapped[float]` = `mapped_column(Numeric(10, 2), default=0, nullable=False)`
- `auto_generated`: `Mapped[bool]` = `mapped_column(Boolean, default=False, nullable=False)`
- `approved_by`: `Mapped[int | None]` = `mapped_column(Integer, nullable=True)`

### Table: `shifts` (`Shift`)

Source: `app/workforce/models.py`

- `schedule_id`: `Mapped[int]` = `mapped_column(
        Integer, ForeignKey("schedules.id"), nullable=False
    )`
- `employee_id`: `Mapped[int]` = `mapped_column(
        Integer, ForeignKey("employees.id"), nullable=False
    )`
- `date`: `Mapped[date]` = `mapped_column(Date, nullable=False)`
- `start_time`: `Mapped[time]` = `mapped_column(Time, nullable=False)`
- `end_time`: `Mapped[time]` = `mapped_column(Time, nullable=False)`
- `role`: `Mapped[str]` = `mapped_column(String(100), nullable=False)`
- `station`: `Mapped[str | None]` = `mapped_column(String(100), nullable=True)`
- `actual_clock_in`: `Mapped[datetime | None]` = `mapped_column(
        DateTime(timezone=True), nullable=True
    )`
- `actual_clock_out`: `Mapped[datetime | None]` = `mapped_column(
        DateTime(timezone=True), nullable=True
    )`

### Table: `training_modules` (`TrainingModule`)

Source: `app/workforce/models.py`

- `restaurant_id`: `Mapped[int]` = `mapped_column(ForeignKey("restaurants.id"), nullable=False, index=True)`
- `title`: `Mapped[str]` = `mapped_column(String(255), nullable=False)`
- `category`: `Mapped[str]` = `mapped_column(String(100), nullable=False)`
- `duration_min`: `Mapped[int]` = `mapped_column(Integer, default=0, nullable=False)`
- `content_url`: `Mapped[str | None]` = `mapped_column(String(500), nullable=True)`
- `required_for_roles`: `Mapped[dict | None]` = `mapped_column(JSON, nullable=True)`

### Table: `training_progress` (`TrainingProgress`)

Source: `app/workforce/models.py`

- `employee_id`: `Mapped[int]` = `mapped_column(
        Integer, ForeignKey("employees.id"), nullable=False
    )`
- `module_id`: `Mapped[int]` = `mapped_column(
        Integer, ForeignKey("training_modules.id"), nullable=False
    )`
- `status`: `Mapped[str]` = `mapped_column(String(20), default="assigned", nullable=False)`
- `score`: `Mapped[float | None]` = `mapped_column(Float, nullable=True)`
- `completed_at`: `Mapped[datetime | None]` = `mapped_column(
        DateTime(timezone=True), nullable=True
    )`
