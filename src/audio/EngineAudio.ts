export type EngineSoundProfile = 'coupe' | 'rally';

export class EngineAudio {
    private context: AudioContext | null = null;
    private engineGain: GainNode | null = null;
    private filter: BiquadFilterNode | null = null;
    private lowOscillator: OscillatorNode | null = null;
    private highOscillator: OscillatorNode | null = null;
    private turboOscillator: OscillatorNode | null = null;
    private turboGain: GainNode | null = null;
    private windGain: GainNode | null = null;
    private skidGain: GainNode | null = null;
    private noiseBuffer: AudioBuffer | null = null;
    private lastImpactAt = 0;

    unlock() {
        if (typeof window.AudioContext === 'undefined') return;
        if (!this.context) this.createGraph();
        if (this.context?.state === 'suspended') void this.context.resume().catch(() => undefined);
    }

    update(rpm: number, throttle: number, speed: number, profile: EngineSoundProfile, slip: number) {
        if (!this.context || !this.engineGain || !this.filter || !this.lowOscillator || !this.highOscillator || !this.turboOscillator || !this.turboGain || !this.windGain || !this.skidGain) return;

        const now = this.context.currentTime;
        const clampedRpm = Math.max(700, Math.min(rpm, 7200));
        const rally = profile === 'rally';
        const firingFrequency = clampedRpm / (rally ? 30 : 20);
        this.lowOscillator.type = rally ? 'square' : 'sawtooth';
        this.highOscillator.type = rally ? 'sawtooth' : 'triangle';
        this.lowOscillator.frequency.setTargetAtTime(firingFrequency, now, .06);
        this.highOscillator.frequency.setTargetAtTime(firingFrequency * (rally ? 1.5 : 2.01), now, .06);
        this.filter.frequency.setTargetAtTime((rally ? 145 : 250) + clampedRpm * (rally ? .045 : .075) + throttle * (rally ? 620 : 1080), now, .08);
        this.engineGain.gain.setTargetAtTime((rally ? .014 : .01) + throttle * (rally ? .042 : .052) + Math.min(Math.abs(speed) / 80, 1) * .008, now, .12);
        this.turboOscillator.frequency.setTargetAtTime(520 + throttle * 980 + Math.abs(speed) * 5, now, .1);
        this.turboGain.gain.setTargetAtTime(rally ? .004 + throttle * .018 : .0001, now, .12);
        this.windGain.gain.setTargetAtTime(Math.max(0, Math.abs(speed) - 16) * .00065, now, .2);
        this.skidGain.gain.setTargetAtTime(Math.max(0, Math.min(slip, 1)) * .045, now, .08);
    }

    playImpact(intensity: number, soft = false) {
        if (!this.context || !this.noiseBuffer || intensity < .08) return;
        const now = this.context.currentTime;
        if (now - this.lastImpactAt < .12) return;
        this.lastImpactAt = now;

        const source = this.context.createBufferSource();
        source.buffer = this.noiseBuffer;
        source.playbackRate.value = .65 + intensity * .55;
        const filter = this.context.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = soft ? 360 + intensity * 420 : 700 + intensity * 1500;
        filter.Q.value = soft ? .65 : 1.1;
        const gain = this.context.createGain();
        const peak = (soft ? .025 : .06) * intensity;
        gain.gain.setValueAtTime(.0001, now);
        gain.gain.exponentialRampToValueAtTime(Math.max(peak, .0002), now + .012);
        gain.gain.exponentialRampToValueAtTime(.0001, now + (soft ? .28 : .19));
        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.context.destination);
        source.start(now);
        source.stop(now + (soft ? .3 : .21));
    }

    playGearShift() {
        if (!this.context) return;
        const now = this.context.currentTime;
        const oscillator = this.context.createOscillator();
        const gain = this.context.createGain();
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(210, now);
        oscillator.frequency.exponentialRampToValueAtTime(92, now + .11);
        gain.gain.setValueAtTime(.0001, now);
        gain.gain.exponentialRampToValueAtTime(.035, now + .008);
        gain.gain.exponentialRampToValueAtTime(.0001, now + .13);
        oscillator.connect(gain);
        gain.connect(this.context.destination);
        oscillator.start(now);
        oscillator.stop(now + .14);
    }

    private createGraph() {
        const context = new AudioContext();
        const noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
        const noise = noiseBuffer.getChannelData(0);
        for (let i = 0; i < noise.length; i++) noise[i] = Math.random() * 2 - 1;

        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 240;
        filter.Q.value = .7;

        const engineGain = context.createGain();
        engineGain.gain.value = 0;
        filter.connect(engineGain);
        engineGain.connect(context.destination);

        const lowOscillator = context.createOscillator();
        lowOscillator.type = 'sawtooth';
        lowOscillator.frequency.value = 28;
        lowOscillator.connect(filter);
        lowOscillator.start();

        const highOscillator = context.createOscillator();
        highOscillator.type = 'triangle';
        highOscillator.frequency.value = 56;
        highOscillator.connect(filter);
        highOscillator.start();

        const turboFilter = context.createBiquadFilter();
        turboFilter.type = 'highpass';
        turboFilter.frequency.value = 650;
        const turboOscillator = context.createOscillator();
        turboOscillator.type = 'sine';
        turboOscillator.frequency.value = 520;
        const turboGain = context.createGain();
        turboGain.gain.value = .0001;
        turboOscillator.connect(turboFilter);
        turboFilter.connect(turboGain);
        turboGain.connect(context.destination);
        turboOscillator.start();

        const noiseSource = context.createBufferSource();
        noiseSource.buffer = noiseBuffer;
        noiseSource.loop = true;
        const windFilter = context.createBiquadFilter();
        windFilter.type = 'highpass';
        windFilter.frequency.value = 420;
        const windGain = context.createGain();
        windGain.gain.value = 0;
        noiseSource.connect(windFilter);
        windFilter.connect(windGain);
        windGain.connect(context.destination);

        const skidFilter = context.createBiquadFilter();
        skidFilter.type = 'bandpass';
        skidFilter.frequency.value = 1650;
        skidFilter.Q.value = .8;
        const skidGain = context.createGain();
        skidGain.gain.value = 0;
        noiseSource.connect(skidFilter);
        skidFilter.connect(skidGain);
        skidGain.connect(context.destination);
        noiseSource.start();

        this.context = context;
        this.filter = filter;
        this.engineGain = engineGain;
        this.lowOscillator = lowOscillator;
        this.highOscillator = highOscillator;
        this.turboOscillator = turboOscillator;
        this.turboGain = turboGain;
        this.windGain = windGain;
        this.skidGain = skidGain;
        this.noiseBuffer = noiseBuffer;
    }
}
