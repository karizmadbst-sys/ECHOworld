/**
 * ECHO – THE WORLD REMEMBERS
 * Third-Person Character: "The Spirit Guide Explorer"
 * Uses shared CharacterRig for 1:1 local & multiplayer appearance and animations.
 */

import * as THREE from 'three';
import { Terrain } from '../world/Terrain.ts';
import { WorldObstacle } from '../world/Forest.ts';
import { CharacterRig, EquippedToolType } from './CharacterRig.ts';

export type WeaponType = 'sword' | 'pistol' | 'bow';

export class Character {
  public group: THREE.Group;
  public position: THREE.Vector3;
  public velocity: THREE.Vector3;
  public isGrounded: boolean = true;
  public isMoving: boolean = false;
  public isSprinting: boolean = false;
  public isRunningInPlace: boolean = false;
  public isFirstPerson: boolean = false;
  public isSwimming: boolean = false;

  // Collision radius
  public readonly radius = 0.55;

  // Shared 3D voxel rig & visual state
  private readonly rig: CharacterRig;

  // Combat States & Timers
  public isAttacking: boolean = false;
  public attackTimer: number = 0;
  public attackComboStep: number = 0;
  public isDodging: boolean = false;
  public dodgeTimer: number = 0;
  public isCastingPulse: boolean = false;
  public pulseTimer: number = 0;
  public isDead: boolean = false;

  // Unified Weapon & Tool Pose State (Sword / Pistol / Bow / Tools / Blocks)
  public equippedWeapon: WeaponType = 'sword';
  public equippedTool: EquippedToolType = 'sword';
  public heldBlockColor: number = 0x8b5a2b;
  public isBlocking: boolean = false;
  public isAiming: boolean = false;
  public bowDrawAmount: number = 0;
  public pistolRecoilOffset: number = 0;
  public rangedActionTimer: number = 0;
  private rangedActionKind: 'pistol' | 'bow' = 'pistol';
  private pistolFlashTimer = 0;

  // Movement physics variables
  private walkSpeed = 6.8;
  private sprintSpeed = 12.8;
  private swimSpeed = 4.8;
  private sprintSwimSpeed = 8.5;
  private jumpForce = 10.8;
  private gravity = 26.0;
  private verticalVelocity = 0;
  public currentFacingAngle = 0;
  private targetFacingAngle = 0;
  public lastSwimInputY = 0;
  public lastSwimInputX = 0;
  private lastWaterDepth = 0;
  private lastLocalWaterLevel = -999;
  private lastStrafeOnly = false;

  // Coyote time & jump buffering
  private coyoteTimer = 0;
  private readonly maxCoyoteTime = 0.12;
  private swimLeapGraceTimer = 0;

  // Dark Realm / custom world overrides & building swing timers
  public customWaterY: ((x: number, z: number) => number | null) | null = null;
  public externalSpeedMultiplier: number = 1.0;
  private buildSwingTimer = 0;
  private buildSwingDuration = 0.2;
  private isBreakingBlock = false;

  private static readonly _scratchMoveInput = new THREE.Vector2();
  private static readonly _scratchVec = new THREE.Vector3();
  private static readonly _scratchStaffPos = new THREE.Vector3();
  private static readonly _scratchDodgeVec = new THREE.Vector3();

  constructor(spawnPos: THREE.Vector3) {
    this.group = new THREE.Group();
    this.position = spawnPos.clone();
    this.velocity = new THREE.Vector3();
    this.group.position.copy(this.position);

    this.rig = new CharacterRig(this.group);
  }

  /**
   * Jump action with coyote time & swimming leap
   */
  public jump(): boolean {
    if (this.isSwimming) {
      this.verticalVelocity = 8.5;
      this.isGrounded = false;
      this.isSwimming = false;
      this.swimLeapGraceTimer = 0.32;
      return true;
    }
    if (this.isGrounded || this.coyoteTimer > 0) {
      this.verticalVelocity = this.jumpForce;
      this.isGrounded = false;
      this.coyoteTimer = 0;
      return true;
    }
    return false;
  }

  /**
   * Main movement update per frame with continuous collision handling & automatic swimming
   */
  public update(
    dt: number,
    moveInput: THREE.Vector2, // Normalized x (-1 to 1: Strafe), y (-1 to 1: Forward/Back)
    cameraAngle: number,
    sprint: boolean,
    terrain: Terrain,
    obstacles: WorldObstacle[],
    strafeOnly: boolean = false
  ): void {
    const clampedDt = Math.max(0, Math.min(Number.isFinite(dt) ? dt : 0, 0.05));
    if (this.swimLeapGraceTimer > 0) {
      this.swimLeapGraceTimer = Math.max(0, this.swimLeapGraceTimer - clampedDt);
    }
    if (this.buildSwingTimer > 0) {
      this.buildSwingTimer = Math.max(0, this.buildSwingTimer - clampedDt);
    }
    if (this.pistolFlashTimer > 0) {
      this.pistolFlashTimer = Math.max(0, this.pistolFlashTimer - clampedDt);
    }

    const effectiveMoveInput = Character._scratchMoveInput.set(
      Number.isFinite(moveInput.x) ? moveInput.x : 0,
      Number.isFinite(moveInput.y) ? moveInput.y : 0
    );
    if (sprint && effectiveMoveInput.lengthSq() <= 0.001) {
      effectiveMoveInput.set(0, 1.0);
    }

    const hasInput = effectiveMoveInput.lengthSq() > 0.001;
    this.isSprinting = sprint;
    this.isRunningInPlace = false;
    this.lastStrafeOnly = strafeOnly;

    // Detect water zone & depth (Custom Dark Realm River vs Lake vs Ocean)
    let localWaterLevel = -999;
    if (this.customWaterY) {
      const customY = this.customWaterY(this.position.x, this.position.z);
      if (customY !== null) {
        localWaterLevel = customY;
      }
    } else {
      const lakeDist = Math.hypot(
        this.position.x - Terrain.LAKE_CENTER.x,
        this.position.z - Terrain.LAKE_CENTER.y
      );
      localWaterLevel = lakeDist < Terrain.LAKE_RADIUS + 4 ? Terrain.LAKE_WATER_Y : Terrain.WATER_LEVEL;
    }
    const rawGroundHeight = terrain.getHeightAt(this.position.x, this.position.z);
    const currentGroundHeight = Number.isFinite(rawGroundHeight) ? rawGroundHeight : 5;
    const waterDepth = localWaterLevel - currentGroundHeight;
    this.lastWaterDepth = waterDepth;
    this.lastLocalWaterLevel = localWaterLevel;

    // Automatic swimming transition: enter when water depth > 0.45m (respecting leap grace)
    if (
      this.swimLeapGraceTimer <= 0 &&
      waterDepth > 0.45 &&
      (this.position.y <= localWaterLevel + 0.35 || this.isSwimming)
    ) {
      if (!this.isSwimming && this.verticalVelocity < 0) {
        this.verticalVelocity *= 0.2;
      }
      this.isSwimming = true;
      this.isGrounded = false;
    } else if (waterDepth <= 0.30 && currentGroundHeight >= localWaterLevel - 0.30) {
      if (this.isSwimming) {
        this.isSwimming = false;
        this.isGrounded = this.position.y <= currentGroundHeight + 0.35;
        if (this.isGrounded) {
          this.position.y = currentGroundHeight;
        }
      }
    }

    // 0. Dead state
    if (this.isDead) {
      this.velocity.x *= 0.85;
      this.velocity.z *= 0.85;
      const groundHeight = terrain.getHeightAt(this.position.x, this.position.z);
      this.position.y = THREE.MathUtils.lerp(
        this.position.y,
        Number.isFinite(groundHeight) ? groundHeight : this.position.y,
        clampedDt * 10
      );
      this.group.position.copy(this.position);
      this.animateCharacter(clampedDt, false, false, true);
      return;
    }

    // Update combat timers
    if (this.isDodging) {
      this.dodgeTimer -= clampedDt;
      if (this.dodgeTimer <= 0) {
        this.isDodging = false;
        this.rig.characterPivot.rotation.x = 0;
      }
    }
    if (this.isAttacking) {
      this.attackTimer -= clampedDt;
      if (this.attackTimer <= 0) {
        this.isAttacking = false;
        (this.rig.slashArcMesh.material as THREE.MeshBasicMaterial).opacity = 0;
      }
    }
    if (this.isCastingPulse) {
      this.pulseTimer -= clampedDt;
      if (this.pulseTimer <= 0) {
        this.isCastingPulse = false;
      }
    }
    if (this.rangedActionTimer > 0) {
      this.rangedActionTimer = Math.max(0, this.rangedActionTimer - clampedDt);
    }

    // 1. Calculate intended movement direction relative to camera facing
    this.isMoving = hasInput && !this.isDodging;
    if (this.isSwimming) {
      this.lastSwimInputX = hasInput ? effectiveMoveInput.x : 0;
      this.lastSwimInputY = hasInput ? effectiveMoveInput.y : 0;
    } else {
      this.lastSwimInputX = 0;
      this.lastSwimInputY = 0;
    }

    const baseSpeed = this.isSwimming
      ? this.isSprinting
        ? this.sprintSwimSpeed
        : this.swimSpeed
      : (this.isSprinting ? this.sprintSpeed : this.walkSpeed) * (this.isGrounded ? 1.0 : 0.88);
    const currentSpeed = baseSpeed * this.externalSpeedMultiplier;

    const safeCamAngle = Number.isFinite(cameraAngle) ? cameraAngle : Math.PI;
    const zZeroAlpha = 1 - Math.exp(-12.0 * clampedDt);

    if (this.isDodging) {
      const dodgeDrag = 1 - Math.exp(-3.5 * clampedDt);
      this.velocity.x -= this.velocity.x * dodgeDrag;
      this.velocity.z -= this.velocity.z * dodgeDrag;
    } else if (hasInput) {
      const camForwardX = -Math.sin(safeCamAngle);
      const camForwardZ = -Math.cos(safeCamAngle);
      const camRightX = Math.cos(safeCamAngle);
      const camRightZ = -Math.sin(safeCamAngle);

      const moveX = camForwardX * effectiveMoveInput.y + camRightX * effectiveMoveInput.x;
      const moveZ = camForwardZ * effectiveMoveInput.y + camRightZ * effectiveMoveInput.x;

      const moveLen = Math.hypot(moveX, moveZ);
      const moveDirX = moveLen > 0.0001 ? moveX / moveLen : 0;
      const moveDirZ = moveLen > 0.0001 ? moveZ / moveLen : 0;

      const accelRate = this.isSwimming ? 11.0 : this.isGrounded ? 24.0 : 9.0;
      const accelAlpha = 1 - Math.exp(-accelRate * clampedDt);
      this.velocity.x += (moveDirX * currentSpeed - this.velocity.x) * accelAlpha;
      this.velocity.z += (moveDirZ * currentSpeed - this.velocity.z) * accelAlpha;

      const combatAimLock = this.isFirstPerson || this.isAiming || (this.isBlocking && !this.isSwimming);
      if (strafeOnly) {
        this.targetFacingAngle = this.currentFacingAngle;
        this.rig.characterPivot.rotation.y = this.currentFacingAngle;
        this.rig.characterPivot.rotation.z = THREE.MathUtils.lerp(
          this.rig.characterPivot.rotation.z,
          0,
          zZeroAlpha
        );
      } else if (combatAimLock) {
        this.targetFacingAngle = safeCamAngle + Math.PI;
        let angleDiff = this.targetFacingAngle - this.currentFacingAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        const turnAlpha = 1 - Math.exp(-22.0 * clampedDt);
        this.currentFacingAngle += angleDiff * turnAlpha;
        this.rig.characterPivot.rotation.y = this.currentFacingAngle;
        this.rig.characterPivot.rotation.z = THREE.MathUtils.lerp(
          this.rig.characterPivot.rotation.z,
          0,
          zZeroAlpha
        );
      } else {
        this.targetFacingAngle = Math.atan2(moveDirX, moveDirZ);

        let angleDiff = this.targetFacingAngle - this.currentFacingAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        const turnRate = this.isSwimming ? 11.5 : this.isFirstPerson ? 32.0 : 16.0;
        const turnAlpha = 1 - Math.exp(-turnRate * clampedDt);
        this.currentFacingAngle += angleDiff * turnAlpha;
        this.rig.characterPivot.rotation.y = this.currentFacingAngle;

        if (this.isSwimming) {
          this.rig.characterPivot.rotation.z = THREE.MathUtils.lerp(
            this.rig.characterPivot.rotation.z,
            0,
            zZeroAlpha
          );
        } else {
          const targetBank =
            -Math.max(-0.35, Math.min(0.35, angleDiff)) * (this.isSprinting ? 0.22 : 0.10);
          this.rig.characterPivot.rotation.z = THREE.MathUtils.lerp(
            this.rig.characterPivot.rotation.z,
            targetBank,
            zZeroAlpha
          );
        }
      }
    } else {
      if (this.isFirstPerson || this.isAiming || (this.isBlocking && !this.isSwimming)) {
        this.targetFacingAngle = safeCamAngle + Math.PI;
        let angleDiff = this.targetFacingAngle - this.currentFacingAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        const turnAlpha = 1 - Math.exp(-26.0 * clampedDt);
        this.currentFacingAngle += angleDiff * turnAlpha;
        this.rig.characterPivot.rotation.y = this.currentFacingAngle;
      }
      const frictionRate = this.isSwimming ? 10.0 : this.isGrounded ? 18.0 : 4.0;
      const frictionAlpha = 1 - Math.exp(-frictionRate * clampedDt);
      this.velocity.x -= this.velocity.x * frictionAlpha;
      this.velocity.z -= this.velocity.z * frictionAlpha;
      this.rig.characterPivot.rotation.z = THREE.MathUtils.lerp(
        this.rig.characterPivot.rotation.z,
        0,
        zZeroAlpha
      );
    }

    if (!Number.isFinite(this.velocity.x)) this.velocity.x = 0;
    if (!Number.isFinite(this.velocity.z)) this.velocity.z = 0;

    // 2. Apply horizontal movement with sub-step sliding collision
    const prevX = this.position.x;
    const prevZ = this.position.z;
    let newX = prevX + this.velocity.x * clampedDt;
    let newZ = prevZ + this.velocity.z * clampedDt;

    // 3. Multi-pass Obstacle Collision Resolution
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < obstacles.length; i++) {
        const obs = obstacles[i];
        if (obs.radius <= 0) continue;
        if (obs.topY !== undefined && this.position.y >= obs.topY - 0.62) {
          continue;
        }

        const dx = newX - obs.x;
        const dz = newZ - obs.z;
        const minDist = this.radius + obs.radius;
        const distSq = dx * dx + dz * dz;

        if (distSq < minDist * minDist && distSq > 0.00001) {
          const dist = Math.sqrt(distSq);
          const overlap = minDist - dist;
          const nx = dx / dist;
          const nz = dz / dist;
          newX += nx * overlap;
          newZ += nz * overlap;

          const dot = this.velocity.x * nx + this.velocity.z * nz;
          if (dot < 0) {
            this.velocity.x -= dot * nx;
            this.velocity.z -= dot * nz;
          }
        }
      }
    }

    // 3b. Block horizontal clipping into sheer structural ledges
    if (terrain.floorHeightProvider) {
      const nextFloorH = terrain.floorHeightProvider(newX, newZ);
      if (nextFloorH !== null && nextFloorH - this.position.y > 0.72) {
        const floorOnlyX = terrain.floorHeightProvider(newX, prevZ);
        const floorOnlyZ = terrain.floorHeightProvider(prevX, newZ);
        if (floorOnlyX === null || floorOnlyX - this.position.y <= 0.72) {
          newZ = prevZ;
          this.velocity.z = 0;
        } else if (floorOnlyZ === null || floorOnlyZ - this.position.y <= 0.72) {
          newX = prevX;
          this.velocity.x = 0;
        } else {
          newX = prevX;
          newZ = prevZ;
          this.velocity.x = 0;
          this.velocity.z = 0;
        }
      }
    }

    // 4. Perimeter Boundary Check
    const distFromOrigin = Math.sqrt(newX * newX + newZ * newZ);
    const maxWorldRadius = 1180;
    if (distFromOrigin > maxWorldRadius) {
      const angle = Math.atan2(newZ, newX);
      newX = Math.cos(angle) * maxWorldRadius;
      newZ = Math.sin(angle) * maxWorldRadius;
      this.velocity.set(0, 0, 0);
    }

    if (Number.isFinite(newX) && Number.isFinite(newZ)) {
      this.position.x = newX;
      this.position.z = newZ;
    }

    // 5. Vertical Physics, Water Floating & Terrain/Structure Height Clamping
    let walkableObstacleTopY = -Infinity;
    for (let i = 0; i < obstacles.length; i++) {
      const obs = obstacles[i];
      if (obs.topY === undefined || obs.radius <= 0) continue;
      if (this.position.y < obs.topY - 0.62) continue;
      const dx = this.position.x - obs.x;
      const dz = this.position.z - obs.z;
      const supportRadius = obs.radius + 0.18;
      if (dx * dx + dz * dz <= supportRadius * supportRadius) {
        if (obs.topY > walkableObstacleTopY) {
          walkableObstacleTopY = obs.topY;
        }
      }
    }

    const rawNextGround = terrain.getHeightAt(this.position.x, this.position.z);
    const baseGroundHeight = Number.isFinite(rawNextGround) ? rawNextGround : currentGroundHeight;
    const groundHeight = Math.max(baseGroundHeight, walkableObstacleTopY);

    if (this.isSwimming) {
      this.coyoteTimer = 0;
      this.verticalVelocity = 0;
      const waveBobbing = Math.sin(this.rig.getAnimTime() * 1.15) * 0.04;
      const targetSwimY = Math.max(
        groundHeight - 0.04,
        localWaterLevel - 0.45 + waveBobbing
      );
      this.position.y = THREE.MathUtils.lerp(
        this.position.y,
        targetSwimY,
        Math.min(1, 10.0 * clampedDt)
      );
    } else if (!this.isGrounded) {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - clampedDt);
      this.verticalVelocity -= this.gravity * clampedDt;
      this.position.y += this.verticalVelocity * clampedDt;

      if (this.position.y <= groundHeight) {
        this.position.y = groundHeight;
        this.verticalVelocity = 0;
        this.isGrounded = true;
        this.coyoteTimer = 0;
      }
    } else {
      const heightDiff = groundHeight - this.position.y;
      if (heightDiff < -0.8) {
        this.isGrounded = false;
        this.coyoteTimer = this.maxCoyoteTime;
      } else {
        this.position.y = THREE.MathUtils.lerp(
          this.position.y,
          groundHeight,
          Math.min(1, 28.0 * clampedDt)
        );
        this.coyoteTimer = this.maxCoyoteTime;
      }
    }

    if (!Number.isFinite(this.position.y) || this.position.y < -15) {
      this.position.y = groundHeight;
      this.verticalVelocity = 0;
      this.isGrounded = true;
    }

    this.group.position.copy(this.position);

    // 6. Character Procedural Animations via shared CharacterRig
    this.animateCharacter(clampedDt, hasInput, this.isSprinting, this.isGrounded);
  }

  private animateCharacter(
    dt: number,
    isMoving: boolean,
    isSprinting: boolean,
    isGrounded: boolean
  ): void {
    this.rig.animatePose(dt, {
      isMoving,
      isSprinting,
      isGrounded,
      isSwimming: this.isSwimming,
      isDead: this.isDead,
      isDodging: this.isDodging,
      dodgeProgress: 1 - Math.max(0, this.dodgeTimer / 0.38),
      isAttacking: this.isAttacking,
      attackProgress: 1 - Math.max(0, this.attackTimer / 0.32),
      attackComboStep: this.attackComboStep,
      isCastingPulse: this.isCastingPulse,
      equippedWeapon: this.equippedWeapon,
      equippedTool: this.equippedTool,
      isBlocking: this.isBlocking,
      isAiming: this.isAiming,
      bowDrawAmount: this.bowDrawAmount,
      pistolRecoilOffset: this.pistolRecoilOffset,
      rangedActionTimer: this.rangedActionTimer,
      rangedActionKind: this.rangedActionKind,
      pistolFlashTimer: this.pistolFlashTimer,
      isBreakingBlock: this.isBreakingBlock,
      buildSwingTimer: this.buildSwingTimer,
      buildSwingDuration: this.buildSwingDuration,
      isRunningInPlace: this.isRunningInPlace,
      isFirstPerson: this.isFirstPerson,
      strafeOnly: this.lastStrafeOnly,
      swimInputX: this.lastSwimInputX,
      swimInputY: this.lastSwimInputY,
      waterDepth: this.lastWaterDepth,
      localWaterLevel: this.lastLocalWaterLevel,
      worldY: this.position.y,
    });
  }

  // ==========================================
  // COMBAT ACTIONS
  // ==========================================

  public performAttack(comboStep: number = 0): boolean {
    if (this.isDead || this.isDodging) return false;
    this.isAttacking = true;
    this.attackTimer = 0.32;
    this.attackComboStep = comboStep % 3;

    Character._scratchVec.set(
      Math.sin(this.currentFacingAngle),
      0,
      Math.cos(this.currentFacingAngle)
    );
    this.velocity.x += Character._scratchVec.x * 4.5;
    this.velocity.z += Character._scratchVec.z * 4.5;
    return true;
  }

  public performDodge(inputDir?: THREE.Vector3): boolean {
    if (this.isDead || this.isDodging) return false;
    this.isDodging = true;
    this.dodgeTimer = 0.38;
    this.isAttacking = false;
    this.attackTimer = 0;
    (this.rig.slashArcMesh.material as THREE.MeshBasicMaterial).opacity = 0;

    if (inputDir && inputDir.lengthSq() > 0.01) {
      Character._scratchVec.copy(inputDir).normalize();
    } else {
      Character._scratchVec.set(
        Math.sin(this.currentFacingAngle),
        0,
        Math.cos(this.currentFacingAngle)
      );
    }

    this.velocity.copy(Character._scratchVec.multiplyScalar(17.5));
    return true;
  }

  public performEchoPulse(): boolean {
    if (this.isDead || this.isDodging) return false;
    this.isCastingPulse = true;
    this.pulseTimer = 0.55;
    this.isAttacking = false;
    return true;
  }

  public triggerAttackAnimation(): void {
    this.performAttack((this.attackComboStep + 1) % 3);
  }

  public triggerRangedAction(weapon: 'pistol' | 'bow', power: number = 1.0): void {
    if (this.isDead || this.isDodging) return;
    this.rangedActionKind = weapon;
    this.rangedActionTimer = weapon === 'pistol' ? 0.16 : 0.24;
    if (weapon === 'pistol') {
      this.pistolRecoilOffset = Math.max(this.pistolRecoilOffset, 1.0);
      this.pistolFlashTimer = 0.055;
    } else {
      this.bowDrawAmount = Math.max(0, power * 0.15);
    }
  }

  public setFacingAngleInstant(yaw: number): void {
    this.currentFacingAngle = yaw;
    this.targetFacingAngle = yaw;
    this.rig.characterPivot.rotation.y = yaw;
  }

  public triggerEchoPulseAnimation(): void {
    this.performEchoPulse();
  }

  public triggerDodge(cameraYaw: number, moveX: number, moveY: number): void {
    if (Math.hypot(moveX, moveY) > 0.05) {
      const camForwardX = -Math.sin(cameraYaw);
      const camForwardZ = -Math.cos(cameraYaw);
      const camRightX = Math.cos(cameraYaw);
      const camRightZ = -Math.sin(cameraYaw);
      Character._scratchDodgeVec.set(
        camForwardX * moveY + camRightX * moveX,
        0,
        camForwardZ * moveY + camRightZ * moveX
      );
      this.performDodge(Character._scratchDodgeVec);
    } else {
      this.performDodge();
    }
  }

  public setEquippedWeapon(weapon: WeaponType): void {
    this.equippedWeapon = weapon;
    if (weapon !== 'sword') this.isBlocking = false;
    this.setDarkRealmToolVisual(weapon, 0x00f5d4);
  }

  public setCombatPose(pose: {
    isBlocking?: boolean;
    isAiming?: boolean;
    bowDraw?: number;
    pistolRecoil?: number;
  }): void {
    if (pose.isBlocking !== undefined) this.isBlocking = pose.isBlocking;
    if (pose.isAiming !== undefined) this.isAiming = pose.isAiming;
    if (pose.bowDraw !== undefined) this.bowDrawAmount = pose.bowDraw;
    if (pose.pistolRecoil !== undefined) this.pistolRecoilOffset = pose.pistolRecoil;
  }

  public getWeaponMuzzleWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    return this.rig.getWeaponMuzzleWorldPosition(this.equippedWeapon, out);
  }

  public setDarkRealmToolVisual(
    tool: EquippedToolType,
    swordColor: number = 0x00f5d4
  ): void {
    this.equippedTool = tool;
    this.rig.setEquippedTool(tool, swordColor);
  }

  public triggerBuildPlaceAnimation(): void {
    this.buildSwingDuration = 0.2;
    this.buildSwingTimer = 0.2;
  }

  public triggerBuildBreakHitAnimation(): void {
    this.buildSwingDuration = 0.18;
    this.buildSwingTimer = 0.18;
  }

  public setBreakingBlockAnimation(active: boolean): void {
    this.isBreakingBlock = active;
  }

  public setHeldBlockAppearance(colorHex: number): void {
    this.heldBlockColor = colorHex;
    this.rig.setHeldBlockAppearance(colorHex);
  }

  public die(): void {
    this.isDead = true;
    this.isAttacking = false;
    this.isDodging = false;
    this.isCastingPulse = false;
    this.isBlocking = false;
    this.isAiming = false;
    this.velocity.set(0, 0, 0);
  }

  public respawn(spawnPos: THREE.Vector3): void {
    this.isDead = false;
    this.isAttacking = false;
    this.isDodging = false;
    this.isCastingPulse = false;
    this.isSwimming = false;
    this.position.copy(spawnPos);
    this.velocity.set(0, 0, 0);
    this.rig.resetTransformPose(this.currentFacingAngle);
  }

  public getFacingDirection(): THREE.Vector3 {
    return Character._scratchVec
      .set(Math.sin(this.currentFacingAngle), 0, Math.cos(this.currentFacingAngle))
      .normalize();
  }

  public getStaffWorldPosition(): THREE.Vector3 {
    return this.rig.getStaffWorldPosition(Character._scratchStaffPos);
  }

  public getSwordWorldPosition(): THREE.Vector3 {
    return this.getStaffWorldPosition();
  }

  public setFirstPersonMode(active: boolean, hideMesh: boolean = active): void {
    this.isFirstPerson = active;
    this.rig.characterPivot.visible = !hideMesh;
  }

  public isCharacterMeshHidden(): boolean {
    return !this.rig.characterPivot.visible;
  }

  public applyProfileAppearance(profile: { robeColor?: string; auraColor?: string }): void {
    this.rig.applyProfileAppearance(profile);
  }

  public dispose(): void {
    this.rig.dispose();
  }
}
