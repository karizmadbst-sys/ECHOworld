/**
 * ECHO – THE WORLD REMEMBERS
 * Shared Blocky Character Rig & Procedural Animation Engine
 * Used identically by both local Character.ts and multiplayer RemotePlayerEntity.ts
 * so friends always see the exact same character model, colors, tools, and animations.
 */

import * as THREE from 'three';
import { PooledPointLightProxy } from '../world/WorldLightPool.ts';

export type EquippedToolType = 'sword' | 'pickaxe' | 'axe' | 'bow' | 'pistol' | 'block';

export interface CharacterRigPoseInput {
  isMoving: boolean;
  isSprinting: boolean;
  isGrounded: boolean;
  isSwimming: boolean;
  isDead: boolean;
  isDodging: boolean;
  dodgeProgress: number; // 0..1
  isAttacking: boolean;
  attackProgress: number; // 0..1
  attackComboStep: number; // 0, 1, 2
  isCastingPulse: boolean;
  equippedWeapon: 'sword' | 'pistol' | 'bow';
  equippedTool: EquippedToolType;
  isBlocking: boolean;
  isAiming: boolean;
  bowDrawAmount: number;
  pistolRecoilOffset: number;
  rangedActionTimer: number;
  rangedActionKind: 'pistol' | 'bow';
  pistolFlashTimer: number;
  isBreakingBlock: boolean;
  buildSwingTimer: number;
  buildSwingDuration: number;
  isRunningInPlace?: boolean;
  isFirstPerson?: boolean;
  strafeOnly?: boolean;
  swimInputX?: number;
  swimInputY?: number;
  waterDepth?: number;
  localWaterLevel?: number;
  worldY?: number;
}

export class CharacterRig {
  public readonly characterPivot: THREE.Group;
  public readonly torsoGroup: THREE.Group;
  public readonly headGroup: THREE.Group;
  public readonly hairBun: THREE.Mesh;
  public readonly capeletGroup: THREE.Group;
  public readonly capeletTails: THREE.Mesh;
  public readonly leftLeg: THREE.Group;
  public readonly rightLeg: THREE.Group;
  public readonly leftArm: THREE.Group;
  public readonly rightArm: THREE.Group;
  public readonly staffGroup: THREE.Group;
  public readonly staffCrystal: THREE.Mesh;
  public readonly staffLight: PooledPointLightProxy;
  public readonly spiritCompanion: THREE.Group;
  public readonly shadowDisc: THREE.Mesh;
  public readonly swimWakeMesh: THREE.Mesh;
  public readonly slashArcMesh: THREE.Mesh;

  private readonly capeletMat: THREE.MeshStandardMaterial;
  private readonly capeletTrimMat: THREE.MeshStandardMaterial;
  private readonly bladeSteelMat: THREE.MeshStandardMaterial;
  private readonly swordVisualParts: THREE.Object3D[] = [];
  private readonly toolModeGroups: Record<'pickaxe' | 'axe' | 'bow' | 'pistol' | 'block', THREE.Group>;
  private readonly heldBlockMesh: THREE.Mesh;
  private readonly pistolSlideMesh: THREE.Mesh;
  private readonly pistolMuzzleAnchor: THREE.Object3D;
  private readonly pistolFlashMesh: THREE.Mesh;
  private readonly bowUpperLimb: THREE.Mesh;
  private readonly bowLowerLimb: THREE.Mesh;
  private readonly bowStringTop: THREE.Mesh;
  private readonly bowStringBot: THREE.Mesh;
  private readonly bowNockedArrow: THREE.Group;

  private readonly disposableGeometries: THREE.BufferGeometry[] = [];
  private readonly disposableMaterials: THREE.Material[] = [];

  private animTime = 0;
  private breakAnimTime = 0;
  private auraColorHex = 0x00f5d4;
  private currentTool: EquippedToolType = 'sword';

  constructor(hostGroup: THREE.Group, initialProfile?: { robeColor?: string; auraColor?: string }) {
    this.characterPivot = new THREE.Group();
    hostGroup.add(this.characterPivot);

    // Magical Weapon Slash Arc
    const arcGeom = this.trackGeo(new THREE.RingGeometry(0.65, 1.45, 24, 1, 0, Math.PI * 0.85));
    const arcMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0x00f5d4,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
      })
    );
    this.slashArcMesh = new THREE.Mesh(arcGeom, arcMat);
    this.slashArcMesh.rotation.x = Math.PI / 2;
    this.slashArcMesh.position.set(0, 0.95, 0.45);
    this.characterPivot.add(this.slashArcMesh);

    // 1. Minecraft-inspired blocky Materials Palette ("The Spirit Guide Explorer")
    const skinMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xe0b484,
        roughness: 0.78,
        metalness: 0.04,
      })
    );

    const hairMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x16141a,
        roughness: 0.68,
        metalness: 0.08,
      })
    );

    const hairTieMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x2dd4bf,
        roughness: 0.45,
      })
    );

    this.capeletMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x2563eb,
        roughness: 0.65,
        metalness: 0.12,
      })
    );

    this.capeletTrimMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x1d4ed8,
        roughness: 0.72,
      })
    );

    const tunicMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xf1ece4,
        roughness: 0.82,
        metalness: 0.04,
      })
    );

    const leatherMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x4a2e1b,
        roughness: 0.85,
        metalness: 0.1,
      })
    );

    const pantsMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x1e222b,
        roughness: 0.86,
      })
    );

    const bootMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x523622,
        roughness: 0.85,
      })
    );

    const furCuffMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xd6cab8,
        roughness: 0.92,
      })
    );

    // 2. Blocky Torso & Adventurer Tunic
    this.torsoGroup = new THREE.Group();
    this.torsoGroup.position.y = 0.92;
    this.characterPivot.add(this.torsoGroup);

    const tunic = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.46, 0.56, 0.28)), tunicMat);
    tunic.position.y = 0.36;
    tunic.castShadow = true;
    this.torsoGroup.add(tunic);

    const skirt = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.5, 0.18, 0.31)), tunicMat);
    skirt.position.y = 0.04;
    skirt.castShadow = true;
    this.torsoGroup.add(skirt);

    const belt = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.49, 0.08, 0.3)), leatherMat);
    belt.position.y = 0.16;
    this.torsoGroup.add(belt);

    const buckleMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.8, roughness: 0.28 })
    );
    const buckle = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.11, 0.085, 0.04)), buckleMat);
    buckle.position.set(0, 0.16, 0.155);
    this.torsoGroup.add(buckle);

    // 3. Cross-Body Messenger Satchel & Pouch
    const strap = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.07, 0.64, 0.32)), leatherMat);
    strap.position.set(0.02, 0.38, 0);
    strap.rotation.z = 0.65;
    this.torsoGroup.add(strap);

    const pouch = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.16, 0.19, 0.14)), leatherMat);
    pouch.position.set(-0.26, 0.14, -0.08);
    pouch.castShadow = true;
    this.torsoGroup.add(pouch);

    // 4. Royal Blue Blocky Capelet / Shawl over Shoulders
    this.capeletGroup = new THREE.Group();
    this.capeletGroup.position.set(0, 0.64, 0);
    this.torsoGroup.add(this.capeletGroup);

    const mantle = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.56, 0.17, 0.34)), this.capeletMat);
    mantle.position.y = -0.02;
    mantle.castShadow = true;
    this.capeletGroup.add(mantle);

    const collarGeo = this.trackGeo(new THREE.BoxGeometry(0.16, 0.14, 0.06));
    const collarFrontL = new THREE.Mesh(collarGeo, this.capeletTrimMat);
    collarFrontL.position.set(-0.14, -0.1, 0.16);
    const collarFrontR = new THREE.Mesh(collarGeo, this.capeletTrimMat);
    collarFrontR.position.set(0.14, -0.1, 0.16);
    this.capeletGroup.add(collarFrontL, collarFrontR);

    const capeTailGeo = this.trackGeo(new THREE.BoxGeometry(0.42, 0.54, 0.06));
    capeTailGeo.translate(0, -0.24, 0);
    this.capeletTails = new THREE.Mesh(capeTailGeo, this.capeletMat);
    this.capeletTails.position.set(0, -0.02, -0.18);
    this.capeletTails.castShadow = true;
    this.capeletGroup.add(this.capeletTails);

    // 5. Blocky Minecraft-style Head, Face & Topknot Bun
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 0.68, 0);
    this.torsoGroup.add(this.headGroup);

    const head = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.36, 0.36, 0.36)), skinMat);
    head.position.y = 0.19;
    head.castShadow = true;
    this.headGroup.add(head);

    const eyeWhiteMat = this.trackMat(new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const eyePupilMat = this.trackMat(new THREE.MeshBasicMaterial({ color: 0x0f172a }));
    const eyeWGeo = this.trackGeo(new THREE.BoxGeometry(0.075, 0.055, 0.02));
    const eyePGeo = this.trackGeo(new THREE.BoxGeometry(0.042, 0.05, 0.024));
    const lEyeW = new THREE.Mesh(eyeWGeo, eyeWhiteMat);
    lEyeW.position.set(-0.085, 0.19, 0.182);
    const rEyeW = new THREE.Mesh(eyeWGeo, eyeWhiteMat);
    rEyeW.position.set(0.085, 0.19, 0.182);
    const lPupil = new THREE.Mesh(eyePGeo, eyePupilMat);
    lPupil.position.set(-0.08, 0.19, 0.185);
    const rPupil = new THREE.Mesh(eyePGeo, eyePupilMat);
    rPupil.position.set(0.08, 0.19, 0.185);
    this.headGroup.add(lEyeW, rEyeW, lPupil, rPupil);

    const hairTop = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.39, 0.11, 0.39)), hairMat);
    hairTop.position.set(0, 0.34, -0.01);
    hairTop.castShadow = true;
    const hairBack = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.39, 0.31, 0.14)), hairMat);
    hairBack.position.set(0, 0.21, -0.14);
    const hairSideGeo = this.trackGeo(new THREE.BoxGeometry(0.06, 0.22, 0.24));
    const hairSideL = new THREE.Mesh(hairSideGeo, hairMat);
    hairSideL.position.set(-0.18, 0.24, -0.04);
    const hairSideR = new THREE.Mesh(hairSideGeo, hairMat);
    hairSideR.position.set(0.18, 0.24, -0.04);
    const bangs = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.38, 0.07, 0.06)), hairMat);
    bangs.position.set(0, 0.31, 0.17);
    this.headGroup.add(hairTop, hairBack, hairSideL, hairSideR, bangs);

    this.hairBun = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.16, 0.15, 0.16)), hairMat);
    this.hairBun.position.set(0, 0.48, -0.08);
    this.hairBun.castShadow = true;
    this.headGroup.add(this.hairBun);

    const hairTie = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.18, 0.045, 0.18)), hairTieMat);
    hairTie.position.set(0, 0.41, -0.08);
    this.headGroup.add(hairTie);

    // 6. Articulated Blocky Legs & Boots
    const pantsGeo = this.trackGeo(new THREE.BoxGeometry(0.2, 0.62, 0.22));
    const cuffGeo = this.trackGeo(new THREE.BoxGeometry(0.22, 0.09, 0.24));
    const bootGeo = this.trackGeo(new THREE.BoxGeometry(0.22, 0.2, 0.26));

    this.leftLeg = this.createLeg(pantsGeo, cuffGeo, bootGeo, pantsMat, bootMat, furCuffMat);
    this.leftLeg.position.set(-0.12, 0.0, 0);
    this.torsoGroup.add(this.leftLeg);

    this.rightLeg = this.createLeg(pantsGeo, cuffGeo, bootGeo, pantsMat, bootMat, furCuffMat);
    this.rightLeg.position.set(0.12, 0.0, 0);
    this.torsoGroup.add(this.rightLeg);

    // 7. Articulated Blocky Arms
    const sleeveGeo = this.trackGeo(new THREE.BoxGeometry(0.18, 0.26, 0.2));
    const forearmGeo = this.trackGeo(new THREE.BoxGeometry(0.16, 0.34, 0.18));

    this.leftArm = this.createArm(sleeveGeo, forearmGeo, skinMat, tunicMat);
    this.leftArm.position.set(-0.33, 0.54, 0);
    this.torsoGroup.add(this.leftArm);

    this.rightArm = this.createArm(sleeveGeo, forearmGeo, skinMat, tunicMat);
    this.rightArm.position.set(0.33, 0.54, 0);
    this.torsoGroup.add(this.rightArm);

    // 8. Blocky Glowing Cyan Echo Crystal Sword & Tools socketed in Right Hand
    this.staffGroup = new THREE.Group();
    this.staffGroup.name = 'RightHandSwordSocket';
    this.staffGroup.position.set(0.0, -0.52, 0.04);
    this.staffGroup.rotation.set(-Math.PI * 0.44, 0.12, 0.16);

    this.bladeSteelMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.7,
        metalness: 0.55,
        roughness: 0.22,
      })
    );

    const guardBrassMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x1e3a8a,
        metalness: 0.7,
        roughness: 0.3,
      })
    );

    const gripLeatherMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x3b2314,
        roughness: 0.85,
      })
    );

    const gemMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x00f5d4,
        emissive: 0x00f5d4,
        emissiveIntensity: 2.0,
        roughness: 0.15,
        metalness: 0.8,
      })
    );

    const pommel = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.075, 0.065, 0.055)), guardBrassMat);
    pommel.position.y = -0.12;
    this.staffGroup.add(pommel);

    const grip = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.05, 0.18, 0.05)), gripLeatherMat);
    grip.position.y = 0.0;
    this.staffGroup.add(grip);

    const crossGuard = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.24, 0.055, 0.075)), guardBrassMat);
    crossGuard.position.y = 0.1;
    crossGuard.castShadow = true;
    this.staffGroup.add(crossGuard);

    this.staffCrystal = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.055, 0.055, 0.085)), gemMat);
    this.staffCrystal.position.set(0, 0.1, 0.01);
    this.staffGroup.add(this.staffCrystal);

    const blade = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.085, 0.72, 0.032)), this.bladeSteelMat);
    blade.position.y = 0.48;
    blade.castShadow = true;
    this.staffGroup.add(blade);

    const bladeCore = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.036, 0.64, 0.042)), gemMat);
    bladeCore.position.y = 0.46;
    this.staffGroup.add(bladeCore);

    const bladeTip = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.055, 0.1, 0.032)), this.bladeSteelMat);
    bladeTip.position.y = 0.88;
    this.staffGroup.add(bladeTip);

    this.staffLight = new PooledPointLightProxy(0x00f5d4, 1.4, 5.0);
    this.staffLight.position.set(0, 0.55, 0.04);
    this.staffGroup.add(this.staffLight);

    this.swordVisualParts = [...this.staffGroup.children];

    // Additional tool visuals attached to the right-hand socket
    const darkWoodMat = this.trackMat(new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.88 }));
    const darkIronMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.78, roughness: 0.3 })
    );

    const pickaxeGroup = new THREE.Group();
    pickaxeGroup.visible = false;
    const pickHandle = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.05, 0.72, 0.05)), darkWoodMat);
    pickHandle.position.y = 0.28;
    const pickHead = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.48, 0.085, 0.07)), darkIronMat);
    pickHead.position.y = 0.62;
    const pickTipGeo = this.trackGeo(new THREE.BoxGeometry(0.11, 0.08, 0.065));
    const pickTipL = new THREE.Mesh(pickTipGeo, darkIronMat);
    pickTipL.position.set(-0.27, 0.57, 0);
    const pickTipR = new THREE.Mesh(pickTipGeo, darkIronMat);
    pickTipR.position.set(0.27, 0.57, 0);
    pickaxeGroup.add(pickHandle, pickHead, pickTipL, pickTipR);
    this.staffGroup.add(pickaxeGroup);

    const axeGroup = new THREE.Group();
    axeGroup.visible = false;
    const axeHandle = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.055, 0.76, 0.055)), darkWoodMat);
    axeHandle.position.y = 0.3;
    const axeBlade = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.24, 0.22, 0.05)), darkIronMat);
    axeBlade.position.set(0.12, 0.58, 0);
    axeGroup.add(axeHandle, axeBlade);
    this.staffGroup.add(axeGroup);

    const bowGroup = new THREE.Group();
    bowGroup.visible = false;
    const bowCenter = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.055, 0.34, 0.065)), darkWoodMat);
    bowCenter.position.set(0, 0.24, 0.16);
    const bowLimbGeo = this.trackGeo(new THREE.BoxGeometry(0.045, 0.28, 0.05));
    this.bowUpperLimb = new THREE.Mesh(bowLimbGeo, darkWoodMat);
    this.bowUpperLimb.position.set(0, 0.50, 0.06);
    this.bowUpperLimb.rotation.x = 0.48;
    this.bowLowerLimb = new THREE.Mesh(bowLimbGeo, darkWoodMat);
    this.bowLowerLimb.position.set(0, -0.02, 0.06);
    this.bowLowerLimb.rotation.x = -0.48;

    const bowStrMat = this.trackMat(new THREE.MeshBasicMaterial({ color: 0xe2e8f0 }));
    const bowStrGeo = this.trackGeo(new THREE.BoxGeometry(0.013, 0.39, 0.013));
    this.bowStringTop = new THREE.Mesh(bowStrGeo, bowStrMat);
    this.bowStringTop.position.set(0, 0.435, -0.04);
    this.bowStringBot = new THREE.Mesh(bowStrGeo, bowStrMat);
    this.bowStringBot.position.set(0, 0.045, -0.04);

    this.bowNockedArrow = new THREE.Group();
    const arrowShaft = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.012, 0.012, 0.64, 6)),
      darkWoodMat
    );
    arrowShaft.rotation.x = Math.PI / 2;
    const arrowTip = new THREE.Mesh(
      this.trackGeo(new THREE.ConeGeometry(0.032, 0.11, 4)),
      this.trackMat(
        new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 1.0 })
      )
    );
    arrowTip.rotation.x = Math.PI / 2;
    arrowTip.position.z = 0.34;
    this.bowNockedArrow.add(arrowShaft, arrowTip);
    this.bowNockedArrow.position.set(0, 0.24, 0.12);
    bowGroup.add(
      bowCenter,
      this.bowUpperLimb,
      this.bowLowerLimb,
      this.bowStringTop,
      this.bowStringBot,
      this.bowNockedArrow
    );
    this.staffGroup.add(bowGroup);

    // Sleek Arcane Flintlock / Tactical Pistol
    const pistolGroup = new THREE.Group();
    pistolGroup.visible = false;
    const pistolMetalMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.85, roughness: 0.24 })
    );
    const pistolGrip = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.065, 0.17, 0.08)), gripLeatherMat);
    pistolGrip.position.set(0, 0.04, 0.02);
    pistolGrip.rotation.x = -0.22;
    const pistolReceiver = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.072, 0.08, 0.26)), pistolMetalMat);
    pistolReceiver.position.set(0, 0.15, 0.13);
    this.pistolSlideMesh = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.076, 0.055, 0.25)), darkIronMat);
    this.pistolSlideMesh.position.set(0, 0.19, 0.13);
    const pistolCore = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.08, 0.03, 0.11)), gemMat);
    pistolCore.position.set(0, 0.15, 0.16);
    this.pistolMuzzleAnchor = new THREE.Object3D();
    this.pistolMuzzleAnchor.position.set(0, 0.17, 0.30);
    this.pistolFlashMesh = new THREE.Mesh(
      this.trackGeo(new THREE.OctahedronGeometry(0.065, 0)),
      this.trackMat(new THREE.MeshBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 0.92 }))
    );
    this.pistolFlashMesh.position.set(0, 0.17, 0.31);
    this.pistolFlashMesh.visible = false;
    pistolGroup.add(
      pistolGrip,
      pistolReceiver,
      this.pistolSlideMesh,
      pistolCore,
      this.pistolMuzzleAnchor,
      this.pistolFlashMesh
    );
    this.staffGroup.add(pistolGroup);

    const blockGroup = new THREE.Group();
    blockGroup.visible = false;
    this.heldBlockMesh = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(0.26, 0.26, 0.26)),
      this.trackMat(new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.82 }))
    );
    this.heldBlockMesh.position.set(0, 0.14, 0.04);
    blockGroup.add(this.heldBlockMesh);
    this.staffGroup.add(blockGroup);

    this.toolModeGroups = {
      pickaxe: pickaxeGroup,
      axe: axeGroup,
      bow: bowGroup,
      pistol: pistolGroup,
      block: blockGroup,
    };

    this.rightArm.add(this.staffGroup);

    // 9. Blocky Forest Spirit Wisp Companion beside left shoulder
    this.spiritCompanion = new THREE.Group();
    const spiritBody = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(0.2, 0.2, 0.2)),
      this.trackMat(new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 }))
    );
    this.spiritCompanion.add(spiritBody);

    const spiritEyeGeo = this.trackGeo(new THREE.BoxGeometry(0.05, 0.05, 0.02));
    const eyeL = new THREE.Mesh(spiritEyeGeo, eyeWhiteMat);
    eyeL.position.set(-0.045, 0.02, 0.105);
    const eyeR = new THREE.Mesh(spiritEyeGeo, eyeWhiteMat);
    eyeR.position.set(0.045, 0.02, 0.105);
    this.spiritCompanion.add(eyeL, eyeR);

    const leaf = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(0.08, 0.09, 0.05)),
      this.trackMat(new THREE.MeshStandardMaterial({ color: 0x4ade80 }))
    );
    leaf.position.y = 0.14;
    leaf.rotation.z = 0.25;
    this.spiritCompanion.add(leaf);

    this.spiritCompanion.position.set(-0.46, 1.12, -0.32);
    this.characterPivot.add(this.spiritCompanion);

    // 10. Contact Shadow Disc beneath feet
    const shadowGeo = this.trackGeo(new THREE.CircleGeometry(0.65, 16));
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.36,
        depthWrite: false,
      })
    );
    this.shadowDisc = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadowDisc.position.y = 0.02;
    hostGroup.add(this.shadowDisc);

    // 11. Water Ripple / Swimming Wake Ring
    const wakeGeo = this.trackGeo(new THREE.RingGeometry(0.35, 1.25, 20));
    wakeGeo.rotateX(-Math.PI / 2);
    const wakeMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0x88eeff,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.swimWakeMesh = new THREE.Mesh(wakeGeo, wakeMat);
    this.swimWakeMesh.position.y = 0.04;
    this.swimWakeMesh.visible = false;
    hostGroup.add(this.swimWakeMesh);

    if (initialProfile) {
      this.applyProfileAppearance(initialProfile);
    }
  }

  private trackGeo<T extends THREE.BufferGeometry>(geo: T): T {
    this.disposableGeometries.push(geo);
    return geo;
  }

  private trackMat<T extends THREE.Material>(mat: T): T {
    this.disposableMaterials.push(mat);
    return mat;
  }

  private createLeg(
    pantsGeo: THREE.BufferGeometry,
    cuffGeo: THREE.BufferGeometry,
    bootGeo: THREE.BufferGeometry,
    pantsMat: THREE.Material,
    bootMat: THREE.Material,
    cuffMat: THREE.Material
  ): THREE.Group {
    const group = new THREE.Group();

    const pants = new THREE.Mesh(pantsGeo, pantsMat);
    pants.position.y = -0.31;
    pants.castShadow = true;
    group.add(pants);

    const cuff = new THREE.Mesh(cuffGeo, cuffMat);
    cuff.position.y = -0.66;
    group.add(cuff);

    const boot = new THREE.Mesh(bootGeo, bootMat);
    boot.position.set(0, -0.8, 0.02);
    boot.castShadow = true;
    group.add(boot);

    return group;
  }

  private createArm(
    sleeveGeo: THREE.BufferGeometry,
    forearmGeo: THREE.BufferGeometry,
    skinMat: THREE.Material,
    sleeveMat: THREE.Material
  ): THREE.Group {
    const group = new THREE.Group();

    const sleeve = new THREE.Mesh(sleeveGeo, sleeveMat);
    sleeve.position.y = -0.1;
    sleeve.castShadow = true;
    group.add(sleeve);

    const forearm = new THREE.Mesh(forearmGeo, skinMat);
    forearm.position.y = -0.39;
    forearm.castShadow = true;
    group.add(forearm);

    return group;
  }

  public getAnimTime(): number {
    return this.animTime;
  }

  public getEquippedTool(): EquippedToolType {
    return this.currentTool;
  }

  public applyProfileAppearance(profile: { robeColor?: string; auraColor?: string }): void {
    if (profile.robeColor) {
      this.capeletMat.color.set(profile.robeColor);
      this.capeletTrimMat.color.set(profile.robeColor).multiplyScalar(0.8);
    }
    if (profile.auraColor) {
      const parsed = parseInt(profile.auraColor.replace('#', ''), 16);
      if (Number.isFinite(parsed)) {
        this.auraColorHex = parsed;
      }
      const gemMat = this.staffCrystal.material as THREE.MeshStandardMaterial;
      gemMat.color.set(profile.auraColor);
      gemMat.emissive.set(profile.auraColor);
      this.staffLight.color.set(profile.auraColor);
      (this.slashArcMesh.material as THREE.MeshBasicMaterial).color.set(profile.auraColor);
      if (this.auraColorHex !== 0x00f5d4) {
        this.bladeSteelMat.emissive.set(profile.auraColor);
      }
    }
  }

  public setEquippedTool(tool: EquippedToolType, swordColor?: number): void {
    this.currentTool = tool;
    const isSword = tool === 'sword';
    for (const part of this.swordVisualParts) {
      part.visible = isSword;
    }
    this.toolModeGroups.pickaxe.visible = tool === 'pickaxe';
    this.toolModeGroups.axe.visible = tool === 'axe';
    this.toolModeGroups.bow.visible = tool === 'bow';
    this.toolModeGroups.pistol.visible = tool === 'pistol';
    this.toolModeGroups.block.visible = tool === 'block';

    if (isSword) {
      const targetColor = swordColor !== undefined && swordColor !== 0x00f5d4 ? swordColor : this.auraColorHex;
      const gemMat = this.staffCrystal.material as THREE.MeshStandardMaterial;
      gemMat.color.setHex(targetColor);
      gemMat.emissive.setHex(targetColor);
      this.staffLight.color.setHex(targetColor);
      (this.slashArcMesh.material as THREE.MeshBasicMaterial).color.setHex(targetColor);
      this.bladeSteelMat.emissive.setHex(targetColor === 0x00f5d4 ? 0x0284c7 : targetColor);
      this.bladeSteelMat.emissiveIntensity = targetColor === 0x00f5d4 ? 0.7 : 0.35;
    }
  }

  public setHeldBlockAppearance(colorHex: number): void {
    (this.heldBlockMesh.material as THREE.MeshStandardMaterial).color.setHex(colorHex);
  }

  public getWeaponMuzzleWorldPosition(
    equippedWeapon: 'sword' | 'pistol' | 'bow',
    out: THREE.Vector3
  ): THREE.Vector3 {
    if (equippedWeapon === 'pistol') {
      return this.pistolMuzzleAnchor.getWorldPosition(out);
    }
    if (equippedWeapon === 'bow') {
      return this.bowNockedArrow.getWorldPosition(out);
    }
    return this.staffCrystal.getWorldPosition(out);
  }

  public getStaffWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    return this.staffCrystal.getWorldPosition(out);
  }

  public resetTransformPose(facingAngle: number): void {
    this.characterPivot.rotation.set(0, facingAngle, 0);
    this.characterPivot.position.set(0, 0, 0);
    this.torsoGroup.position.y = 0.92;
    this.torsoGroup.rotation.set(0, 0, 0);
    this.headGroup.rotation.set(0, 0, 0);
  }

  public animatePose(dt: number, state: CharacterRigPoseInput): void {
    const safeDt = Math.max(0, Math.min(Number.isFinite(dt) ? dt : 0, 0.05));
    const arcMat = this.slashArcMesh.material as THREE.MeshBasicMaterial;

    // 1. Dead state
    if (state.isDead) {
      const deadAlpha = 1 - Math.exp(-10.0 * safeDt);
      this.characterPivot.rotation.x = THREE.MathUtils.lerp(
        this.characterPivot.rotation.x,
        -Math.PI / 2.2,
        deadAlpha
      );
      this.characterPivot.rotation.z = THREE.MathUtils.lerp(this.characterPivot.rotation.z, 0, deadAlpha);
      this.characterPivot.position.y = THREE.MathUtils.lerp(this.characterPivot.position.y, 0, deadAlpha);
      this.torsoGroup.position.y = THREE.MathUtils.lerp(this.torsoGroup.position.y, 0.2, deadAlpha);
      this.leftArm.rotation.set(0.4, 0, 0.3);
      this.rightArm.rotation.set(-0.2, 0, -0.4);
      this.leftLeg.rotation.set(-0.3, 0, 0.2);
      this.rightLeg.rotation.set(0.2, 0, -0.2);
      this.pistolFlashMesh.visible = false;
      this.swimWakeMesh.visible = false;
      this.shadowDisc.visible = true;
      arcMat.opacity = 0;
      this.spiritCompanion.position.y = 0.55 + Math.sin(this.animTime * 4.0) * 0.05;
      return;
    }

    // 2. Dodge roll (360-degree acrobatic tumble flip)
    if (state.isDodging) {
      const progress = Math.max(0, Math.min(1, state.dodgeProgress));
      this.characterPivot.rotation.x = -progress * Math.PI * 2;
      this.characterPivot.rotation.z = 0;
      this.characterPivot.position.y = 0;
      this.torsoGroup.position.y = 0.55 + Math.sin(progress * Math.PI) * 0.25;
      this.headGroup.rotation.set(0, 0, 0);
      this.capeletTails.rotation.x = 0.85;
      this.leftArm.rotation.set(-1.2, 0, 0);
      this.rightArm.rotation.set(1.0, 0, 0);
      this.leftLeg.rotation.x = 0.6;
      this.rightLeg.rotation.x = 0.6;
      this.pistolFlashMesh.visible = false;
      arcMat.opacity = 0;
      return;
    }

    const exitAlpha = 1 - Math.exp(-14.0 * safeDt);

    // 3. Swimming Locomotion & Buoyancy Posture (Treading Water / Forward Crawl / Backstroke / Sidestroke)
    if (state.isSwimming) {
      const swimFreq = state.isSprinting ? 10.5 : state.isMoving ? 6.8 : 2.6;
      this.animTime += safeDt * swimFreq;
      const swimAlpha = 1 - Math.exp(-11.0 * safeDt);
      const waterDepth = state.waterDepth ?? 1.5;

      this.shadowDisc.visible = false;
      this.swimWakeMesh.visible = true;
      if (typeof state.localWaterLevel === 'number' && typeof state.worldY === 'number') {
        this.swimWakeMesh.position.y = state.localWaterLevel - state.worldY + 0.03;
      } else {
        this.swimWakeMesh.position.y = 0.48;
      }
      const ripplePulse =
        1.0 + Math.sin(this.animTime * (state.isMoving ? 1.1 : 1.4)) * 0.16 + (state.isMoving ? 0.34 : 0.0);
      this.swimWakeMesh.scale.set(ripplePulse, ripplePulse, ripplePulse);

      const inX = state.swimInputX ?? 0;
      const inY = state.swimInputY ?? 0;
      const lockedViewSwim = Boolean(state.isFirstPerson || state.isAiming || state.strafeOnly);
      const isBackstroke = lockedViewSwim && state.isMoving && inY < -0.2 && Math.abs(inX) <= Math.abs(inY) + 0.15;
      const isSidestroke = lockedViewSwim && state.isMoving && !isBackstroke && Math.abs(inX) > 0.2;

      if (!state.isMoving) {
        // Treading Water (vertical floating with shoulders/head above water, sculling hands & fluttering feet)
        const treadSubmerge = Math.min(0.66, Math.max(0.24, (waterDepth - 0.2) * 0.72));
        this.characterPivot.position.y = THREE.MathUtils.lerp(this.characterPivot.position.y, -treadSubmerge, swimAlpha);
        this.characterPivot.rotation.x = THREE.MathUtils.lerp(this.characterPivot.rotation.x, 0.08, swimAlpha);
        this.characterPivot.rotation.z = THREE.MathUtils.lerp(this.characterPivot.rotation.z, 0, swimAlpha);
        this.torsoGroup.position.y = THREE.MathUtils.lerp(this.torsoGroup.position.y, 0.92, swimAlpha);
        this.torsoGroup.rotation.y = THREE.MathUtils.lerp(this.torsoGroup.rotation.y, 0, swimAlpha);
        this.headGroup.rotation.x = THREE.MathUtils.lerp(this.headGroup.rotation.x, 0.04, swimAlpha);
        this.headGroup.rotation.z = THREE.MathUtils.lerp(this.headGroup.rotation.z, 0, swimAlpha);

        const scull = Math.sin(this.animTime);
        const kick = Math.sin(this.animTime * 1.45);
        this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, -0.38 + scull * 0.24, swimAlpha);
        this.leftArm.rotation.y = THREE.MathUtils.lerp(this.leftArm.rotation.y, 0.22 * scull, swimAlpha);
        this.leftArm.rotation.z = THREE.MathUtils.lerp(this.leftArm.rotation.z, -0.58 - Math.abs(scull) * 0.18, swimAlpha);

        this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, -0.38 - scull * 0.24, swimAlpha);
        this.rightArm.rotation.y = THREE.MathUtils.lerp(this.rightArm.rotation.y, -0.22 * scull, swimAlpha);
        this.rightArm.rotation.z = THREE.MathUtils.lerp(this.rightArm.rotation.z, 0.58 + Math.abs(scull) * 0.18, swimAlpha);

        this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, kick * 0.34, swimAlpha);
        this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, -kick * 0.34, swimAlpha);
        this.capeletTails.rotation.x = THREE.MathUtils.lerp(
          this.capeletTails.rotation.x,
          0.18 + Math.sin(this.animTime) * 0.1,
          swimAlpha
        );
      } else if (isBackstroke) {
        // Backstroke swimming (tilted backwards, head tucked forward to see, alternating overhead scoops)
        const submerge = Math.min(0.45, Math.max(0.18, waterDepth * 0.36));
        this.characterPivot.position.y = THREE.MathUtils.lerp(this.characterPivot.position.y, -submerge, swimAlpha);
        this.characterPivot.rotation.x = THREE.MathUtils.lerp(this.characterPivot.rotation.x, -0.68, swimAlpha);
        this.characterPivot.rotation.z = THREE.MathUtils.lerp(this.characterPivot.rotation.z, 0, swimAlpha);
        this.torsoGroup.position.y = THREE.MathUtils.lerp(this.torsoGroup.position.y, 0.92, swimAlpha);
        this.headGroup.rotation.x = THREE.MathUtils.lerp(this.headGroup.rotation.x, 0.45, swimAlpha);
        this.headGroup.rotation.z = THREE.MathUtils.lerp(this.headGroup.rotation.z, 0, swimAlpha);

        const strokeL = Math.sin(this.animTime);
        const strokeR = Math.sin(this.animTime + Math.PI);
        const kick = Math.sin(this.animTime * 2.0);
        this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, -1.6 + strokeL * 0.95, swimAlpha);
        this.leftArm.rotation.z = THREE.MathUtils.lerp(this.leftArm.rotation.z, -0.35, swimAlpha);
        this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, -1.6 + strokeR * 0.95, swimAlpha);
        this.rightArm.rotation.z = THREE.MathUtils.lerp(this.rightArm.rotation.z, 0.35, swimAlpha);
        this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, kick * 0.44, swimAlpha);
        this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, -kick * 0.44, swimAlpha);
        this.torsoGroup.rotation.y = THREE.MathUtils.lerp(this.torsoGroup.rotation.y, strokeL * 0.14, swimAlpha);
        this.capeletTails.rotation.x = THREE.MathUtils.lerp(this.capeletTails.rotation.x, 0.1, swimAlpha);
      } else if (isSidestroke) {
        // Left/Right sidestroke
        const dirSign = inX >= 0 ? 1 : -1;
        this.characterPivot.position.y = THREE.MathUtils.lerp(this.characterPivot.position.y, 0.04, swimAlpha);
        this.characterPivot.rotation.x = THREE.MathUtils.lerp(this.characterPivot.rotation.x, 0.85, swimAlpha);
        this.characterPivot.rotation.z = THREE.MathUtils.lerp(
          this.characterPivot.rotation.z,
          -dirSign * 0.32,
          swimAlpha
        );
        this.torsoGroup.position.y = THREE.MathUtils.lerp(this.torsoGroup.position.y, 0.92, swimAlpha);
        this.headGroup.rotation.x = THREE.MathUtils.lerp(this.headGroup.rotation.x, -0.62, swimAlpha);
        this.headGroup.rotation.z = THREE.MathUtils.lerp(this.headGroup.rotation.z, dirSign * 0.2, swimAlpha);

        const sweep = Math.sin(this.animTime);
        const kick = Math.sin(this.animTime * 1.8);
        this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, -1.3 + sweep * 0.65, swimAlpha);
        this.leftArm.rotation.z = THREE.MathUtils.lerp(
          this.leftArm.rotation.z,
          -0.45 - Math.max(0, -dirSign) * 0.35,
          swimAlpha
        );
        this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, -1.3 - sweep * 0.65, swimAlpha);
        this.rightArm.rotation.z = THREE.MathUtils.lerp(
          this.rightArm.rotation.z,
          0.45 + Math.max(0, dirSign) * 0.35,
          swimAlpha
        );
        this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, kick * 0.42, swimAlpha);
        this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, -kick * 0.42, swimAlpha);
        this.torsoGroup.rotation.y = THREE.MathUtils.lerp(this.torsoGroup.rotation.y, dirSign * 0.18, swimAlpha);
        this.capeletTails.rotation.x = THREE.MathUtils.lerp(this.capeletTails.rotation.x, 0.24, swimAlpha);
      } else {
        // Prone forward freestyle crawl
        const submergeY = waterDepth < 0.72 ? -0.18 : 0.12;
        this.characterPivot.position.y = THREE.MathUtils.lerp(this.characterPivot.position.y, submergeY, swimAlpha);
        this.characterPivot.rotation.x = THREE.MathUtils.lerp(this.characterPivot.rotation.x, 1.16, swimAlpha);
        this.characterPivot.rotation.z = THREE.MathUtils.lerp(this.characterPivot.rotation.z, 0, swimAlpha);
        this.torsoGroup.position.y = THREE.MathUtils.lerp(this.torsoGroup.position.y, 0.92, swimAlpha);
        this.headGroup.rotation.x = THREE.MathUtils.lerp(this.headGroup.rotation.x, -0.82, swimAlpha);
        this.headGroup.rotation.z = THREE.MathUtils.lerp(this.headGroup.rotation.z, 0, swimAlpha);

        const stroke = Math.sin(this.animTime);
        const kick = Math.sin(this.animTime * 2.0);
        this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, -1.55 + stroke * 1.12, swimAlpha);
        this.leftArm.rotation.y = THREE.MathUtils.lerp(this.leftArm.rotation.y, 0.18, swimAlpha);
        this.leftArm.rotation.z = THREE.MathUtils.lerp(
          this.leftArm.rotation.z,
          -0.28 - Math.max(0, stroke) * 0.25,
          swimAlpha
        );

        this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, -1.55 - stroke * 1.12, swimAlpha);
        this.rightArm.rotation.y = THREE.MathUtils.lerp(this.rightArm.rotation.y, -0.18, swimAlpha);
        this.rightArm.rotation.z = THREE.MathUtils.lerp(
          this.rightArm.rotation.z,
          0.28 + Math.max(0, -stroke) * 0.25,
          swimAlpha
        );

        this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, kick * 0.48, swimAlpha);
        this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, -kick * 0.48, swimAlpha);
        this.torsoGroup.rotation.y = THREE.MathUtils.lerp(this.torsoGroup.rotation.y, stroke * 0.16, swimAlpha);
        this.capeletTails.rotation.x = THREE.MathUtils.lerp(
          this.capeletTails.rotation.x,
          0.28 + Math.abs(stroke) * 0.12,
          swimAlpha
        );
      }

      // Allow combat/aim pose overlays when treading water so shots/swings look clean in water too
      if (!state.isMoving) {
        this.applyUpperBodyCombatAndToolLayers(safeDt, state, arcMat);
      } else {
        arcMat.opacity = THREE.MathUtils.lerp(arcMat.opacity, 0, exitAlpha);
        this.updateMuzzleFlashAndAmbientDetails(safeDt, state);
      }
      return;
    }

    // 4. Default Land / Air Locomotion & Idle (cleanly exit swimming/dodge posture)
    this.swimWakeMesh.visible = false;
    this.shadowDisc.visible = true;
    this.characterPivot.position.y = THREE.MathUtils.lerp(this.characterPivot.position.y, 0, exitAlpha);
    this.characterPivot.rotation.x = THREE.MathUtils.lerp(this.characterPivot.rotation.x, 0, exitAlpha);
    this.headGroup.rotation.z = THREE.MathUtils.lerp(this.headGroup.rotation.z, 0, exitAlpha);
    this.torsoGroup.rotation.y = THREE.MathUtils.lerp(this.torsoGroup.rotation.y, 0, exitAlpha);

    if ((state.isMoving || state.isRunningInPlace) && state.isGrounded) {
      const freq = state.isSprinting ? 15.0 : 9.5;
      this.animTime += safeDt * freq;

      const legSwing = Math.sin(this.animTime) * (state.isSprinting ? 0.78 : 0.52);
      const armSwing = Math.sin(this.animTime) * (state.isSprinting ? 0.65 : 0.42);

      this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, legSwing, exitAlpha * 1.4);
      this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, -legSwing, exitAlpha * 1.4);

      this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, -armSwing, exitAlpha * 1.4);
      this.leftArm.rotation.y = THREE.MathUtils.lerp(this.leftArm.rotation.y, 0, exitAlpha);
      this.leftArm.rotation.z = THREE.MathUtils.lerp(this.leftArm.rotation.z, 0, exitAlpha);

      this.rightArm.rotation.x = THREE.MathUtils.lerp(
        this.rightArm.rotation.x,
        -0.18 + armSwing * 0.32,
        exitAlpha * 1.4
      );
      this.rightArm.rotation.y = THREE.MathUtils.lerp(this.rightArm.rotation.y, -0.06, exitAlpha);
      this.rightArm.rotation.z = THREE.MathUtils.lerp(this.rightArm.rotation.z, -0.08, exitAlpha);

      const capeSway = Math.sin(this.animTime * 0.9) * 0.15 + (state.isSprinting ? 0.45 : 0.22);
      this.capeletTails.rotation.x = THREE.MathUtils.lerp(this.capeletTails.rotation.x, capeSway, exitAlpha);

      this.torsoGroup.position.y = THREE.MathUtils.lerp(
        this.torsoGroup.position.y,
        0.95 + Math.abs(Math.sin(this.animTime * 2)) * (state.isSprinting ? 0.14 : 0.08),
        exitAlpha
      );
      this.headGroup.rotation.x = Math.sin(this.animTime * 2) * 0.04;
    } else if (!state.isGrounded) {
      const jumpAlpha = 1 - Math.exp(-14.0 * safeDt);
      this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 0.45, jumpAlpha);
      this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, -0.32, jumpAlpha);
      this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, -0.7, jumpAlpha);
      this.leftArm.rotation.y = THREE.MathUtils.lerp(this.leftArm.rotation.y, 0, jumpAlpha);
      this.leftArm.rotation.z = THREE.MathUtils.lerp(this.leftArm.rotation.z, 0, jumpAlpha);
      this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, -0.32, jumpAlpha);
      this.rightArm.rotation.y = THREE.MathUtils.lerp(this.rightArm.rotation.y, -0.08, jumpAlpha);
      this.rightArm.rotation.z = THREE.MathUtils.lerp(this.rightArm.rotation.z, -0.12, jumpAlpha);
      this.capeletTails.rotation.x = THREE.MathUtils.lerp(this.capeletTails.rotation.x, 0.55, jumpAlpha);
      this.torsoGroup.position.y = THREE.MathUtils.lerp(this.torsoGroup.position.y, 0.95, jumpAlpha);
      this.headGroup.rotation.x = THREE.MathUtils.lerp(this.headGroup.rotation.x, 0, jumpAlpha);
    } else {
      this.animTime += safeDt * 2.2;
      const idleAlpha = 1 - Math.exp(-10.0 * safeDt);
      this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 0, idleAlpha);
      this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, 0, idleAlpha);
      this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, 0, idleAlpha);
      this.leftArm.rotation.y = THREE.MathUtils.lerp(this.leftArm.rotation.y, 0, idleAlpha);
      this.leftArm.rotation.z = THREE.MathUtils.lerp(this.leftArm.rotation.z, 0, idleAlpha);

      this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, -0.22, idleAlpha);
      this.rightArm.rotation.y = THREE.MathUtils.lerp(this.rightArm.rotation.y, -0.08, idleAlpha);
      this.rightArm.rotation.z = THREE.MathUtils.lerp(this.rightArm.rotation.z, -0.08, idleAlpha);

      this.torsoGroup.position.y = THREE.MathUtils.lerp(
        this.torsoGroup.position.y,
        0.95 + Math.sin(this.animTime) * 0.03,
        idleAlpha
      );
      this.capeletTails.rotation.x = THREE.MathUtils.lerp(this.capeletTails.rotation.x, 0.05, idleAlpha);
      this.headGroup.rotation.x = Math.sin(this.animTime * 1.2) * 0.03;
    }

    this.applyUpperBodyCombatAndToolLayers(safeDt, state, arcMat);
  }

  private applyUpperBodyCombatAndToolLayers(
    safeDt: number,
    state: CharacterRigPoseInput,
    arcMat: THREE.MeshBasicMaterial
  ): void {
    const poseAlpha = 1 - Math.exp(-22.0 * safeDt);

    if (state.isCastingPulse) {
      this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, -2.5, poseAlpha);
      this.leftArm.rotation.y = THREE.MathUtils.lerp(this.leftArm.rotation.y, 0.1, poseAlpha);
      this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, -2.5, poseAlpha);
      this.rightArm.rotation.y = THREE.MathUtils.lerp(this.rightArm.rotation.y, 0, poseAlpha);
      this.rightArm.rotation.z = THREE.MathUtils.lerp(this.rightArm.rotation.z, -0.1, poseAlpha);
      this.staffLight.intensity = 5.5;
      this.torsoGroup.position.y = THREE.MathUtils.lerp(this.torsoGroup.position.y, 1.05, poseAlpha);
      arcMat.opacity = 0;
    } else if (state.isAttacking && state.equippedWeapon === 'sword') {
      const progress = Math.max(0, Math.min(1, state.attackProgress));
      const swing = Math.sin(progress * Math.PI);

      let targetArmX = -1.1 + swing * 2.0;
      let targetArmY = -0.6 + swing * 1.3;
      let targetArmZ = -0.3 + swing * 0.7;
      let torsoTwist = -0.25 + swing * 0.55;

      if (state.attackComboStep === 1) {
        targetArmX = -2.3 + progress * 3.5;
        targetArmY = 0.1;
        targetArmZ = -0.1;
        torsoTwist = 0.18 - progress * 0.36;
      } else if (state.attackComboStep === 2) {
        targetArmX = -0.6 - swing * 1.3;
        targetArmY = 0.35;
        targetArmZ = 1.1 - swing * 2.1;
        torsoTwist = 0.35 - swing * 0.7;
      }

      this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, targetArmX, poseAlpha);
      this.rightArm.rotation.y = THREE.MathUtils.lerp(this.rightArm.rotation.y, targetArmY, poseAlpha);
      this.rightArm.rotation.z = THREE.MathUtils.lerp(this.rightArm.rotation.z, targetArmZ, poseAlpha);
      this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, 0.45, poseAlpha);
      this.torsoGroup.rotation.y = THREE.MathUtils.lerp(this.torsoGroup.rotation.y, torsoTwist, poseAlpha);
      arcMat.opacity = swing * 0.92;
      this.slashArcMesh.rotation.z = progress * Math.PI;
      this.staffLight.intensity = 3.6;
    } else {
      arcMat.opacity = THREE.MathUtils.lerp(arcMat.opacity, 0, poseAlpha);

      if (state.equippedWeapon === 'sword' && state.isBlocking && state.equippedTool === 'sword') {
        this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, -1.05, poseAlpha);
        this.rightArm.rotation.y = THREE.MathUtils.lerp(this.rightArm.rotation.y, 0.42, poseAlpha);
        this.rightArm.rotation.z = THREE.MathUtils.lerp(this.rightArm.rotation.z, 0.85, poseAlpha);
        this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, -0.95, poseAlpha);
        this.leftArm.rotation.z = THREE.MathUtils.lerp(this.leftArm.rotation.z, -0.42, poseAlpha);
        this.torsoGroup.rotation.y = THREE.MathUtils.lerp(this.torsoGroup.rotation.y, -0.22, poseAlpha);
      } else if (state.equippedWeapon === 'pistol' && state.equippedTool === 'pistol') {
        const kick =
          state.rangedActionKind === 'pistol' && state.rangedActionTimer > 0
            ? Math.sin((state.rangedActionTimer / 0.16) * Math.PI) * 0.42
            : 0;
        const holdingAim = state.isAiming || state.pistolRecoilOffset > 0.01 || state.rangedActionTimer > 0;
        const targetArmX = (holdingAim ? -1.48 : -0.78) - state.pistolRecoilOffset * 0.45 - kick;
        this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, targetArmX, poseAlpha);
        this.rightArm.rotation.y = THREE.MathUtils.lerp(this.rightArm.rotation.y, 0.04, poseAlpha);
        this.rightArm.rotation.z = THREE.MathUtils.lerp(this.rightArm.rotation.z, 0, poseAlpha);
        if (state.isAiming) {
          this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, -1.32, poseAlpha);
          this.leftArm.rotation.y = THREE.MathUtils.lerp(this.leftArm.rotation.y, -0.45, poseAlpha);
          this.torsoGroup.rotation.y = THREE.MathUtils.lerp(this.torsoGroup.rotation.y, -0.14, poseAlpha);
        }
        this.pistolSlideMesh.position.z = 0.13 - Math.max(state.pistolRecoilOffset, kick) * 0.09;
      } else if (state.equippedWeapon === 'bow' && state.equippedTool === 'bow') {
        const releaseSnap =
          state.rangedActionKind === 'bow' && state.rangedActionTimer > 0
            ? Math.sin((state.rangedActionTimer / 0.24) * Math.PI)
            : 0;
        if (state.isAiming || state.bowDrawAmount > 0.01 || releaseSnap > 0.01) {
          this.rightArm.rotation.x = THREE.MathUtils.lerp(
            this.rightArm.rotation.x,
            -1.38 + releaseSnap * 0.12,
            poseAlpha
          );
          this.rightArm.rotation.y = THREE.MathUtils.lerp(this.rightArm.rotation.y, -0.05, poseAlpha);
          this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, -1.26, poseAlpha);
          this.leftArm.rotation.y = THREE.MathUtils.lerp(
            this.leftArm.rotation.y,
            -0.46 - state.bowDrawAmount * 0.34 + releaseSnap * 0.25,
            poseAlpha
          );
          this.torsoGroup.rotation.y = THREE.MathUtils.lerp(
            this.torsoGroup.rotation.y,
            0.24 * Math.max(state.bowDrawAmount, state.isAiming ? 0.6 : 0),
            poseAlpha
          );
        }
        const pullBack = state.bowDrawAmount * 0.22;
        const midZ = -0.04 - pullBack * 0.5;
        const tilt = Math.atan2(pullBack, 0.39);
        this.bowStringTop.position.set(0, 0.435, midZ);
        this.bowStringTop.rotation.x = -tilt;
        this.bowStringBot.position.set(0, 0.045, midZ);
        this.bowStringBot.rotation.x = tilt;
        const stringScale = Math.hypot(0.39, pullBack) / 0.39;
        this.bowStringTop.scale.y = stringScale;
        this.bowStringBot.scale.y = stringScale;

        this.bowUpperLimb.rotation.x = 0.48 - state.bowDrawAmount * 0.18;
        this.bowLowerLimb.rotation.x = -0.48 + state.bowDrawAmount * 0.18;

        this.bowNockedArrow.position.z = 0.12 - pullBack;
        this.bowNockedArrow.visible = state.bowDrawAmount > 0.02 || state.isAiming;
      }
    }

    if (state.isBreakingBlock) {
      this.breakAnimTime += safeDt * 16.0;
      const mineSwing = Math.sin(this.breakAnimTime);
      this.rightArm.rotation.x = -0.95 + mineSwing * 0.65;
      this.rightArm.rotation.y = -0.18 + Math.cos(this.breakAnimTime) * 0.16;
      this.rightArm.rotation.z = -0.15 + mineSwing * 0.18;
    } else {
      this.breakAnimTime = 0;
      if (state.buildSwingTimer > 0) {
        const p = 1 - state.buildSwingTimer / Math.max(0.01, state.buildSwingDuration);
        const swing = Math.sin(p * Math.PI);
        this.rightArm.rotation.x = -0.35 - swing * 1.15;
        this.rightArm.rotation.y = -0.1 - swing * 0.22;
        this.rightArm.rotation.z = -0.08 + swing * 0.18;
      }
    }

    this.updateMuzzleFlashAndAmbientDetails(safeDt, state);
  }

  private updateMuzzleFlashAndAmbientDetails(safeDt: number, state: CharacterRigPoseInput): void {
    if (state.pistolFlashTimer > 0 && state.equippedTool === 'pistol') {
      this.pistolFlashMesh.visible = true;
      const fScale = 0.7 + Math.min(1, state.pistolFlashTimer / 0.05) * 0.6;
      this.pistolFlashMesh.scale.setScalar(fScale);
    } else {
      this.pistolFlashMesh.visible = false;
    }

    this.staffCrystal.rotation.y += safeDt * 2.0;
    const gemPulse = 1.0 + Math.sin(this.animTime * 2.8) * 0.15;
    this.staffCrystal.scale.setScalar(gemPulse);
    if (!state.isAttacking && !state.isCastingPulse) {
      this.staffLight.intensity = 1.0 + Math.sin(this.animTime * 3.0) * 0.4;
    }

    this.spiritCompanion.position.y = 1.1 + Math.sin(this.animTime * 2.5) * 0.08;
    this.spiritCompanion.rotation.y = Math.sin(this.animTime * 1.5) * 0.25;
  }

  public dispose(): void {
    this.staffLight.dispose();
    for (const geo of this.disposableGeometries) {
      geo.dispose();
    }
    for (const mat of this.disposableMaterials) {
      mat.dispose();
    }
  }
}
