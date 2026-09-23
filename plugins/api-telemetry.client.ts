import { startApiTelemetryRum } from '~/scripts/apiTelemetryRum';

// Client-side API timing (Resource Timing → /KliveAPI/telemetry/rum). Best-effort and
// switchable per browser from the API telemetry page.
export default defineNuxtPlugin(() => {
    startApiTelemetryRum();
});
