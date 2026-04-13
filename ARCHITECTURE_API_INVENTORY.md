# API Inventory

Generated from FastAPI router declarations in `backend/app`.

## Notes

- `Request` lists the non-dependency function parameters from the route handler.
- `Response` is the FastAPI `response_model` when present, otherwise the handler returns untyped JSON / dict data.
- Authenticated routes rely on bearer token auth unless they are under public prefixes or runtime health endpoints.

## Accounting

Source: `app.accounting.router`

| Method | Path | Handler | Purpose | Request | Response |
|---|---|---|---|---|---|
| `GET` | `/api/accounting/budgets` | `list_budgets` | List budgets | period: str \| None | list[BudgetRead] |
| `POST` | `/api/accounting/budgets` | `add_budget` | Add budget | payload: BudgetCreate | BudgetRead |
| `GET` | `/api/accounting/cash-flow` | `cash_flow` | Cash flow | No explicit request fields | Untyped JSON / dict |
| `GET` | `/api/accounting/gl` | `list_gl_entries` | List gl entries | limit: int | list[GLEntryRead] |
| `GET` | `/api/accounting/invoices` | `list_invoices` | List invoices | status: str \| None, limit: int | list[InvoiceRead] |
| `POST` | `/api/accounting/invoices` | `add_invoice` | Add invoice | payload: InvoiceCreate | InvoiceRead |
| `GET` | `/api/accounting/pl` | `profit_and_loss` | Profit and loss | period: str \| None | Untyped JSON / dict |
| `GET` | `/api/accounting/reports/{report_type}` | `get_report` | Get report | report_type: str | Untyped JSON / dict |

## Authentication

Source: `app.auth.router`

| Method | Path | Handler | Purpose | Request | Response |
|---|---|---|---|---|---|
| `POST` | `/api/auth/login` | `login` | Login | payload: LoginRequest | TokenResponse |
| `GET` | `/api/auth/me` | `me` | Me | No explicit request fields | UserRead |
| `POST` | `/api/auth/refresh` | `refresh` | Refresh | payload: RefreshRequest | TokenResponse |
| `POST` | `/api/auth/register` | `register` | Register | payload: RegisterRequest | UserRead |

## Billing / POS / KDS

Source: `app.billing.router`

| Method | Path | Handler | Purpose | Request | Response |
|---|---|---|---|---|---|
| `POST` | `/api/billing/bills` | `create_bill` | Create bill | payload: BillCreate | BillRead |
| `GET` | `/api/billing/bills/by-order/{order_id}` | `bill_by_order` | Bill by order | order_id: int | BillRead |
| `GET` | `/api/billing/bills/{bill_id}` | `bill_detail` | Bill detail | bill_id: int | BillRead |
| `GET` | `/api/billing/bills/{bill_id}/digital-receipt` | `digital_receipt` | Digital receipt | bill_id: int | Untyped JSON / dict |
| `GET` | `/api/billing/bills/{bill_id}/receipt` | `receipt` | Receipt | bill_id: int | Untyped JSON / dict |
| `POST` | `/api/billing/bills/{bill_id}/send-receipt` | `send_receipt_endpoint` | Send receipt endpoint | bill_id: int, payload: SendReceiptRequest | Untyped JSON / dict |
| `PUT` | `/api/billing/bills/{bill_id}/split` | `split_bill` | Split bill | bill_id: int, payload: BillSplitUpdate | BillRead |
| `GET` | `/api/billing/cash-shifts` | `list_shifts` | List shifts | limit: int | list[CashShiftRead] |
| `GET` | `/api/billing/cash-shifts/current` | `current_shift` | Current shift | No explicit request fields | Untyped JSON / dict |
| `POST` | `/api/billing/cash-shifts/open` | `open_shift` | Open shift | payload: CashShiftOpen | CashShiftRead |
| `POST` | `/api/billing/cash-shifts/{shift_id}/close` | `close_shift` | Close shift | shift_id: int, payload: CashShiftClose | CashShiftRead |
| `GET` | `/api/billing/daily-summary` | `daily_summary` | Daily summary | target_date: date \| None | Untyped JSON / dict |
| `DELETE` | `/api/billing/items/{item_id}` | `remove_item` | Remove item | item_id: int | Untyped JSON / dict |
| `PUT` | `/api/billing/items/{item_id}` | `edit_item` | Edit item | item_id: int, payload: OrderItemUpdate | OrderItemRead |
| `POST` | `/api/billing/kds/items/{item_id}/ready` | `kds_item_ready` | Kds item ready | item_id: int | OrderItemRead |
| `POST` | `/api/billing/kds/items/{item_id}/recall` | `kds_item_recall` | Kds item recall | item_id: int | OrderItemRead |
| `POST` | `/api/billing/kds/items/{item_id}/served` | `kds_item_served` | Kds item served | item_id: int | OrderItemRead |
| `GET` | `/api/billing/kds/orders` | `kds_orders` | Kds orders | station: str \| None | Untyped JSON / dict |
| `POST` | `/api/billing/kds/orders/{order_id}/bump` | `kds_bump_order` | Kds bump order | order_id: int | Untyped JSON / dict |
| `GET` | `/api/billing/kds/stations` | `list_kds_stations` | List kds stations | active_only: bool | list[KDSStationRead] |
| `POST` | `/api/billing/kds/stations` | `add_kds_station` | Add kds station | payload: KDSStationCreate | KDSStationRead |
| `DELETE` | `/api/billing/kds/stations/{station_id}` | `remove_kds_station` | Remove kds station | station_id: int | Untyped JSON / dict |
| `PUT` | `/api/billing/kds/stations/{station_id}` | `edit_kds_station` | Edit kds station | station_id: int, payload: KDSStationUpdate | KDSStationRead |
| `GET` | `/api/billing/orders` | `list_active_orders` | List active orders | No explicit request fields | list[TableOrderRead] |
| `POST` | `/api/billing/orders` | `new_order` | New order | payload: TableOrderCreate | TableOrderRead |
| `GET` | `/api/billing/orders/live` | `live_orders` | Live orders | No explicit request fields | Untyped JSON / dict |
| `GET` | `/api/billing/orders/{order_id}` | `order_detail` | Order detail | order_id: int | TableOrderRead |
| `PUT` | `/api/billing/orders/{order_id}` | `edit_order` | Edit order | order_id: int, payload: TableOrderUpdate | TableOrderRead |
| `POST` | `/api/billing/orders/{order_id}/close` | `close` | Close | order_id: int | TableOrderRead |
| `GET` | `/api/billing/orders/{order_id}/items` | `list_order_items` | List order items | order_id: int | list[OrderItemRead] |
| `POST` | `/api/billing/orders/{order_id}/items` | `add_item` | Add item | order_id: int, payload: OrderItemCreate | OrderItemRead |
| `POST` | `/api/billing/orders/{order_id}/send-to-kitchen` | `kitchen_send` | Kitchen send | order_id: int | TableOrderRead |
| `POST` | `/api/billing/payments` | `make_payment` | Make payment | payload: PaymentCreate | PaymentRead |
| `POST` | `/api/billing/payments/{payment_id}/refund` | `refund` | Refund | payment_id: int, payload: RefundCreate | PaymentRead |
| `GET` | `/api/public/billing/receipt/{token}` | `public_receipt` | Public receipt | token: str | Untyped JSON / dict |

## Stripe Webhooks

Source: `app.billing.stripe_router`

| Method | Path | Handler | Purpose | Request | Response |
|---|---|---|---|---|---|
| `POST` | `/api/webhooks/stripe/webhook` | `stripe_webhook` | Stripe webhook | request: Request | Untyped JSON / dict |

## Agents / Revenue Control

Source: `app.core.router`

| Method | Path | Handler | Purpose | Request | Response |
|---|---|---|---|---|---|
| `GET` | `/api/agents` | `list_agents` | List agents | No explicit request fields | list[AgentConfigRead] |
| `POST` | `/api/agents/revenue-control-tower/experiments` | `revenue_experiment_create` | Revenue experiment create | payload: RevenueExperimentCreate | RevenueExperimentRead |
| `POST` | `/api/agents/revenue-control-tower/experiments/{experiment_id}/events` | `revenue_experiment_record_event` | Revenue experiment record event | experiment_id: int, payload: RevenueExperimentEventCreate | RevenueExperimentRead |
| `POST` | `/api/agents/revenue-control-tower/experiments/{experiment_id}/start` | `revenue_experiment_start` | Revenue experiment start | experiment_id: int | RevenueExperimentRead |
| `POST` | `/api/agents/revenue-control-tower/experiments/{experiment_id}/stop` | `revenue_experiment_stop` | Revenue experiment stop | experiment_id: int | RevenueExperimentStopResponse |
| `GET` | `/api/agents/revenue-control-tower/experiments/{experiment_id}/uplift-dashboard` | `revenue_experiment_uplift_dashboard` | Revenue experiment uplift dashboard | experiment_id: int | RevenueExperimentDashboardResponse |
| `GET` | `/api/agents/revenue-control-tower/policy` | `revenue_control_policy` | Revenue control policy | No explicit request fields | RevenueControlPolicyRead |
| `PUT` | `/api/agents/revenue-control-tower/policy` | `revenue_control_policy_update` | Revenue control policy update | payload: RevenueControlPolicyUpdate | RevenueControlPolicyRead |
| `GET` | `/api/agents/revenue-control-tower/upsell-candidates` | `revenue_upsell_candidates` | Revenue upsell candidates | guest_id: int \| None, limit: int | RevenueUpsellOptimizerResponse |
| `POST` | `/api/agents/service-autopilot/actions/{action_id}/approve` | `service_autopilot_approve` | Service autopilot approve | action_id: int | ServiceAutopilotActionExecuteResponse |
| `POST` | `/api/agents/service-autopilot/actions/{action_id}/execute` | `service_autopilot_execute` | Service autopilot execute | action_id: int | ServiceAutopilotActionExecuteResponse |
| `GET` | `/api/agents/service-autopilot/predict` | `service_autopilot_predict` | Service autopilot predict | horizon_minutes: int | ServiceAutopilotPredictionResponse |
| `POST` | `/api/agents/service-autopilot/suggest` | `service_autopilot_suggest` | Service autopilot suggest | horizon_minutes: int | ServiceAutopilotSuggestResponse |
| `GET` | `/api/agents/{name}` | `agent_detail` | Agent detail | name: str | AgentConfigRead |
| `GET` | `/api/agents/{name}/actions` | `agent_actions` | Agent actions | name: str, limit: int | list[AgentActionRead] |
| `POST` | `/api/agents/{name}/approve/{action_id}` | `approve_agent_action` | Approve agent action | name: str, action_id: int, user_id: int | AgentActionRead |
| `PUT` | `/api/agents/{name}/config` | `update_config` | Update config | name: str, payload: AgentConfigUpdate | AgentConfigRead |

## Operational Dashboard

Source: `app.dashboard.router`

| Method | Path | Handler | Purpose | Request | Response |
|---|---|---|---|---|---|
| `GET` | `/api/dashboard/activity` | `recent_activity` | Recent activity | limit: int | list[AgentActionRead] |
| `GET` | `/api/dashboard/alerts` | `list_alerts` | List alerts | is_read: bool \| None, limit: int | list[AlertRead] |
| `PUT` | `/api/dashboard/alerts/{alert_id}` | `edit_alert` | Edit alert | alert_id: int, payload: AlertUpdate | AlertRead |
| `GET` | `/api/dashboard/audit-timeline` | `audit_timeline` | Audit timeline | entity_type: str \| None, entity_id: int \| None, limit: int | list[AuditTimelineEvent] |
| `GET` | `/api/dashboard/exceptions` | `exception_inbox` | Exception inbox | severity: str \| None, status: str, owner: str \| None, limit: int | list[ExceptionInboxItem] |
| `PATCH` | `/api/dashboard/exceptions/{exception_id}` | `update_exception` | Update exception | exception_id: int, payload: ExceptionWorkflowUpdate | ExceptionInboxItem |
| `GET` | `/api/dashboard/kpis` | `kpi_history` | Kpi history | metric_name: str \| None, limit: int | list[KPISnapshotRead] |
| `GET` | `/api/dashboard/live` | `live_kpis` | Live kpis | No explicit request fields | list[KPISnapshotRead] |
| `POST` | `/api/dashboard/query` | `nl_query` | Nl query | payload: NLQueryRequest | NLQueryResponse |
| `GET` | `/api/dashboard/recommendations` | `explainable_recommendations` | Explainable recommendations | status: str \| None, limit: int | list[ExplainableRecommendation] |
| `GET` | `/api/dashboard/slo` | `slo_dashboard` | Slo dashboard | window_minutes: int | SLODashboardResponse |

## Simulation / Digital Twin

Source: `app.digital_twin.router`

| Method | Path | Handler | Purpose | Request | Response |
|---|---|---|---|---|---|
| `GET` | `/api/simulation/results/{run_id}` | `simulation_results` | Simulation results | run_id: int | SimulationRunRead |
| `POST` | `/api/simulation/run` | `start_simulation` | Start simulation | payload: SimulationRunCreate | SimulationRunRead |
| `GET` | `/api/simulation/scenarios` | `list_scenarios` | List scenarios | limit: int | list[ScenarioRead] |
| `POST` | `/api/simulation/scenarios` | `add_scenario` | Add scenario | payload: ScenarioCreate | ScenarioRead |

## Email Inbox

Source: `app.email_inbox.router`

| Method | Path | Handler | Purpose | Request | Response |
|---|---|---|---|---|---|
| `POST` | `/api/email-inbox/ingest` | `ingest_email_thread` | Ingest email thread | payload: NormalizedEmailPayload, background_tasks: BackgroundTasks, x_email_inbox_secret: str \| None | EmailIngestResponse |
| `GET` | `/api/hms/email-inbox` | `list_email_threads` | List email threads | limit: int, _user: Any | EmailInboxListResponse |
| `GET` | `/api/hms/email-inbox/stats` | `get_email_inbox_stats` | Get email inbox stats | _user: Any | Untyped JSON / dict |
| `GET` | `/api/hms/email-inbox/{thread_id}` | `get_email_thread_detail` | Get email thread detail | thread_id: int, _user: Any | EmailThreadRead |
| `PATCH` | `/api/hms/email-inbox/{thread_id}` | `patch_email_thread` | Patch email thread | thread_id: int, payload: EmailThreadUpdate, _user: Any | EmailThreadRead |
| `POST` | `/api/hms/email-inbox/{thread_id}/generate-reply` | `generate_reply` | Generate reply | thread_id: int, _user: Any | GenerateReplyResponse |
| `POST` | `/api/hms/email-inbox/{thread_id}/send-reply` | `send_reply` | Send reply | thread_id: int, payload: SendReplyRequest | GenerateReplyResponse |

## Food Safety

Source: `app.food_safety.router`

| Method | Path | Handler | Purpose | Request | Response |
|---|---|---|---|---|---|
| `GET` | `/api/safety/allergens` | `list_allergens` | List allergens | limit: int | list[AllergenAlertRead] |
| `POST` | `/api/safety/ask` | `ask_compliance` | Ask compliance | payload: ComplianceAskRequest | ComplianceAskResponse |
| `GET` | `/api/safety/compliance-score` | `compliance_score` | Compliance score | limit: int | list[ComplianceScoreRead] |
| `GET` | `/api/safety/haccp` | `list_haccp_logs` | List haccp logs | check_type: str \| None, limit: int | list[HACCPLogRead] |
| `POST` | `/api/safety/haccp` | `add_haccp_log` | Add haccp log | payload: HACCPLogCreate | HACCPLogRead |
| `GET` | `/api/safety/temperatures` | `list_temperatures` | List temperatures | location: str \| None, limit: int | list[TemperatureReadingRead] |

## Forecasting

Source: `app.forecasting.router`

| Method | Path | Handler | Purpose | Request | Response |
|---|---|---|---|---|---|
| `GET` | `/api/forecast/accuracy` | `accuracy` | Accuracy | No explicit request fields | Untyped JSON / dict |
| `GET` | `/api/forecast/items/{item_id}` | `item_forecast` | Item forecast | item_id: int, limit: int | list[ForecastRead] |
| `GET` | `/api/forecast/labor` | `labor_forecast` | Labor forecast | limit: int | list[ForecastRead] |
| `POST` | `/api/forecast/retrain` | `retrain` | Retrain | forecast_type: str | Untyped JSON / dict |
| `GET` | `/api/forecast/sales` | `sales_forecast` | Sales forecast | limit: int | list[ForecastRead] |

## Franchise / Multi-location

Source: `app.franchise.router`

| Method | Path | Handler | Purpose | Request | Response |
|---|---|---|---|---|---|
| `GET` | `/api/franchise/anomalies` | `location_anomalies` | Location anomalies | No explicit request fields | list[dict[str, Any]] |
| `GET` | `/api/franchise/benchmarks` | `list_benchmarks` | List benchmarks | metric_name: str \| None, limit: int | list[BenchmarkRead] |
| `GET` | `/api/franchise/locations` | `list_locations` | List locations | active_only: bool, limit: int | list[LocationRead] |
| `POST` | `/api/franchise/locations` | `add_location` | Add location | payload: LocationCreate | LocationRead |
| `GET` | `/api/franchise/locations/{location_id}` | `get_location` | Get location | location_id: int | LocationRead |
| `GET` | `/api/franchise/rankings` | `location_rankings` | Location rankings | No explicit request fields | list[dict[str, Any]] |

## Guests / CRM

Source: `app.guests.router`

| Method | Path | Handler | Purpose | Request | Response |
|---|---|---|---|---|---|
| `GET` | `/api/guests` | `list_guests` | List guests | limit: int | list[GuestProfileRead] |
| `POST` | `/api/guests` | `add_guest` | Add guest | payload: GuestCreate | GuestProfileRead |
| `GET` | `/api/guests/churn-risk` | `churn_risk` | Churn risk | threshold: float | list[GuestProfileRead] |
| `GET` | `/api/guests/loyalty` | `loyalty` | Loyalty | No explicit request fields | Untyped JSON / dict |
| `GET` | `/api/guests/orders` | `list_orders` | List orders | guest_id: int \| None, limit: int | list[OrderRead] |
| `POST` | `/api/guests/orders` | `add_order` | Add order | payload: OrderCreate | OrderRead |
| `GET` | `/api/guests/pricing` | `pricing` | Pricing | No explicit request fields | Untyped JSON / dict |
| `POST` | `/api/guests/promotions` | `create_promotion` | Create promotion | payload: PromotionCreate | PromotionRead |
| `GET` | `/api/guests/{guest_id}` | `guest_detail` | Guest detail | guest_id: int | GuestProfileRead |

## Public Hotel

Source: `app.hms.public_router`

| Method | Path | Handler | Purpose | Request | Response |
|---|---|---|---|---|---|
| `GET` | `/api/public/hotel/availability` | `check_room_availability` | Check room availability | check_in: date, check_out: date, room_type: str, property_id: int, adults: int, children: int | Untyped JSON / dict |
| `GET` | `/api/public/hotel/rooms` | `get_public_rooms` | Get public rooms | property_id: int | Untyped JSON / dict |

## Hotel Management

Source: `app.hms.router`

| Method | Path | Handler | Purpose | Request | Response |
|---|---|---|---|---|---|
| `GET` | `/api/hms/front-desk/arrivals` | `get_front_desk_arrivals` | Get front desk arrivals | property_id: int \| None | Untyped JSON / dict |
| `GET` | `/api/hms/front-desk/departures` | `get_front_desk_departures` | Get front desk departures | property_id: int \| None | Untyped JSON / dict |
| `GET` | `/api/hms/front-desk/stats` | `get_front_desk_stats` | Get front desk stats | property_id: int \| None | Untyped JSON / dict |
| `GET` | `/api/hms/overview` | `get_hms_overview` | Get hms overview | property_id: int \| None | Untyped JSON / dict |
| `GET` | `/api/hms/reservations` | `list_reservations` | List reservations | property_id: int \| None, status: str \| None, limit: int | Untyped JSON / dict |
| `PATCH` | `/api/hms/reservations/{reservation_id}` | `patch_reservation` | Patch reservation | reservation_id: str, payload: ReservationUpdate | Untyped JSON / dict |
| `PUT` | `/api/hms/reservations/{reservation_id}` | `update_reservation` | Update reservation | reservation_id: str, payload: ReservationUpdate | Untyped JSON / dict |
| `GET` | `/api/hms/rooms` | `get_hms_rooms` | Get hms rooms | property_id: int \| None | Untyped JSON / dict |

## External Integrations

Source: `app.integrations.router`

| Method | Path | Handler | Purpose | Request | Response |
|---|---|---|---|---|---|
| `POST` | `/voicebooker` | `receive_voicebooker_webhook` | Receive voicebooker webhook | request: Request, background_tasks: BackgroundTasks, x_vb_signature: str \| None, x_vb_timestamp: str \| None | WebhookResponse |

## Inventory / Procurement

Source: `app.inventory.router`

| Method | Path | Handler | Purpose | Request | Response |
|---|---|---|---|---|---|
| `GET` | `/api/inventory/auto-purchase-rules` | `list_auto_purchase_rules` | List auto purchase rules | active_only: bool | list[AutoPurchaseRuleRead] |
| `POST` | `/api/inventory/auto-purchase-rules` | `add_auto_purchase_rule` | Add auto purchase rule | payload: AutoPurchaseRuleCreate | AutoPurchaseRuleRead |
| `DELETE` | `/api/inventory/auto-purchase-rules/{rule_id}` | `remove_auto_purchase_rule` | Remove auto purchase rule | rule_id: int | Untyped JSON / dict |
| `PUT` | `/api/inventory/auto-purchase-rules/{rule_id}` | `edit_auto_purchase_rule` | Edit auto purchase rule | rule_id: int, payload: AutoPurchaseRuleUpdate | AutoPurchaseRuleRead |
| `GET` | `/api/inventory/items` | `list_items` | List items | category: str \| None, limit: int | list[InventoryItemRead] |
| `POST` | `/api/inventory/items` | `add_item` | Add item | payload: InventoryItemCreate | InventoryItemRead |
| `PUT` | `/api/inventory/items/{item_id}` | `edit_item` | Edit item | item_id: int, payload: InventoryItemUpdate | InventoryItemRead |
| `GET` | `/api/inventory/low-stock` | `low_stock` | Low stock | No explicit request fields | list[InventoryItemRead] |
| `GET` | `/api/inventory/orders` | `list_orders` | List orders | status: str \| None, limit: int | list[PurchaseOrderRead] |
| `POST` | `/api/inventory/orders` | `add_order` | Add order | payload: PurchaseOrderCreate | PurchaseOrderRead |
| `PUT` | `/api/inventory/orders/{order_id}` | `edit_order` | Edit order | order_id: int, payload: PurchaseOrderUpdate | PurchaseOrderRead |
| `POST` | `/api/inventory/orders/{order_id}/receive` | `receive_order` | Receive order | order_id: int, payload: GoodsReceiptCreate | PurchaseOrderRead |
| `GET` | `/api/inventory/price-comparison` | `price_comparison` | Price comparison | item_id: int | Untyped JSON / dict |
| `GET` | `/api/inventory/tva` | `tva_report` | Tva report | period: str \| None | list[TVAReportRead] |
| `GET` | `/api/inventory/vendors` | `list_vendors` | List vendors | active_only: bool | list[VendorRead] |
| `POST` | `/api/inventory/vendors` | `add_vendor` | Add vendor | payload: VendorCreate | VendorRead |
| `PUT` | `/api/inventory/vendors/{vendor_id}` | `edit_vendor` | Edit vendor | vendor_id: int, payload: VendorUpdate | VendorRead |
| `GET` | `/api/inventory/vendors/{vendor_id}/catalog` | `vendor_catalog` | Vendor catalog | vendor_id: int | list[SupplierCatalogItemRead] |
| `POST` | `/api/inventory/vendors/{vendor_id}/catalog` | `add_vendor_catalog_item` | Add vendor catalog item | vendor_id: int, payload: SupplierCatalogItemCreate | SupplierCatalogItemRead |

## Platform Runtime

Source: `app.main`

| Method | Path | Handler | Purpose | Request | Response |
|---|---|---|---|---|---|
| `GET` | `/api/health` | `health_check` | Health check | No explicit request fields | Untyped JSON / dict |
| `GET` | `/api/metrics` | `get_metrics` | Get metrics | window_minutes: int | Untyped JSON / dict |
| `GET` | `/api/ready` | `readiness` | Readiness | No explicit request fields | Untyped JSON / dict |
| `GET` | `/health` | `health_check_root` | Health check root | No explicit request fields | Untyped JSON / dict |
| `GET` | `/internal/reservations/conflict-insights` | `reservation_conflict_insights` | Reservation conflict insights | window_hours: int | Untyped JSON / dict |
| `GET` | `/internal/reservations/system-consistency-check` | `reservation_system_consistency_check` | Reservation system consistency check | window_hours: int | Untyped JSON / dict |
| `GET` | `/mcp/voicebooker` | `mcp_voicebooker_root_redirect` | Mcp voicebooker root redirect | No explicit request fields | Untyped JSON / dict |
| `HEAD` | `/mcp/voicebooker/` | `mcp_voicebooker_head_ok` | Mcp voicebooker head ok | No explicit request fields | Untyped JSON / dict |
| `GET` | `/ready` | `readiness_root` | Readiness root | No explicit request fields | Untyped JSON / dict |

## Maintenance / Energy

Source: `app.maintenance.router`

| Method | Path | Handler | Purpose | Request | Response |
|---|---|---|---|---|---|
| `GET` | `/api/maintenance/energy/savings` | `energy_savings` | Energy savings | No explicit request fields | dict[str, Any] |
| `GET` | `/api/maintenance/energy/usage` | `energy_usage` | Energy usage | zone: str \| None, limit: int | list[EnergyReadingRead] |
| `GET` | `/api/maintenance/equipment` | `list_equipment` | List equipment | status: str \| None, limit: int | list[EquipmentRead] |
| `POST` | `/api/maintenance/equipment` | `add_equipment` | Add equipment | payload: EquipmentCreate | EquipmentRead |
| `GET` | `/api/maintenance/equipment/{equipment_id}` | `get_equipment` | Get equipment | equipment_id: int | EquipmentRead |
| `GET` | `/api/maintenance/predictions` | `failure_predictions` | Failure predictions | No explicit request fields | list[dict[str, Any]] |
| `GET` | `/api/maintenance/tickets` | `list_tickets` | List tickets | status: str \| None, limit: int | list[MaintenanceTicketRead] |
| `POST` | `/api/maintenance/tickets` | `add_ticket` | Add ticket | payload: MaintenanceTicketCreate | MaintenanceTicketRead |

## Marketing / Reputation

Source: `app.marketing.router`

| Method | Path | Handler | Purpose | Request | Response |
|---|---|---|---|---|---|
| `GET` | `/api/marketing/campaigns` | `list_campaigns` | List campaigns | status: str \| None, limit: int | list[CampaignRead] |
| `POST` | `/api/marketing/campaigns` | `add_campaign` | Add campaign | payload: CampaignCreate | CampaignRead |
| `GET` | `/api/marketing/reputation` | `reputation_score` | Reputation score | No explicit request fields | dict[str, Any] |
| `GET` | `/api/marketing/reviews` | `list_reviews` | List reviews | platform: str \| None, limit: int | list[ReviewRead] |
| `POST` | `/api/marketing/reviews/{review_id}/respond` | `review_respond` | Review respond | review_id: int, payload: ReviewResponseRequest | ReviewRead |
| `GET` | `/api/marketing/social` | `list_social_posts` | List social posts | platform: str \| None, limit: int | list[SocialPostRead] |
| `POST` | `/api/marketing/social/generate` | `gen_social_content` | Gen social content | payload: SocialPostCreate | SocialPostRead |

## Menu / Catalog

Source: `app.menu.router`

| Method | Path | Handler | Purpose | Request | Response |
|---|---|---|---|---|---|
| `GET` | `/api/menu/analytics` | `menu_analytics` | Menu analytics | No explicit request fields | MenuAnalytics |
| `GET` | `/api/menu/categories` | `list_categories` | List categories | No explicit request fields | list[MenuCategoryRead] |
| `POST` | `/api/menu/categories` | `add_category` | Add category | payload: MenuCategoryCreate | MenuCategoryRead |
| `DELETE` | `/api/menu/categories/{category_id}` | `remove_category` | Remove category | category_id: int | Untyped JSON / dict |
| `PUT` | `/api/menu/categories/{category_id}` | `edit_category` | Edit category | category_id: int, payload: MenuCategoryUpdate | MenuCategoryRead |
| `GET` | `/api/menu/combos` | `list_combos` | List combos | No explicit request fields | list[MenuComboRead] |
| `POST` | `/api/menu/combos` | `add_combo` | Add combo | payload: MenuComboCreate | MenuComboRead |
| `DELETE` | `/api/menu/combos/{combo_id}` | `remove_combo` | Remove combo | combo_id: int | Untyped JSON / dict |
| `PUT` | `/api/menu/combos/{combo_id}` | `edit_combo` | Edit combo | combo_id: int, payload: MenuComboUpdate | MenuComboRead |
| `DELETE` | `/api/menu/item-modifiers/{link_id}` | `remove_item_modifier` | Remove item modifier | link_id: int | Untyped JSON / dict |
| `GET` | `/api/menu/items` | `list_items` | List items | category_id: int \| None, dietary: str \| None, search: str \| None, available: bool \| None | list[MenuItemRead] |
| `POST` | `/api/menu/items` | `add_item` | Add item | payload: MenuItemCreate | MenuItemRead |
| `DELETE` | `/api/menu/items/{item_id}` | `remove_item` | Remove item | item_id: int | Untyped JSON / dict |
| `GET` | `/api/menu/items/{item_id}` | `item_detail` | Item detail | item_id: int | MenuItemRead |
| `PUT` | `/api/menu/items/{item_id}` | `edit_item` | Edit item | item_id: int, payload: MenuItemUpdate | MenuItemRead |
| `GET` | `/api/menu/items/{item_id}/modifiers` | `list_item_modifiers` | List item modifiers | item_id: int | list[MenuModifierRead] |
| `POST` | `/api/menu/items/{item_id}/modifiers` | `add_item_modifier` | Add item modifier | item_id: int, payload: MenuItemModifierCreate | MenuItemModifierRead |
| `GET` | `/api/menu/items/{item_id}/suggestions` | `item_suggestions` | Item suggestions | item_id: int | Untyped JSON / dict |
| `GET` | `/api/menu/modifiers` | `list_modifiers` | List modifiers | group_name: str \| None | list[MenuModifierRead] |
| `POST` | `/api/menu/modifiers` | `add_modifier` | Add modifier | payload: MenuModifierCreate | MenuModifierRead |
| `DELETE` | `/api/menu/modifiers/{modifier_id}` | `remove_modifier` | Remove modifier | modifier_id: int | Untyped JSON / dict |
| `PUT` | `/api/menu/modifiers/{modifier_id}` | `edit_modifier` | Edit modifier | modifier_id: int, payload: MenuModifierUpdate | MenuModifierRead |
| `GET` | `/api/menu/upsell-rules` | `list_upsell_rules` | List upsell rules | active_only: bool | list[UpsellRuleRead] |
| `POST` | `/api/menu/upsell-rules` | `add_upsell_rule` | Add upsell rule | payload: UpsellRuleCreate | UpsellRuleRead |
| `DELETE` | `/api/menu/upsell-rules/{rule_id}` | `remove_upsell_rule` | Remove upsell rule | rule_id: int | Untyped JSON / dict |
| `PUT` | `/api/menu/upsell-rules/{rule_id}` | `edit_upsell_rule` | Edit upsell rule | rule_id: int, payload: UpsellRuleUpdate | UpsellRuleRead |
| `POST` | `/api/menu/upsell-rules/{rule_id}/accepted` | `upsell_accepted` | Upsell accepted | rule_id: int | UpsellRuleRead |

## Menu Designer

Source: `app.menu_designer.router`

| Method | Path | Handler | Purpose | Request | Response |
|---|---|---|---|---|---|
| `GET` | `/api/menu-designer/designs` | `list_designs` | List designs | No explicit request fields | list[schemas.MenuDesignRead] |
| `POST` | `/api/menu-designer/designs` | `create_design` | Create design | data: schemas.MenuDesignCreate | schemas.MenuDesignRead |
| `DELETE` | `/api/menu-designer/designs/{design_id}` | `delete_design` | Delete design | design_id: int | Untyped JSON / dict |
| `PUT` | `/api/menu-designer/designs/{design_id}` | `update_design` | Update design | design_id: int, data: schemas.MenuDesignUpdate | schemas.MenuDesignRead |
| `GET` | `/api/menu-designer/designs/{design_id}/preview` | `preview_design` | Preview design | design_id: int | Untyped JSON / dict |
| `POST` | `/api/menu-designer/designs/{design_id}/publish` | `publish_design` | Publish design | design_id: int | schemas.PublishResponse |
| `GET` | `/api/menu-designer/templates` | `list_templates` | List templates | No explicit request fields | list[schemas.MenuTemplateRead] |
| `POST` | `/api/menu-designer/templates` | `create_template` | Create template | data: schemas.MenuTemplateCreate | schemas.MenuTemplateRead |
| `DELETE` | `/api/menu-designer/templates/{template_id}` | `delete_template` | Delete template | template_id: int | Untyped JSON / dict |

## QR Ordering

Source: `app.qr_ordering.router`

| Method | Path | Handler | Purpose | Request | Response |
|---|---|---|---|---|---|
| `POST` | `/api/qr/admin/tables/{table_id}/qr-code` | `create_qr_code` | Create qr code | table_id: int, _user: Any | schemas.QRTableCodeRead |
| `GET` | `/api/qr/admin/tables/{table_id}/qr-codes` | `list_qr_codes` | List qr codes | table_id: int, _user: Any | list[schemas.QRTableCodeRead] |
| `GET` | `/api/qr/menu` | `get_general_menu` | Get general menu | restaurant_id: int \| None | Untyped JSON / dict |
| `GET` | `/api/qr/menu/{code}` | `get_menu_for_code` | Get menu for code | code: str | Untyped JSON / dict |
| `POST` | `/api/qr/order` | `submit_order` | Submit order | data: schemas.QROrderSubmit | schemas.QROrderResponse |
| `GET` | `/api/qr/order/{order_id}/status` | `get_order_status` | Get order status | order_id: int | schemas.QROrderStatus |
| `GET` | `/api/qr/table/{code}` | `get_table_info` | Get table info | code: str | Untyped JSON / dict |

## Availability

Source: `app.reservations.availability_router`

| Method | Path | Handler | Purpose | Request | Response |
|---|---|---|---|---|---|
| `GET` | `/api/availability` | `get_availability` | Get availability | restaurant_id: int \| None, reservation_date: date_type \| None, party_size: int \| None, property_id: int \| None, check_in: date_type \| None, check_out: date_type \| None, adults: int, children: int | Untyped JSON / dict |
| `GET` | `/api/availability/` | `get_availability` | Get availability | restaurant_id: int \| None, reservation_date: date_type \| None, party_size: int \| None, property_id: int \| None, check_in: date_type \| None, check_out: date_type \| None, adults: int, children: int | Untyped JSON / dict |

## Public Restaurant

Source: `app.reservations.public_router`

| Method | Path | Handler | Purpose | Request | Response |
|---|---|---|---|---|---|
| `GET` | `/api/public/restaurant/menu` | `public_restaurant_menu` | Public restaurant menu | restaurant_id: int \| None | Untyped JSON / dict |
| `POST` | `/api/public/restaurant/order` | `public_submit_order` | Public submit order | data: qr_schemas.QROrderSubmit | qr_schemas.QROrderResponse |
| `GET` | `/api/public/restaurant/table/{code}` | `public_table_info` | Public table info | code: str | Untyped JSON / dict |

## Reservations / Floor / Waitlist

Source: `app.reservations.router`

| Method | Path | Handler | Purpose | Request | Response |
|---|---|---|---|---|---|
| `GET` | `/api/reservations` | `list_reservations` | List reservations | reservation_date: date \| None, table_id: int \| None, status: str \| None | list[ReservationRead] |
| `POST` | `/api/reservations` | `add_reservation` | Add reservation | request: Request, payload: UnifiedReservationCreate, idempotency_key: str \| None | Untyped JSON / dict |
| `GET` | `/api/reservations/` | `list_reservations` | List reservations | reservation_date: date \| None, table_id: int \| None, status: str \| None | list[ReservationRead] |
| `POST` | `/api/reservations/` | `add_reservation` | Add reservation | request: Request, payload: UnifiedReservationCreate, idempotency_key: str \| None | Untyped JSON / dict |
| `GET` | `/api/reservations/availability` | `availability` | Availability | reservation_date: date, party_size: int | Untyped JSON / dict |
| `GET` | `/api/reservations/floor-summary` | `floor_summary` | Floor summary | No explicit request fields | FloorSummary |
| `GET` | `/api/reservations/sections` | `list_sections` | List sections | No explicit request fields | list[FloorSectionRead] |
| `POST` | `/api/reservations/sections` | `add_section` | Add section | payload: FloorSectionCreate | FloorSectionRead |
| `DELETE` | `/api/reservations/sections/{section_id}` | `remove_section` | Remove section | section_id: int | Untyped JSON / dict |
| `PUT` | `/api/reservations/sections/{section_id}` | `edit_section` | Edit section | section_id: int, payload: FloorSectionUpdate | FloorSectionRead |
| `POST` | `/api/reservations/sessions` | `start_session` | Start session | payload: TableSessionCreate | TableSessionRead |
| `GET` | `/api/reservations/sessions/active` | `active_sessions` | Active sessions | No explicit request fields | list[TableSessionRead] |
| `POST` | `/api/reservations/sessions/{session_id}/close` | `end_session` | End session | session_id: int | TableSessionRead |
| `GET` | `/api/reservations/tables` | `list_tables` | List tables | section_id: int \| None | list[TableRead] |
| `POST` | `/api/reservations/tables` | `add_table` | Add table | payload: TableCreate | TableRead |
| `DELETE` | `/api/reservations/tables/{table_id}` | `remove_table` | Remove table | table_id: int | Untyped JSON / dict |
| `GET` | `/api/reservations/tables/{table_id}` | `table_detail` | Table detail | table_id: int | TableRead |
| `PUT` | `/api/reservations/tables/{table_id}` | `edit_table` | Edit table | table_id: int, payload: TableUpdate | TableRead |
| `PATCH` | `/api/reservations/tables/{table_id}/status` | `change_table_status` | Change table status | table_id: int, payload: TableStatusUpdate | TableRead |
| `POST` | `/api/reservations/waitlist` | `add_to_wait` | Add to wait | payload: WaitlistEntryCreate | WaitlistEntryRead |
| `GET` | `/api/reservations/waitlist/active` | `list_waitlist` | List waitlist | No explicit request fields | list[WaitlistEntryRead] |
| `DELETE` | `/api/reservations/waitlist/{entry_id}` | `remove_waitlist` | Remove waitlist | entry_id: int | Untyped JSON / dict |
| `POST` | `/api/reservations/waitlist/{entry_id}/seat` | `seat_from_waitlist` | Seat from waitlist | entry_id: int, table_id: int | Untyped JSON / dict |
| `GET` | `/api/reservations/{reservation_id}` | `reservation_detail` | Reservation detail | reservation_id: int | ReservationRead |
| `PUT` | `/api/reservations/{reservation_id}` | `edit_reservation` | Edit reservation | reservation_id: int, payload: ReservationUpdate | ReservationRead |
| `POST` | `/api/reservations/{reservation_id}/cancel` | `cancel` | Cancel | reservation_id: int | ReservationRead |
| `POST` | `/api/reservations/{reservation_id}/complete` | `complete` | Complete | reservation_id: int | ReservationRead |
| `POST` | `/api/reservations/{reservation_id}/seat` | `seat` | Seat | reservation_id: int | ReservationRead |

## Digital Signage

Source: `app.signage.router`

| Method | Path | Handler | Purpose | Request | Response |
|---|---|---|---|---|---|
| `GET` | `/api/public/signage/display/{screen_code}` | `get_display` | Get display | screen_code: str | Untyped JSON / dict |
| `GET` | `/api/signage/content` | `list_content` | List content | No explicit request fields | list[schemas.SignageContentRead] |
| `POST` | `/api/signage/content` | `create_content` | Create content | data: schemas.SignageContentCreate | schemas.SignageContentRead |
| `DELETE` | `/api/signage/content/{content_id}` | `delete_content` | Delete content | content_id: int | Untyped JSON / dict |
| `PUT` | `/api/signage/content/{content_id}` | `update_content` | Update content | content_id: int, data: schemas.SignageContentUpdate | schemas.SignageContentRead |
| `GET` | `/api/signage/playlists` | `list_playlists` | List playlists | No explicit request fields | list[schemas.SignagePlaylistRead] |
| `POST` | `/api/signage/playlists` | `create_playlist` | Create playlist | data: schemas.SignagePlaylistCreate | schemas.SignagePlaylistRead |
| `DELETE` | `/api/signage/playlists/{playlist_id}` | `delete_playlist` | Delete playlist | playlist_id: int | Untyped JSON / dict |
| `PUT` | `/api/signage/playlists/{playlist_id}` | `update_playlist` | Update playlist | playlist_id: int, data: schemas.SignagePlaylistUpdate | schemas.SignagePlaylistRead |
| `GET` | `/api/signage/screens` | `list_screens` | List screens | No explicit request fields | list[schemas.SignageScreenRead] |
| `POST` | `/api/signage/screens` | `create_screen` | Create screen | data: schemas.SignageScreenCreate | schemas.SignageScreenRead |
| `DELETE` | `/api/signage/screens/{screen_id}` | `delete_screen` | Delete screen | screen_id: int | Untyped JSON / dict |
| `PUT` | `/api/signage/screens/{screen_id}` | `update_screen` | Update screen | screen_id: int, data: schemas.SignageScreenUpdate | schemas.SignageScreenRead |

## Vision / Waste / Compliance

Source: `app.vision.router`

| Method | Path | Handler | Purpose | Request | Response |
|---|---|---|---|---|---|
| `GET` | `/api/vision/alerts` | `list_alerts` | List alerts | resolved: bool \| None, limit: int | list[VisionAlertRead] |
| `POST` | `/api/vision/analyze` | `analyze_image` | Analyze image | payload: VisionAlertCreate | VisionAlertRead |
| `GET` | `/api/vision/compliance` | `list_compliance` | List compliance | event_type: str \| None, limit: int | list[ComplianceEventRead] |
| `GET` | `/api/vision/stats` | `vision_stats` | Vision stats | No explicit request fields | Untyped JSON / dict |
| `GET` | `/api/vision/waste` | `list_waste` | List waste | category: str \| None, limit: int | list[WasteLogRead] |
| `POST` | `/api/vision/waste` | `add_waste_log` | Add waste log | payload: WasteLogCreate | WasteLogRead |

## Vouchers / Gift Cards / Loyalty Cards

Source: `app.vouchers.router`

| Method | Path | Handler | Purpose | Request | Response |
|---|---|---|---|---|---|
| `GET` | `/api/vouchers` | `list_vouchers` | List vouchers | active_only: bool | list[schemas.VoucherRead] |
| `POST` | `/api/vouchers` | `create_voucher` | Create voucher | data: schemas.VoucherCreate, background_tasks: BackgroundTasks | schemas.VoucherRead |
| `GET` | `/api/vouchers/` | `list_vouchers` | List vouchers | active_only: bool | list[schemas.VoucherRead] |
| `POST` | `/api/vouchers/` | `create_voucher` | Create voucher | data: schemas.VoucherCreate, background_tasks: BackgroundTasks | schemas.VoucherRead |
| `GET` | `/api/vouchers/customer-cards` | `list_customer_cards` | List customer cards | No explicit request fields | list[schemas.CustomerCardRead] |
| `POST` | `/api/vouchers/customer-cards` | `create_customer_card` | Create customer card | data: schemas.CustomerCardCreate | schemas.CustomerCardRead |
| `POST` | `/api/vouchers/customer-cards/{card_number}/add-points` | `add_points_to_card` | Add points to card | card_number: str, data: schemas.AddPoints | schemas.CustomerCardRead |
| `POST` | `/api/vouchers/customer-cards/{card_number}/redeem-points` | `redeem_points_from_card` | Redeem points from card | card_number: str, data: schemas.RedeemPoints | schemas.CustomerCardRead |
| `POST` | `/api/vouchers/customer-cards/{card_number}/stamp` | `add_stamp_to_card` | Add stamp to card | card_number: str | Untyped JSON / dict |
| `GET` | `/api/vouchers/gift-cards` | `list_gift_cards` | List gift cards | No explicit request fields | Untyped JSON / dict |
| `POST` | `/api/vouchers/gift-cards` | `create_gift_card` | Create gift card | payload: GiftCardCreate | Untyped JSON / dict |
| `POST` | `/api/vouchers/redeem` | `redeem_voucher` | Redeem voucher | data: schemas.VoucherRedeem | schemas.VoucherRedemptionRead |
| `POST` | `/api/vouchers/validate` | `validate_voucher` | Validate voucher | data: schemas.VoucherValidate | schemas.VoucherValidateResponse |
| `DELETE` | `/api/vouchers/{voucher_id}` | `delete_voucher` | Delete voucher | voucher_id: int | Untyped JSON / dict |
| `PUT` | `/api/vouchers/{voucher_id}` | `update_voucher` | Update voucher | voucher_id: int, data: schemas.VoucherUpdate | schemas.VoucherRead |
| `GET` | `/api/vouchers/{voucher_id}/redemptions` | `list_redemptions` | List redemptions | voucher_id: int | list[schemas.VoucherRedemptionRead] |
| `POST` | `/api/vouchers/{voucher_id}/resend-email` | `resend_voucher_email` | Resend voucher email | voucher_id: int, background_tasks: BackgroundTasks | Untyped JSON / dict |

## WebSockets

Source: `app.websockets.router`

| Method | Path | Handler | Purpose | Request | Response |
|---|---|---|---|---|---|
| `WEBSOCKET` | `/ws/{restaurant_id}` | `websocket_endpoint` | Websocket endpoint | websocket: WebSocket, restaurant_id: int | Untyped JSON / dict |

## Workforce

Source: `app.workforce.router`

| Method | Path | Handler | Purpose | Request | Response |
|---|---|---|---|---|---|
| `GET` | `/api/workforce/employees` | `list_employees` | List employees | status: str \| None, limit: int | list[EmployeeRead] |
| `POST` | `/api/workforce/employees` | `add_employee` | Add employee | payload: EmployeeCreate | EmployeeRead |
| `GET` | `/api/workforce/hiring` | `list_hiring` | List hiring | status: str \| None | list[ApplicantRead] |
| `POST` | `/api/workforce/hiring` | `add_applicant` | Add applicant | payload: ApplicantCreate | ApplicantRead |
| `GET` | `/api/workforce/labor-tracker` | `labor_tracker` | Labor tracker | No explicit request fields | Untyped JSON / dict |
| `GET` | `/api/workforce/schedule` | `list_schedules` | List schedules | status: str \| None | list[ScheduleRead] |
| `POST` | `/api/workforce/schedule/generate` | `gen_schedule` | Gen schedule | payload: ScheduleCreate | ScheduleRead |
| `PUT` | `/api/workforce/schedule/{schedule_id}/approve` | `approve` | Approve | schedule_id: int | ScheduleRead |
| `GET` | `/api/workforce/training` | `training` | Training | No explicit request fields | Untyped JSON / dict |
