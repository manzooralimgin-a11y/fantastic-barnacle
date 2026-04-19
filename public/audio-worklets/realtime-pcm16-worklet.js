class RealtimePCM16WorkletProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const processorOptions = options?.processorOptions ?? {};

    this.targetSampleRate = processorOptions.targetSampleRate ?? 24000;
    this.chunkSamples = processorOptions.chunkSamples ?? 1440;
    this.minChunkSamples = processorOptions.minChunkSamples ?? 480;
    this.sourceSampleRate = sampleRate;
    this.resampleRatio = this.sourceSampleRate / this.targetSampleRate;

    this.inputBuffer = [];
    this.readIndex = 0;
    this.outputBuffer = new Int16Array(this.chunkSamples);
    this.outputOffset = 0;
    this.outputPeak = 0;

    this.port.onmessage = (event) => {
      const message = event.data ?? {};
      if (message.type === "reset") {
        this._reset();
      }
      if (message.type === "flush") {
        this._flushChunk(true);
        this.port.postMessage({ type: "flush-complete" });
      }
    };
  }

  _reset() {
    this.inputBuffer = [];
    this.readIndex = 0;
    this.outputBuffer = new Int16Array(this.chunkSamples);
    this.outputOffset = 0;
    this.outputPeak = 0;
  }

  _clampToPCM16(sample) {
    const clamped = Math.max(-1, Math.min(1, sample));
    return clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
  }

  _mixToMono(channels, frameIndex) {
    let mixed = 0;
    for (let channelIndex = 0; channelIndex < channels.length; channelIndex += 1) {
      mixed += channels[channelIndex][frameIndex] ?? 0;
    }
    return mixed / channels.length;
  }

  _emitOutputChunk(length) {
    if (length <= 0) {
      return;
    }

    const payload = new ArrayBuffer(length * 2);
    const view = new Int16Array(payload);
    view.set(this.outputBuffer.subarray(0, length));

    this.port.postMessage(
      { type: "chunk", buffer: payload, peak: this.outputPeak },
      [payload]
    );
    this.outputPeak = 0;
  }

  _emitPartialChunk() {
    if (this.outputOffset === 0) {
      return;
    }

    // Avoid extremely tiny network frames at the end of a turn by padding the
    // final packet up to the minimum chunk size before flushing it.
    if (this.outputOffset < this.minChunkSamples) {
      for (let index = this.outputOffset; index < this.minChunkSamples; index += 1) {
        this.outputBuffer[index] = 0;
      }
      this.outputOffset = this.minChunkSamples;
    }

    this._emitOutputChunk(this.outputOffset);
    this.outputBuffer = new Int16Array(this.chunkSamples);
    this.outputOffset = 0;
  }

  _flushChunk(forcePartial = false) {
    while (this.readIndex + 1 < this.inputBuffer.length) {
      const baseIndex = Math.floor(this.readIndex);
      const nextIndex = baseIndex + 1;

      if (nextIndex >= this.inputBuffer.length) {
        break;
      }

      const fraction = this.readIndex - baseIndex;
      const current = this.inputBuffer[baseIndex];
      const next = this.inputBuffer[nextIndex];
      // Linear interpolation keeps the 48kHz -> 24kHz conversion aligned so
      // we do not introduce pitch or speed drift.
      const interpolated = current + (next - current) * fraction;
      this.outputPeak = Math.max(this.outputPeak, Math.abs(interpolated));

      this.outputBuffer[this.outputOffset] = this._clampToPCM16(interpolated);
      this.outputOffset += 1;
      this.readIndex += this.resampleRatio;

      if (this.outputOffset === this.outputBuffer.length) {
        this._emitOutputChunk(this.outputOffset);
        this.outputBuffer = new Int16Array(this.chunkSamples);
        this.outputOffset = 0;
      }
    }

    const consumedFrames = Math.floor(this.readIndex);
    if (consumedFrames > 0) {
      // Remove consumed frames in place so the mutable JS array does not rely
      // on typed-array-only APIs during long sessions.
      this.inputBuffer.splice(0, consumedFrames);
      this.readIndex -= consumedFrames;
    }

    if (forcePartial && this.outputOffset > 0) {
      this._emitPartialChunk();
    }
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    if (output) {
      for (let channelIndex = 0; channelIndex < output.length; channelIndex += 1) {
        output[channelIndex].fill(0);
      }
    }

    if (!input || input.length === 0 || input[0].length === 0) {
      return true;
    }

    for (let frameIndex = 0; frameIndex < input[0].length; frameIndex += 1) {
      this.inputBuffer.push(this._mixToMono(input, frameIndex));
    }

    this._flushChunk(false);
    return true;
  }
}

registerProcessor("realtime-pcm16-worklet", RealtimePCM16WorkletProcessor);
