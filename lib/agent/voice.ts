import { booleanEnvironmentValue } from "../env";

export function isVoiceFeatureEnabled(): boolean {
  return booleanEnvironmentValue("VOICE_FEATURE_ENABLED", true);
}
