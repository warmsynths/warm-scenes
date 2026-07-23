import * as THREE from 'three';
import { createGearModel, GET_GEAR_SIZE } from './gear-builder';
import { TrackerScreen } from './tracker-screen';
import { M8Screen } from './m8-screen';
import { QuantumCube } from './quantum-cube';

export const GEAR_DICTIONARY: Record<string, string> = {
  polyend: 'Polyend Tracker',
  circuit_tracks: 'Circuit Tracks',
  mood: 'MOOD',
  blooper: 'Blooper',
  generation_loss: 'Gen Loss',
  sp404: 'SP-404',
  m8: 'M8',
  poster_believe: 'Believe Poster',
  poster_808: 'TR-808 Poster',
  poster_mpc: 'MPC Poster',
  lamp: 'Desk Lamp',
  cup: 'Coffee Cup',
  succulent_echeveria: 'Echeveria',
  succulent_moonstones: 'Moonstones',
  succulent_haworthia: 'Haworthia',
  succulent_pearls: 'String of Pearls',
  succulent_jade: 'Jade Plant'
};

export class GearRegistry {
  private static trackerScreen: TrackerScreen | null = null;
  private static m8Screen: M8Screen | null = null;
  private static quantumCube: QuantumCube | null = null;

  public static getLabel(id: string): string {
    return GEAR_DICTIONARY[id] || id;
  }

  public static getDimensions(wMm: number, dMm: number, hMm: number) {
    return GET_GEAR_SIZE(wMm, dMm, hMm);
  }

  public static async buildGearMesh(id: string): Promise<THREE.Object3D> {
    return createGearModel(id);
  }

  public static getTrackerScreen(): TrackerScreen {
    if (!this.trackerScreen) {
      this.trackerScreen = new TrackerScreen();
    }
    return this.trackerScreen;
  }

  public static getM8Screen(): M8Screen {
    if (!this.m8Screen) {
      this.m8Screen = new M8Screen();
    }
    return this.m8Screen;
  }

  public static getQuantumCube(scene?: THREE.Scene): QuantumCube {
    if (!this.quantumCube) {
      this.quantumCube = new QuantumCube(scene);
    }
    return this.quantumCube;
  }

  public static updateScreens(time: number): void {
    if (this.trackerScreen) {
      this.trackerScreen.update(time);
    }
    if (this.m8Screen) {
      this.m8Screen.update(time);
    }
    if (this.quantumCube) {
      this.quantumCube.update(time);
    }
  }
}
