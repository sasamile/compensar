# Modelo de datos

Base relacional (SQLite en desarrollo; PostgreSQL/Aurora recomendado en producción). Generado desde el esquema de la plataforma. Las vistas `bi_*` son de solo lectura para BI.

### Tabla `alert_rules`

`id` (INTEGER), `key` (TEXT), `name` (TEXT), `description` (TEXT), `threshold` (INTEGER), `owner_role` (TEXT), `channel` (TEXT), `active` (INTEGER)

### Tabla `alerts`

`id` (INTEGER), `rule_key` (TEXT), `company_id` (INTEGER), `program_id` (INTEGER), `entity` (TEXT), `entity_id` (INTEGER), `severity` (TEXT), `message` (TEXT), `status` (TEXT), `owner_id` (INTEGER), `created_at` (TEXT), `resolved_at` (TEXT), `resolved_by` (INTEGER)

### Tabla `aliados`

`id` (INTEGER), `name` (TEXT), `nit` (TEXT), `active` (INTEGER)

### Tabla `ana_report_notes`

`company_id` (INTEGER), `conclusions` (TEXT), `recommendations` (TEXT), `updated_by` (INTEGER), `updated_at` (TEXT)

### Tabla `ana_snapshots`

`day` (TEXT), `metric` (TEXT), `value` (REAL), `taken_at` (TEXT)

### Tabla `api_client_meta`

`client_id` (TEXT), `program_id` (INTEGER), `description` (TEXT), `last_used_at` (TEXT)

### Tabla `api_clients`

`id` (INTEGER), `name` (TEXT), `client_id` (TEXT), `secret_hash` (TEXT), `scopes` (TEXT), `active` (INTEGER), `created_by` (INTEGER), `created_at` (TEXT)

### Tabla `api_log`

`id` (INTEGER), `ts` (TEXT), `client_id` (TEXT), `method` (TEXT), `path` (TEXT), `status` (INTEGER), `ms` (INTEGER), `ip` (TEXT)

### Tabla `api_tokens`

`token` (TEXT), `client_id` (TEXT), `scopes` (TEXT), `expires_at` (TEXT)

### Tabla `audit_log`

`id` (INTEGER), `ts` (TEXT), `user_id` (INTEGER), `user_email` (TEXT), `action` (TEXT), `entity` (TEXT), `entity_id` (TEXT), `before` (TEXT), `after` (TEXT), `ip` (TEXT), `ua` (TEXT)

### Tabla `auth_flows`

`id` (TEXT), `kind` (TEXT), `user_id` (INTEGER), `data` (TEXT), `created_at` (TEXT), `expires_at` (TEXT)

### Tabla `certificates`

`id` (INTEGER), `registration_id` (INTEGER), `code` (TEXT), `issued_at` (TEXT)

### Tabla `circuit_breakers`

`name` (TEXT), `state` (TEXT), `failures` (INTEGER), `opened_at` (TEXT)

### Tabla `client_registry`

`nit` (TEXT), `razon_social` (TEXT), `afiliado` (INTEGER), `meses_afiliacion` (INTEGER), `al_dia_parafiscales` (INTEGER), `ventas_brutas` (REAL), `inscrito_agencia` (INTEGER), `aportes_meses_3a` (INTEGER), `cesante` (INTEGER)

### Tabla `closures`

`id` (INTEGER), `company_id` (INTEGER), `referral_id` (INTEGER), `program_id` (INTEGER), `result` (TEXT), `status` (TEXT), `approved_by` (INTEGER), `approved_at` (TEXT), `created_by` (INTEGER), `created_at` (TEXT)

### Tabla `companies`

`id` (INTEGER), `razon_social` (TEXT), `nit` (TEXT), `dv` (TEXT), `sector` (TEXT), `size` (TEXT), `city` (TEXT), `program_id` (INTEGER), `status` (TEXT), `value_prop` (TEXT), `social` (TEXT), `visible_fields` (TEXT), `onboarding_done` (INTEGER), `consent_at` (TEXT), `source` (TEXT), `created_at` (TEXT)

### Tabla `company_items`

`id` (INTEGER), `company_id` (INTEGER), `kind` (TEXT), `ref_id` (INTEGER), `label` (TEXT), `status` (TEXT), `assigned_by` (INTEGER), `created_at` (TEXT)

### Tabla `company_route_steps`

`id` (INTEGER), `company_route_id` (INTEGER), `ord` (INTEGER), `name` (TEXT), `kind` (TEXT), `servicio_id` (INTEGER), `event_id` (INTEGER), `indicator` (TEXT), `baseline` (REAL), `goal` (REAL), `current` (REAL), `status` (TEXT), `due_at` (TEXT), `completed_at` (TEXT), `evidence_doc_id` (INTEGER)

### Tabla `company_routes`

`id` (INTEGER), `company_id` (INTEGER), `ruta_id` (INTEGER), `name` (TEXT), `status` (TEXT), `origin` (TEXT), `diagnostic_id` (INTEGER), `approved_by` (INTEGER), `approved_at` (TEXT), `closed_at` (TEXT), `close_result` (TEXT), `parent_id` (INTEGER), `created_by` (INTEGER), `created_at` (TEXT)

### Tabla `contents`

`id` (INTEGER), `title` (TEXT), `description` (TEXT), `kind` (TEXT), `url` (TEXT), `doc_id` (INTEGER), `program_id` (INTEGER), `servicio_id` (INTEGER), `tags` (TEXT), `active` (INTEGER), `created_by` (INTEGER), `created_at` (TEXT)

### Tabla `dashboards`

`id` (INTEGER), `user_id` (INTEGER), `name` (TEXT), `widgets` (TEXT), `shared` (INTEGER), `created_at` (TEXT), `updated_at` (TEXT)

### Tabla `diagnostics`

`id` (INTEGER), `company_id` (INTEGER), `form_id` (INTEGER), `response_id` (INTEGER), `stage` (TEXT), `status` (TEXT), `assigned_by` (INTEGER), `assigned_to` (INTEGER), `score` (REAL), `level` (TEXT), `segment` (TEXT), `completed_at` (TEXT), `created_at` (TEXT)

### Tabla `documents`

`id` (INTEGER), `company_id` (INTEGER), `session_id` (INTEGER), `event_id` (INTEGER), `name` (TEXT), `kind` (TEXT), `mime` (TEXT), `size` (INTEGER), `onbase_ref` (TEXT), `onbase_status` (TEXT), `uploaded_by` (INTEGER), `accepted_by` (INTEGER), `accepted_at` (TEXT), `accepted_ip` (TEXT), `created_at` (TEXT)

### Tabla `ejes`

`id` (INTEGER), `program_id` (INTEGER), `name` (TEXT), `active` (INTEGER)

### Tabla `error_log`

`id` (INTEGER), `ts` (TEXT), `source` (TEXT), `message` (TEXT), `stack` (TEXT), `user_id` (INTEGER)

### Tabla `events`

`id` (INTEGER), `program_id` (INTEGER), `title` (TEXT), `type` (TEXT), `description` (TEXT), `audience` (TEXT), `requirements` (TEXT), `owner` (TEXT), `status` (TEXT), `modality` (TEXT), `place` (TEXT), `start_at` (TEXT), `end_at` (TEXT), `capacity` (INTEGER), `internal_cost` (REAL), `external_form_url` (TEXT), `banner_url` (TEXT), `summary` (TEXT), `slug` (TEXT), `min_attendance` (INTEGER), `min_minutes` (INTEGER), `active` (INTEGER), `created_by` (INTEGER), `created_at` (TEXT), `reminders` (TEXT), `form_id` (INTEGER), `sessions_count` (INTEGER)

### Tabla `form_notices`

`response_id` (INTEGER), `kind` (TEXT), `sent_at` (TEXT)

### Tabla `form_responses`

`id` (INTEGER), `form_id` (INTEGER), `form_version` (INTEGER), `company_id` (INTEGER), `user_id` (INTEGER), `email` (TEXT), `answers` (TEXT), `status` (TEXT), `score` (REAL), `level` (TEXT), `result` (TEXT), `assigned_to` (INTEGER), `decision_reason` (TEXT), `submitted_at` (TEXT), `updated_at` (TEXT), `created_at` (TEXT)

### Tabla `form_versions`

`id` (INTEGER), `form_id` (INTEGER), `version` (INTEGER), `schema` (TEXT), `scoring` (TEXT), `published_at` (TEXT), `published_by` (INTEGER)

### Tabla `forms`

`id` (INTEGER), `name` (TEXT), `description` (TEXT), `kind` (TEXT), `program_id` (INTEGER), `event_id` (INTEGER), `slug` (TEXT), `status` (TEXT), `version` (INTEGER), `schema` (TEXT), `scoring` (TEXT), `requires_login` (INTEGER), `created_by` (INTEGER), `created_at` (TEXT), `updated_at` (TEXT)

### Tabla `indicator_defs`

`id` (INTEGER), `program_id` (INTEGER), `servicio_id` (INTEGER), `name` (TEXT), `unit` (TEXT), `kind` (TEXT), `formula` (TEXT), `baseline_default` (REAL), `goal` (REAL), `periodicity` (TEXT), `active` (INTEGER)

### Tabla `indicator_values`

`id` (INTEGER), `indicator_id` (INTEGER), `value` (REAL), `note` (TEXT), `doc_id` (INTEGER), `session_id` (INTEGER), `recorded_by` (INTEGER), `recorded_at` (TEXT)

### Tabla `indicators`

`id` (INTEGER), `company_id` (INTEGER), `program_id` (INTEGER), `name` (TEXT), `baseline` (REAL), `final` (REAL), `goal` (REAL), `updated_by` (INTEGER), `updated_at` (TEXT), `def_id` (INTEGER), `servicio_id` (INTEGER), `referral_id` (INTEGER), `unit` (TEXT)

### Tabla `info_requests`

`id` (INTEGER), `case_id` (INTEGER), `message` (TEXT), `due_at` (TEXT), `status` (TEXT), `response` (TEXT), `doc_id` (INTEGER), `created_by` (INTEGER), `created_at` (TEXT), `answered_at` (TEXT), `reminded_at` (TEXT)

### Tabla `integration_jobs`

`id` (INTEGER), `kind` (TEXT), `ref_id` (INTEGER), `payload` (TEXT), `status` (TEXT), `attempts` (INTEGER), `next_at` (TEXT), `last_error` (TEXT), `created_at` (TEXT), `done_at` (TEXT)

### Tabla `integration_log`

`id` (INTEGER), `ts` (TEXT), `system` (TEXT), `operation` (TEXT), `ref` (TEXT), `ok` (INTEGER), `ms` (INTEGER), `detail` (TEXT)

### Tabla `job_locks`

`name` (TEXT), `owner` (TEXT), `until` (INTEGER)

### Tabla `job_runs`

`id` (INTEGER), `job` (TEXT), `started_at` (TEXT), `finished_at` (TEXT), `ok` (INTEGER), `detail` (TEXT)

### Tabla `lineas`

`id` (INTEGER), `eje_id` (INTEGER), `name` (TEXT), `active` (INTEGER)

### Tabla `mentor_assignments`

`id` (INTEGER), `company_id` (INTEGER), `mentor_id` (INTEGER), `program_id` (INTEGER), `active` (INTEGER), `assigned_by` (INTEGER), `from_at` (TEXT), `to_at` (TEXT)

### Tabla `mentoring_sessions`

`id` (INTEGER), `company_id` (INTEGER), `mentor_id` (INTEGER), `referral_id` (INTEGER), `program_id` (INTEGER), `title` (TEXT), `scheduled_at` (TEXT), `duration_min` (INTEGER), `modality` (TEXT), `status` (TEXT), `cancel_reason` (TEXT), `topics` (TEXT), `commitments` (TEXT), `results` (TEXT), `hours` (REAL), `registered_by` (INTEGER), `accepted_by` (INTEGER), `accepted_at` (TEXT), `accepted_ip` (TEXT), `created_by` (INTEGER), `created_at` (TEXT)

### Tabla `message_notifications`

`message_id` (INTEGER), `notification_id` (INTEGER)

### Tabla `messages`

`id` (INTEGER), `company_id` (INTEGER), `mentor_id` (INTEGER), `from_user_id` (INTEGER), `body` (TEXT), `sent_at` (TEXT), `read_at` (TEXT)

### Tabla `mfa_recovery_codes`

`id` (INTEGER), `user_id` (INTEGER), `code_hash` (TEXT), `used_at` (TEXT), `created_at` (TEXT)

### Tabla `mfa_state`

`user_id` (INTEGER), `last_step` (INTEGER), `enrolled_at` (TEXT)

### Tabla `notifications`

`id` (INTEGER), `channel` (TEXT), `template_key` (TEXT), `to_addr` (TEXT), `user_id` (INTEGER), `subject` (TEXT), `body` (TEXT), `status` (TEXT), `sent_at` (TEXT), `delivered_at` (TEXT), `read_at` (TEXT), `error` (TEXT)

### Tabla `otp_codes`

`id` (INTEGER), `email` (TEXT), `code` (TEXT), `purpose` (TEXT), `expires_at` (TEXT), `used` (INTEGER)

### Tabla `payment_reports`

`id` (INTEGER), `aliado_id` (INTEGER), `period` (TEXT), `status` (TEXT), `total_sessions` (INTEGER), `total_hours` (REAL), `total_cost` (REAL), `approved_by` (INTEGER), `approved_at` (TEXT), `created_by` (INTEGER), `created_at` (TEXT)

### Tabla `programs`

`id` (INTEGER), `name` (TEXT), `requirements` (TEXT), `valid_from` (TEXT), `valid_to` (TEXT), `owner` (TEXT), `status` (TEXT)

### Tabla `rate_limits`

`key` (TEXT), `count` (INTEGER), `window_start` (INTEGER)

### Tabla `referrals`

`id` (INTEGER), `company_id` (INTEGER), `servicio_id` (INTEGER), `aliado_id` (INTEGER), `referred_by` (INTEGER), `mentor_id` (INTEGER), `assigned_by` (INTEGER), `status` (TEXT), `accepted_by` (INTEGER), `accepted_at` (TEXT), `accepted_ip` (TEXT), `created_at` (TEXT), `closed_at` (TEXT)

### Tabla `registrations`

`id` (INTEGER), `event_id` (INTEGER), `company_id` (INTEGER), `user_id` (INTEGER), `name` (TEXT), `email` (TEXT), `phone` (TEXT), `code` (TEXT), `status` (TEXT), `consent_version` (TEXT), `consent_at` (TEXT), `waitlist` (INTEGER), `attended` (INTEGER), `minutes` (INTEGER), `attendance_source` (TEXT), `created_at` (TEXT)

### Tabla `reminder_log`

`event_id` (INTEGER), `registration_id` (INTEGER), `kind` (TEXT), `sent_at` (TEXT)

### Tabla `roles`

`id` (INTEGER), `key` (TEXT), `name` (TEXT), `description` (TEXT), `internal` (INTEGER), `perms` (TEXT), `system` (INTEGER)

### Tabla `route_closures`

`id` (INTEGER), `company_route_id` (INTEGER), `kind` (TEXT), `outcome` (TEXT), `result` (TEXT), `next_ruta_id` (INTEGER), `status` (TEXT), `requested_by` (INTEGER), `requested_at` (TEXT), `decided_by` (INTEGER), `decided_at` (TEXT), `decision_note` (TEXT), `new_route_id` (INTEGER)

### Tabla `route_step_log`

`id` (INTEGER), `company_route_id` (INTEGER), `step_id` (INTEGER), `action` (TEXT), `status` (TEXT), `note` (TEXT), `value` (REAL), `doc_id` (INTEGER), `user_id` (INTEGER), `at` (TEXT)

### Tabla `route_template_steps`

`id` (INTEGER), `ruta_id` (INTEGER), `ord` (INTEGER), `name` (TEXT), `kind` (TEXT), `servicio_id` (INTEGER), `event_id` (INTEGER), `indicator` (TEXT), `goal` (REAL)

### Tabla `rutas`

`id` (INTEGER), `linea_id` (INTEGER), `name` (TEXT), `description` (TEXT), `active` (INTEGER)

### Tabla `saved_reports`

`id` (INTEGER), `user_id` (INTEGER), `name` (TEXT), `source` (TEXT), `columns` (TEXT), `filters` (TEXT), `created_at` (TEXT)

### Tabla `security_events`

`id` (INTEGER), `ts` (TEXT), `kind` (TEXT), `ip` (TEXT), `email` (TEXT), `detail` (TEXT)

### Tabla `servicios`

`id` (INTEGER), `program_id` (INTEGER), `linea_id` (INTEGER), `aliado_id` (INTEGER), `name` (TEXT), `kind` (TEXT), `hours` (REAL), `sessions` (INTEGER), `indicators` (TEXT), `internal_cost` (REAL), `active` (INTEGER)

### Tabla `session_meta`

`token` (TEXT), `user_id` (INTEGER), `method` (TEXT), `ua` (TEXT), `created_at` (TEXT)

### Tabla `sessions`

`token` (TEXT), `user_id` (INTEGER), `created_at` (TEXT), `last_seen` (TEXT), `ip` (TEXT)

### Tabla `settings`

`key` (TEXT), `value` (TEXT)

### Tabla `surveys`

`id` (INTEGER), `kind` (TEXT), `referral_id` (INTEGER), `closure_id` (INTEGER), `event_id` (INTEGER), `company_id` (INTEGER), `servicio_id` (INTEGER), `aliado_id` (INTEGER), `user_id` (INTEGER), `token` (TEXT), `status` (TEXT), `nps` (INTEGER), `satisfaction` (INTEGER), `answers` (TEXT), `comment` (TEXT), `sent_at` (TEXT), `answered_at` (TEXT)

### Tabla `tasks`

`id` (INTEGER), `title` (TEXT), `description` (TEXT), `company_id` (INTEGER), `program_id` (INTEGER), `assignee_id` (INTEGER), `due_at` (TEXT), `status` (TEXT), `evidence_doc_id` (INTEGER), `created_by` (INTEGER), `created_at` (TEXT), `done_at` (TEXT)

### Tabla `templates`

`id` (INTEGER), `key` (TEXT), `channel` (TEXT), `name` (TEXT), `subject` (TEXT), `body` (TEXT), `approved` (INTEGER), `approved_by` (INTEGER)

### Tabla `user_roles`

`id` (INTEGER), `user_id` (INTEGER), `role_id` (INTEGER), `scope_type` (TEXT), `scope_id` (INTEGER), `granted_by` (INTEGER), `created_at` (TEXT)

### Tabla `users`

`id` (INTEGER), `email` (TEXT), `name` (TEXT), `phone` (TEXT), `password_hash` (TEXT), `status` (TEXT), `internal` (INTEGER), `must_change_password` (INTEGER), `temp_expires_at` (TEXT), `failed_attempts` (INTEGER), `locked_until` (TEXT), `invited_at` (TEXT), `company_id` (INTEGER), `is_principal` (INTEGER), `aliado_id` (INTEGER), `created_at` (TEXT), `mfa_secret` (TEXT), `mfa_enabled` (INTEGER), `sso_subject` (TEXT), `last_login_at` (TEXT), `notif_prefs` (TEXT), `title` (TEXT)

### Tabla `validation_cases`

`id` (INTEGER), `kind` (TEXT), `company_id` (INTEGER), `response_id` (INTEGER), `program_id` (INTEGER), `status` (TEXT), `assigned_to` (INTEGER), `auto_result` (TEXT), `checklist` (TEXT), `observations` (TEXT), `decided_by` (INTEGER), `decided_at` (TEXT), `reason` (TEXT), `created_at` (TEXT), `updated_at` (TEXT)

### Tabla `validation_rules`

`id` (INTEGER), `program_id` (INTEGER), `key` (TEXT), `name` (TEXT), `field` (TEXT), `operator` (TEXT), `value` (TEXT), `active` (INTEGER)

### Tabla `webhook_deliveries`

`id` (INTEGER), `webhook_id` (INTEGER), `event` (TEXT), `payload` (TEXT), `status` (TEXT), `attempts` (INTEGER), `next_at` (TEXT), `last_error` (TEXT), `created_at` (TEXT), `delivered_at` (TEXT)

### Tabla `webhooks`

`id` (INTEGER), `url` (TEXT), `events` (TEXT), `secret` (TEXT), `active` (INTEGER), `created_by` (INTEGER), `created_at` (TEXT)

### Vista `bi_alertas`

`alerta_id` (INTEGER), `regla` (TEXT), `nombre_regla`, `company_id` (INTEGER), `empresa` (TEXT), `program_id`, `programa` (TEXT), `entidad` (TEXT), `entity_id` (INTEGER), `severidad` (TEXT), `mensaje` (TEXT), `estado` (TEXT), `mentor_id` (INTEGER), `responsable` (TEXT), `fecha` (TEXT), `mes`, `resuelta_en` (TEXT)

### Vista `bi_auditoria`

`registro_id` (INTEGER), `fecha` (TEXT), `mes`, `user_id` (INTEGER), `usuario` (TEXT), `accion` (TEXT), `entidad` (TEXT), `entity_id` (TEXT), `ip` (TEXT)

### Vista `bi_cierres`

`cierre_id` (INTEGER), `company_id` (INTEGER), `empresa` (TEXT), `program_id`, `programa` (TEXT), `referral_id` (INTEGER), `aliado_id` (INTEGER), `servicio` (TEXT), `estado` (TEXT), `resultado` (TEXT), `aprobado_por` (TEXT), `aprobado_en` (TEXT), `fecha` (TEXT), `mes`

### Vista `bi_diagnosticos`

`diagnostico_id` (INTEGER), `company_id` (INTEGER), `empresa` (TEXT), `program_id` (INTEGER), `programa` (TEXT), `etapa` (TEXT), `estado` (TEXT), `puntaje` (REAL), `nivel` (TEXT), `segmento` (TEXT), `formulario` (TEXT), `mentor_id` (INTEGER), `asignado_a` (TEXT), `fecha`, `mes`, `completado_en` (TEXT)

### Vista `bi_documentos`

`documento_id` (INTEGER), `company_id` (INTEGER), `empresa` (TEXT), `program_id` (INTEGER), `programa` (TEXT), `session_id` (INTEGER), `sesion` (TEXT), `event_id` (INTEGER), `evento` (TEXT), `proceso`, `nombre` (TEXT), `tipo` (TEXT), `mime` (TEXT), `tamano` (INTEGER), `referencia_onbase` (TEXT), `estado_onbase` (TEXT), `subido_por` (TEXT), `aceptado`, `aceptado_por` (TEXT), `aceptado_en` (TEXT), `ip_aceptacion` (TEXT), `mentor_id` (INTEGER), `fecha` (TEXT), `mes`

### Vista `bi_empresas`

`company_id` (INTEGER), `empresa` (TEXT), `nit`, `program_id` (INTEGER), `programa` (TEXT), `estado` (TEXT), `sector` (TEXT), `tamano` (TEXT), `ciudad` (TEXT), `origen` (TEXT), `fecha` (TEXT), `mes`, `mentor` (TEXT), `mentor_id` (INTEGER), `activa`, `con_mentor`, `con_servicio`, `cerrada`, `sesiones_realizadas`, `horas`, `nivel_diagnostico` (TEXT), `alertas_abiertas`

### Vista `bi_encuestas`

`encuesta_id` (INTEGER), `tipo` (TEXT), `company_id` (INTEGER), `empresa` (TEXT), `program_id` (INTEGER), `programa` (TEXT), `servicio_id` (INTEGER), `servicio` (TEXT), `aliado_id` (INTEGER), `aliado` (TEXT), `event_id` (INTEGER), `evento` (TEXT), `estado` (TEXT), `nps` (INTEGER), `satisfaccion` (INTEGER), `categoria_nps`, `comentario` (TEXT), `enviada_en` (TEXT), `respondida_en` (TEXT), `fecha`, `mes`

### Vista `bi_eventos`

`event_id` (INTEGER), `evento` (TEXT), `tipo` (TEXT), `program_id` (INTEGER), `programa` (TEXT), `estado` (TEXT), `modalidad` (TEXT), `fecha` (TEXT), `mes`, `cupo` (INTEGER), `costo_interno` (REAL), `inscritos`, `asistentes`, `certificados`

### Vista `bi_indicadores`

`indicador_id` (INTEGER), `company_id` (INTEGER), `empresa` (TEXT), `program_id`, `programa` (TEXT), `indicador` (TEXT), `unidad` (TEXT), `linea_base` (REAL), `meta` (REAL), `resultado` (REAL), `variacion`, `variacion_pct`, `cumple_meta`, `ultimo_valor` (REAL), `ultima_medicion` (TEXT), `mediciones`, `servicio_id` (INTEGER), `referral_id` (INTEGER), `aliado_id` (INTEGER), `fecha` (TEXT), `mes`

### Vista `bi_inscripciones`

`inscripcion_id` (INTEGER), `event_id` (INTEGER), `evento` (TEXT), `tipo_evento` (TEXT), `program_id` (INTEGER), `programa` (TEXT), `company_id` (INTEGER), `empresa` (TEXT), `estado` (TEXT), `lista_espera` (INTEGER), `asistio` (INTEGER), `minutos` (INTEGER), `fecha` (TEXT), `mes`, `certificado`

### Vista `bi_notificaciones`

`notificacion_id` (INTEGER), `canal` (TEXT), `plantilla` (TEXT), `estado` (TEXT), `fecha` (TEXT), `mes`, `entregada_en` (TEXT), `leida_en` (TEXT), `con_error`

### Vista `bi_remisiones`

`remision_id` (INTEGER), `company_id` (INTEGER), `empresa` (TEXT), `program_id` (INTEGER), `programa` (TEXT), `servicio_id` (INTEGER), `servicio` (TEXT), `aliado_id` (INTEGER), `aliado` (TEXT), `mentor_id` (INTEGER), `mentor` (TEXT), `estado` (TEXT), `fecha` (TEXT), `mes`, `aceptada_en` (TEXT), `cerrada_en` (TEXT), `sesiones_realizadas`, `sesiones_aceptadas`

### Vista `bi_rutas`

`ruta_empresa_id` (INTEGER), `company_id` (INTEGER), `empresa` (TEXT), `program_id` (INTEGER), `programa` (TEXT), `ruta` (TEXT), `estado` (TEXT), `origen` (TEXT), `aprobada_en` (TEXT), `cerrada_en` (TEXT), `resultado_cierre` (TEXT), `fecha` (TEXT), `mes`, `pasos`, `pasos_completados`

### Vista `bi_servicios`

`servicio_id` (INTEGER), `servicio` (TEXT), `tipo` (TEXT), `program_id` (INTEGER), `programa` (TEXT), `aliado_id` (INTEGER), `aliado` (TEXT), `horas_previstas` (REAL), `sesiones_previstas` (INTEGER), `costo_interno` (REAL), `activo` (INTEGER), `remisiones`, `empresas`, `sesiones_realizadas`, `sesiones_aceptadas`, `horas_ejecutadas`

### Vista `bi_sesiones`

`sesion_id` (INTEGER), `company_id` (INTEGER), `empresa` (TEXT), `program_id`, `programa` (TEXT), `mentor_id` (INTEGER), `mentor` (TEXT), `referral_id` (INTEGER), `aliado_id` (INTEGER), `aliado` (TEXT), `servicio` (TEXT), `titulo` (TEXT), `fecha` (TEXT), `mes`, `modalidad` (TEXT), `estado` (TEXT), `duracion_min` (INTEGER), `horas`, `aceptada`, `aceptada_por` (TEXT), `aceptada_en` (TEXT), `ip_aceptacion` (TEXT), `con_seguimiento`

### Vista `bi_snapshots`

`dia` (TEXT), `metrica` (TEXT), `valor` (REAL), `tomado_en` (TEXT)

### Vista `bi_validacion`

`caso_id` (INTEGER), `tipo` (TEXT), `company_id` (INTEGER), `empresa` (TEXT), `program_id`, `programa` (TEXT), `estado` (TEXT), `mentor_id` (INTEGER), `asignado_a` (TEXT), `decidido_por` (TEXT), `decidido_en` (TEXT), `motivo` (TEXT), `fecha` (TEXT), `mes`, `dias_en_tramite`, `solicitudes_info`

