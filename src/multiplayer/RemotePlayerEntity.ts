/**
 * ECHO – THE WORLD REMEMBERS
 * Remote Player 3D Entity (تمثيل اللاعبين المتصلين في العالم ثلاثي الأبعاد)
 *
 * Uses the exact same CharacterRig model, skin colors, equipped tools/weapons,
 * and procedural animations as local Character.ts so friends see 1:1 fidelity.
 */

import * as THREE from 'three';
import {
  PlayerAccountProfile,
  PlayerLocomotionState,
  PlayerTransformSnapshot,
  RealmId,
} from './types.ts';
import { CharacterRig, EquippedToolType } from '../player/CharacterRig.ts';

export class RemotePlayerEntity {
  public group: THREE.Group;
  public profile: PlayerAccountProfile;
  public realm: RealmId = 'ISLAND';

  // Transform interpolation targets
  private targetPosition: THREE.Vector3;
  private currentPosition: THREE.Vector3;
  private targetFacingAngle: number = 0;
  private currentFacingAngle: number = 0;
  private targetVelX: number = 0;
  private targetVelZ: number = 0;
  private isMoving: boolean = false;
  private isSprinting: boolean = false;
  private isGrounded: boolean = true;
  private actionState: PlayerLocomotionState = 'IDLE';

  // Voice status indicators
  private voiceEnabled: boolean = false;
  private voiceMuted: boolean = false;
  private isSpeaking: boolean = false;
  private lastNameplateKey: string = '';

  // Shared 3D rig (identical to local player)
  private readonly rig: CharacterRig;
  private readonly pulseShockwaveMesh: THREE.Mesh;
  private readonly pulseGeom: THREE.RingGeometry;
  private readonly pulseMat: THREE.MeshBasicMaterial;

  // Remote weapon/combat/swim pose state
  private equippedWeapon: 'sword' | 'pistol' | 'bow' = 'sword';
  private equippedTool: EquippedToolType = 'sword';
  private heldBlockColor: number = 0x8b5a2b;
  private isBlocking = false;
  private isAiming = false;
  private bowDraw = 0;
  private pistolRecoil = 0;
  private rangedActionTimer = 0;
  private rangedActionKind: 'pistol' | 'bow' = 'pistol';
  private pistolFlashTimer = 0;
  private attackComboStep = 0;
  private swordSwingTimer = 0;
  private readonly swordSwingDuration = 0.32;
  private dodgeAnimTimer = 0;
  private readonly dodgeAnimDuration = 0.38;
  private pulseAnimTimer = 0;
  private readonly pulseAnimDuration = 0.45;
  private swimInputX = 0;
  private swimInputY = 0;

  // Overhead Billboard UI (Nameplate & HP bar)
  private nameplateGroup: THREE.Group;
  private nameplateCanvas: HTMLCanvasElement;
  private nameplateCtx: CanvasRenderingContext2D | null;
  private nameplateTexture: THREE.CanvasTexture;
  private tagGeom: THREE.PlaneGeometry;
  private tagMat: THREE.MeshBasicMaterial;
  private hpBgGeom: THREE.PlaneGeometry;
  private hpBgMat: THREE.MeshBasicMaterial;
  private hpFillGeom: THREE.PlaneGeometry;
  private hpFillMat: THREE.MeshBasicMaterial;
  private hpFillMesh: THREE.Mesh;

  constructor(profile: PlayerAccountProfile, initialTransform: PlayerTransformSnapshot) {
    this.profile = profile;
    this.realm = initialTransform.realm ?? 'ISLAND';
    this.targetPosition = new THREE.Vector3(initialTransform.x, initialTransform.y, initialTransform.z);
    this.currentPosition = this.targetPosition.clone();
    this.targetFacingAngle = initialTransform.facingAngle || 0;
    this.currentFacingAngle = this.targetFacingAngle;
    this.targetVelX = initialTransform.vx || 0;
    this.targetVelZ = initialTransform.vz || 0;
    this.isMoving = Boolean(initialTransform.isMoving);
    this.isSprinting = Boolean(initialTransform.isSprinting);
    this.isGrounded = initialTransform.isGrounded ?? true;
    this.actionState = initialTransform.actionState || 'IDLE';
    this.attackComboStep = ((Math.round(initialTransform.comboStep ?? 0) % 3) + 3) % 3;

    this.group = new THREE.Group();
    this.group.name = `RemotePlayer_${profile.id}`;
    this.group.position.copy(this.currentPosition);

    // 1. Instantiate exact shared CharacterRig used by local Character
    this.rig = new CharacterRig(this.group, {
      robeColor: profile.robeColor,
      auraColor: profile.auraColor,
    });
    this.rig.characterPivot.rotation.y = this.currentFacingAngle;

    this.equippedWeapon = initialTransform.weapon ?? 'sword';
    this.equippedTool = initialTransform.equippedTool ?? this.equippedWeapon;
    if (typeof initialTransform.heldBlockColor === 'number') {
      this.heldBlockColor = initialTransform.heldBlockColor;
      this.rig.setHeldBlockAppearance(this.heldBlockColor);
    }
    this.rig.setEquippedTool(this.equippedTool);
    this.isBlocking = Boolean(initialTransform.isBlocking);
    this.isAiming = Boolean(initialTransform.isAiming);
    this.bowDraw = typeof initialTransform.bowDraw === 'number' ? initialTransform.bowDraw : 0;
    this.swimInputX = typeof initialTransform.swimInputX === 'number' ? initialTransform.swimInputX : 0;
    this.swimInputY = typeof initialTransform.swimInputY === 'number' ? initialTransform.swimInputY : 0;

    // 2. Pulse Shockwave VFX
    const auraHex = parseInt((profile.auraColor || '#00f5d4').replace('#', ''), 16) || 0x00f5d4;
    this.pulseGeom = new THREE.RingGeometry(0.2, 0.6, 32);
    this.pulseGeom.rotateX(-Math.PI / 2);
    this.pulseMat = new THREE.MeshBasicMaterial({
      color: auraHex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
    });
    this.pulseShockwaveMesh = new THREE.Mesh(this.pulseGeom, this.pulseMat);
    this.group.add(this.pulseShockwaveMesh);

    // 3. Overhead Nameplate Canvas Billboard
    this.nameplateGroup = new THREE.Group();
    this.nameplateGroup.position.y = 2.15;

    this.nameplateCanvas = document.createElement('canvas');
    this.nameplateCanvas.width = 420;
    this.nameplateCanvas.height = 104;
    this.nameplateCtx = this.nameplateCanvas.getContext('2d');
    this.nameplateTexture = new THREE.CanvasTexture(this.nameplateCanvas);
    this.redrawNameplate();

    this.tagGeom = new THREE.PlaneGeometry(1.5, 0.37);
    this.tagMat = new THREE.MeshBasicMaterial({
      map: this.nameplateTexture,
      transparent: true,
      depthTest: false,
    });
    const tagMesh = new THREE.Mesh(this.tagGeom, this.tagMat);
    this.nameplateGroup.add(tagMesh);

    // Health bar above nameplate
    this.hpBgGeom = new THREE.PlaneGeometry(1.0, 0.08);
    this.hpBgMat = new THREE.MeshBasicMaterial({ color: 0x18181b, depthTest: false });
    const hpBg = new THREE.Mesh(this.hpBgGeom, this.hpBgMat);
    hpBg.position.y = 0.25;
    this.nameplateGroup.add(hpBg);

    this.hpFillGeom = new THREE.PlaneGeometry(0.96, 0.05);
    this.hpFillGeom.translate(0.48, 0, 0);
    this.hpFillMat = new THREE.MeshBasicMaterial({ color: 0x10b981, depthTest: false });
    this.hpFillMesh = new THREE.Mesh(this.hpFillGeom, this.hpFillMat);
    this.hpFillMesh.position.set(-0.48, 0.25, 0.005);
    this.nameplateGroup.add(this.hpFillMesh);

    if (
      typeof initialTransform.hp === 'number' &&
      typeof initialTransform.maxHp === 'number' &&
      initialTransform.maxHp > 0
    ) {
      this.setHealthPercent(initialTransform.hp / initialTransform.maxHp);
    }

    this.group.add(this.nameplateGroup);
  }

  private redrawNameplate(): void {
    const key = `${this.profile.username}|${this.profile.titleEn}|${this.profile.level}|${this.profile.auraColor}|${this.voiceEnabled}|${this.voiceMuted}|${this.isSpeaking}`;
    if (key === this.lastNameplateKey) return;
    this.lastNameplateKey = key;

    const ctx = this.nameplateCtx;
    if (!ctx) return;

    const w = this.nameplateCanvas.width;
    const h = this.nameplateCanvas.height;
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = this.isSpeaking ? 'rgba(6, 40, 36, 0.9)' : 'rgba(6, 10, 18, 0.84)';
    ctx.beginPath();
    ctx.roundRect(8, 8, w - 16, h - 16, 18);
    ctx.fill();

    ctx.strokeStyle = this.isSpeaking ? '#34d399' : this.profile.auraColor || '#00f5d4';
    ctx.lineWidth = this.isSpeaking ? 4.5 : 3;
    ctx.stroke();

    if (this.voiceEnabled) {
      ctx.fillStyle = this.voiceMuted
        ? 'rgba(239, 68, 68, 0.92)'
        : this.isSpeaking
          ? 'rgba(16, 185, 129, 0.95)'
          : 'rgba(14, 165, 233, 0.85)';
      ctx.beginPath();
      ctx.roundRect(w - 98, 16, 76, 24, 10);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(this.voiceMuted ? 'MUTED' : this.isSpeaking ? 'TALKING' : 'MIC ON', w - 60, 33);
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.profile.username, w / 2, 46);

    ctx.fillStyle = this.profile.auraColor || '#00f5d4';
    ctx.font = '18px sans-serif';
    ctx.fillText(`${this.profile.titleEn} (Lv.${this.profile.level})`, w / 2, 76);

    this.nameplateTexture.needsUpdate = true;
  }

  public updateProfile(profile: PlayerAccountProfile): void {
    this.profile = { ...this.profile, ...profile };
    this.rig.applyProfileAppearance({
      robeColor: this.profile.robeColor,
      auraColor: this.profile.auraColor,
    });
    const auraHex = parseInt((this.profile.auraColor || '#00f5d4').replace('#', ''), 16) || 0x00f5d4;
    this.pulseMat.color.setHex(auraHex);
    this.redrawNameplate();
  }

  public setVoiceState(enabled: boolean, muted: boolean, speaking: boolean): void {
    this.voiceEnabled = enabled;
    this.voiceMuted = muted;
    this.isSpeaking = speaking && enabled && !muted;
    this.redrawNameplate();
  }

  public setEquippedWeapon(weapon: 'sword' | 'pistol' | 'bow', tool?: EquippedToolType): void {
    this.equippedWeapon = weapon;
    this.equippedTool = tool ?? weapon;
    this.rig.setEquippedTool(this.equippedTool);
  }

  /**
   * Ingests network packet transform
   */
  public updateNetworkTransform(snapshot: PlayerTransformSnapshot): void {
    const prevActionState = this.actionState;
    const prevComboStep = this.attackComboStep;

    this.targetPosition.set(snapshot.x, snapshot.y, snapshot.z);
    this.targetFacingAngle = snapshot.facingAngle;
    this.targetVelX = snapshot.vx || 0;
    this.targetVelZ = snapshot.vz || 0;
    this.isMoving = snapshot.isMoving;
    this.isSprinting = snapshot.isSprinting;
    this.isGrounded = snapshot.isGrounded;
    this.realm = snapshot.realm ?? this.realm;
    this.actionState = snapshot.actionState || 'IDLE';
    this.attackComboStep = ((Math.round(snapshot.comboStep ?? 0) % 3) + 3) % 3;

    const nextWeapon = snapshot.weapon ?? this.equippedWeapon;
    const nextTool: EquippedToolType = snapshot.equippedTool ?? nextWeapon;
    if (nextWeapon !== this.equippedWeapon || nextTool !== this.equippedTool) {
      this.setEquippedWeapon(nextWeapon, nextTool);
    }
    if (typeof snapshot.heldBlockColor === 'number' && snapshot.heldBlockColor !== this.heldBlockColor) {
      this.heldBlockColor = snapshot.heldBlockColor;
      this.rig.setHeldBlockAppearance(this.heldBlockColor);
    }

    this.isBlocking = Boolean(snapshot.isBlocking);
    this.isAiming = Boolean(snapshot.isAiming);
    this.bowDraw = typeof snapshot.bowDraw === 'number' ? snapshot.bowDraw : 0;
    this.swimInputX = typeof snapshot.swimInputX === 'number' ? snapshot.swimInputX : 0;
    this.swimInputY = typeof snapshot.swimInputY === 'number' ? snapshot.swimInputY : 0;

    if (typeof snapshot.hp === 'number' && typeof snapshot.maxHp === 'number' && snapshot.maxHp > 0) {
      this.setHealthPercent(snapshot.hp / snapshot.maxHp);
    }

    if (snapshot.actionState === 'ATTACK') {
      if (this.swordSwingTimer <= 0 || prevActionState !== 'ATTACK' || prevComboStep !== this.attackComboStep) {
        this.playAttackAnimation(this.attackComboStep);
      }
    } else if (snapshot.actionState === 'DODGE') {
      if (this.dodgeAnimTimer <= 0 && prevActionState !== 'DODGE') {
        this.playDodgeAnimation();
      }
    } else if (snapshot.actionState === 'PULSE') {
      if (this.pulseAnimTimer <= 0 && prevActionState !== 'PULSE') {
        this.playPulseAnimation();
      }
    }
  }

  public setHealthPercent(pct: number): void {
    const clamped = Math.max(0, Math.min(1, pct));
    this.hpFillMesh.scale.x = clamped;
    if (clamped > 0.5) this.hpFillMat.color.setHex(0x10b981);
    else if (clamped > 0.25) this.hpFillMat.color.setHex(0xf59e0b);
    else this.hpFillMat.color.setHex(0xef4444);
  }

  public update(dt: number, cameraPos: THREE.Vector3): void {
    // 1. Smoothly interpolate position toward target (network dead reckoning lerp)
    const dist = this.currentPosition.distanceTo(this.targetPosition);
    if (dist > 18) {
      this.currentPosition.copy(this.targetPosition);
    } else {
      const lerpRate = 1 - Math.exp(-13.0 * dt);
      this.currentPosition.lerp(this.targetPosition, lerpRate);
    }
    this.group.position.copy(this.currentPosition);

    // 2. Smoothly rotate facing angle
    let diff = this.targetFacingAngle - this.currentFacingAngle;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    this.currentFacingAngle += diff * (1 - Math.exp(-14.0 * dt));
    this.rig.characterPivot.rotation.y = this.currentFacingAngle;

    // 3. Face nameplate toward local camera
    this.nameplateGroup.lookAt(cameraPos);

    // 4. Advance combat/action timers smoothly
    if (this.pistolRecoil > 0) this.pistolRecoil = Math.max(0, this.pistolRecoil - dt * 6);
    if (this.pistolFlashTimer > 0) this.pistolFlashTimer = Math.max(0, this.pistolFlashTimer - dt);
    if (this.rangedActionTimer > 0) this.rangedActionTimer = Math.max(0, this.rangedActionTimer - dt);
    if (this.swordSwingTimer > 0) this.swordSwingTimer = Math.max(0, this.swordSwingTimer - dt);
    if (this.dodgeAnimTimer > 0) this.dodgeAnimTimer = Math.max(0, this.dodgeAnimTimer - dt);

    if (this.pulseAnimTimer > 0) {
      this.pulseAnimTimer = Math.max(0, this.pulseAnimTimer - dt);
      const t = 1 - this.pulseAnimTimer / this.pulseAnimDuration;
      const s = 1 + t * 8.5;
      this.pulseShockwaveMesh.scale.set(s, s, s);
      this.pulseMat.opacity = (1 - t) * 0.9;
    } else {
      this.pulseMat.opacity = 0;
    }

    // 5. Determine swim stroke orientation lock identically to local player
    const isSwimming = this.actionState === 'SWIM';
    let lockedSwim = false;
    if (isSwimming && this.isMoving) {
      const fwdX = Math.sin(this.currentFacingAngle);
      const fwdZ = Math.cos(this.currentFacingAngle);
      const fwdSpeed = this.targetVelX * fwdX + this.targetVelZ * fwdZ;
      const sideSpeed = Math.abs(this.targetVelX * fwdZ - this.targetVelZ * fwdX);
      lockedSwim =
        this.isAiming ||
        fwdSpeed < -0.5 ||
        (sideSpeed > Math.abs(fwdSpeed) + 0.45 && Math.abs(this.swimInputX) > 0.2);
    }

    // 6. Animate via shared CharacterRig (identical 3-hit combos, 360 flip, swimming, tools)
    this.rig.animatePose(dt, {
      isMoving: this.isMoving,
      isSprinting: this.isSprinting,
      isGrounded: this.isGrounded,
      isSwimming,
      isDead: this.actionState === 'DEAD',
      isDodging: this.dodgeAnimTimer > 0,
      dodgeProgress: 1 - Math.max(0, this.dodgeAnimTimer / this.dodgeAnimDuration),
      isAttacking: this.swordSwingTimer > 0,
      attackProgress: 1 - Math.max(0, this.swordSwingTimer / this.swordSwingDuration),
      attackComboStep: this.attackComboStep,
      isCastingPulse: this.pulseAnimTimer > 0,
      equippedWeapon: this.equippedWeapon,
      equippedTool: this.equippedTool,
      isBlocking: this.isBlocking,
      isAiming: this.isAiming,
      bowDrawAmount: this.bowDraw,
      pistolRecoilOffset: this.pistolRecoil,
      rangedActionTimer: this.rangedActionTimer,
      rangedActionKind: this.rangedActionKind,
      pistolFlashTimer: this.pistolFlashTimer,
      isBreakingBlock: false,
      buildSwingTimer: 0,
      buildSwingDuration: 0.2,
      strafeOnly: lockedSwim,
      swimInputX: this.swimInputX,
      swimInputY: this.swimInputY,
      waterDepth: isSwimming ? 1.5 : 0,
      localWaterLevel: isSwimming ? this.currentPosition.y + 0.45 : undefined,
      worldY: this.currentPosition.y,
    });
  }

  public playAttackAnimation(step: number = 0): void {
    this.attackComboStep = ((Math.round(step) % 3) + 3) % 3;
    if (
      (this.equippedWeapon === 'pistol' || this.equippedWeapon === 'bow') &&
      this.equippedTool === this.equippedWeapon
    ) {
      this.playShotAnimation(this.equippedWeapon);
      return;
    }
    this.swordSwingTimer = this.swordSwingDuration;
  }

  public playShotAnimation(weapon: 'pistol' | 'bow'): void {
    this.setEquippedWeapon(weapon, weapon);
    this.rangedActionKind = weapon;
    this.rangedActionTimer = weapon === 'pistol' ? 0.16 : 0.24;
    if (weapon === 'pistol') {
      this.pistolRecoil = 1.0;
      this.pistolFlashTimer = 0.055;
    } else {
      this.bowDraw = 0;
    }
  }

  public playDodgeAnimation(): void {
    this.dodgeAnimTimer = this.dodgeAnimDuration;
    this.swordSwingTimer = 0;
  }

  public playPulseAnimation(): void {
    this.pulseAnimTimer = this.pulseAnimDuration;
    this.pulseShockwaveMesh.scale.set(1, 1, 1);
  }

  public dispose(): void {
    this.rig.dispose();
    this.pulseGeom.dispose();
    this.pulseMat.dispose();
    this.tagGeom.dispose();
    this.tagMat.dispose();
    this.hpBgGeom.dispose();
    this.hpBgMat.dispose();
    this.hpFillGeom.dispose();
    this.hpFillMat.dispose();
    this.nameplateTexture.dispose();
    this.group.removeFromParent();
  }
}
