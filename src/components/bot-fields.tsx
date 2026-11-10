import { HONEYPOT_FIELD, turnstileEnabled, turnstileSiteKey } from "@/lib/ratelimit";

/**
 * Campos anti-bots para formularios públicos (TEC-7): campo trampa invisible y, si está configurado,
 * el widget invisible de Cloudflare Turnstile. Insertar dentro del <form>: <BotFields />.
 * El servidor los valida con botGuard() de @/lib/ratelimit.
 */
export function BotFields() {
  const site = turnstileEnabled() ? turnstileSiteKey() : "";
  return (
    <>
      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", top: "auto", width: 1, height: 1, overflow: "hidden" }}>
        <label>Deja este campo vacío<input type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" defaultValue="" /></label>
      </div>
      {site && (
        <>
          <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
          <div className="cf-turnstile" data-sitekey={site} data-appearance="interaction-only" data-language="es" />
        </>
      )}
    </>
  );
}
