// Tablas adicionales propias del módulo seguimiento (opcional). Se ejecuta al abrir la base.
// message_notifications: enlaza cada mensaje con los avisos enviados (correo/SMS/WhatsApp) para mostrar su estado de entrega (RF-ALE-05).
export const SQL = `
CREATE TABLE IF NOT EXISTS message_notifications (
  message_id INTEGER NOT NULL, notification_id INTEGER NOT NULL, PRIMARY KEY (message_id, notification_id)
);
CREATE INDEX IF NOT EXISTS ix_indicator_values_ind ON indicator_values(indicator_id, recorded_at);
CREATE INDEX IF NOT EXISTS ix_alerts_key ON alerts(rule_key, entity, entity_id, status);
CREATE INDEX IF NOT EXISTS ix_messages_thread ON messages(company_id, mentor_id, sent_at);
CREATE INDEX IF NOT EXISTS ix_surveys_refs ON surveys(closure_id, referral_id, event_id);
`;
