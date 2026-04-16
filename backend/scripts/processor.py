import sys
import json
import numpy as np
from scipy.io import wavfile
from scipy.signal import resample, butter, lfilter, spectrogram
import os

def get_fft_data(data, fs, points=500):
    n = len(data)
    if n == 0: return [], []
    fft_values = np.abs(np.fft.rfft(data))
    fft_freqs = np.fft.rfftfreq(n, 1/fs)
    
    if len(fft_values) > points:
        indices = np.linspace(0, len(fft_values) - 1, points).astype(int)
        fft_values = fft_values[indices]
        fft_freqs = fft_freqs[indices]
        
    return fft_freqs.tolist(), fft_values.tolist()

def get_waveform_data(data, points=1000):
    if len(data) > points:
        indices = np.linspace(0, len(data) - 1, points).astype(int)
        data = data[indices]
    return data.tolist()

def get_spectrogram_data(data, fs, points_t=100, points_f=64):
    nperseg = 512
    f, t, Sxx = spectrogram(data, fs, nperseg=nperseg)
    
    # Convert to log scale and normalize
    Sxx = 10 * np.log10(Sxx + 1e-10)
    
    # Downsample to keep payload small but representative
    if len(t) > points_t:
        t_indices = np.linspace(0, len(t) - 1, points_t).astype(int)
        Sxx = Sxx[:, t_indices]
        t = t[t_indices]
        
    if len(f) > points_f:
        f_indices = np.linspace(0, len(f) - 1, points_f).astype(int)
        Sxx = Sxx[f_indices, :]
        f = f[f_indices]
        
    return {
        "values": Sxx.tolist(),
        "freqs": f.tolist(),
        "times": t.tolist()
    }

def apply_operations(data, fs, config):
    # 1. Amplitude Scaling (Gain)
    gain = float(config.get('gain', 1.0))
    data = data * gain
    
    # 2. Time Reversal (Folding)
    if config.get('reversal', False):
        data = np.flip(data)
        
    # 3. Time Scaling (Speed)
    scaling = float(config.get('scaling', 1.0))
    if scaling != 1.0:
        new_length = int(len(data) / scaling)
        if new_length > 0:
            data = resample(data, new_length)
            
    # 4. Time Shifting (Delay/Advance)
    shift = float(config.get('shift', 0.0))
    shift_samples = int(shift * fs)
    if shift_samples > 0:
        data = np.pad(data, (shift_samples, 0), mode='constant')
    elif shift_samples < 0:
        data = data[abs(shift_samples):]
        
    # 5. Signal Addition (Simple Gaussian Noise for demo if requested)
    noise_level = float(config.get('noise', 0.0))
    if noise_level > 0:
        noise = np.random.normal(0, noise_level, len(data))
        data = data + noise
        
    # 6. Echo effect (Convolution-like)
    if config.get('echo', False):
        delay_sec = 0.3
        decay = 0.5
        delay_samples = int(delay_sec * fs)
        echo_signal = np.zeros(len(data) + delay_samples)
        echo_signal[:len(data)] = data
        echo_signal[delay_samples:] += data * decay
        data = echo_signal
        
    # 7. Advanced Filters (Butterworth)
    low_cutoff = float(config.get('lowCutoff', 0))
    if low_cutoff > 20: # Minimum audible cutoff
        nyq = 0.5 * fs
        if low_cutoff < nyq:
            b, a = butter(4, low_cutoff / nyq, btype='low')
            data = lfilter(b, a, data)

    high_cutoff = float(config.get('highCutoff', 0))
    if high_cutoff > 20:
        nyq = 0.5 * fs
        if high_cutoff < nyq:
            b, a = butter(4, high_cutoff / nyq, btype='high')
            data = lfilter(b, a, data)
        
    return data

def generate_signal(config, fs=44100):
    sig_type = config.get('type', 'sine')
    duration = float(config.get('duration', 2.0))
    freq = float(config.get('frequency', 440.0))
    amp = float(config.get('amplitude', 0.5))
    
    t = np.linspace(0, duration, int(fs * duration), endpoint=False)
    
    if sig_type == 'sine':
        data = amp * np.sin(2 * np.pi * freq * t)
    elif sig_type == 'step':
        data = np.ones_like(t) * amp
        # Step starts half-way
        data[:len(t)//2] = 0
    else:
        data = np.zeros_like(t)
        
    return data.astype(np.float32), fs

def main():
    try:
        input_path = sys.argv[1]
        output_path = sys.argv[2]
        config = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}

        mode = config.get('mode', 'process')
        
        if mode == 'generate':
            processed_data, fs = generate_signal(config)
        else:
            if not os.path.exists(input_path):
                print(json.dumps({"error": f"Input file not found: {input_path}"}))
                return
                
            fs, data = wavfile.read(input_path)
            # Normalize to float32
            if data.dtype != np.float32:
                if data.dtype == np.int16:
                    data = data.astype(np.float32) / 32768.0
                elif data.dtype == np.int32:
                    data = data.astype(np.float32) / 2147483648.0
            
            # Use mono if stereo
            if len(data.shape) > 1:
                data = data[:, 0]
                
            processed_data = apply_operations(data, fs, config)

        # Write output
        # Convert back to int16 for compatibility
        out_data = (processed_data * 32767).astype(np.int16)
        wavfile.write(output_path, fs, out_data)

        # Analysis
        orig_waveform = get_waveform_data(processed_data)
        freqs, magnitudes = get_fft_data(processed_data, fs)
        spec_data = get_spectrogram_data(processed_data, fs)

        result = {
            "status": "success",
            "waveform": orig_waveform,
            "fft_freqs": freqs,
            "fft_magnitudes": magnitudes,
            "spectrogram": spec_data,
            "sample_rate": fs,
            "duration": len(processed_data) / fs
        }
        print(json.dumps(result))

    except Exception as e:
        import traceback
        print(json.dumps({"error": str(e), "trace": traceback.format_exc()}))

if __name__ == "__main__":
    main()
