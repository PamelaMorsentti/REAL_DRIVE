import * as THREE from 'three';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { VehiclePhysics } from './VehiclePhysics';

export async function runPhysicsSmoke() {
    await RAPIER.init();
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.createCollider(RAPIER.ColliderDesc.cuboid(50, .1, 50).setTranslation(0, -.1, 0).setFriction(1));
    const vehicle = new VehiclePhysics(world, {
        mass: 1450,
        wheelRadius: .37,
        wheelInertia: 1.65,
        suspensionRest: .48,
        suspensionTravel: .22,
        springRate: 42_000,
        damperRate: 3_600,
        peakTorque: 400,
        finalDrive: 3.12,
        gearRatios: [2.96, 2.04, 1.48, 1.14, .91, .74],
        maxRpm: 7_400,
        maxSteeringAngle: .56,
        brakeTorque: 2_150,
        handbrakeTorque: 2_850,
        dragCoefficient: .68,
        rollingResistance: .014,
        surfaceGrip: () => 1.08,
        wheelMounts: [
            { x: -.78, y: .78, z: -1.35, front: true, driven: false },
            { x: .78, y: .78, z: -1.35, front: true, driven: false },
            { x: -.78, y: .78, z: 1.38, front: false, driven: true },
            { x: .78, y: .78, z: 1.38, front: false, driven: true },
        ],
    }, new THREE.Vector3(0, .1, 0), 0);

    try {
        let minimumGroundedWheels = 4;
        const samples = [];
        for (let frame = 0; frame < 240; frame++) {
            vehicle.step({ steering: frame > 80 ? .65 : 0, throttle: 1, brake: 0, handbrake: false, reverse: false }, 1 / 120);
            const snapshot = vehicle.getSnapshot();
            if (frame > 4) minimumGroundedWheels = Math.min(minimumGroundedWheels, snapshot.groundedWheels);
            if ([0, 1, 2, 10, 30, 60, 120, 239].includes(frame)) {
                samples.push({
                    frame,
                    y: Number(snapshot.position.y.toFixed(3)),
                    rotation: [snapshot.rotation.x, snapshot.rotation.y, snapshot.rotation.z].map(value => Number(value.toFixed(3))),
                    grounded: snapshot.groundedWheels,
                    loads: snapshot.wheels.map(wheel => Math.round(wheel.normalLoad)),
                });
            }
        }
        const accelerating = vehicle.getSnapshot();
        if (accelerating.speedKmh <= 10) {
            throw new Error(`Throttle did not accelerate: ${accelerating.speedKmh.toFixed(1)} km/h, ${accelerating.rpm.toFixed(0)} rpm; samples ${JSON.stringify(samples)}.`);
        }
        if (Math.abs(accelerating.steeringAngle) <= 2 * Math.PI / 180) throw new Error('Steering did not angle the front wheels.');
        if (minimumGroundedWheels < 3) throw new Error('Suspension lost ground contact on a flat surface.');

        for (let frame = 0; frame < 360; frame++) {
            vehicle.step({ steering: 0, throttle: 0, brake: 1, handbrake: false, reverse: false }, 1 / 120);
        }
        const braking = vehicle.getSnapshot();
        if (braking.speedKmh >= 5) throw new Error('Brakes did not bring the chassis close to a stop.');

        return {
            speedKmh: Number(accelerating.speedKmh.toFixed(1)),
            groundedWheels: minimumGroundedWheels,
            brakingSpeedKmh: Number(braking.speedKmh.toFixed(1)),
        };
    } finally {
        vehicle.dispose();
        world.free();
    }
}