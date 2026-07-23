export interface DioramaEnvironmentConfig {
  weather: 'sunny' | 'rainy' | 'thunderstorm';
  timeOfDay: 'day' | 'sunset' | 'night';
  sceneMode: 'normal' | 'liminal';
  celestialPosition: number;
  rainIntensity: number;
  lightningIntensity: number;
}

export interface DioramaGearConfig {
  activeGear: string[];
  primaryArray: string[];
  secondaryArray: string[];
  macroShots: any[];
  microCuts: any[];
}

export interface DioramaSceneState {
  environment: DioramaEnvironmentConfig;
  gear: DioramaGearConfig;
}
