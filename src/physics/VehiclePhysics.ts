import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';

export interface DriverInput {
    steering: number;
    throttle: number;
    brake: number;
    handbrake: boolean;
    reverse: boolean;
}

export interface WheelMount {
    x: number;
    y: number;
    z: number;
    front: boolean;
    driven: boolean;
}

export interface VehiclePhysicsConfig {
    mass: number;
    wheelRadius: number;
    wheelInertia: number;
    suspensionRest: number;
    suspensionTravel: number;
    springRate: number;
    damperRate: number;
    peakTorque: number;
    finalDrive: number;
    gearRatios: readonly number[];
    maxRpm: number;
    maxSteeringAngle: number;
    brakeTorque: number;
    handbrakeTorque: number;
    dragCoefficient: number;
    rollingResistance: number;
    surfaceGrip: (x: number, z: number) => number;
    wheelMounts: readonly WheelMount[];
}

export interface WheelPhysicsSnapshot {
    suspensionLength: number;
    normalLoad: number;
    slipRatio: number;
    slipAngle: number;
    rotation: number;
    steeringAngle: number;
    grounded: boolean;
}

export interface VehiclePhysicsSnapshot {
    speedKmh: number;
    rpm: number;
    gear: number | 'R';
    steeringAngle: number;
    longitudinalG: number;
    lateralG: number;
    groundedWheels: number;
    wheels: WheelPhysicsSnapshot[];
}

interface WheelState extends WheelMount {
    mount: THREE.Vector3;
    previousLength: number;
    angularSpeed: number;
    rotation: number;
    suspensionLength: number;
    normalLoad: number;
    slipRatio: number;
    slipAngle: number;
    grounded: boolean;
}

function toRapier(vector: THREE.Vector3): RAPIER.Vector {
    return { x: vector.x, y: vector.y, z: vector.z };
}

function torqueAtRpm(rpm: number, peakTorque: number, maxRpm: number) {
    const rise = THREE.MathUtils.smoothstep(rpm, 850, maxRpm * .52);
    const fall = THREE.MathUtils.smoothstep(rpm, maxRpm * .7, maxRpm);
    return THREE.MathUtils.clamp(peakTorque * (.68 + rise * .32 - fall * .23), peakTorque * .55, peakTorque);
}

export class VehiclePhysics {
    readonly body: RAPIER.RigidBody;
    readonly collider: RAPIER.Collider;
    private readonly wheels: WheelState[];
    private readonly forward = new THREE.Vector3();
    private readonly right = new THREE.Vector3();
    private readonly chassisUp = new THREE.Vector3();
    private readonly worldMount = new THREE.Vector3();
    private readonly contactPoint = new THREE.Vector3();
    private readonly tireForward = new THREE.Vector3();
    private readonly tireSide = new THREE.Vector3();
    private readonly suspensionDown = new THREE.Vector3();
    private readonly temporary = new THREE.Vector3();
    private readonly localMount = new THREE.Vector3();
    private readonly previousVelocity = new THREE.Vector3();
    private steeringAngle = 0;
    private engineRpm = 850;
    private gear = 1;
    private reverse = false;
    private shiftCooldown = 0;
    private longitudinalG = 0;
    private lateralG = 0;
    private lastInput: DriverInput = { steering: 0, throttle: 0, brake: 0, handbrake: false, reverse: false };

    constructor(
        private readonly world: RAPIER.World,
        private readonly config: VehiclePhysicsConfig,
        spawn: THREE.Vector3,
        yaw: number,
    ) {
        const bodyRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        this.body = world.createRigidBody(
            RAPIER.RigidBodyDesc.dynamic()
                .setTranslation(spawn.x, spawn.y, spawn.z)
                .setRotation({ x: bodyRotation.x, y: bodyRotation.y, z: bodyRotation.z, w: bodyRotation.w })
                .setLinearDamping(.025)
                .setAngularDamping(.22)
                .setCanSleep(false)
                .setCcdEnabled(true),
        );
        this.collider = world.createCollider(
            RAPIER.ColliderDesc.cuboid(.94, .4, 2.12)
                .setTranslation(0, .72, 0)
                .setMass(config.mass)
                .setFriction(.62)
                .setRestitution(.04),
            this.body,
        );
        this.body.setEnabledRotations(true, true, true, true);
        this.wheels = config.wheelMounts.map(mount => ({
            ...mount,
            mount: new THREE.Vector3(mount.x, mount.y, mount.z),
            previousLength: config.suspensionRest,
            angularSpeed: 0,
            rotation: 0,
            suspensionLength: config.suspensionRest,
            normalLoad: 0,
            slipRatio: 0,
            slipAngle: 0,
            grounded: false,
        }));
    }

    step(input: DriverInput, dt: number) {
        this.body.resetForces(true);
        this.body.resetTorques(true);
        this.shiftCooldown = Math.max(0, this.shiftCooldown - dt);
        this.lastInput = { ...input };

        const rotation = this.body.rotation();
        const quaternion = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
        const position = this.body.translation();
        const bodyPosition = new THREE.Vector3(position.x, position.y, position.z);
        this.forward.set(0, 0, -1).applyQuaternion(quaternion).normalize();
        this.right.set(1, 0, 0).applyQuaternion(quaternion).normalize();
        this.chassisUp.set(0, 1, 0).applyQuaternion(quaternion).normalize();

        const linearVelocity = this.body.linvel();
        const velocity = new THREE.Vector3(linearVelocity.x, linearVelocity.y, linearVelocity.z);
        const longitudinalSpeed = velocity.dot(this.forward);
        const planarSpeed = Math.hypot(linearVelocity.x, linearVelocity.z);
        const steeringScale = 1 - THREE.MathUtils.clamp(planarSpeed / 38, 0, .68);
        const targetSteering = THREE.MathUtils.clamp(input.steering, -1, 1) * this.config.maxSteeringAngle * steeringScale;
        this.steeringAngle = THREE.MathUtils.damp(this.steeringAngle, targetSteering, 5.2, dt);

        const drivenWheels = this.wheels.filter(wheel => wheel.driven);
        const averageWheelSpeed = drivenWheels.length
            ? drivenWheels.reduce((total, wheel) => total + Math.abs(wheel.angularSpeed), 0) / drivenWheels.length
            : 0;
        const ratio = this.reverse ? 3.05 : this.config.gearRatios[this.gear - 1];
        const projectedRpm = averageWheelSpeed * ratio * this.config.finalDrive * (60 / (Math.PI * 2));
        const targetRpm = THREE.MathUtils.clamp(Math.max(850, projectedRpm) + input.throttle * 650, 850, this.config.maxRpm);
        this.engineRpm = THREE.MathUtils.damp(this.engineRpm, targetRpm, 8.5, dt);

        if (this.shiftCooldown <= 0 && !input.reverse) {
            if (this.engineRpm > this.config.maxRpm * .9 && this.gear < this.config.gearRatios.length) {
                this.gear += 1;
                this.shiftCooldown = .42;
            } else if (this.engineRpm < 1_700 && this.gear > 1 && planarSpeed > 8) {
                this.gear -= 1;
                this.shiftCooldown = .34;
            }
        }
        this.reverse = input.reverse;
        const selectedRatio = this.reverse ? 3.05 : this.config.gearRatios[this.gear - 1];
        const engineTorque = torqueAtRpm(this.engineRpm, this.config.peakTorque, this.config.maxRpm) * input.throttle;
        const driveTorquePerWheel = (engineTorque * selectedRatio * this.config.finalDrive * .84) / Math.max(1, drivenWheels.length);
        const suspensionDown = this.suspensionDown.copy(this.chassisUp).negate().normalize();

        for (const wheel of this.wheels) {
            this.worldMount.copy(this.localMount.copy(wheel.mount).applyQuaternion(quaternion)).add(bodyPosition);
            const ray = new RAPIER.Ray(toRapier(this.worldMount), toRapier(suspensionDown));
            const rayLength = this.config.suspensionRest + this.config.suspensionTravel + this.config.wheelRadius;
            const hit = this.world.castRayAndGetNormal(
                ray,
                rayLength,
                false,
                undefined,
                undefined,
                undefined,
                this.body,
                collider => collider.parent() === null,
            );

            if (!hit) {
                wheel.grounded = false;
                wheel.normalLoad = 0;
                wheel.slipRatio = 0;
                wheel.slipAngle = 0;
                wheel.suspensionLength = this.config.suspensionRest + this.config.suspensionTravel;
                wheel.previousLength = wheel.suspensionLength;
                continue;
            }

            const wasGrounded = wheel.grounded;
            wheel.grounded = true;
            const length = THREE.MathUtils.clamp(hit.timeOfImpact - this.config.wheelRadius, 0, this.config.suspensionRest + this.config.suspensionTravel);
            const suspensionVelocity = wasGrounded ? (length - wheel.previousLength) / dt : 0;
            wheel.previousLength = length;
            wheel.suspensionLength = length;
            this.contactPoint.copy(this.worldMount).addScaledVector(suspensionDown, hit.timeOfImpact);

            const normal = new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z).normalize();
            const springForce = THREE.MathUtils.clamp(
                this.config.springRate * (this.config.suspensionRest - length) - this.config.damperRate * suspensionVelocity,
                0,
                this.config.mass * 9.81 * .72,
            );
            wheel.normalLoad = springForce;
            this.body.addForceAtPoint(toRapier(this.temporary.copy(normal).multiplyScalar(springForce)), toRapier(this.contactPoint), true);

            this.tireForward.copy(this.forward);
            if (wheel.front) this.tireForward.applyAxisAngle(this.chassisUp, this.steeringAngle);
            this.tireForward.addScaledVector(normal, -this.tireForward.dot(normal)).normalize();
            this.tireSide.copy(this.right)
                .applyAxisAngle(this.chassisUp, wheel.front ? this.steeringAngle : 0)
                .addScaledVector(normal, -this.tireSide.dot(normal)).normalize();

            const pointVelocityRaw = this.body.velocityAtPoint(toRapier(this.contactPoint));
            const pointVelocity = new THREE.Vector3(pointVelocityRaw.x, pointVelocityRaw.y, pointVelocityRaw.z);
            const wheelLongitudinalSpeed = pointVelocity.dot(this.tireForward);
            const wheelLateralSpeed = pointVelocity.dot(this.tireSide);
            const driveTorque = wheel.driven ? driveTorquePerWheel * (this.reverse ? -1 : 1) : 0;
            const brakeTorque = input.brake * this.config.brakeTorque + (input.handbrake && !wheel.front ? this.config.handbrakeTorque : 0);

            if (brakeTorque > 0 && Math.abs(wheel.angularSpeed) > .2) {
                const angularChange = brakeTorque / this.config.wheelInertia * dt;
                wheel.angularSpeed -= Math.sign(wheel.angularSpeed) * Math.min(Math.abs(wheel.angularSpeed), angularChange);
            }
            wheel.angularSpeed += driveTorque / this.config.wheelInertia * dt;

            const slipDenominator = Math.max(Math.abs(wheelLongitudinalSpeed), 2.6);
            wheel.slipRatio = THREE.MathUtils.clamp((wheel.angularSpeed * this.config.wheelRadius - wheelLongitudinalSpeed) / slipDenominator, -3, 3);
            wheel.slipAngle = THREE.MathUtils.clamp(Math.atan2(wheelLateralSpeed, Math.max(Math.abs(wheelLongitudinalSpeed), 2.1)), -1.15, 1.15);

            let forceLongitudinal = THREE.MathUtils.clamp(wheel.slipRatio * (wheel.driven ? 4_600 : 8_000), -springForce * 1.28, springForce * 1.28);
            let forceLateral = THREE.MathUtils.clamp(-wheel.slipAngle * (wheel.front ? 25_000 : 23_000), -springForce * 1.32, springForce * 1.32);
            const frictionLimit = springForce * this.config.surfaceGrip(this.contactPoint.x, this.contactPoint.z);
            const resultant = Math.hypot(forceLongitudinal, forceLateral);
            if (resultant > frictionLimit && resultant > 0) {
                const gripScale = frictionLimit / resultant;
                forceLongitudinal *= gripScale;
                forceLateral *= gripScale;
            }

            const tireForce = this.temporary.copy(this.tireForward)
                .multiplyScalar(forceLongitudinal)
                .addScaledVector(this.tireSide, forceLateral);
            this.body.addForceAtPoint(toRapier(tireForce), toRapier(this.contactPoint), true);
            wheel.angularSpeed -= forceLongitudinal * this.config.wheelRadius * dt / this.config.wheelInertia;
            if (brakeTorque > 0 && Math.abs(wheel.angularSpeed) < .3) wheel.angularSpeed = 0;
            wheel.rotation += wheel.angularSpeed * dt;
        }

        if (planarSpeed > .05) {
            const dragMagnitude = .5 * 1.225 * this.config.dragCoefficient * planarSpeed * planarSpeed;
            const rollingMagnitude = this.config.mass * 9.81 * this.config.rollingResistance;
            this.temporary.set(linearVelocity.x, 0, linearVelocity.z).normalize().multiplyScalar(-(dragMagnitude + rollingMagnitude));
            this.body.addForce(toRapier(this.temporary), true);
        }

        const acceleration = velocity.sub(this.previousVelocity).multiplyScalar(1 / Math.max(dt, .001));
        this.longitudinalG = THREE.MathUtils.clamp(acceleration.dot(this.forward) / 9.81, -4, 4);
        this.lateralG = THREE.MathUtils.clamp(acceleration.dot(this.right) / 9.81, -4, 4);
        this.world.timestep = dt;
        this.world.step();
        const postStepVelocity = this.body.linvel();
        this.previousVelocity.set(postStepVelocity.x, postStepVelocity.y, postStepVelocity.z);
    }

    getSnapshot() {
        const position = this.body.translation();
        const rotation = this.body.rotation();
        const velocity = this.body.linvel();
        const wheels = this.wheels.map(wheel => ({
            suspensionLength: wheel.suspensionLength,
            normalLoad: wheel.normalLoad,
            slipRatio: wheel.slipRatio,
            slipAngle: wheel.slipAngle,
            rotation: wheel.rotation,
            steeringAngle: wheel.front ? this.steeringAngle : 0,
            grounded: wheel.grounded,
        }));
        return {
            position: new THREE.Vector3(position.x, position.y, position.z),
            rotation: new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w),
            speedKmh: Math.hypot(velocity.x, velocity.z) * 3.6,
            rpm: this.engineRpm,
            gear: this.reverse ? 'R' as const : this.gear,
            steeringAngle: this.steeringAngle,
            longitudinalG: this.longitudinalG,
            lateralG: this.lateralG,
            groundedWheels: this.wheels.filter(wheel => wheel.grounded).length,
            wheels,
        };
    }

    reset(position: THREE.Vector3, yaw: number) {
        this.body.resetForces(true);
        this.body.resetTorques(true);
        const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        this.body.setTranslation({ x: position.x, y: position.y, z: position.z }, true);
        this.body.setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w }, true);
        this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        this.resetWheelState();
        this.previousVelocity.set(0, 0, 0);
        this.engineRpm = 850;
        this.gear = 1;
        this.reverse = false;
        this.steeringAngle = 0;
        this.shiftCooldown = 0;
    }

    dispose() {
        this.world.removeRigidBody(this.body);
    }

    private resetWheelState() {
        for (const wheel of this.wheels) {
            wheel.previousLength = this.config.suspensionRest;
            wheel.angularSpeed = 0;
            wheel.rotation = 0;
            wheel.suspensionLength = this.config.suspensionRest;
            wheel.normalLoad = 0;
            wheel.slipRatio = 0;
            wheel.slipAngle = 0;
            wheel.grounded = false;
        }
    }
}